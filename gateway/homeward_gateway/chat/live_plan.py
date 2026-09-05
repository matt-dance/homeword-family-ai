"""Plan live lookups from the child's words and lock spoken facts."""

from __future__ import annotations

import re

from homeward_gateway.chat.lookups import (
    NEWS_RE,
    SPORTS_LIVE_RE,
    US_PRESIDENT_RE,
    WEATHER_RE,
    WIKI_OFFICES,
    LookupIntent,
    SessionContext,
    _extract_location,
    _extract_sports_team,
    _map_current_facts_query,
    _matching_team_key,
    is_referential,
    normalize_sports_query,
    sports_when,
)
from homeward_gateway.chat.tools import extract_model_tools

_WEEKDAYS = frozenset(
    {"monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"}
)
_MONTHS = frozenset(
    {
        "january",
        "february",
        "march",
        "april",
        "may",
        "june",
        "july",
        "august",
        "september",
        "october",
        "november",
        "december",
    }
)
_VENUE_WORDS = frozenset({"stadium", "arena", "field", "coliseum", "center", "park"})


def _is_sports_question(text: str, context: SessionContext) -> bool:
    if not SPORTS_LIVE_RE.search(text):
        return False
    if _matching_team_key(text) or _extract_sports_team(text):
        return True
    if context.team:
        return True
    cleaned = normalize_sports_query(text)
    return bool(cleaned) and cleaned.lower() not in {"play", "game", "games"}


def plan_live_lookup(
    message: str,
    *,
    context: SessionContext | None = None,
    home_location: str | None = None,
) -> LookupIntent | None:
    """Map a child question onto a named source, or return None."""
    ctx = context or SessionContext()
    text = (message or "").strip()
    if not text:
        return None

    if WEATHER_RE.search(text):
        place = _extract_location(text) or ctx.place or home_location or ""
        return LookupIntent("weather", place)

    if US_PRESIDENT_RE.search(text) or any(pattern.search(text) for _label, pattern in WIKI_OFFICES.values()):
        mapped = _map_current_facts_query(text)
        if mapped:
            return LookupIntent("current_facts", mapped)

    if NEWS_RE.search(text):
        return LookupIntent("news", "current events")

    if _is_sports_question(text, ctx):
        extracted = _matching_team_key(text) or _extract_sports_team(text)
        if extracted and extracted.lower() in {"next", "upcoming", "game", "games"}:
            extracted = None
        if is_referential(text) and ctx.team:
            team = ctx.team
        else:
            team = extracted or normalize_sports_query(text) or ctx.team or ""
        team = normalize_sports_query(team) if team else ""
        if not team:
            return None
        return LookupIntent("sports", team, when=sports_when(text), schedule=True)

    return None


def _follow_up_is_safe(extra: str, spoken: str) -> bool:
    spoken_l = spoken.lower()
    for num in re.findall(r"\d+", extra):
        if num not in spoken:
            return False
    extra_l = extra.lower()
    for word in _WEEKDAYS | _MONTHS | _VENUE_WORDS:
        if word in extra_l and word not in spoken_l:
            return False
    for name in re.findall(r"\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b", extra):
        if name.lower() not in spoken_l:
            return False
    return True


def lock_spoken_reply(model_text: str, spoken: str) -> str:
    """Keep gateway facts. Drop any model add-on that introduces new live details."""
    visible, _cards = extract_model_tools(model_text or "")
    visible = visible.strip()
    spoken = (spoken or "").strip()
    if not spoken:
        return visible
    if spoken not in visible:
        return spoken
    extra = visible.replace(spoken, "", 1).strip()
    if extra and not _follow_up_is_safe(extra, spoken):
        return spoken
    return visible
