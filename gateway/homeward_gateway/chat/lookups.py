"""Named live lookups: weather, sports scores, and Wikipedia current events.

These are specific APIs — not a generic web search. Lookups only run when a
parent enables them for a child and the child's question matches a known kind.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import date
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
    r"won last night|sports scores?)\b",
    re.IGNORECASE,
)
NEWS_RE = re.compile(
    r"\b(current events|in the news|today'?s news|world news|news headlines|"
    r"what(?:'s| is) (?:in )?the news)\b",
    re.IGNORECASE,
)

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


@dataclass(frozen=True)
class LookupResult:
    kind: str
    source: str
    source_label: str
    query: str
    summary: str
    notes: str


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

    if SPORTS_ASK_RE.search(text) or _matching_team_key(text):
        key = _matching_team_key(text)
        if key:
            return LookupIntent("sports", key)
        return None

    return None


def _is_place(value: str) -> bool:
    first = value.split()[0].lower()
    return first not in _PLACE_STOP and len(value) >= 2


def _extract_place(text: str) -> str:
    found = PLACE_IN_RE.search(text)
    if found:
        candidate = found.group(1).strip()
        if _is_place(candidate):
            return candidate
    prefixed = PLACE_PREFIX_RE.search(text)
    if prefixed:
        candidate = prefixed.group(1).strip()
        if _is_place(candidate):
            return candidate
    return ""


def _matching_team_key(text: str) -> str | None:
    lower = text.lower()
    for key in sorted(TEAM_LEAGUES, key=len, reverse=True):
        if re.search(rf"\b{re.escape(key)}\b", lower):
            return key
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


def format_sports_notes(league_label: str, events: list[dict[str, Any]], query: str) -> LookupResult:
    if not events:
        notes = f"No {league_label} games matched “{query}” on today's scoreboard."
        return LookupResult(
            kind="sports",
            source="espn-scoreboard",
            source_label="Public sports scoreboard",
            query=query,
            summary=notes,
            notes=notes,
        )

    lines = [f"{league_label} scores:"]
    for event in events[:6]:
        lines.append(f"- {event}")
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


def lookup_prompt_notes(result: LookupResult) -> str:
    return (
        "LIVE LOOKUP NOTES from a named source — not a generic web search. "
        f"Source: {result.source_label}. "
        "Use only these notes for current facts. If they do not answer the child, "
        "say you could not check. Do not invent weather, scores, or headlines.\n\n"
        f"{result.notes}"
    )


def parse_scoreboard_events(payload: dict[str, Any], query: str) -> list[str]:
    events: list[str] = []
    needle = query.lower()
    for event in payload.get("events") or []:
        name = str(event.get("name") or "")
        status = ((event.get("status") or {}).get("type") or {}).get("description") or ""
        competitions = event.get("competitions") or []
        if not competitions:
            continue
        teams = []
        for competitor in competitions[0].get("competitors") or []:
            team = (competitor.get("team") or {}).get("displayName") or "Team"
            score = competitor.get("score") or "0"
            teams.append(f"{team} {score}")
        haystack = " ".join([name, " ".join(teams)]).lower()
        if needle not in {"nfl", "nba", "mlb", "nhl", "wnba", "mls"} and needle not in haystack:
            continue
        line = " vs ".join(teams)
        if status:
            line = f"{line} ({status})"
        events.append(line)
    return events


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
        return await _fetch_sports(intent.query)
    if intent.kind == "news":
        return await _fetch_news()
    return None


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        timeout=getattr(settings, "lookup_timeout", 8.0),
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
    )


async def _fetch_weather(place: str) -> LookupResult | None:
    try:
        async with _client() as client:
            geo_resp = await client.get(
                "https://geocoding-api.open-meteo.com/v1/search",
                params={"name": place, "count": 1, "language": "en", "format": "json"},
            )
            geo_resp.raise_for_status()
            results = (geo_resp.json() or {}).get("results") or []
            if not results:
                return None
            geo = results[0]
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


async def _fetch_sports(query: str) -> LookupResult | None:
    league = TEAM_LEAGUES.get(query.lower())
    if not league:
        return None
    sport, slug = league
    label = slug.replace("usa.1", "MLS").upper() if slug != "usa.1" else "MLS"
    if slug == "nfl":
        label = "NFL"
    elif slug == "nba":
        label = "NBA"
    elif slug == "mlb":
        label = "MLB"
    elif slug == "nhl":
        label = "NHL"
    elif slug == "wnba":
        label = "WNBA"
    try:
        async with _client() as client:
            resp = await client.get(
                f"https://site.api.espn.com/apis/site/v2/sports/{sport}/{slug}/scoreboard"
            )
            resp.raise_for_status()
            events = parse_scoreboard_events(resp.json(), query)
            return format_sports_notes(label, events, query)
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
