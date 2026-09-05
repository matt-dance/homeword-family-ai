"""Safety pipeline orchestration — fail-closed on every stage."""

import asyncio
from dataclasses import dataclass
from typing import AsyncIterator, Awaitable, TypeVar

from homeward_gateway.pipeline.classifier import classify
from homeward_gateway.pipeline.normalize import normalize, normalize_output
from homeward_gateway.pipeline.policy import PolicyPreset, check_policy_match
from homeward_gateway.pipeline.rules import check_rules
from homeward_gateway.chat.live_plan import plan_live_lookup
from homeward_gateway.chat.lookups import (
    LookupIntent,
    LookupResult,
    SessionContext,
    build_session_context,
    fetch_lookup,
    intent_from_request,
    lookup_card,
    lookup_prompt_notes,
    lookup_request_hint,
    parse_lookup_request,
    weather_missing_place_notes,
    weather_place_not_found_notes,
)
from homeward_gateway.chat.session_state import (
    SessionState,
    format_user_turn,
    resolve_turn,
)
from homeward_gateway.chat.tools import (
    ask_parent_card,
    clock_tool_hint,
    detect_intents,
    extract_model_tools,
    run_local_tools,
    tool_prompt_hint,
)
from homeward_gateway.models.router import generate_response, stream_response
from homeward_gateway.home.location import HomeContext

# Keep SSE status flowing while a local model decides whether to look something up.
# The web client aborts after 25s of silence.
LOOKUP_HEARTBEAT_SECONDS = 8.0

_T = TypeVar("_T")


@dataclass
class PipelineResult:
    allowed: bool
    content: str | None = None
    block_reason: str | None = None
    stage: str | None = None
    session_state: SessionState | None = None
    tools: list[dict] | None = None


def _blocked_result(result: PipelineResult) -> PipelineResult:
    return PipelineResult(
        allowed=False,
        content=result.content,
        block_reason=result.block_reason,
        stage=result.stage,
        tools=result.tools or [ask_parent_card(result.block_reason).to_dict()],
    )


@dataclass
class ToolEvent:
    tools: list[dict]


@dataclass
class StatusEvent:
    message: str | None = None
    phase: str | None = None


def _rules_only_classifier(chat_model: str | None) -> bool:
    """Skip the small Ollama classifier when the chat model is large — avoids slow model swaps."""
    from homeward_gateway.config import settings
    from homeward_gateway.ollama.catalog import estimate_min_ram_gb

    return estimate_min_ram_gb(chat_model or settings.ollama_model) > 8


async def filter_input(
    text: str,
    preset: PolicyPreset,
    strictness: int,
    classifier_model: str | None = None,
    classifier_enabled: bool = True,
    rules_only_classifier: bool = False,
) -> PipelineResult:
    """Run input through all safety stages. Fail-closed on any error."""
    # Stage 1: Normalize
    try:
        normalized = normalize(text)
    except Exception:
        return PipelineResult(allowed=False, block_reason="normalize error", stage="normalize")

    if not normalized:
        return PipelineResult(allowed=False, block_reason="empty message", stage="normalize")

    # Stage 2: Fast rules
    try:
        rule_result = check_rules(
            normalized,
            extra_keywords=preset.blocked_keywords,
            extra_jailbreaks=preset.jailbreak_patterns,
        )
        if not rule_result.allowed:
            return PipelineResult(
                allowed=False,
                block_reason=rule_result.reason,
                stage=rule_result.stage,
            )
    except Exception:
        return PipelineResult(allowed=False, block_reason="rules error", stage="rules")

    # Stage 3: Classifier
    if classifier_enabled:
        try:
            classifier_result = await classify(
                normalized,
                strictness,
                model=classifier_model,
                rules_only=rules_only_classifier,
            )
            if not classifier_result.allowed:
                return PipelineResult(
                    allowed=False,
                    block_reason=classifier_result.reason,
                    stage=classifier_result.stage,
                )
        except Exception:
            return PipelineResult(allowed=False, block_reason="classifier error", stage="classifier")

    # Stage 4: Policy match
    try:
        policy_ok, policy_reason = check_policy_match(normalized, preset, strictness)
        if not policy_ok:
            return PipelineResult(allowed=False, block_reason=policy_reason, stage="policy")
    except Exception:
        return PipelineResult(allowed=False, block_reason="policy error", stage="policy")

    return PipelineResult(allowed=True, content=normalized)


async def filter_output(
    text: str,
    preset: PolicyPreset,
    strictness: int,
    classifier_model: str | None = None,
    classifier_enabled: bool = True,
    rules_only_classifier: bool = False,
) -> PipelineResult:
    """Run output through safety stages before delivering to child."""
    try:
        normalized = normalize_output(text)
    except Exception:
        return PipelineResult(allowed=False, block_reason="output normalize error", stage="normalize")

    try:
        rule_result = check_rules(
            normalized,
            extra_keywords=preset.blocked_keywords,
            extra_jailbreaks=preset.jailbreak_patterns,
        )
        if not rule_result.allowed:
            return PipelineResult(
                allowed=False,
                block_reason=rule_result.reason,
                stage=f"output_{rule_result.stage}",
            )
    except Exception:
        return PipelineResult(allowed=False, block_reason="output rules error", stage="rules")

    if classifier_enabled:
        try:
            classifier_result = await classify(
                normalized,
                strictness,
                model=classifier_model,
                rules_only=rules_only_classifier,
            )
            if not classifier_result.allowed:
                return PipelineResult(
                    allowed=False,
                    block_reason=classifier_result.reason,
                    stage=f"output_{classifier_result.stage}",
                )
        except Exception:
            return PipelineResult(allowed=False, block_reason="output classifier error", stage="classifier")

    try:
        policy_ok, policy_reason = check_policy_match(normalized, preset, strictness)
        if not policy_ok:
            return PipelineResult(allowed=False, block_reason=policy_reason, stage="output_policy")
    except Exception:
        return PipelineResult(allowed=False, block_reason="output policy error", stage="policy")

    return PipelineResult(allowed=True, content=normalized)


def _session_context(
    history: list[dict] | None,
    session_state: SessionState | None,
) -> SessionContext:
    inferred = build_session_context(history)
    if not session_state:
        return inferred
    existing = session_state.to_context()
    return SessionContext(
        place=existing.place or inferred.place,
        team=existing.team or inferred.team,
        venue=existing.venue or inferred.venue,
        event_time=existing.event_time or inferred.event_time,
        last_lookup_kind=existing.last_lookup_kind or inferred.last_lookup_kind,
    )


async def resolve_live_lookup(
    model_text: str,
    *,
    live_lookups: bool,
    preset: PolicyPreset,
    strictness: int,
    classifier_model: str | None = None,
    history: list[dict] | None = None,
    home: HomeContext | None = None,
    session_state: SessionState | None = None,
    rules_only_classifier: bool = False,
    user_message: str = "",
) -> tuple[str, list[dict], LookupIntent | None, LookupResult | None]:
    """Fetch a named source when the parent enabled it and the child asked a live question."""
    if not live_lookups:
        return "", [], None, None

    context = _session_context(history, session_state)
    intent = plan_live_lookup(
        user_message,
        context=context,
        home_location=home.location if home else None,
    )
    if not intent:
        payload = parse_lookup_request(model_text)
        intent = intent_from_request(
            payload,
            home_location=home.location if home else None,
            context=context,
            user_message=user_message,
        )
    if not intent:
        return "", [], None, None

    if intent.kind == "weather" and not intent.query:
        spoken = "Which city or town do you mean?"
        result = LookupResult(
            kind="weather",
            source="open-meteo",
            source_label="Open-Meteo weather",
            query="",
            summary=spoken,
            notes=weather_missing_place_notes(),
            found=False,
            spoken=spoken,
        )
        return weather_missing_place_notes(), [], intent, result

    result = await fetch_lookup(intent, timezone=home.timezone if home else None)
    if not result:
        if intent.kind == "weather":
            spoken = f"I could not find weather for {intent.query}." if intent.query else "I could not find that weather."
            notes = weather_place_not_found_notes(intent.query)
            result = LookupResult(
                kind="weather",
                source="open-meteo",
                source_label="Open-Meteo weather",
                query=intent.query,
                summary=spoken,
                notes=notes,
                found=False,
                spoken=spoken,
            )
            return notes, [], intent, result
        spoken = "I could not find that in the lookup source."
        result = LookupResult(
            kind=intent.kind,
            source="lookup",
            source_label="Named live lookup",
            query=intent.query,
            summary=spoken,
            notes=spoken,
            found=False,
            spoken=spoken,
        )
        return spoken, [], intent, result
    if not result.spoken:
        result = LookupResult(
            kind=result.kind,
            source=result.source,
            source_label=result.source_label,
            query=result.query,
            summary=result.summary,
            notes=result.notes,
            found=result.found,
            spoken=result.notes,
        )

    safety = await filter_output(
        result.notes,
        preset,
        strictness,
        classifier_model,
        rules_only_classifier=rules_only_classifier,
    )
    if not safety.allowed:
        return (
            "A live lookup was skipped because the notes were not kid-safe. "
            "Do not invent weather, scores, or headlines. Say you could not check.",
            [],
            intent,
            None,
        )

    return lookup_prompt_notes(result), [lookup_card(result).to_dict()], intent, result


async def _wait_with_heartbeats(
    coro: Awaitable[_T],
    *,
    message: str,
    phase: str,
):
    """Await a coroutine, yielding status events so the kid-chat stream stays alive."""
    task = asyncio.create_task(coro)
    try:
        while not task.done():
            done, _pending = await asyncio.wait({task}, timeout=LOOKUP_HEARTBEAT_SECONDS)
            if not done:
                yield StatusEvent(message=message, phase=phase)
        yield task.result()
    except Exception:
        if not task.done():
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
        raise


def _combined_tool_hint(
    user_message: str,
    home: HomeContext | None = None,
    *,
    live_lookups: bool = False,
    session_state: SessionState | None = None,
) -> str:
    tz = home.timezone if home else None
    parts = [
        tool_prompt_hint(detect_intents(user_message)),
        clock_tool_hint(user_message, timezone=tz),
    ]
    if live_lookups:
        parts.append(
            lookup_request_hint(
                home_location=home.location if home else None,
                context=session_state.to_context() if session_state else None,
            )
        )
    return "\n\n".join(part for part in parts if part)


async def process_chat(
    user_message: str,
    messages: list[dict],
    preset: PolicyPreset,
    strictness: int,
    child_name: str,
    age: int,
    chat_model: str | None = None,
    classifier_model: str | None = None,
    homework_mode: bool = False,
    live_lookups: bool = False,
    home: HomeContext | None = None,
    classifier_enabled: bool = True,
    ai_tone: str = "balanced",
    ai_verbosity: int = 3,
    quick_chat: bool = False,
    session_state: SessionState | None = None,
    memory_items: list[dict] | None = None,
) -> PipelineResult:
    """Full pipeline: filter input → LLM → filter output."""
    rules_only = _rules_only_classifier(chat_model)
    input_result = await filter_input(
        user_message, preset, strictness, classifier_model,
        classifier_enabled=classifier_enabled,
        rules_only_classifier=rules_only,
    )
    if not input_result.allowed:
        return _blocked_result(input_result)

    resolved = resolve_turn(
        user_message,
        messages,
        session_state,
        home_location=home.location if home else None,
    )
    updated_state = resolved.state.with_topic(user_message)
    hint = _combined_tool_hint(
        user_message,
        home,
        live_lookups=live_lookups,
        session_state=resolved.state,
    )
    if resolved.context_hint:
        hint = "\n\n".join(part for part in (hint, resolved.context_hint) if part)
    filtered = input_result.content or user_message
    user_turn = format_user_turn(resolved, filtered_content=filtered)
    generate_kwargs = dict(
        child_name=child_name,
        age=age,
        preset=preset,
        model=chat_model,
        homework_mode=homework_mode,
        tool_hint=hint,
        home_label=home.label if home else None,
        ai_tone=ai_tone,
        ai_verbosity=ai_verbosity,
        quick_chat=quick_chat,
        memory_items=memory_items,
    )
    if live_lookups:
        lookup_notes, lookup_tools, intent, lookup_result = await resolve_live_lookup(
            "",
            live_lookups=True,
            preset=preset,
            strictness=strictness,
            classifier_model=classifier_model,
            history=messages,
            home=home,
            session_state=resolved.state,
            rules_only_classifier=rules_only,
            user_message=user_message,
        )
        if lookup_result and lookup_result.spoken:
            if intent:
                updated_state = updated_state.merge_lookup(intent, lookup_result)
            output_result = await filter_output(
                lookup_result.spoken, preset, strictness, classifier_model,
                classifier_enabled=classifier_enabled,
                rules_only_classifier=rules_only,
            )
            if not output_result.allowed:
                return _blocked_result(output_result)
            return PipelineResult(
                allowed=True,
                content=output_result.content,
                session_state=updated_state,
                tools=lookup_tools or None,
            )

    try:
        response = await generate_response(
            messages + [{"role": "user", "content": user_turn}],
            **generate_kwargs,
        )
    except Exception:
        return PipelineResult(allowed=False, block_reason="llm error", stage="llm")

    output_result = await filter_output(
        response, preset, strictness, classifier_model,
        classifier_enabled=classifier_enabled,
        rules_only_classifier=rules_only,
    )
    if not output_result.allowed:
        return _blocked_result(output_result)

    return PipelineResult(
        allowed=True,
        content=output_result.content,
        session_state=updated_state,
    )


async def process_chat_stream(
    user_message: str,
    messages: list[dict],
    preset: PolicyPreset,
    strictness: int,
    child_name: str,
    age: int,
    chat_model: str | None = None,
    classifier_model: str | None = None,
    homework_mode: bool = False,
    live_lookups: bool = False,
    home: HomeContext | None = None,
    classifier_enabled: bool = True,
    ai_tone: str = "balanced",
    ai_verbosity: int = 3,
    quick_chat: bool = False,
    session_state: SessionState | None = None,
    memory_items: list[dict] | None = None,
) -> AsyncIterator[str | PipelineResult | ToolEvent | StatusEvent]:
    """Stream pipeline: filter input first, then stream LLM, filter output at end."""
    rules_only = _rules_only_classifier(chat_model)
    yield StatusEvent(message="Checking your message…", phase="checking")
    input_result = await filter_input(
        user_message, preset, strictness, classifier_model,
        classifier_enabled=classifier_enabled,
        rules_only_classifier=rules_only,
    )
    if not input_result.allowed:
        yield _blocked_result(input_result)
        return

    resolved = resolve_turn(
        user_message,
        messages,
        session_state,
        home_location=home.location if home else None,
    )
    # Tell the client the safety check finished so Thinking is not a silent hang.
    yield StatusEvent(message="Writing a reply…", phase="generating")
    local_tools = [card.to_dict() for card in run_local_tools(user_message, timezone=home.timezone if home else None)]
    if local_tools:
        yield ToolEvent(local_tools)

    updated_state = resolved.state.with_topic(user_message)
    hint = _combined_tool_hint(
        user_message,
        home,
        live_lookups=live_lookups,
        session_state=resolved.state,
    )
    if resolved.context_hint:
        hint = "\n\n".join(part for part in (hint, resolved.context_hint) if part)
    filtered = input_result.content or user_message
    user_turn = format_user_turn(resolved, filtered_content=filtered)
    generate_kwargs = dict(
        child_name=child_name,
        age=age,
        preset=preset,
        model=chat_model,
        homework_mode=homework_mode,
        tool_hint=hint,
        home_label=home.label if home else None,
        ai_tone=ai_tone,
        ai_verbosity=ai_verbosity,
        quick_chat=quick_chat,
        memory_items=memory_items,
    )

    if live_lookups:
        lookup_notes, lookup_tools, intent, lookup_result = "", [], None, None
        async for item in _wait_with_heartbeats(
            resolve_live_lookup(
                "",
                live_lookups=True,
                preset=preset,
                strictness=strictness,
                classifier_model=classifier_model,
                history=messages,
                home=home,
                session_state=resolved.state,
                rules_only_classifier=rules_only,
                user_message=user_message,
            ),
            message="Looking that up…",
            phase="lookup",
        ):
            if isinstance(item, StatusEvent):
                yield item
            else:
                lookup_notes, lookup_tools, intent, lookup_result = item
        if lookup_result and lookup_result.spoken:
            if intent:
                updated_state = updated_state.merge_lookup(intent, lookup_result)
            if lookup_tools:
                yield ToolEvent(lookup_tools)
            output_result = await filter_output(
                lookup_result.spoken, preset, strictness, classifier_model,
                classifier_enabled=classifier_enabled,
                rules_only_classifier=rules_only,
            )
            if not output_result.allowed:
                yield _blocked_result(output_result)
                return
            yield output_result.content or lookup_result.spoken
            yield PipelineResult(
                allowed=True,
                content=output_result.content,
                session_state=updated_state,
                tools=lookup_tools or None,
            )
            return

    collected = []
    yield StatusEvent(message="Writing a reply…", phase="generating")
    try:
        async for token in stream_response(
            messages + [{"role": "user", "content": user_turn}],
            **generate_kwargs,
        ):
            collected.append(token)
            yield token
    except Exception:
        yield PipelineResult(allowed=False, block_reason="llm stream error", stage="llm")
        return

    if not collected:
        yield PipelineResult(allowed=False, block_reason="empty LLM stream", stage="llm")
        return

    full_response = "".join(collected)
    _visible, model_cards = extract_model_tools(full_response)
    extra = [card.to_dict() for card in model_cards if card.type != "lookup_request"]
    if extra:
        yield ToolEvent(extra)
    output_result = await filter_output(
        full_response, preset, strictness, classifier_model,
        classifier_enabled=classifier_enabled,
        rules_only_classifier=rules_only,
    )
    if not output_result.allowed:
        yield _blocked_result(output_result)
        return

    yield PipelineResult(
        allowed=True,
        content=output_result.content,
        session_state=updated_state,
    )
