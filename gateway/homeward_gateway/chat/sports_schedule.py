"""Team schedule objects: parse ESPN, pick a game, speak only from that record."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo


@dataclass(frozen=True)
class SportsGame:
    name: str
    home: str
    away: str
    opponent: str
    venue: str
    city: str
    state: str
    start: datetime
    completed: bool
    home_score: str = ""
    away_score: str = ""

    @property
    def venue_line(self) -> str:
        place = ", ".join(part for part in (self.city, self.state) if part)
        if self.venue and place:
            return f"{self.venue}, {place}"
        return self.venue or place


def _tzinfo(tz: str | None):
    if tz:
        try:
            return ZoneInfo(tz)
        except Exception:
            pass
    return datetime.now().astimezone().tzinfo


def competitor_score(value: Any) -> str:
    if isinstance(value, dict):
        return str(value.get("displayValue") or value.get("value") or "").strip()
    return str(value or "").strip()


def parse_espn_datetime(value: str) -> datetime | None:
    raw = (value or "").strip()
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None


def local_game_date(start: datetime, tz: str | None) -> date:
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    return start.astimezone(_tzinfo(tz)).date()


def friendly_kickoff(start: datetime, tz: str | None) -> str:
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    local = start.astimezone(_tzinfo(tz))
    day = local.day
    if 10 <= day % 100 <= 20:
        suffix = "th"
    else:
        suffix = {1: "st", 2: "nd", 3: "rd"}.get(day % 10, "th")
    hour = local.strftime("%I").lstrip("0") or "12"
    minute = local.strftime("%M")
    zone = local.strftime("%Z")
    return f"{local.strftime('%A, %B')} {day}{suffix} at {hour}:{minute} {local.strftime('%p')} {zone}".strip()


def parse_team_schedule(payload: dict[str, Any], *, subject: str) -> list[SportsGame]:
    games: list[SportsGame] = []
    subject_l = (subject or "").lower()
    for event in payload.get("events") or []:
        start = parse_espn_datetime(str(event.get("date") or ""))
        if not start:
            continue
        competitions = event.get("competitions") or []
        if not competitions:
            continue
        competition = competitions[0]
        status = (competition.get("status") or event.get("status") or {}).get("type") or {}
        venue = competition.get("venue") or {}
        address = venue.get("address") or {}
        home = away = ""
        home_score = away_score = ""
        for competitor in competition.get("competitors") or []:
            team = (competitor.get("team") or {}).get("displayName") or "Team"
            side = str(competitor.get("homeAway") or "").lower()
            score = competitor_score(competitor.get("score"))
            if side == "home":
                home, home_score = team, score
            elif side == "away":
                away, away_score = team, score
        if not home or not away:
            continue
        if subject_l and subject_l in home.lower():
            opponent = away
        elif subject_l and subject_l in away.lower():
            opponent = home
        else:
            opponent = away if subject_l in (event.get("name") or "").lower() else home
        games.append(
            SportsGame(
                name=str(event.get("name") or f"{away} at {home}"),
                home=home,
                away=away,
                opponent=opponent,
                venue=str(venue.get("fullName") or "").strip(),
                city=str(address.get("city") or "").strip(),
                state=str(address.get("state") or "").strip(),
                start=start,
                completed=bool(status.get("completed")),
                home_score=home_score,
                away_score=away_score,
            )
        )
    games.sort(key=lambda game: game.start)
    return games


def select_sports_game(
    games: list[SportsGame],
    *,
    when: str | None,
    now: datetime,
    tz: str | None,
) -> tuple[SportsGame | None, bool]:
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    today = local_game_date(now, tz)
    tomorrow = today + timedelta(days=1)
    future = [game for game in games if not game.completed and game.start >= now]
    past = [game for game in games if game.completed]

    if when == "tomorrow":
        day = [game for game in games if local_game_date(game.start, tz) == tomorrow]
        if day:
            return day[0], False
        return (future[0] if future else None), True

    if when == "today":
        day = [game for game in games if local_game_date(game.start, tz) == today]
        if day:
            return day[0], False
        if past:
            return past[-1], True
        return (future[0] if future else None), True

    if future:
        return future[0], False
    return (past[-1] if past else None), False


def speak_sports(
    team: str,
    game: SportsGame | None,
    *,
    when: str | None,
    day_miss: bool,
    tz: str | None,
) -> str:
    label = (team or "That team").strip()
    if not game:
        return f"I could not find a game for {label} on the sports schedule."
    kickoff = friendly_kickoff(game.start, tz)
    venue = game.venue_line or "the stadium listed on the schedule"
    if day_miss and when == "tomorrow":
        return (
            f"{label} do not play tomorrow. Their next game is {game.opponent} on {kickoff}. "
            f"The game is at {venue}."
        )
    if day_miss and when == "today":
        return (
            f"{label} did not play today. The next listed game is {game.opponent} on {kickoff}. "
            f"The game is at {venue}."
        )
    if game.completed and game.home_score and game.away_score:
        return (
            f"{label} played {game.opponent}. "
            f"The score was {game.away} {game.away_score} at {game.home} {game.home_score}."
        )
    return f"{label} play {game.opponent} on {kickoff}. The game is at {venue}."
