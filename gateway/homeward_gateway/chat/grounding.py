"""Primary grounding judge: retrieve first when an answer can go stale."""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from typing import Any

import httpx

from homeward_gateway.chat.lookup_tools import LookupToolCall, _when_arg
from homeward_gateway.chat.lookups import detect_current_facts_intent

logger = logging.getLogger(__name__)

FRESHNESS_VALUES = frozenset({"none", "stable", "days", "hours"})
PREFER_VALUES = frozenset({"weather", "sports", "news", "web", "any"})

_BARE_FOLLOW_UP_RE = re.compile(
    r"^\s*(tell me more|say more|explain more|what about|how about|"
    r"why|why is that|what do you mean|can you clarify|"
    r"go on|continue|and then|what else)\s*[?.!]?\s*$",
    re.IGNORECASE,
)

JUDGE_PROMPT = """You decide whether a child's question needs a live lookup.
Facts that can go stale or be checked must be retrieved. Never answer sports
scores, quarterbacks, conferences, officeholders, wars, or headlines from memory.

Return JSON only:
{{"needs_grounding": true or false, "freshness": "none" or "stable" or "days" or "hours", "query": "<short topic>", "prefer": "weather" or "sports" or "news" or "web" or "any"}}

Bias toward grounding when unsure.

Ground (needs_grounding true):
- sports teams, scores, quarterbacks, conferences, schedules
- weather, temperature, rain, jacket
- news headlines and current events
- wars, elections, officeholders, unfolding events

Do not ground (needs_grounding false):
- stories, riddles, feelings
- homework process and math
- timeless science such as what a black hole is

prefer:
- weather: weather and forecast
- sports: teams, scores, players, schedule
- news: general news headlines (Wikipedia In the News)
- web: a named current event, war, election, or other specific timely topic
- any: checkable but no named source

If the child says "tell me more" or similar, follow the LATEST topic, not an older leftover topic.

Latest topic:
{latest}

Open web search is {web_state}.

Recent chat:
{history}

Child message:
{message}
"""


@dataclass(frozen=True)
class GroundingDecision:
    needs_grounding: bool
    freshness: str
    query: str
    prefer: str


def is_bare_follow_up(message: str) -> bool:
    return bool(_BARE_FOLLOW_UP_RE.search((message or "").strip()))


def latest_user_topic(history: list[dict] | None, message: str = "") -> str:
    """Bare follow-ups resolve to the latest user topic, not leftover news."""
    text = (message or "").strip()
    if text and not is_bare_follow_up(text):
        return text
    for item in reversed(history or []):
        if item.get("role") != "user":
            continue
        content = str(item.get("content") or "").strip()
        if content and not is_bare_follow_up(content):
            return content
    return text


def extract_json_object(text: str) -> dict[str, Any] | None:
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


def _as_bool(value: Any, *, default: bool) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"true", "yes", "1"}:
            return True
        if lowered in {"false", "no", "0", "none", "null"}:
            return False
    return default


def parse_grounding_json(text: str) -> GroundingDecision | None:
    payload = extract_json_object(text)
    if not payload:
        return None
    needs = _as_bool(payload.get("needs_grounding"), default=True)
    freshness = str(payload.get("freshness") or "").strip().lower()
    if freshness not in FRESHNESS_VALUES:
        freshness = "days" if needs else "none"
    prefer = str(payload.get("prefer") or "").strip().lower()
    if prefer not in PREFER_VALUES:
        prefer = "any"
    query = payload.get("query")
    query_text = "" if query is None else str(query).strip()
    if prefer in {"sports", "news"} and freshness in {"hours", "days", "stable"}:
        needs = True
    return GroundingDecision(
        needs_grounding=needs,
        freshness=freshness,
        query=query_text,
        prefer=prefer,
    )


def tool_call_from_grounding(
    decision: GroundingDecision,
    *,
    open_web_search: bool,
    message: str = "",
) -> LookupToolCall | None:
    """Map a judge decision onto one allowlisted lookup. Flag gating happens at execute."""
    _ = open_web_search
    if not decision.needs_grounding:
        return None
    query = decision.query.strip() or (message or "").strip()
    prefer = decision.prefer
    from homeward_gateway.chat.lookup_tools import is_explicit_web_request

    if is_explicit_web_request(message):
        return LookupToolCall("search_web", {"query": query})
    if prefer == "weather":
        return LookupToolCall(
            "get_weather",
            {"place": query, "when": _when_arg(message)},
        )
    if prefer == "sports":
        return LookupToolCall(
            "get_sports",
            {"team": query, "when": _when_arg(message)},
        )
    if prefer == "news":
        return LookupToolCall("get_current_events", {})
    facts = detect_current_facts_intent(query) or detect_current_facts_intent(message)
    if facts:
        return LookupToolCall("get_current_facts", {"topic": facts.query})
    return LookupToolCall("search_web", {"query": query})


def _format_judge_history(history: list[dict] | None, *, limit: int = 8) -> str:
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


async def call_grounding_judge(
    message: str,
    history: list[dict] | None = None,
    *,
    open_web_search: bool = False,
    classifier_model: str | None = None,
) -> GroundingDecision | None:
    """One JSON judge call on the classifier-sized model. Fail closed to regex fallback."""
    from homeward_gateway.config import settings

    model = classifier_model or settings.classifier_model
    prompt = JUDGE_PROMPT.format(
        latest=latest_user_topic(history, message) or "(none)",
        web_state="available" if open_web_search else "not available",
        history=_format_judge_history(history),
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
                    "options": {"temperature": 0, "num_predict": 120},
                },
            )
            if resp.status_code != 200:
                return None
            text = (resp.json() or {}).get("response") or ""
            return parse_grounding_json(text)
    except Exception as exc:
        logger.info("Grounding judge skipped: %s", exc)
        return None


ASSESS_PROMPT = """Does this lookup data answer the child's question?
Return JSON only: {{"answers_question": true or false}}

True only if the notes contain the fact the child asked for.
A scoreboard or upcoming schedule does not answer who the quarterback, coach, or starter is.
"No matching results" is false.

Question:
{message}

Lookup notes:
{notes}
"""


def parse_evidence_json(text: str) -> bool | None:
    payload = extract_json_object(text)
    if not payload:
        return None
    if "answers_question" not in payload:
        return None
    return _as_bool(payload.get("answers_question"), default=False)


async def evidence_answers_question(
    message: str,
    notes: str,
    *,
    classifier_model: str | None = None,
) -> bool:
    """True when notes answer the question. Fail toward 'no' so we can try the web."""
    from homeward_gateway.config import settings

    model = classifier_model or settings.classifier_model
    prompt = ASSESS_PROMPT.format(
        message=(message or "").strip() or "(none)",
        notes=(notes or "").strip()[:1200] or "(empty)",
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
                    "options": {"temperature": 0, "num_predict": 40},
                },
            )
            if resp.status_code != 200:
                return False
            parsed = parse_evidence_json((resp.json() or {}).get("response") or "")
            return bool(parsed)
    except Exception as exc:
        logger.info("Evidence assess skipped: %s", exc)
        return False
