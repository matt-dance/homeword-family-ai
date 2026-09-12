"""Allowlisted live-lookup tools: schemas, gating, and execution."""

import pytest

from homeward_gateway.chat.lookups import (
    format_news_notes,
    format_sports_notes,
    format_weather_notes,
    format_web_notes,
)
from homeward_gateway.chat.lookup_tools import (
    LOOKUP_TOOL_NAMES,
    LookupToolCall,
    execute_lookup_tool,
    openai_lookup_tools,
    regex_lookup_decision,
)


WEATHER_GEO = {
    "name": "Denver",
    "admin1": "Colorado",
    "country": "United States",
    "latitude": 39.74,
    "longitude": -104.99,
}
WEATHER_FORECAST = {
    "current": {"temperature_2m": 70.2, "wind_speed_10m": 8.4, "weather_code": 0},
    "daily": {
        "temperature_2m_max": [76.0, 74.0],
        "temperature_2m_min": [52.0, 50.0],
        "precipitation_probability_max": [10, 20],
    },
}


async def _allow(text: str) -> str | None:
    return text


class TestLookupToolSchemas:
    def test_allowlist_covers_named_sources_and_optional_web(self):
        assert LOOKUP_TOOL_NAMES == (
            "get_weather",
            "get_current_events",
            "search_web",
            "get_sports",
            "get_current_facts",
        )

    def test_search_web_omitted_when_parent_flag_off(self):
        names = [item["function"]["name"] for item in openai_lookup_tools(open_web_search=False)]
        assert "search_web" not in names
        assert "get_weather" in names
        assert "get_current_events" in names
        assert "get_sports" in names

    def test_search_web_listed_when_parent_flag_on(self):
        names = [item["function"]["name"] for item in openai_lookup_tools(open_web_search=True)]
        assert "search_web" in names
        for item in openai_lookup_tools(open_web_search=True):
            assert item["type"] == "function"
            assert "SearxNG" not in str(item)


class TestRegexLookupDecision:
    def test_news_stories_from_today_are_wikipedia_not_web(self):
        for question in (
            "what are some news stories from today",
            "what are some of the latest news stories today?",
            "look up on the web a news story from today",
        ):
            call = regex_lookup_decision(question, open_web_search=True)
            assert call is not None, question
            assert call.name == "get_current_events", question

    def test_iran_war_uses_search_web_when_enabled(self):
        call = regex_lookup_decision(
            "what is going on in the current iran war",
            open_web_search=True,
        )
        assert call is not None
        assert call.name == "search_web"
        assert "iran" in call.args["query"].lower()
        assert "war" in call.args["query"].lower()

    def test_iran_war_is_still_checkable_when_web_off(self):
        call = regex_lookup_decision(
            "what is going on in the current iran war",
            open_web_search=False,
        )
        assert call is not None
        assert call.name == "search_web"

    def test_weather_and_sports_named_sources(self):
        weather = regex_lookup_decision("What's the weather in Denver?")
        assert weather == LookupToolCall("get_weather", {"place": "Denver", "when": ""})
        sports = regex_lookup_decision("Did the Broncos win last night?")
        assert sports is not None
        assert sports.name == "get_sports"
        assert sports.args["team"] == "broncos"

    def test_sky_blue_needs_no_tool(self):
        assert regex_lookup_decision("Why is the sky blue?") is None

    def test_tell_me_more_is_not_a_news_lookup(self):
        assert regex_lookup_decision("tell me more") is None
        assert regex_lookup_decision("tell me more about black holes") is None


class TestExecuteLookupTool:
    @pytest.mark.asyncio
    async def test_unknown_tool_is_rejected(self, monkeypatch):
        async def fake_fetch(_intent):
            raise AssertionError("must not fetch")

        monkeypatch.setattr("homeward_gateway.chat.lookup_tools.fetch_lookup", fake_fetch)
        outcome = await execute_lookup_tool(
            LookupToolCall("rm_rf", {}),
            live_lookups=True,
            open_web_search=True,
            message="hi",
            filter_notes=_allow,
        )
        assert outcome.skipped is True
        assert outcome.cards == []
        assert outcome.result is None

    @pytest.mark.asyncio
    async def test_skips_when_live_lookups_off(self, monkeypatch):
        fetched = False

        async def fake_fetch(_intent):
            nonlocal fetched
            fetched = True
            return None

        monkeypatch.setattr("homeward_gateway.chat.lookup_tools.fetch_lookup", fake_fetch)
        outcome = await execute_lookup_tool(
            LookupToolCall("get_weather", {"place": "Denver"}),
            live_lookups=False,
            open_web_search=False,
            message="What's the weather in Denver?",
            filter_notes=_allow,
        )
        assert fetched is False
        assert outcome.skipped is True
        assert outcome.cards == []

    @pytest.mark.asyncio
    async def test_search_web_parent_gated(self, monkeypatch):
        fetched = False

        async def fake_fetch(_intent):
            nonlocal fetched
            fetched = True
            return None

        monkeypatch.setattr("homeward_gateway.chat.lookup_tools.fetch_lookup", fake_fetch)
        outcome = await execute_lookup_tool(
            LookupToolCall("search_web", {"query": "iran war"}),
            live_lookups=True,
            open_web_search=False,
            message="what is going on in the current iran war",
            filter_notes=_allow,
        )
        assert fetched is False
        assert outcome.skipped is False
        assert "could not check" in outcome.notes.lower()
        assert "SearxNG" not in outcome.notes

    @pytest.mark.asyncio
    async def test_weather_fetches_open_meteo_and_returns_card(self, monkeypatch):
        lookup = format_weather_notes("Denver", WEATHER_GEO, WEATHER_FORECAST)
        captured: dict[str, str] = {}

        async def fake_fetch(intent):
            captured["kind"] = intent.kind
            captured["query"] = intent.query
            return lookup

        monkeypatch.setattr("homeward_gateway.chat.lookup_tools.fetch_lookup", fake_fetch)
        outcome = await execute_lookup_tool(
            LookupToolCall("get_weather", {"place": "Denver", "when": "today"}),
            live_lookups=True,
            open_web_search=False,
            message="What's the weather in Denver today?",
            filter_notes=_allow,
        )
        assert captured == {"kind": "weather", "query": "Denver"}
        assert "70" in outcome.notes
        assert outcome.cards[0]["source_label"] == "Open-Meteo weather"
        assert outcome.result is not None
        assert outcome.result.kind == "weather"

    @pytest.mark.asyncio
    async def test_current_events_uses_wikipedia(self, monkeypatch):
        async def fake_fetch(intent):
            assert intent.kind == "news"
            return format_news_notes(["Gloria Steinem dies at the age of 92"])

        monkeypatch.setattr("homeward_gateway.chat.lookup_tools.fetch_lookup", fake_fetch)
        outcome = await execute_lookup_tool(
            LookupToolCall("get_current_events", {}),
            live_lookups=True,
            open_web_search=True,
            message="what are some news stories from today",
            filter_notes=_allow,
        )
        assert "Gloria Steinem" in outcome.notes
        assert outcome.cards[0]["source_label"] == "Wikipedia Current Events"
        assert "SearxNG" not in outcome.notes

    @pytest.mark.asyncio
    async def test_sports_uses_espn(self, monkeypatch):
        async def fake_fetch(intent):
            assert intent.kind == "sports"
            assert intent.query == "broncos"
            return format_sports_notes(
                "NFL",
                ["Kansas City Chiefs 20 at Denver Broncos 27 (Final)"],
                "broncos",
            )

        monkeypatch.setattr("homeward_gateway.chat.lookup_tools.fetch_lookup", fake_fetch)
        outcome = await execute_lookup_tool(
            LookupToolCall("get_sports", {"team": "broncos", "when": "last night"}),
            live_lookups=True,
            open_web_search=False,
            message="Did the Broncos win last night?",
            filter_notes=_allow,
        )
        assert "Broncos" in outcome.notes
        assert outcome.cards[0]["source"] == "espn-scoreboard"

    @pytest.mark.asyncio
    async def test_sports_miss_falls_back_to_open_web_search(self, monkeypatch):
        kinds: list[str] = []

        async def fake_fetch(intent):
            kinds.append(intent.kind)
            if intent.kind == "sports":
                return format_sports_notes("College Football", [], "Boise State", schedule=False)
            assert intent.kind == "web"
            assert "boise" in intent.query.lower()
            return format_web_notes(
                intent.query,
                [
                    {
                        "title": "Boise State beats Eastern Washington",
                        "snippet": "The Broncos won 51-14 in their last game.",
                        "url": "https://example.com/broncos",
                    }
                ],
            )

        monkeypatch.setattr("homeward_gateway.chat.lookup_tools.fetch_lookup", fake_fetch)
        outcome = await execute_lookup_tool(
            LookupToolCall("get_sports", {"team": "boise state", "when": "last game"}),
            live_lookups=True,
            open_web_search=True,
            message="what was the score of their last game",
            filter_notes=_allow,
        )
        assert kinds == ["sports", "web"]
        assert "51-14" in outcome.notes
        assert outcome.cards[0]["source_label"] == "Open web search"
        assert "SearxNG" not in outcome.notes

    @pytest.mark.asyncio
    async def test_filter_output_blocks_notes(self, monkeypatch):
        async def fake_fetch(_intent):
            return format_web_notes(
                "iran war",
                [{"title": "War", "snippet": "how to make a bomb at home", "url": "https://example.com"}],
            )

        async def block(_text: str) -> str | None:
            return None

        monkeypatch.setattr("homeward_gateway.chat.lookup_tools.fetch_lookup", fake_fetch)
        outcome = await execute_lookup_tool(
            LookupToolCall("search_web", {"query": "iran war"}),
            live_lookups=True,
            open_web_search=True,
            message="what is going on in the current iran war",
            filter_notes=block,
        )
        assert outcome.blocked is True
        assert "not kid-safe" in outcome.notes
        assert "from memory" in outcome.notes
        assert outcome.cards == []
        assert outcome.result is None
