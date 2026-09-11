"""Allowlisted lookup tool loop: structured router (small models) or native tools."""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

import httpx

from homeward_gateway.chat.grounding import (
    GroundingDecision,
    call_grounding_judge,
    evidence_answers_question,
    tool_call_from_grounding,
)
from homeward_gateway.chat.lookup_tools import (
    LOOKUP_TOOL_NAMES,
    FilterNotes,
    LookupToolCall,
    LookupToolOutcome,
    execute_lookup_tool,
    openai_lookup_tools,
    regex_lookup_decision,
)
from homeward_gateway.chat.lookups import coerce_open_web_search
from homeward_gateway.models.prompts import _BASE_SAFETY

logger = logging.getLogger(__name__)

DecideFn = Callable[..., Awaitable[LookupToolCall | None]]
JudgeFn = Callable[..., Awaitable[GroundingDecision | None]]
ChatTurnFn = Callable[..., Awaitable["ModelTurn"]]

_EVIDENCE_ONLY_HINT = (
    "Write only from the tool result notes. "
    "Do not invent scores, player names, conferences, officeholders, wars, "
    "or headlines unless they appear in those notes. "
    "If the notes do not answer the question, say you could not find that "
    "in the lookup results. Do not say you cannot use the web or the internet."
)

ROUTER_PROMPT = """You choose at most one live lookup tool for a child's question.
Return JSON only: {{"tool": "<name>" or null, "args": {{}}}}

Tools:
- get_weather: weather, temperature, rain, jacket. args: place (city), when (today|tomorrow|weekend or "").
- get_current_events: Wikipedia In the News. Use for news headlines, "news stories from today", and current events. Prefer this over search_web for general news.
- search_web: timely specific topics (a named war, election, or unfolding event). NOT general news headlines.{web_note}
- get_sports: scores or schedule. args: team, when.
- get_current_facts: who currently holds a public office such as the US president. args: topic.

If the child says "tell me more" or similar, only pick a tool when the latest topic still needs a live lookup. Do not reuse an older news lookup after they changed topics.

Recent chat:
{history}

Child message:
{message}
"""


@dataclass
class ModelTurn:
    content: str = ""
    tool_calls: list[LookupToolCall] = field(default_factory=list)
    raw_message: dict[str, Any] = field(default_factory=dict)


@dataclass
class LookupToolLoopResult:
    outcomes: list[LookupToolOutcome] = field(default_factory=list)
    extra_messages: list[dict] = field(default_factory=list)
    cards: list[dict] = field(default_factory=list)
    intent: Any = None
    result: Any = None
    native: bool = False
    final_content: str | None = None
    needs_grounding: bool = False


def uses_native_lookup_tools(chat_model: str | None) -> bool:
    """Same >8GB split as the pipeline classifier skip — 3B/8B use the JSON router."""
    from homeward_gateway.config import settings
    from homeward_gateway.ollama.catalog import estimate_min_ram_gb

    return estimate_min_ram_gb(chat_model or settings.ollama_model) > 8


def lookup_tool_fact_hint(
    has_tool_results: bool = False,
    *,
    needs_grounding: bool = False,
) -> str:
    if needs_grounding or has_tool_results:
        return _EVIDENCE_ONLY_HINT
    return ""


def _extract_json_object(text: str) -> dict[str, Any] | None:
    raw = (text or "").strip()
    if not raw:
        return None
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not match:
        return None
    try:
        data = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def parse_router_json(text: str, *, open_web_search: bool) -> LookupToolCall | None:
    payload = _extract_json_object(text)
    if not payload:
        return None
    name = payload.get("tool")
    if name is None or name is False:
        return None
    if not isinstance(name, str):
        return None
    name = name.strip()
    if not name or name.lower() in {"null", "none", "nil"}:
        return None
    if name not in LOOKUP_TOOL_NAMES:
        return None
    if name == "search_web" and not open_web_search:
        return None
    args = payload.get("args") or {}
    if not isinstance(args, dict):
        args = {}
    cleaned = {str(key): "" if value is None else str(value) for key, value in args.items()}
    return LookupToolCall(name, cleaned)


def _format_router_history(history: list[dict] | None, *, limit: int = 8) -> str:
    lines: list[str] = []
    for item in (history or [])[-limit:]:
        role = item.get("role") or "user"
        if role not in {"user", "assistant"}:
            continue
        content = re.sub(r"\s+", " ", str(item.get("content") or "")).strip()
        if not content:
            continue
        lines.append(f"{role}: {content[:400]}")
    return "\n".join(lines) if lines else "(none)"


async def call_structured_router(
    message: str,
    history: list[dict] | None = None,
    *,
    open_web_search: bool = False,
    classifier_model: str | None = None,
) -> LookupToolCall | None:
    """One JSON router call on the classifier-sized model. Fail closed to regex fallback."""
    from homeward_gateway.config import settings

    model = classifier_model or settings.classifier_model
    web_note = (
        ""
        if open_web_search
        else " This tool is not available — never choose search_web."
    )
    prompt = ROUTER_PROMPT.format(
        web_note=web_note,
        history=_format_router_history(history),
        message=(message or "").strip(),
    )
    timeout = min(float(getattr(settings, "classifier_timeout", 5.0)), 5.0)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(
                f"{settings.ollama_base_url.rstrip('/')}/api/generate",
                json={
                    "model": model,
                    "prompt": prompt,
                    "stream": False,
                    "format": "json",
                    "keep_alive": "30m",
                    "options": {"temperature": 0, "num_predict": 80},
                },
            )
            if resp.status_code != 200:
                return None
            text = (resp.json() or {}).get("response") or ""
            return parse_router_json(text, open_web_search=open_web_search)
    except Exception as exc:
        logger.info("Lookup router skipped: %s", exc)
        return None


async def resolve_lookup_plan(
    message: str,
    history: list[dict] | None = None,
    *,
    open_web_search: bool = False,
    home_location: str | None = None,
    context: Any = None,
    classifier_model: str | None = None,
    judge: JudgeFn | None = None,
    router: DecideFn | None = None,
) -> tuple[GroundingDecision | None, LookupToolCall | None]:
    """Judge first. Regex / injected router run only when judge JSON is empty."""
    if judge is not None:
        decision = await judge(
            message,
            history,
            open_web_search=open_web_search,
        )
    else:
        decision = await call_grounding_judge(
            message,
            history,
            open_web_search=open_web_search,
            classifier_model=classifier_model,
        )
    if decision is not None:
        return decision, tool_call_from_grounding(
            decision,
            open_web_search=open_web_search,
            message=message,
        )
    if router is not None:
        routed = await router(
            message,
            history,
            open_web_search=open_web_search,
        )
        if routed is not None:
            return None, routed
    return None, regex_lookup_decision(
        message,
        history,
        home_location=home_location,
        open_web_search=open_web_search,
        context=context,
    )


async def decide_lookup_tool(
    message: str,
    history: list[dict] | None = None,
    *,
    open_web_search: bool = False,
    home_location: str | None = None,
    context: Any = None,
    classifier_model: str | None = None,
    judge: JudgeFn | None = None,
    router: DecideFn | None = None,
) -> LookupToolCall | None:
    _decision, call = await resolve_lookup_plan(
        message,
        history,
        open_web_search=open_web_search,
        home_location=home_location,
        context=context,
        classifier_model=classifier_model,
        judge=judge,
        router=router,
    )
    return call


def lookup_tool_messages(outcome: LookupToolOutcome) -> list[dict]:
    if not outcome.notes:
        return []
    source = ""
    if outcome.cards:
        source = str(outcome.cards[0].get("source_label") or "")
    prefix = f"Named source: {source}\n" if source else ""
    return [
        {
            "role": "assistant",
            "content": "",
            "tool_calls": [
                {
                    "type": "function",
                    "function": {"name": outcome.name, "arguments": outcome.args},
                }
            ],
        },
        {
            "role": "tool",
            "name": outcome.name,
            "content": f"{prefix}{outcome.notes}".strip(),
        },
    ]


def parse_model_tool_calls(message: dict[str, Any], *, open_web_search: bool) -> list[LookupToolCall]:
    calls: list[LookupToolCall] = []
    for item in message.get("tool_calls") or []:
        if not isinstance(item, dict):
            continue
        fn = item.get("function") if isinstance(item.get("function"), dict) else item
        name = str(fn.get("name") or "").strip()
        if name not in LOOKUP_TOOL_NAMES:
            continue
        if name == "search_web" and not open_web_search:
            continue
        args = fn.get("arguments") or {}
        if isinstance(args, str):
            try:
                args = json.loads(args)
            except json.JSONDecodeError:
                args = {}
        if not isinstance(args, dict):
            args = {}
        cleaned = {str(key): "" if value is None else str(value) for key, value in args.items()}
        calls.append(LookupToolCall(name, cleaned))
    return calls


def model_turn_from_message(message: dict[str, Any], *, open_web_search: bool) -> ModelTurn:
    content = message.get("content") or ""
    if not isinstance(content, str):
        content = str(content)
    return ModelTurn(
        content=content,
        tool_calls=parse_model_tool_calls(message, open_web_search=open_web_search),
        raw_message=message,
    )


def _empty_loop(*, native: bool = False, needs_grounding: bool = False) -> LookupToolLoopResult:
    return LookupToolLoopResult(native=native, needs_grounding=needs_grounding)


def _from_outcomes(
    outcomes: list[LookupToolOutcome],
    *,
    native: bool,
    final_content: str | None = None,
    needs_grounding: bool = False,
) -> LookupToolLoopResult:
    extra: list[dict] = []
    cards: list[dict] = []
    intent = None
    result = None
    kept: list[LookupToolOutcome] = []
    for outcome in outcomes:
        extra.extend(lookup_tool_messages(outcome))
        cards.extend(outcome.cards)
        if outcome.intent:
            intent = outcome.intent
        if outcome.result:
            result = outcome.result
        if not outcome.skipped:
            kept.append(outcome)
    return LookupToolLoopResult(
        outcomes=kept,
        extra_messages=extra,
        cards=cards,
        intent=intent,
        result=result,
        native=native,
        final_content=final_content,
        needs_grounding=needs_grounding,
    )


def _native_messages(
    message: str,
    history: list[dict] | None,
    system_prompt: str | None,
) -> list[dict]:
    """Kid-facing native turns always carry age, preset, and _BASE_SAFETY."""
    safety = (system_prompt or "").strip() or _BASE_SAFETY
    return [
        {"role": "system", "content": safety},
        *(history or []),
        {"role": "user", "content": message},
    ]


def _assistant_tool_call_message(turn: ModelTurn) -> dict:
    payload: dict[str, Any] = {
        "role": "assistant",
        "content": turn.content or "",
        "tool_calls": [
            {
                "type": "function",
                "function": {"name": call.name, "arguments": call.args},
            }
            for call in turn.tool_calls
        ],
    }
    raw_calls = (turn.raw_message or {}).get("tool_calls")
    if raw_calls:
        payload["tool_calls"] = raw_calls
    return payload


async def _native_loop(
    message: str,
    history: list[dict] | None,
    *,
    live_lookups: bool,
    open_web_search: bool,
    filter_notes: FilterNotes,
    home_location: str | None,
    context: Any,
    chat_turn: ChatTurnFn,
    max_native_steps: int,
    system_prompt: str | None = None,
) -> LookupToolLoopResult:
    tools = openai_lookup_tools(open_web_search=open_web_search)
    messages = _native_messages(message, history, system_prompt)
    outcomes: list[LookupToolOutcome] = []
    for _ in range(max(1, max_native_steps)):
        turn = await chat_turn(messages, tools=tools)
        if turn.tool_calls:
            messages.append(_assistant_tool_call_message(turn))
            for call in turn.tool_calls:
                outcome = await execute_lookup_tool(
                    call,
                    live_lookups=live_lookups,
                    open_web_search=open_web_search,
                    message=message,
                    filter_notes=filter_notes,
                    history=history,
                    home_location=home_location,
                    context=context,
                    assess=evidence_answers_question,
                )
                outcomes.append(outcome)
                for item in lookup_tool_messages(outcome):
                    if item.get("role") == "tool":
                        messages.append(item)
            continue
        return _from_outcomes(outcomes, native=True, final_content=turn.content or None)
    return _from_outcomes(outcomes, native=True, final_content=None)


async def run_lookup_tool_loop(
    message: str,
    history: list[dict] | None = None,
    *,
    live_lookups: bool,
    open_web_search: bool = False,
    chat_model: str | None = None,
    filter_notes: FilterNotes,
    home_location: str | None = None,
    context: Any = None,
    classifier_model: str | None = None,
    judge: JudgeFn | None = None,
    router: DecideFn | None = None,
    chat_turn: ChatTurnFn | None = None,
    max_native_steps: int = 3,
    system_prompt: str | None = None,
) -> LookupToolLoopResult:
    open_web_search = coerce_open_web_search(live_lookups, open_web_search)
    if not live_lookups:
        return _empty_loop()

    decision, call = await resolve_lookup_plan(
        message,
        history,
        open_web_search=open_web_search,
        home_location=home_location,
        context=context,
        classifier_model=classifier_model,
        judge=judge,
        router=router,
    )
    if decision is not None:
        if not decision.needs_grounding:
            return _empty_loop()
        if call is None:
            call = LookupToolCall("search_web", {"query": decision.query or message})
        outcome = await execute_lookup_tool(
            call,
            live_lookups=live_lookups,
            open_web_search=open_web_search,
            message=message,
            filter_notes=filter_notes,
            history=history,
            home_location=home_location,
            context=context,
            assess=evidence_answers_question,
        )
        return _from_outcomes([outcome], native=False, needs_grounding=True)

    # Judge JSON was empty, but regex/router already planned a lookup. Honor that
    # call for every model size so a 14B/27B native turn cannot skip sports, news,
    # or officeholder evidence and answer from memory.
    if call is None and uses_native_lookup_tools(chat_model):
        turn_fn = chat_turn
        if turn_fn is None:
            from homeward_gateway.models.router import complete_chat_turn

            async def turn_fn(messages, tools=None):
                raw = await complete_chat_turn(
                    messages,
                    tools=tools,
                    model=chat_model,
                )
                return model_turn_from_message(raw, open_web_search=open_web_search)

        native = await _native_loop(
            message,
            history,
            live_lookups=live_lookups,
            open_web_search=open_web_search,
            filter_notes=filter_notes,
            home_location=home_location,
            context=context,
            chat_turn=turn_fn,
            max_native_steps=max_native_steps,
            system_prompt=system_prompt,
        )
        native.needs_grounding = bool(native.outcomes or native.extra_messages)
        return native

    if call is None:
        return _empty_loop()
    outcome = await execute_lookup_tool(
        call,
        live_lookups=live_lookups,
        open_web_search=open_web_search,
        message=message,
        filter_notes=filter_notes,
        history=history,
        home_location=home_location,
        context=context,
        assess=evidence_answers_question,
    )
    return _from_outcomes([outcome], native=False, needs_grounding=True)
