"""Clock hints/cards must use household local time, not container UTC."""

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from homeward_gateway.chat.lookups import resolve_home_location
from homeward_gateway.chat.tools import clock_tool_hint, current_clock_card, run_local_tools
from homeward_gateway.home.timezone import now_in_timezone, resolve_display_timezone


# Scout S1/S2 failure: Sunday 10:36 PM MDT was shown as Monday 4:36 AM UTC.
EVENING_MDT_AS_UTC = datetime(2026, 9, 7, 4, 36, tzinfo=timezone.utc)


def test_zoneinfo_resolves_america_denver():
    zone = ZoneInfo("America/Denver")
    assert zone.key == "America/Denver"


def test_evening_mdt_does_not_flip_to_utc_monday():
    card = current_clock_card(now=EVENING_MDT_AS_UTC, timezone="America/Denver")
    assert card.data["time"] == "10:36 PM"
    assert card.data["date"] == "Sunday, September 06, 2026"
    assert card.data["timezone"] == "MDT"

    hint = clock_tool_hint(
        "What day is today?",
        timezone="America/Denver",
        now=EVENING_MDT_AS_UTC,
    )
    assert "10:36 PM" in hint
    assert "Sunday, September 06, 2026" in hint
    assert "MDT" in hint
    assert "Monday" not in hint
    assert "4:36 AM" not in hint


def test_clock_hint_and_card_share_the_same_timezone():
    card = current_clock_card(now=EVENING_MDT_AS_UTC, timezone="America/Denver")
    hint = clock_tool_hint("what time is it?", timezone="America/Denver", now=EVENING_MDT_AS_UTC)
    assert card.data["time"] in hint
    assert card.data["date"] in hint
    assert card.data["timezone"] in hint


def test_clock_card_still_gated_on_explicit_time_ask():
    joke = run_local_tools("Tell me a joke", timezone="America/Denver")
    assert not any(card.type == "clock" for card in joke)

    asked = run_local_tools("What time is it?", timezone="America/Denver")
    assert any(card.type == "clock" and card.data["time"] for card in asked)


def test_resolve_display_timezone_prefers_household(monkeypatch):
    monkeypatch.setattr("homeward_gateway.home.timezone.settings.timezone", "America/New_York")
    monkeypatch.setenv("TZ", "America/Chicago")
    assert resolve_display_timezone("America/Denver") == "America/Denver"


def test_resolve_display_timezone_uses_homeward_then_tz(monkeypatch):
    monkeypatch.setattr("homeward_gateway.home.timezone.settings.timezone", "Pacific/Auckland")
    monkeypatch.setenv("TZ", "America/Chicago")
    assert resolve_display_timezone(None) == "Pacific/Auckland"

    monkeypatch.setattr("homeward_gateway.home.timezone.settings.timezone", "")
    assert resolve_display_timezone(None) == "America/Chicago"

    monkeypatch.delenv("TZ", raising=False)
    assert resolve_display_timezone(None) is None


def test_now_in_timezone_converts_utc_instant():
    moment = now_in_timezone("America/Denver", EVENING_MDT_AS_UTC)
    assert moment.tzinfo == ZoneInfo("America/Denver")
    assert moment.hour == 22
    assert moment.day == 6
    assert moment.strftime("%A") == "Sunday"


async def test_resolve_home_location_uses_geocode_timezone(monkeypatch):
    async def fake_geocode(name: str):
        return {
            "name": "Denver",
            "admin1": "Colorado",
            "country": "United States",
            "timezone": "America/Denver",
            "latitude": 39.74,
            "longitude": -104.99,
        }

    async def fail_forecast(_geo):
        raise AssertionError("forecast timezone lookup should not run when geocode has timezone")

    monkeypatch.setattr("homeward_gateway.chat.lookups.geocode_place", fake_geocode)
    monkeypatch.setattr("homeward_gateway.chat.lookups.timezone_for_geo", fail_forecast)
    resolved = await resolve_home_location("Denver, CO")
    assert resolved is not None
    query, label, tz = resolved
    assert query == "Denver, CO"
    assert "Denver" in label
    assert tz == "America/Denver"
