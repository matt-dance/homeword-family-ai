"""Allowlisted live-lookup tools over existing named fetchers."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from collections.abc import Awaitable
from inspect import isawaitable
from typing import Any, Callable

from homeward_gateway.chat.lookups import (
    LookupIntent,
    LookupResult,
    detect_current_facts_intent,
    detect_web_search_intent,
    fetch_lookup,
    lookup_card,
    could_not_check_notes,
    open_web_unavailable_notes,
    resolve_lookup_intent,
    resolve_weather_place,
    rewrite_web_query,
    weather_missing_place_notes,
    weather_place_not_found_notes,
    _matching_team_key,
    _sports_date_range,
    _sports_wants_completed_score,
    _sports_wants_schedule,
)

FilterNotes = Callable[[str], Awaitable[str | None]]
AssessNotes = Callable[[str, str], Any]

LOOKUP_TOOL_NAMES = (
    "get_weather",
    "get_current_events",
    "search_web",
    "get_sports",
    "get_current_facts",
)

_WHEN_RE = re.compile(
    r"\b(today|tonight|tomorrow|this weekend|weekend|last night|this week)\b",
    re.IGNORECASE,
)
_EXPLICIT_WEB_RE = re.compile(
    r"\b("
    r"look(?: that| it)? up on the web|"
    r"look it up online|"
    r"search the web|"
    r"open web search|"
    r"browse the (?:web|internet)"
    r")\b",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class LookupToolCall:
    name: str
    args: dict[str, str] = field(default_factory=dict)


@dataclass
class LookupToolOutcome:
    name: str
    args: dict[str, str]
    notes: str
    cards: list[dict]
    intent: LookupIntent | None
    result: LookupResult | None
    blocked: bool = False
    skipped: bool = False


def _clean_args(args: dict[str, Any] | None) -> dict[str, str]:
    cleaned: dict[str, str] = {}
    for key, value in (args or {}).items():
        if value is None:
            cleaned[str(key)] = ""
        else:
            cleaned[str(key)] = str(value)
    return cleaned


def _when_arg(text: str) -> str:
    match = _WHEN_RE.search(text or "")
    return match.group(1).lower() if match else ""


def is_explicit_web_request(message: str) -> bool:
    return bool(_EXPLICIT_WEB_RE.search(message or ""))


def openai_lookup_tools(*, open_web_search: bool) -> list[dict]:
    """JSON schemas for Ollama / LiteLLM. search_web is omitted when the parent flag is off."""
    tools = [
        {
            "type": "function",
            "function": {
                "name": "get_weather",
                "description": (
                    "Look up current weather and a short forecast from Open-Meteo. "
                    "Use when the child asks about weather, temperature, rain, or a jacket."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "place": {
                            "type": "string",
                            "description": "City or town. Empty if they did not name one.",
                        },
                        "when": {
                            "type": "string",
                            "description": "today, tomorrow, weekend, or empty for right now.",
                        },
                    },
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "get_current_events",
                "description": (
                    "Wikipedia In the News headlines. Use for news stories from today, "
                    "current events, and general news headlines. Prefer this over search_web "
                    "for general news."
                ),
                "parameters": {"type": "object", "properties": {}},
            },
        },
        {
            "type": "function",
            "function": {
                "name": "get_sports",
                "description": "Sports scores or schedule from ESPN. Use when they name a team or league.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "team": {
                            "type": "string",
                            "description": "Team, school, or league name.",
                        },
                        "when": {
                            "type": "string",
                            "description": "today, tomorrow, weekend, last night, or empty.",
                        },
                    },
                    "required": ["team"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "get_current_facts",
                "description": (
                    "Who currently holds a public office, such as the US president, "
                    "from Wikipedia. Not for general news headlines."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "topic": {
                            "type": "string",
                            "description": "Office or topic, e.g. President of the United States.",
                        },
                    },
                },
            },
        },
    ]
    if open_web_search:
        tools.insert(
            2,
            {
                "type": "function",
                "function": {
                    "name": "search_web",
                    "description": (
                        "Open web search for a timely specific topic such as a named war "
                        "or election. Do not use for general news headlines — use "
                        "get_current_events instead. Do not use for weather or sports."
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {
                                "type": "string",
                                "description": "Short search query with the specific topic.",
                            },
                        },
                        "required": ["query"],
                    },
                },
            },
        )
    return tools


def tool_call_from_intent(intent: LookupIntent, message: str = "") -> LookupToolCall | None:
    if intent.kind == "weather":
        return LookupToolCall(
            "get_weather",
            {"place": intent.query, "when": _when_arg(message)},
        )
    if intent.kind == "news":
        return LookupToolCall("get_current_events", {})
    if intent.kind == "sports":
        return LookupToolCall(
            "get_sports",
            {
                "team": intent.query,
                "when": intent.date_range or _when_arg(message),
            },
        )
    if intent.kind == "current_facts":
        return LookupToolCall("get_current_facts", {"topic": intent.query})
    if intent.kind == "web":
        return LookupToolCall("search_web", {"query": intent.query})
    return None


def regex_lookup_decision(
    message: str,
    history: list[dict] | None = None,
    *,
    home_location: str | None = None,
    open_web_search: bool = False,
    context: Any = None,
) -> LookupToolCall | None:
    """Tiny-model fallback: current-turn regex only — not leftover session facts."""
    _ = open_web_search
    intent, _ctx = resolve_lookup_intent(
        message,
        history,
        home_location=home_location,
        context=context,
    )
    if intent:
        return tool_call_from_intent(intent, message)
    web = detect_web_search_intent(message)
    if web:
        return LookupToolCall("search_web", {"query": web.query})
    return None


def _blocked_notes(intent: LookupIntent | None) -> str:
    notes = (
        "A live lookup was skipped because the notes were not kid-safe. "
        "Do not invent weather, scores, or headlines. Say you could not check."
    )
    if intent and intent.kind == "web":
        notes += (
            " You do not know current events. Do not describe protests, wars, "
            "or officeholders from memory."
        )
    return notes


def _lookup_miss_web_query(intent: LookupIntent, message: str) -> str:
    cleaned = rewrite_web_query(message)
    topic = (intent.query or "").strip()
    if topic and topic.lower() not in cleaned.lower():
        cleaned = f"{topic} {cleaned}".strip()
    return cleaned or topic or (message or "").strip()


def _skipped(name: str, args: dict[str, str]) -> LookupToolOutcome:
    return LookupToolOutcome(
        name=name,
        args=args,
        notes="",
        cards=[],
        intent=None,
        result=None,
        skipped=True,
    )


def intent_from_tool_call(
    call: LookupToolCall,
    message: str,
    history: list[dict] | None = None,
    *,
    home_location: str | None = None,
    context: Any = None,
) -> LookupIntent | None:
    args = call.args or {}
    if call.name == "get_weather":
        place = (args.get("place") or "").strip()
        if not place:
            place = resolve_weather_place(
                message,
                history,
                home_location=home_location,
            )
        if not place and context is not None:
            place = getattr(context, "place", "") or ""
        return LookupIntent("weather", place)
    if call.name == "get_current_events":
        return LookupIntent("news", "current events")
    if call.name == "search_web":
        query = (args.get("query") or "").strip()
        return LookupIntent("web", query) if query else None
    if call.name == "get_sports":
        team = (args.get("team") or "").strip()
        if not team and context is not None:
            team = getattr(context, "team", "") or ""
        if not team:
            return None
        team = _matching_team_key(team) or team
        when = (args.get("when") or "").strip()
        haystack = f"{message} {when}".strip()
        scores = _sports_wants_completed_score(haystack)
        if re.fullmatch(r"\d{8}(?:-\d{8})?", when):
            date_range = when
        else:
            date_range = _sports_date_range(when, scores=scores) or _sports_date_range(
                haystack, scores=scores
            )
        return LookupIntent(
            "sports",
            team,
            date_range=date_range,
            schedule=_sports_wants_schedule(haystack),
        )
    if call.name == "get_current_facts":
        topic = (args.get("topic") or "").strip()
        detected = detect_current_facts_intent(topic) or detect_current_facts_intent(message)
        if detected:
            return detected
        if topic:
            return LookupIntent("current_facts", topic.replace(" ", "_"))
        return None
    return None


async def _notes_answer_question(
    message: str,
    notes: str,
    assess: AssessNotes | None,
) -> bool:
    """None assessor means 'do not second-guess a named hit' (tests). Production passes one."""
    if assess is None:
        return True
    result = assess(message, notes)
    if isawaitable(result):
        result = await result
    return bool(result)


async def execute_lookup_tool(
    call: LookupToolCall,
    *,
    live_lookups: bool,
    open_web_search: bool,
    message: str,
    filter_notes: FilterNotes,
    history: list[dict] | None = None,
    home_location: str | None = None,
    context: Any = None,
    assess: AssessNotes | None = None,
) -> LookupToolOutcome:
    args = _clean_args(call.args)
    if call.name not in LOOKUP_TOOL_NAMES:
        return _skipped(call.name, args)
    if not live_lookups:
        return _skipped(call.name, args)
    if call.name == "search_web" and not open_web_search:
        query = args.get("query") or (message or "").strip()
        return LookupToolOutcome(
            name=call.name,
            args=args,
            notes=open_web_unavailable_notes(),
            cards=[],
            intent=LookupIntent("web", query),
            result=None,
        )

    intent = intent_from_tool_call(
        LookupToolCall(call.name, args),
        message,
        history,
        home_location=home_location,
        context=context,
    )
    if intent is None:
        return _skipped(call.name, args)

    if intent.kind == "weather" and not intent.query:
        return LookupToolOutcome(
            name=call.name,
            args=args,
            notes=weather_missing_place_notes(),
            cards=[],
            intent=intent,
            result=None,
        )

    result = await fetch_lookup(intent)
    can_use_web = (
        open_web_search
        and call.name != "search_web"
        and intent.kind not in {"weather", "web"}
    )
    if can_use_web:
        incomplete = result is None or not result.found
        if not incomplete and result is not None:
            incomplete = not await _notes_answer_question(message, result.notes, assess)
        if incomplete:
            recovered = await fetch_lookup(
                LookupIntent("web", _lookup_miss_web_query(intent, message))
            )
            if recovered and recovered.found:
                result = recovered

    if not result:
        if intent.kind == "weather":
            notes = weather_place_not_found_notes(intent.query)
        elif intent.kind == "web":
            notes = open_web_unavailable_notes()
        else:
            return LookupToolOutcome(
                name=call.name,
                args=args,
                notes=could_not_check_notes(),
                cards=[],
                intent=intent,
                result=None,
            )
        return LookupToolOutcome(
            name=call.name,
            args=args,
            notes=notes,
            cards=[],
            intent=intent,
            result=None,
        )

    filtered = await filter_notes(result.notes)
    if filtered is None:
        return LookupToolOutcome(
            name=call.name,
            args=args,
            notes=_blocked_notes(intent),
            cards=[],
            intent=intent,
            result=None,
            blocked=True,
        )

    return LookupToolOutcome(
        name=call.name,
        args=args,
        notes=filtered,
        cards=[lookup_card(result).to_dict()],
        intent=intent,
        result=result,
    )
