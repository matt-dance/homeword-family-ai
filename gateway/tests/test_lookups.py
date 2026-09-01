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

    def test_news(self):
        intent = detect_lookup_intent("What's in the news today?")
        assert intent is not None
        assert intent.kind == "news"

    def test_sports_team(self):
        intent = detect_lookup_intent("Did the Broncos win last night?")
        assert intent is not None
        assert intent.kind == "sports"
        assert intent.query == "broncos"

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
        assert "not a generic web search" in lookup_prompt_notes(result)

    def test_sports_notes(self):
        result = format_sports_notes("NFL", ["Denver Broncos 24 vs Kansas City Chiefs 17 (Final)"], "broncos")
        assert result.source == "espn-scoreboard"
        assert result.source_label == "Public sports scoreboard"
        assert "Broncos" in result.summary

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
                    "name": "Denver Broncos vs Kansas City Chiefs",
                    "status": {"type": {"description": "Final"}},
                    "competitions": [
                        {
                            "competitors": [
                                {"team": {"displayName": "Denver Broncos"}, "score": "24"},
                                {"team": {"displayName": "Kansas City Chiefs"}, "score": "17"},
                            ]
                        }
                    ],
                },
                {
                    "name": "Dallas Cowboys vs New York Giants",
                    "status": {"type": {"description": "Final"}},
                    "competitions": [
                        {
                            "competitors": [
                                {"team": {"displayName": "Dallas Cowboys"}, "score": "10"},
                                {"team": {"displayName": "New York Giants"}, "score": "7"},
                            ]
                        }
                    ],
                },
            ]
        }
        events = parse_scoreboard_events(payload, "broncos")
        assert len(events) == 1
        assert "Broncos" in events[0]

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

        async def fake_generate(*_args, **kwargs):
            captured["hint"] = kwargs.get("tool_hint") or ""
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
        assert "Open-Meteo" not in captured["hint"]

    @pytest.mark.asyncio
    async def test_process_chat_adds_notes_when_enabled(self, monkeypatch):
        lookup = format_weather_notes("Denver", WEATHER_GEO, WEATHER_FORECAST)

        async def fake_filter_input(*_args, **_kwargs):
            return PipelineResult(allowed=True, content="What's the weather in Denver?")

        async def fake_fetch(_intent):
            return lookup

        captured: dict[str, str] = {}

        async def fake_generate(*_args, **kwargs):
            captured["hint"] = kwargs.get("tool_hint") or ""
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
        assert "Open-Meteo" in captured["hint"]
        assert "70" in captured["hint"]

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
