"""Safety pipeline orchestration — fail-closed on every stage."""

from dataclasses import dataclass
from typing import AsyncIterator

from homeward_gateway.pipeline.classifier import classify
from homeward_gateway.pipeline.normalize import normalize, normalize_output
from homeward_gateway.pipeline.policy import PolicyPreset, check_policy_match
from homeward_gateway.pipeline.rules import check_rules
from homeward_gateway.chat.lookups import (
    LookupIntent,
    LookupResult,
    fetch_lookup,
    is_referential,
    lookup_card,
    lookup_context_hint,
    lookup_prompt_notes,
    resolve_lookup_intent,
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


async def resolve_live_lookup(
    user_message: str,
    *,
    live_lookups: bool,
    preset: PolicyPreset,
    strictness: int,
    classifier_model: str | None = None,
    history: list[dict] | None = None,
    home: HomeContext | None = None,
    session_state: SessionState | None = None,
    rules_only_classifier: bool = False,
) -> tuple[str, list[dict], LookupIntent | None, LookupResult | None]:
    """Fetch a named source only when the parent enabled it for this child."""
    if not live_lookups:
        return "", [], None, None

    context = session_state.to_context() if session_state else None
    intent, ctx = resolve_lookup_intent(
        user_message,
        history,
        home_location=home.location if home else None,
        context=context,
    )
    if not intent:
        return "", [], None, None

    if intent.kind == "weather" and not intent.query:
        return weather_missing_place_notes(), [], intent, None

    result = await fetch_lookup(intent)
    if not result:
        if intent.kind == "weather":
            return weather_place_not_found_notes(intent.query), [], intent, None
        return "", [], intent, None

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

    hint = lookup_context_hint(
        user_message,
        intent,
        ctx,
        referential=is_referential(user_message),
    )
    combined_hint = hint
    return lookup_prompt_notes(result, context_hint=combined_hint), [lookup_card(result).to_dict()], intent, result


def _combined_tool_hint(
    user_message: str,
    home: HomeContext | None = None,
) -> str:
    tz = home.timezone if home else None
    parts = [
        tool_prompt_hint(detect_intents(user_message)),
        clock_tool_hint(user_message, timezone=tz),
    ]
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
    lookup_notes, _lookup_tools, intent, lookup_result = await resolve_live_lookup(
        resolved.expanded_message,
        live_lookups=live_lookups,
        preset=preset,
        strictness=strictness,
        classifier_model=classifier_model,
        history=messages,
        home=home,
        session_state=resolved.state,
        rules_only_classifier=rules_only,
    )
    updated_state = resolved.state.with_topic(user_message)
    if intent and lookup_result:
        updated_state = updated_state.merge_lookup(intent, lookup_result)

    hint = _combined_tool_hint(user_message, home)
    if resolved.context_hint:
        hint = "\n\n".join(part for part in (hint, resolved.context_hint) if part)
    user_turn = format_user_turn(
        resolved,
        filtered_content=input_result.content or user_message,
        lookup_notes=lookup_notes,
    )
    try:
        response = await generate_response(
            messages + [{"role": "user", "content": user_turn}],
            child_name,
            age,
            preset,
            model=chat_model,
            homework_mode=homework_mode,
            tool_hint=hint,
            home_label=home.label if home else None,
            ai_tone=ai_tone,
            ai_verbosity=ai_verbosity,
            quick_chat=quick_chat,
            memory_items=memory_items,
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

    if live_lookups:
        yield StatusEvent(message="Looking that up…", phase="lookup")
    lookup_notes, lookup_tools, intent, lookup_result = await resolve_live_lookup(
        resolved.expanded_message,
        live_lookups=live_lookups,
        preset=preset,
        strictness=strictness,
        classifier_model=classifier_model,
        history=messages,
        home=home,
        session_state=resolved.state,
        rules_only_classifier=rules_only,
    )
    updated_state = resolved.state.with_topic(user_message)
    if intent and lookup_result:
        updated_state = updated_state.merge_lookup(intent, lookup_result)

    if lookup_tools:
        yield ToolEvent(lookup_tools)

    hint = _combined_tool_hint(user_message, home)
    if resolved.context_hint:
        hint = "\n\n".join(part for part in (hint, resolved.context_hint) if part)
    user_turn = format_user_turn(
        resolved,
        filtered_content=input_result.content or user_message,
        lookup_notes=lookup_notes,
    )
    collected = []
    yield StatusEvent(message="Writing a reply…", phase="generating")
    try:
        async for token in stream_response(
            messages + [{"role": "user", "content": user_turn}],
            child_name,
            age,
            preset,
            model=chat_model,
            homework_mode=homework_mode,
            tool_hint=hint,
            home_label=home.label if home else None,
            ai_tone=ai_tone,
            ai_verbosity=ai_verbosity,
            quick_chat=quick_chat,
            memory_items=memory_items,
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
    extra = [card.to_dict() for card in model_cards]
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
