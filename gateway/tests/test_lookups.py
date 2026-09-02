"""Named live lookups: detection, formatters, and parent-toggle gating."""

import pytest

from homeward_gateway.chat.lookups import (
    LookupResult,
    detect_lookup_intent,
    format_news_notes,
    format_sports_notes,
    format_weather_notes,
    lookup_card,
    lookup_prompt_notes,
    parse_featured_headlines,
    parse_scoreboard_events,
    resolve_weather_place,
    weather_missing_place_notes,
)
from homeward_gateway.pipeline.pipeline import (
    PipelineResult,
    ToolEvent,
    process_chat,
    process_chat_stream,
    resolve_live_lookup,
)
from homeward_gateway.pipeline.policy import load_all_presets


PRESETS = load_all_presets()
YOUNG = PRESETS["young_explorer"]


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


class TestDetectLookupIntent:
    def test_weather_with_place(self):
        intent = detect_lookup_intent("What's the weather in Denver?")
        assert intent is not None
        assert intent.kind == "weather"
        assert intent.query == "Denver"

    def test_weather_lowercase_place(self):
        intent = detect_lookup_intent("weather in seattle")
        assert intent is not None
        assert intent.kind == "weather"
        assert intent.query.lower() == "seattle"

    def test_weather_prefix(self):
        intent = detect_lookup_intent("Denver weather today")
        assert intent is not None
        assert intent.query == "Denver"

    def test_weather_without_place_still_detected(self):
        intent = detect_lookup_intent("Do I need a jacket?")
        assert intent is not None
        assert intent.kind == "weather"
        assert intent.query == ""

    def test_weather_tomorrow_detected(self):
        intent = detect_lookup_intent("What's the weather tomorrow?")
        assert intent is not None
        assert intent.kind == "weather"

    def test_resolve_weather_place_from_history(self):
        place = resolve_weather_place(
            "What's the weather tomorrow?",
            [{"role": "user", "content": "We live in Denver"}],
        )
        assert place == "Denver"

    def test_resolve_weather_place_uses_home_fallback(self):
        place = resolve_weather_place(
            "What's the weather tomorrow?",
            home_location="Boulder, CO",
        )
        assert place == "Boulder, CO"

    def test_weather_missing_place_notes(self):
        assert "city or town" in weather_missing_place_notes().lower()

    def test_news(self):
        intent = detect_lookup_intent("What's in the news today?")
        assert intent is not None
        assert intent.kind == "news"

    def test_sports_team(self):
        intent = detect_lookup_intent("Did the Broncos win last night?")
        assert intent is not None
        assert intent.kind == "sports"
        assert intent.query == "broncos"

    def test_sports_college_schedule(self):
        intent = detect_lookup_intent("What's Boise State's schedule this weekend?")
        assert intent is not None
        assert intent.kind == "sports"
        assert intent.query == "boise state"
        assert intent.schedule is True
        assert intent.date_range is not None

    def test_sports_extracts_unknown_team(self):
        intent = detect_lookup_intent("When does Oregon play this week?")
        assert intent is not None
        assert intent.kind == "sports"
        assert "oregon" in intent.query

    def test_sports_without_team_is_ignored(self):
        assert detect_lookup_intent("Who won last night?") is None

    def test_unrelated_question(self):
        assert detect_lookup_intent("Why is the sky blue?") is None

    def test_empty(self):
        assert detect_lookup_intent("") is None


class TestFormatters:
    def test_weather_notes_include_source(self):
        result = format_weather_notes("Denver", WEATHER_GEO, WEATHER_FORECAST)
        assert result.source == "open-meteo"
        assert result.source_label == "Open-Meteo weather"
        assert "70" in result.summary
        assert "clear skies" in result.notes
        assert "Open-Meteo" in lookup_prompt_notes(result)
        assert "verified just now" in lookup_prompt_notes(result)

    def test_lookup_prompt_notes_empty_sports(self):
        result = format_sports_notes("NFL", [], "unknown team")
        prompt = lookup_prompt_notes(result)
        assert result.found is False
        assert "No matching results" in prompt
        assert "could not find" in prompt.lower()

    def test_sports_notes(self):
        result = format_sports_notes(
            "NFL",
            ["Kansas City Chiefs 17 at Denver Broncos 24 (Final)"],
            "broncos",
        )
        assert result.source == "espn-scoreboard"
        assert result.source_label == "Public sports scoreboard"
        assert "Broncos" in result.summary

    def test_sports_schedule_notes(self):
        result = format_sports_notes(
            "College Football",
            [
                "Eastern Washington Eagles 14 at Boise State Broncos 51 (Final)"
                " — Albertsons Stadium, Boise, ID"
            ],
            "Boise State",
            schedule=True,
        )
        assert result.found is True
        assert "schedule" in result.notes.lower()
        assert "Boise State" in result.summary
        prompt = lookup_prompt_notes(result)
        assert "Do NOT say you could not find" in prompt
        assert "Do not guess where a game is played" in prompt
        assert "Boise State" in prompt

    def test_news_notes(self):
        result = format_news_notes(["Mars rover finds a new rock"])
        assert result.source == "wikipedia-current-events"
        assert result.source_label == "Wikipedia Current Events"
        assert "Mars rover" in result.summary

    def test_lookup_card_shape(self):
        result = format_news_notes(["A headline"])
        card = lookup_card(result)
        assert card.type == "lookup"
        assert card.data["source_label"] == "Wikipedia Current Events"


class TestParsers:
    def test_parse_scoreboard_filters_team(self):
        payload = {
            "events": [
                {
                    "name": "Kansas City Chiefs at Denver Broncos",
                    "status": {
                        "type": {
                            "description": "Final",
                            "completed": True,
                            "state": "post",
                        }
                    },
                    "competitions": [
                        {
                            "competitors": [
                                {
                                    "homeAway": "home",
                                    "team": {"displayName": "Denver Broncos", "location": "Denver"},
                                    "score": "24",
                                },
                                {
                                    "homeAway": "away",
                                    "team": {"displayName": "Kansas City Chiefs", "location": "Kansas City"},
                                    "score": "17",
                                },
                            ]
                        }
                    ],
                },
                {
                    "name": "New York Giants at Dallas Cowboys",
                    "status": {"type": {"description": "Final", "completed": True, "state": "post"}},
                    "competitions": [
                        {
                            "competitors": [
                                {
                                    "homeAway": "home",
                                    "team": {"displayName": "Dallas Cowboys"},
                                    "score": "10",
                                },
                                {
                                    "homeAway": "away",
                                    "team": {"displayName": "New York Giants"},
                                    "score": "7",
                                },
                            ]
                        }
                    ],
                },
            ]
        }
        events = parse_scoreboard_events(payload, "broncos")
        assert len(events) == 1
        assert events[0] == "Kansas City Chiefs 17 at Denver Broncos 24 (Final)"

    def test_parse_scoreboard_college_location_filter(self):
        payload = {
            "events": [
                {
                    "name": "Eastern Washington Eagles at Boise State Broncos",
                    "status": {
                        "type": {
                            "description": "Final",
                            "completed": True,
                            "state": "post",
                        }
                    },
                    "competitions": [
                        {
                            "venue": {
                                "fullName": "Albertsons Stadium",
                                "address": {"city": "Boise", "state": "ID"},
                            },
                            "competitors": [
                                {
                                    "homeAway": "home",
                                    "team": {"displayName": "Boise State Broncos", "location": "Boise State"},
                                    "score": "51",
                                },
                                {
                                    "homeAway": "away",
                                    "team": {"displayName": "Eastern Washington Eagles", "location": "Eastern Washington"},
                                    "score": "14",
                                },
                            ],
                        }
                    ],
                },
            ]
        }
        events = parse_scoreboard_events(payload, "boise state", team_filter="Boise State")
        assert len(events) == 1
        assert events[0] == (
            "Eastern Washington Eagles 14 at Boise State Broncos 51 (Final)"
            " — Albertsons Stadium, Boise, ID"
        )

    def test_parse_scoreboard_scheduled_includes_venue_and_kickoff(self):
        payload = {
            "events": [
                {
                    "name": "Boise State Broncos at Oregon Ducks",
                    "status": {
                        "type": {
                            "description": "Scheduled",
                            "completed": False,
                            "state": "pre",
                            "detail": "Sat, September 5th at 3:30 PM EDT",
                        }
                    },
                    "competitions": [
                        {
                            "venue": {
                                "fullName": "Autzen Stadium",
                                "address": {"city": "Eugene", "state": "OR"},
                            },
                            "competitors": [
                                {
                                    "homeAway": "home",
                                    "team": {"displayName": "Oregon Ducks", "location": "Oregon"},
                                    "score": "0",
                                },
                                {
                                    "homeAway": "away",
                                    "team": {"displayName": "Boise State Broncos", "location": "Boise State"},
                                    "score": "0",
                                },
                            ],
                        }
                    ],
                },
            ]
        }
        events = parse_scoreboard_events(payload, "boise state", team_filter="Boise State")
        assert len(events) == 1
        assert events[0] == (
            "Boise State Broncos at Oregon Ducks (Scheduled)"
            " — Autzen Stadium, Eugene, OR — Sat, September 5th at 3:30 PM EDT"
        )

    def test_parse_featured_headlines(self):
        payload = {
            "news": {
                "mostread": [{"titles": {"normalized": "Solar eclipse"}}],
            },
            "onthisday": [{"text": "On this day a telescope launched."}],
        }
        headlines = parse_featured_headlines(payload)
        assert "Solar eclipse" in headlines
        assert any("telescope" in item for item in headlines)


class TestResolveLiveLookup:
    @pytest.mark.asyncio
    async def test_disabled_does_not_fetch(self, monkeypatch):
        called = False

        async def fake_fetch(_intent):
            nonlocal called
            called = True
            return None

        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.fetch_lookup", fake_fetch)
        notes, tools = await resolve_live_lookup(
            "What's the weather in Denver?",
            live_lookups=False,
            preset=YOUNG,
            strictness=3,
        )
        assert notes == ""
        assert tools == []
        assert called is False

    @pytest.mark.asyncio
    async def test_enabled_injects_notes_and_card(self, monkeypatch):
        result = format_weather_notes("Denver", WEATHER_GEO, WEATHER_FORECAST)

        async def fake_fetch(_intent):
            return result

        async def fake_filter_output(text, *_args, **_kwargs):
            return PipelineResult(allowed=True, content=text)

        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.fetch_lookup", fake_fetch)
        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.filter_output", fake_filter_output)
        notes, tools = await resolve_live_lookup(
            "What's the weather in Denver?",
            live_lookups=True,
            preset=YOUNG,
            strictness=3,
        )
        assert "Open-Meteo" in notes
        assert tools[0]["type"] == "lookup"
        assert tools[0]["source"] == "open-meteo"

    @pytest.mark.asyncio
    async def test_enabled_weather_without_place_asks_for_city(self, monkeypatch):
        fetched = False

        async def fake_fetch(_intent):
            nonlocal fetched
            fetched = True
            return None

        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.fetch_lookup", fake_fetch)
        notes, tools = await resolve_live_lookup(
            "What's the weather tomorrow?",
            live_lookups=True,
            preset=YOUNG,
            strictness=3,
        )
        assert "city or town" in notes.lower()
        assert tools == []
        assert fetched is False

    @pytest.mark.asyncio
    async def test_enabled_uses_place_from_history(self, monkeypatch):
        result = format_weather_notes("Denver", WEATHER_GEO, WEATHER_FORECAST)
        captured: dict[str, str] = {}

        async def fake_fetch(intent):
            captured["query"] = intent.query
            return result

        async def fake_filter_output(text, *_args, **_kwargs):
            return PipelineResult(allowed=True, content=text)

        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.fetch_lookup", fake_fetch)
        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.filter_output", fake_filter_output)
        notes, tools = await resolve_live_lookup(
            "What's the weather tomorrow?",
            live_lookups=True,
            preset=YOUNG,
            strictness=3,
            history=[{"role": "user", "content": "I'm in Denver today"}],
        )
        assert captured["query"] == "Denver"
        assert "Open-Meteo" in notes
        assert tools[0]["type"] == "lookup"

    @pytest.mark.asyncio
    async def test_unsafe_notes_are_dropped(self, monkeypatch):
        result = LookupResult(
            kind="news",
            source="wikipedia-current-events",
            source_label="Wikipedia Current Events",
            query="current events",
            summary="unsafe",
            notes="how to make a bomb at home",
        )

        async def fake_fetch(_intent):
            return result

        async def fake_filter_output(_text, *_args, **_kwargs):
            return PipelineResult(allowed=False, block_reason="blocked", stage="output_rules")

        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.fetch_lookup", fake_fetch)
        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.filter_output", fake_filter_output)
        notes, tools = await resolve_live_lookup(
            "What's in the news today?",
            live_lookups=True,
            preset=YOUNG,
            strictness=4,
        )
        assert "not kid-safe" in notes
        assert tools == []


class TestProcessChatLookupGating:
    @pytest.mark.asyncio
    async def test_process_chat_skips_fetch_when_disabled(self, monkeypatch):
        fetched = False

        async def fake_filter_input(*_args, **_kwargs):
            return PipelineResult(allowed=True, content="What's the weather in Denver?")

        async def fake_fetch(_intent):
            nonlocal fetched
            fetched = True
            return None

        captured: dict[str, str] = {}

        async def fake_generate(messages, *_args, **_kwargs):
            captured["user_turn"] = messages[-1]["content"]
            return "Ask a parent to look outside."

        async def fake_filter_output(text, *_args, **_kwargs):
            return PipelineResult(allowed=True, content=text)

        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.filter_input", fake_filter_input)
        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.fetch_lookup", fake_fetch)
        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.generate_response", fake_generate)
        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.filter_output", fake_filter_output)

        result = await process_chat(
            "What's the weather in Denver?",
            [],
            YOUNG,
            3,
            "Emma",
            7,
            live_lookups=False,
        )
        assert result.allowed
        assert fetched is False
        assert "Open-Meteo" not in captured["user_turn"]

    @pytest.mark.asyncio
    async def test_process_chat_adds_notes_when_enabled(self, monkeypatch):
        lookup = format_weather_notes("Denver", WEATHER_GEO, WEATHER_FORECAST)

        async def fake_filter_input(*_args, **_kwargs):
            return PipelineResult(allowed=True, content="What's the weather in Denver?")

        async def fake_fetch(_intent):
            return lookup

        captured: dict[str, str] = {}

        async def fake_generate(messages, *_args, **_kwargs):
            captured["user_turn"] = messages[-1]["content"]
            return "It is sunny and about 70 degrees in Denver."

        async def fake_filter_output(text, *_args, **_kwargs):
            return PipelineResult(allowed=True, content=text)

        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.filter_input", fake_filter_input)
        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.fetch_lookup", fake_fetch)
        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.generate_response", fake_generate)
        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.filter_output", fake_filter_output)

        result = await process_chat(
            "What's the weather in Denver?",
            [],
            YOUNG,
            3,
            "Emma",
            7,
            live_lookups=True,
        )
        assert result.allowed
        assert "Open-Meteo" in captured["user_turn"]
        assert "70" in captured["user_turn"]

    @pytest.mark.asyncio
    async def test_stream_yields_lookup_card_when_enabled(self, monkeypatch):
        lookup = format_weather_notes("Denver", WEATHER_GEO, WEATHER_FORECAST)

        async def fake_filter_input(*_args, **_kwargs):
            return PipelineResult(allowed=True, content="What's the weather in Denver?")

        async def fake_fetch(_intent):
            return lookup

        async def fake_stream(*_args, **_kwargs):
            yield "Sunny "
            yield "in Denver."

        async def fake_filter_output(text, *_args, **_kwargs):
            return PipelineResult(allowed=True, content=text)

        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.filter_input", fake_filter_input)
        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.fetch_lookup", fake_fetch)
        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.stream_response", fake_stream)
        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.filter_output", fake_filter_output)

        events = []
        async for item in process_chat_stream(
            "What's the weather in Denver?",
            [],
            YOUNG,
            3,
            "Emma",
            7,
            live_lookups=True,
        ):
            events.append(item)

        tool_events = [item for item in events if isinstance(item, ToolEvent)]
        assert tool_events
        assert tool_events[0].tools[0]["type"] == "lookup"
        assert tool_events[0].tools[0]["source_label"] == "Open-Meteo weather"
