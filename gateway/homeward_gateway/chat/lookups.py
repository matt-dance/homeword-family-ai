"""Named live lookups: weather, sports scores, and Wikipedia current events.

These are specific APIs — not a generic web search. Lookups only run when a
parent enables them for a child and the child's question matches a known kind.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

import httpx

from homeward_gateway.chat.tools import ToolCard
from homeward_gateway.config import settings

logger = logging.getLogger(__name__)

USER_AGENT = "Homeward/0.1 (local family AI; https://github.com/homeward)"

WEATHER_RE = re.compile(
    r"\b(weather|forecast|temperature|raining|rainy|snowing|snowy|humid|"
    r"thunderstorm|umbrella|how (hot|cold|warm)|need a (jacket|coat|hoodie))\b",
    re.IGNORECASE,
)
PLACE_IN_RE = re.compile(
    r"\b(?:in|for|at|near)\s+([A-Za-z][A-Za-z.'\-]+(?:\s+[A-Za-z][A-Za-z.'\-]+){0,2})\b"
)
PLACE_PREFIX_RE = re.compile(
    r"^([A-Za-z][A-Za-z.'\-]+(?:\s+[A-Za-z][A-Za-z.'\-]+){0,2})\s+(?:weather|forecast|temperature)\b",
    re.IGNORECASE,
)
CITY_STATE_RE = re.compile(
    r"\bin\s+([A-Za-z][A-Za-z .'-]+),\s*([A-Z]{2})\b"
)
SPORTS_VENUE_RE = re.compile(
    r" — [^—\n]+,\s*([A-Za-z][A-Za-z .'-]+),\s*([A-Z]{2})(?:\s|—|$)"
)
EVENT_TIME_RE = re.compile(
    r" — (?:Sat|Sun|Mon|Tue|Wed|Thu|Fri)[^—\n]+(?:AM|PM)[^—\n]*(?: —|$)"
)
VENUE_CITY_STATE_RE = re.compile(
    r"(?:Venue:\s*)?[^,\n]*,\s*([A-Za-z][A-Za-z .'-]+),\s*([A-Z]{2})\b"
)
REFERENTIAL_RE = re.compile(
    r"\b(that|this|those|these|there|then|it|they|them|their|"
    r"the game|that game|a game|the team|that team|the stadium|that stadium|"
    r"at the game|for the game|at that game|weather at the game|weather for the game)\b",
    re.IGNORECASE,
)
REFERENTIAL_PLACES = {
    "that game",
    "the game",
    "that stadium",
    "the stadium",
    "that team",
    "the team",
}
SPORTS_FOLLOWUP_RE = re.compile(
    r"\b(did they win|did we win|who won|what was the score|what(?:'s| is) the score|"
    r"how did they do|did they lose|the score|final score)\b",
    re.IGNORECASE,
)
_PLACE_STOP = {
    "a",
    "an",
    "celsius",
    "fahrenheit",
    "fall",
    "here",
    "how",
    "is",
    "it",
    "my",
    "our",
    "spring",
    "summer",
    "that",
    "the",
    "there",
    "this",
    "today",
    "tomorrow",
    "tonight",
    "what",
    "whats",
    "what's",
    "winter",
}

SPORTS_ASK_RE = re.compile(
    r"\b(who won|score|final score|did the|standings|playoff|game last night|"
    r"won last night|sports scores?|schedule|playing this|games this|"
    r"when (?:do|does|is|are)|next game|this weekend|matchup|"
    r"football game|basketball game|baseball game|hockey game|"
    r"college football|football schedule|basketball schedule)\b",
    re.IGNORECASE,
)
TEAM_EXTRACT_RES = (
    re.compile(
        r"\b([A-Za-z][A-Za-z.'\-]+(?:\s+[A-Za-z][A-Za-z.'\-]+){0,3})\s+"
        r"(?:schedule|football|basketball|baseball|hockey|game|games)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:did|do|does)\s+(?:the\s+)?([A-Za-z][A-Za-z.'\-]+(?:\s+[A-Za-z][A-Za-z.'\-]+){0,3})\s+"
        r"(?:win|play|have)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:when (?:do|does|is)|what(?:'s| is))\s+(?:the\s+)?"
        r"([A-Za-z][A-Za-z.'\-]+(?:\s+[A-Za-z][A-Za-z.'\-]+){0,3})\s+"
        r"(?:game|schedule|playing|play)\b",
        re.IGNORECASE,
    ),
)
_TEAM_STOP = {
    "a",
    "an",
    "any",
    "college",
    "current",
    "football",
    "he",
    "high",
    "it",
    "my",
    "our",
    "school",
    "she",
    "team",
    "the",
    "their",
    "them",
    "they",
    "this",
    "we",
    "what",
    "when",
    "who",
}
NEWS_RE = re.compile(
    r"\b(current events|in the news|today'?s news|world news|news headlines|"
    r"what(?:'s| is) (?:in )?the news)\b",
    re.IGNORECASE,
)
US_PRESIDENT_RE = re.compile(
    r"\b("
    r"president of (?:the )?(?:united states|usa|u\.s\.|america)|"
    r"(?:u\.s\.|american|united states) president|"
    r"who(?:'s| is) (?:the )?president(?: of (?:the )?(?:united states|usa|america))?|"
    r"who is president(?: of (?:the )?(?:united states|usa|america))?"
    r")\b",
    re.IGNORECASE,
)
WIKI_OFFICES: dict[str, tuple[str, re.Pattern[str]]] = {
    "President_of_the_United_States": (
        "President of the United States",
        US_PRESIDENT_RE,
    ),
}

# nickname / city / full name → (sport path, league path)
TEAM_LEAGUES: dict[str, tuple[str, str]] = {
    "nfl": ("football", "nfl"),
    "nba": ("basketball", "nba"),
    "mlb": ("baseball", "mlb"),
    "nhl": ("hockey", "nhl"),
    "wnba": ("basketball", "wnba"),
    "mls": ("soccer", "usa.1"),
    "broncos": ("football", "nfl"),
    "chiefs": ("football", "nfl"),
    "cowboys": ("football", "nfl"),
    "eagles": ("football", "nfl"),
    "49ers": ("football", "nfl"),
    "packers": ("football", "nfl"),
    "patriots": ("football", "nfl"),
    "seahawks": ("football", "nfl"),
    "ravens": ("football", "nfl"),
    "bills": ("football", "nfl"),
    "lakers": ("basketball", "nba"),
    "celtics": ("basketball", "nba"),
    "warriors": ("basketball", "nba"),
    "nuggets": ("basketball", "nba"),
    "knicks": ("basketball", "nba"),
    "bulls": ("basketball", "nba"),
    "heat": ("basketball", "nba"),
    "rockets": ("basketball", "nba"),
    "yankees": ("baseball", "mlb"),
    "red sox": ("baseball", "mlb"),
    "dodgers": ("baseball", "mlb"),
    "cubs": ("baseball", "mlb"),
    "mets": ("baseball", "mlb"),
    "braves": ("baseball", "mlb"),
    "rockies": ("baseball", "mlb"),
    "avalanche": ("hockey", "nhl"),
    "avs": ("hockey", "nhl"),
    "bruins": ("hockey", "nhl"),
    "rangers": ("hockey", "nhl"),
    "maple leafs": ("hockey", "nhl"),
    "oilers": ("hockey", "nhl"),
    "penguins": ("hockey", "nhl"),
    # College football (common schools; longer keys match before short nicknames)
    "boise state": ("football", "college-football"),
    "ohio state": ("football", "college-football"),
    "notre dame": ("football", "college-football"),
    "michigan state": ("football", "college-football"),
    "penn state": ("football", "college-football"),
    "florida state": ("football", "college-football"),
    "oregon state": ("football", "college-football"),
    "oklahoma state": ("football", "college-football"),
    "iowa state": ("football", "college-football"),
    "kansas state": ("football", "college-football"),
    "arizona state": ("football", "college-football"),
    "michigan": ("football", "college-football"),
    "alabama": ("football", "college-football"),
    "georgia": ("football", "college-football"),
    "clemson": ("football", "college-football"),
    "texas": ("football", "college-football"),
    "usc": ("football", "college-football"),
    "ucla": ("football", "college-football"),
}

WMO_LABELS = {
    0: "clear skies",
    1: "mostly clear",
    2: "partly cloudy",
    3: "overcast",
    45: "foggy",
    48: "foggy",
    51: "light drizzle",
    53: "drizzle",
    55: "heavy drizzle",
    61: "light rain",
    63: "rain",
    65: "heavy rain",
    71: "light snow",
    73: "snow",
    75: "heavy snow",
    80: "rain showers",
    81: "rain showers",
    82: "heavy showers",
    95: "thunderstorms",
    96: "thunderstorms with hail",
    99: "thunderstorms with hail",
}


@dataclass(frozen=True)
class LookupIntent:
    kind: str
    query: str
    date_range: str | None = None
    schedule: bool = False


@dataclass(frozen=True)
class LookupResult:
    kind: str
    source: str
    source_label: str
    query: str
    summary: str
    notes: str
    found: bool = True


@dataclass(frozen=True)
class SessionContext:
    """Structured entities extracted from recent chat turns."""

    place: str | None = None
    team: str | None = None
    venue: str | None = None
    event_time: str | None = None
    last_lookup_kind: str | None = None


def is_referential(message: str) -> bool:
    """True when the child is referring back to something from earlier in the chat."""
    return bool(REFERENTIAL_RE.search(message or ""))


def build_session_context(history: list[dict] | None, *, limit: int = 10) -> SessionContext:
    """Rebuild session entities from recent chat history (newest facts win)."""
    place = team = venue = event_time = last_kind = None
    recent = (history or [])[-limit:]
    for item in reversed(recent):
        content = item.get("content") or ""
        if not place:
            found = _extract_location(content)
            if found:
                place = found
        if not team:
            found = _matching_team_key(content) or _extract_sports_team(content)
            if found:
                team = found
        if not venue:
            match = SPORTS_VENUE_RE.search(content)
            if match:
                venue = f"{match.group(1).strip()}, {match.group(2).strip()}"
        if not event_time:
            found = _extract_event_time(content)
            if found:
                event_time = found
        if "<<<LOOKUP DATA" in content or "LIVE LOOKUP" in content:
            if "schedule:" in content or "scores:" in content:
                last_kind = "sports"
            elif "Open-Meteo" in content or "Weather" in content:
                last_kind = "weather"
            elif "Wikipedia" in content or "headlines" in content.lower():
                last_kind = "news"
        elif team and not last_kind:
            last_kind = "sports"
        elif place and WEATHER_RE.search(content) and not last_kind:
            last_kind = "weather"

    if not place and venue:
        place = venue

    return SessionContext(
        place=place,
        team=team,
        venue=venue,
        event_time=event_time,
        last_lookup_kind=last_kind,
    )


def detect_lookup_intent(message: str) -> LookupIntent | None:
    """Return at most one named lookup for this turn."""
    text = (message or "").strip()
    if not text:
        return None

    if WEATHER_RE.search(text):
        place = _extract_place(text)
        return LookupIntent("weather", place)

    if NEWS_RE.search(text):
        return LookupIntent("news", "current events")

    team_key = _matching_team_key(text) or _extract_sports_team(text)
    if SPORTS_ASK_RE.search(text) or team_key:
        if team_key:
            date_range = _sports_date_range(text)
            schedule = bool(
                date_range
                or re.search(r"\b(schedule|playing|games?|matchup|next game)\b", text, re.IGNORECASE)
            )
            return LookupIntent("sports", team_key, date_range=date_range, schedule=schedule)
        return None

    return None


def _is_place(value: str) -> bool:
    first = value.split()[0].lower()
    return first not in _PLACE_STOP and len(value) >= 2


def _normalize_place(candidate: str) -> str:
    words = candidate.strip().split()
    while len(words) > 1 and words[-1].lower() in _PLACE_STOP:
        words.pop()
    return " ".join(words)


def _looks_like_team(text: str) -> bool:
    lowered = text.lower().strip()
    if not lowered:
        return False
    return bool(_matching_team_key(lowered) or _extract_sports_team(lowered))


def _is_valid_place(candidate: str) -> bool:
    lowered = candidate.lower().strip()
    if not _is_place(candidate):
        return False
    if lowered in REFERENTIAL_PLACES:
        return False
    return not _looks_like_team(candidate)


def _extract_place(text: str) -> str:
    found = PLACE_IN_RE.search(text)
    if found:
        candidate = _normalize_place(found.group(1).strip())
        if _is_valid_place(candidate):
            return candidate
    prefixed = PLACE_PREFIX_RE.search(text)
    if prefixed:
        candidate = _normalize_place(prefixed.group(1).strip())
        if _is_valid_place(candidate):
            return candidate
    return ""


def _extract_city_state(text: str) -> str:
    """Pull a city from phrases like 'in Eugene, OR', venue bullets, or sports lines."""
    for pattern in (CITY_STATE_RE, SPORTS_VENUE_RE, VENUE_CITY_STATE_RE):
        match = pattern.search(text)
        if match:
            return f"{match.group(1).strip()}, {match.group(2).strip()}"
    return ""


def _extract_location(text: str) -> str:
    """Best-effort city for weather — prefer city/state and never return team names."""
    city = _extract_city_state(text)
    if city:
        return city
    return _extract_place(text)


def _extract_event_time(text: str) -> str:
    match = EVENT_TIME_RE.search(text)
    if not match:
        return ""
    return match.group(0).strip(" —")


def _extract_place_from_user_history(history: list[dict] | None) -> str:
    for item in reversed(history or []):
        if item.get("role") != "user":
            continue
        content = item.get("content") or ""
        place = _extract_location(content)
        if place:
            return place
    return ""


def _resolve_weather_place(
    message: str,
    context: SessionContext,
    history: list[dict] | None,
    *,
    home_location: str | None,
    referential: bool,
) -> str:
    place = _extract_place(message)
    if place:
        return place
    if referential and context.place:
        return context.place
    place = _extract_place_from_user_history(history)
    if place:
        return place
    return home_location or ""


def _resolve_sports_intent(
    message: str,
    context: SessionContext,
    referential: bool,
) -> LookupIntent | None:
    wants_sports = bool(SPORTS_ASK_RE.search(message) or SPORTS_FOLLOWUP_RE.search(message))
    if referential and context.team and wants_sports:
        date_range = _sports_date_range(message)
        schedule = bool(
            date_range
            or SPORTS_FOLLOWUP_RE.search(message)
            or re.search(r"\b(schedule|playing|games?|matchup|next game)\b", message, re.IGNORECASE)
        )
        return LookupIntent("sports", context.team, date_range=date_range, schedule=schedule)

    team_key = _matching_team_key(message) or _extract_sports_team(message)
    if team_key:
        date_range = _sports_date_range(message)
        schedule = bool(
            date_range
            or re.search(r"\b(schedule|playing|games?|matchup|next game)\b", message, re.IGNORECASE)
        )
        return LookupIntent("sports", team_key, date_range=date_range, schedule=schedule)

    return None


def detect_current_facts_intent(message: str) -> LookupIntent | None:
    text = (message or "").strip()
    if not text:
        return None
    for wiki_title, (label, pattern) in WIKI_OFFICES.items():
        if pattern.search(text):
            return LookupIntent("current_facts", wiki_title)
    return None


def resolve_lookup_intent(
    message: str,
    history: list[dict] | None = None,
    *,
    home_location: str | None = None,
    context: SessionContext | None = None,
) -> tuple[LookupIntent | None, SessionContext]:
    """Detect a lookup and fill missing slots from session + recent chat context."""
    text = (message or "").strip()
    if not text:
        return None, SessionContext()

    inferred = build_session_context(history)
    if context:
        ctx = SessionContext(
            place=context.place or inferred.place,
            team=context.team or inferred.team,
            venue=context.venue or inferred.venue,
            event_time=context.event_time or inferred.event_time,
            last_lookup_kind=context.last_lookup_kind or inferred.last_lookup_kind,
        )
    else:
        ctx = inferred
    referential = is_referential(text)

    current = detect_current_facts_intent(text)
    if current:
        return current, ctx

    if WEATHER_RE.search(text):
        place = _resolve_weather_place(
            text,
            ctx,
            history,
            home_location=home_location,
            referential=referential,
        )
        return LookupIntent("weather", place), ctx

    if NEWS_RE.search(text):
        return LookupIntent("news", "current events"), ctx

    sports = _resolve_sports_intent(text, ctx, referential)
    if sports:
        return sports, ctx

    return None, ctx


def lookup_context_hint(
    message: str,
    intent: LookupIntent,
    context: SessionContext,
    *,
    referential: bool,
) -> str:
    """Tell the model when a slot was inferred from earlier in the chat."""
    if not referential:
        return ""

    hints: list[str] = []
    if intent.kind == "weather" and context.place and not _extract_place(message):
        hints.append(f"The child is asking about {context.place} from earlier in this chat.")
    if intent.kind == "sports" and context.team and not (
        _matching_team_key(message) or _extract_sports_team(message)
    ):
        hints.append(f"The child is asking about {context.team} from earlier in this chat.")
    if context.event_time and intent.kind == "weather":
        hints.append(f"The event time discussed earlier was {context.event_time}.")
    return " ".join(hints)


def resolve_weather_place(
    message: str,
    history: list[dict] | None = None,
    *,
    home_location: str | None = None,
) -> str:
    """Find a city in this turn, recent chat context, or the household home."""
    context = build_session_context(history)
    return _resolve_weather_place(
        message,
        context,
        history,
        home_location=home_location,
        referential=is_referential(message),
    )


def format_geo_label(geo: dict[str, Any]) -> str:
    name = geo.get("name") or ""
    admin = geo.get("admin1") or ""
    country = geo.get("country") or ""
    return ", ".join(part for part in (name, admin, country) if part)


async def geocode_place(name: str) -> dict[str, Any] | None:
    """Resolve a place name via Open-Meteo geocoding."""
    try:
        async with _client() as client:
            geo_resp = await client.get(
                "https://geocoding-api.open-meteo.com/v1/search",
                params={"name": name, "count": 1, "language": "en", "format": "json"},
            )
            geo_resp.raise_for_status()
            results = (geo_resp.json() or {}).get("results") or []
            return results[0] if results else None
    except Exception as exc:
        logger.info("Geocoding failed for %s: %s", name, exc)
        return None


async def timezone_for_geo(geo: dict[str, Any]) -> str | None:
    """Read IANA timezone for coordinates from Open-Meteo."""
    try:
        async with _client() as client:
            forecast_resp = await client.get(
                "https://api.open-meteo.com/v1/forecast",
                params={
                    "latitude": geo["latitude"],
                    "longitude": geo["longitude"],
                    "current": "temperature_2m",
                    "forecast_days": 1,
                    "timezone": "auto",
                },
            )
            forecast_resp.raise_for_status()
            tz = (forecast_resp.json() or {}).get("timezone")
            return str(tz) if tz else None
    except Exception as exc:
        logger.info("Timezone lookup failed: %s", exc)
        return None


async def resolve_home_location(name: str) -> tuple[str, str, str | None] | None:
    """Geocode a home location and return (query, label, timezone)."""
    geo = await geocode_place(name)
    if not geo:
        return None
    label = format_geo_label(geo)
    timezone = await timezone_for_geo(geo)
    return name.strip(), label, timezone


def weather_missing_place_notes() -> str:
    return (
        "LIVE LOOKUP: Weather lookup is enabled but no city or town was named. "
        "Ask the child which place they mean (for example, their city). "
        "Do not invent weather, guess, or say you need a parent to look it up."
    )


def weather_place_not_found_notes(place: str) -> str:
    return (
        f"LIVE LOOKUP: Open-Meteo could not find “{place}”. "
        "Ask the child to try a nearby city name. "
        "Do not invent weather or say you need a parent to look it up."
    )


def _matching_team_key(text: str) -> str | None:
    lower = text.lower()
    for key in sorted(TEAM_LEAGUES, key=len, reverse=True):
        if re.search(rf"\b{re.escape(key)}(?:'s)?\b", lower):
            return key
    return None


def _normalize_team_candidate(candidate: str) -> str:
    words = candidate.strip().split()
    while words and words[0].lower() in _TEAM_STOP:
        words.pop(0)
    while words and words[-1].lower() in _TEAM_STOP:
        words.pop()
    return " ".join(words)


def _extract_sports_team(text: str) -> str | None:
    for pattern in TEAM_EXTRACT_RES:
        match = pattern.search(text)
        if not match:
            continue
        candidate = _normalize_team_candidate(match.group(1))
        if len(candidate) >= 2 and candidate.lower() not in _TEAM_STOP:
            return candidate.lower()
    return None


def _fmt_espn_date(day: date) -> str:
    return day.strftime("%Y%m%d")


def _sports_date_range(text: str) -> str | None:
    """Return an ESPN scoreboard dates param (YYYYMMDD or start-end)."""
    lower = text.lower()
    today = date.today()

    if "this weekend" in lower or "weekend" in lower:
        days_until_friday = (4 - today.weekday()) % 7
        friday = today + timedelta(days=days_until_friday)
        sunday = friday + timedelta(days=2)
        return f"{_fmt_espn_date(friday)}-{_fmt_espn_date(sunday)}"

    if "tomorrow" in lower:
        tomorrow = today + timedelta(days=1)
        return _fmt_espn_date(tomorrow)

    if "today" in lower or "tonight" in lower:
        return _fmt_espn_date(today)

    if "this week" in lower or "next game" in lower:
        end = today + timedelta(days=6)
        return f"{_fmt_espn_date(today)}-{_fmt_espn_date(end)}"

    return None


def weather_label(code: int | None) -> str:
    if code is None:
        return "unknown conditions"
    return WMO_LABELS.get(int(code), "mixed conditions")


def format_weather_notes(place: str, geo: dict[str, Any], forecast: dict[str, Any]) -> LookupResult:
    name = geo.get("name") or place
    admin = geo.get("admin1") or ""
    country = geo.get("country") or ""
    label = ", ".join(part for part in (name, admin, country) if part)

    current = forecast.get("current") or {}
    daily = forecast.get("daily") or {}
    temp = current.get("temperature_2m")
    wind = current.get("wind_speed_10m")
    code = current.get("weather_code")
    highs = daily.get("temperature_2m_max") or []
    lows = daily.get("temperature_2m_min") or []
    rain = daily.get("precipitation_probability_max") or []

    pieces = [f"Location: {label}."]
    if temp is not None:
        pieces.append(f"Right now it is {temp:.0f}°F and {weather_label(code)}.")
    if wind is not None:
        pieces.append(f"Wind is about {wind:.0f} mph.")
    if highs and lows:
        pieces.append(f"Today's high is {highs[0]:.0f}°F and the low is {lows[0]:.0f}°F.")
    if rain:
        pieces.append(f"Chance of precipitation today is {rain[0]}%.")
    if len(highs) > 1 and len(lows) > 1:
        pieces.append(f"Tomorrow's high is {highs[1]:.0f}°F and the low is {lows[1]:.0f}°F.")

    notes = " ".join(pieces)
    summary = f"{label} — {temp:.0f}°F, {weather_label(code)}" if temp is not None else label
    return LookupResult(
        kind="weather",
        source="open-meteo",
        source_label="Open-Meteo weather",
        query=label or place,
        summary=summary,
        notes=notes,
    )


def format_sports_notes(
    league_label: str,
    events: list[str],
    query: str,
    *,
    schedule: bool = False,
) -> LookupResult:
    kind_label = "schedule" if schedule else "scores"
    if not events:
        notes = f"No {league_label} {kind_label} matched “{query}” on the scoreboard."
        return LookupResult(
            kind="sports",
            source="espn-scoreboard",
            source_label="Public sports scoreboard",
            query=query,
            summary=notes,
            notes=notes,
            found=False,
        )

    header = f"{league_label} {'schedule' if schedule else 'scores'}:"
    lines = [header] + [f"- {event}" for event in events[:8]]
    notes = "\n".join(lines)
    return LookupResult(
        kind="sports",
        source="espn-scoreboard",
        source_label="Public sports scoreboard",
        query=query,
        summary=events[0],
        notes=notes,
    )


def format_news_notes(headlines: list[str]) -> LookupResult:
    if not headlines:
        notes = "Wikipedia did not return any current-event headlines."
        return LookupResult(
            kind="news",
            source="wikipedia-current-events",
            source_label="Wikipedia Current Events",
            query="current events",
            summary=notes,
            notes=notes,
            found=False,
        )
    lines = ["Wikipedia Current Events headlines:"] + [f"- {item}" for item in headlines[:6]]
    return LookupResult(
        kind="news",
        source="wikipedia-current-events",
        source_label="Wikipedia Current Events",
        query="current events",
        summary=headlines[0],
        notes="\n".join(lines),
    )


def lookup_card(result: LookupResult) -> ToolCard:
    return ToolCard(
        "lookup",
        {
            "kind": result.kind,
            "source": result.source,
            "source_label": result.source_label,
            "query": result.query,
            "summary": result.summary,
        },
    )


def lookup_prompt_notes(
    result: LookupResult,
    *,
    context_hint: str = "",
) -> str:
    prefix = f"{context_hint} " if context_hint else ""
    if result.found:
        sports_hint = ""
        facts_hint = ""
        if result.kind == "sports":
            sports_hint = (
                "For sports, use the home/away and venue lines exactly as written. "
                "Do not guess where a game is played or contradict the lookup. "
            )
        if result.kind == "current_facts":
            facts_hint = (
                "These are current facts from Wikipedia — not from your training data. "
                "Use the officeholder named below even if your training data says someone else. "
            )
        return (
            f"{prefix}"
            "LIVE LOOKUP RESULTS from a named source — not a generic web search. "
            f"Source: {result.source_label}. "
            "These facts were verified just now and ARE the answer. "
            "Summarize them clearly for the child. "
            f"{facts_hint}{sports_hint}"
            "Do NOT say you could not find information, could not check, or that a game "
            "was cancelled or postponed when results are listed below.\n\n"
            f"{result.notes}"
        )
    return (
        f"{prefix}"
        "LIVE LOOKUP from a named source — not a generic web search. "
        f"Source: {result.source_label}. "
        "No matching results were found. Say you could not find that in the lookup source. "
        "Do not invent weather, scores, or headlines.\n\n"
        f"{result.notes}"
    )


def _format_venue(competition: dict[str, Any]) -> str:
    venue = competition.get("venue") or {}
    full_name = str(venue.get("fullName") or "").strip()
    address = venue.get("address") or {}
    city = str(address.get("city") or "").strip()
    state = str(address.get("state") or "").strip()
    place = ", ".join(part for part in (city, state) if part)
    if full_name and place:
        return f"{full_name}, {place}"
    return full_name or place


def _format_event_time(event: dict[str, Any]) -> str:
    status_type = ((event.get("status") or {}).get("type") or {})
    detail = str(status_type.get("detail") or status_type.get("shortDetail") or "").strip()
    return detail


def _format_scoreboard_line(event: dict[str, Any], competition: dict[str, Any]) -> str:
    """Format one game as away-at-home with optional scores, venue, and kickoff."""
    status_type = ((event.get("status") or {}).get("type") or {})
    status = str(status_type.get("description") or "").strip()
    show_scores = bool(status_type.get("completed")) or status_type.get("state") == "in"

    home_team = away_team = ""
    home_score = away_score = ""
    for competitor in competition.get("competitors") or []:
        team_info = competitor.get("team") or {}
        team = team_info.get("displayName") or team_info.get("shortDisplayName") or "Team"
        side = str(competitor.get("homeAway") or "").lower()
        score = str(competitor.get("score") or "").strip()
        if side == "home":
            home_team = team
            home_score = score
        elif side == "away":
            away_team = team
            away_score = score

    if not home_team or not away_team:
        name = str(event.get("name") or "").strip()
        if name:
            line = name
        else:
            return ""
    elif show_scores and home_score and away_score:
        line = f"{away_team} {away_score} at {home_team} {home_score}"
    else:
        line = f"{away_team} at {home_team}"

    if status:
        line = f"{line} ({status})"

    venue = _format_venue(competition)
    if venue:
        line = f"{line} — {venue}"

    kickoff = _format_event_time(event)
    if kickoff and not status_type.get("completed"):
        line = f"{line} — {kickoff}"

    return line


def parse_scoreboard_events(
    payload: dict[str, Any],
    query: str,
    *,
    team_filter: str | None = None,
) -> list[str]:
    events: list[str] = []
    needle = (team_filter or query).lower()
    league_keys = {"nfl", "nba", "mlb", "nhl", "wnba", "mls"}
    filter_by_team = needle not in league_keys

    for event in payload.get("events") or []:
        name = str(event.get("name") or "")
        competitions = event.get("competitions") or []
        if not competitions:
            continue
        competition = competitions[0]
        team_names: list[str] = []
        for competitor in competition.get("competitors") or []:
            team_info = competitor.get("team") or {}
            team = team_info.get("displayName") or team_info.get("shortDisplayName") or "Team"
            location = team_info.get("location") or ""
            team_names.extend(part for part in (team, location) if part)

        haystack = " ".join([name, " ".join(team_names)]).lower()
        if filter_by_team and needle not in haystack:
            continue

        line = _format_scoreboard_line(event, competition)
        if line:
            events.append(line)
    return events


def _league_label(slug: str) -> str:
    labels = {
        "nfl": "NFL",
        "nba": "NBA",
        "mlb": "MLB",
        "nhl": "NHL",
        "wnba": "WNBA",
        "usa.1": "MLS",
        "college-football": "College Football",
        "mens-college-basketball": "College Basketball",
    }
    return labels.get(slug, slug.replace("-", " ").title())


def _sport_path_for_league(sport: str, league: str) -> tuple[str, str] | None:
    mapping = {
        ("football", "nfl"): ("football", "nfl"),
        ("football", "college-football"): ("football", "college-football"),
        ("basketball", "nba"): ("basketball", "nba"),
        ("basketball", "wnba"): ("basketball", "wnba"),
        ("basketball", "mens-college-basketball"): ("basketball", "mens-college-basketball"),
        ("baseball", "mlb"): ("baseball", "mlb"),
        ("hockey", "nhl"): ("hockey", "nhl"),
        ("soccer", "usa.1"): ("soccer", "usa.1"),
    }
    return mapping.get((sport, league))


async def _search_espn_team(query: str) -> dict[str, str] | None:
    """Resolve an unknown team name via ESPN's public search API."""
    try:
        async with _client() as client:
            resp = await client.get(
                "https://site.api.espn.com/apis/common/v3/search",
                params={"query": query, "limit": 5, "type": "team"},
            )
            resp.raise_for_status()
            for item in (resp.json() or {}).get("items") or []:
                if item.get("type") != "team":
                    continue
                sport = item.get("sport") or ""
                league = item.get("league") or item.get("defaultLeagueSlug") or ""
                if not _sport_path_for_league(sport, league):
                    continue
                return {
                    "sport": sport,
                    "league": league,
                    "display_name": item.get("displayName") or query,
                    "location": item.get("location") or query,
                }
    except Exception as exc:
        logger.info("ESPN team search failed for %s: %s", query, exc)
    return None


def parse_featured_headlines(payload: dict[str, Any]) -> list[str]:
    headlines: list[str] = []
    news = payload.get("news") or {}
    for item in news.get("mostread") or []:
        title = ((item.get("titles") or {}).get("normalized")) or item.get("title")
        if title:
            headlines.append(str(title))
    for story in (payload.get("onthisday") or [])[:3]:
        text = story.get("text")
        if text:
            headlines.append(str(text))
    # Featured feed also has a "news" list of story objects
    for story in news if isinstance(news, list) else []:
        if isinstance(story, dict):
            links = story.get("links") or []
            if links:
                title = (links[0].get("titles") or {}).get("normalized") or links[0].get("title")
                if title:
                    headlines.append(str(title))
    # Deduplicate while keeping order
    seen: set[str] = set()
    unique: list[str] = []
    for item in headlines:
        if item not in seen:
            seen.add(item)
            unique.append(item)
    return unique


async def fetch_lookup(intent: LookupIntent) -> LookupResult | None:
    if intent.kind == "weather":
        if not intent.query:
            return None
        return await _fetch_weather(intent.query)
    if intent.kind == "sports":
        return await _fetch_sports(intent)
    if intent.kind == "news":
        return await _fetch_news()
    if intent.kind == "current_facts":
        return await _fetch_current_facts(intent.query)
    return None


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        timeout=getattr(settings, "lookup_timeout", 8.0),
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
    )


async def _fetch_weather(place: str) -> LookupResult | None:
    try:
        geo = await geocode_place(place)
        if not geo:
            return None
        async with _client() as client:
            forecast_resp = await client.get(
                "https://api.open-meteo.com/v1/forecast",
                params={
                    "latitude": geo["latitude"],
                    "longitude": geo["longitude"],
                    "current": "temperature_2m,weather_code,wind_speed_10m",
                    "daily": "temperature_2m_max,temperature_2m_min,precipitation_probability_max",
                    "forecast_days": 2,
                    "temperature_unit": "fahrenheit",
                    "wind_speed_unit": "mph",
                    "timezone": "auto",
                },
            )
            forecast_resp.raise_for_status()
            return format_weather_notes(place, geo, forecast_resp.json())
    except Exception as exc:
        logger.info("Weather lookup failed: %s", exc)
        return None


async def _fetch_sports(intent: LookupIntent) -> LookupResult | None:
    query = intent.query.lower()
    team_filter: str | None = None
    sport: str
    slug: str
    label: str

    league = TEAM_LEAGUES.get(query)
    if league:
        sport, slug = league
        label = _league_label(slug)
    else:
        resolved = await _search_espn_team(intent.query)
        if not resolved:
            return None
        paths = _sport_path_for_league(resolved["sport"], resolved["league"])
        if not paths:
            return None
        sport, slug = paths
        label = _league_label(resolved["league"])
        team_filter = resolved.get("location") or resolved.get("display_name") or intent.query
        query = team_filter.lower()

    schedule = intent.schedule
    try:
        async with _client() as client:
            params: dict[str, str] = {}
            if intent.date_range:
                params["dates"] = intent.date_range
            resp = await client.get(
                f"https://site.api.espn.com/apis/site/v2/sports/{sport}/{slug}/scoreboard",
                params=params or None,
            )
            resp.raise_for_status()
            events = parse_scoreboard_events(resp.json(), query, team_filter=team_filter)
            display_query = team_filter or intent.query
            return format_sports_notes(label, events, display_query, schedule=schedule)
    except Exception as exc:
        logger.info("Sports lookup failed: %s", exc)
        return None


async def _fetch_news() -> LookupResult | None:
    today = date.today()
    try:
        async with _client() as client:
            resp = await client.get(
                f"https://api.wikimedia.org/feed/v1/wikipedia/en/featured/"
                f"{today:%Y}/{today:%m}/{today:%d}"
            )
            resp.raise_for_status()
            return format_news_notes(parse_featured_headlines(resp.json()))
    except Exception as exc:
        logger.info("News lookup failed: %s", exc)
        return None


def _parse_wikipedia_incumbent(wikitext: str) -> tuple[str, str]:
    incumbent = re.search(r"incumbent\s*=\s*\[\[([^|\]]+)", wikitext, re.IGNORECASE)
    since = re.search(r"incumbentsince\s*=\s*(.+)", wikitext, re.IGNORECASE)
    name = incumbent.group(1).strip() if incumbent else ""
    since_text = since.group(1).strip() if since else ""
    return name, since_text


def format_current_facts_notes(label: str, officeholder: str, since: str = "") -> LookupResult:
    lines = [f"{label}: The current officeholder is {officeholder}."]
    if since:
        lines.append(f"In office since {since}.")
    notes = " ".join(lines)
    return LookupResult(
        kind="current_facts",
        source="wikipedia",
        source_label="Wikipedia",
        query=label,
        summary=f"{label}: {officeholder}",
        notes=notes,
    )


async def _fetch_current_facts(wiki_title: str) -> LookupResult | None:
    label = WIKI_OFFICES.get(wiki_title, (wiki_title.replace("_", " "), None))[0]
    try:
        async with _client() as client:
            resp = await client.get(
                "https://en.wikipedia.org/w/api.php",
                params={
                    "action": "parse",
                    "page": wiki_title,
                    "prop": "wikitext",
                    "format": "json",
                },
            )
            resp.raise_for_status()
            wikitext = (resp.json().get("parse") or {}).get("wikitext", {}).get("*", "")
        officeholder, since = _parse_wikipedia_incumbent(wikitext)
        if not officeholder:
            return None
        return format_current_facts_notes(label, officeholder, since)
    except Exception as exc:
        logger.info("Current facts lookup failed for %s: %s", wiki_title, exc)
        return None
