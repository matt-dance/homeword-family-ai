"""Named live lookups: model requests, formatters, and parent-toggle gating."""

import pytest

from homeward_gateway.chat.lookups import (
    LookupResult,
    SessionContext,
    build_session_context,
    format_current_facts_notes,
    format_news_notes,
    format_sports_notes,
    format_weather_notes,
    intent_from_request,
    is_referential,
    lookup_card,
    lookup_prompt_notes,
    lookup_request_hint,
    normalize_sports_query,
    parse_featured_headlines,
    parse_lookup_request,
    parse_scoreboard_events,
    sports_scoreboard_date_attempts,
    team_search_queries,
    weather_missing_place_notes,
    _parse_wikipedia_incumbent,
)
from homeward_gateway.pipeline.pipeline import (
    PipelineResult,
    StatusEvent,
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


LOOKUP_REQUEST = (
    '```homeward\n{"type":"lookup_request","kind":"sports",'
    '"query":"University of Utah football"}\n```'
)


class TestLookupRequest:
    def test_parse_lookup_request_from_model_card(self):
        payload = parse_lookup_request(LOOKUP_REQUEST)
        assert payload is not None
        assert payload["kind"] == "sports"
        assert payload["query"] == "University of Utah football"

    def test_parse_lookup_request_ignores_plain_replies(self):
        assert parse_lookup_request("The sky is blue because of sunlight.") is None

    def test_intent_from_request_uses_model_query(self):
        intent = intent_from_request({"kind": "sports", "query": "University of Utah football"})
        assert intent is not None
        assert intent.kind == "sports"
        assert "utah" in intent.query.lower()

    def test_intent_from_request_rejects_unknown_kind(self):
        assert intent_from_request({"kind": "web", "query": "anything"}) is None

    def test_intent_from_request_fills_weather_from_home(self):
        intent = intent_from_request({"kind": "weather", "query": ""}, home_location="Denver, CO")
        assert intent is not None
        assert intent.kind == "weather"
        assert intent.query == "Denver, CO"

    def test_intent_from_request_fills_sports_from_session(self):
        intent = intent_from_request(
            {"kind": "sports", "query": ""},
            context=SessionContext(team="boise state"),
        )
        assert intent is not None
        assert intent.query == "boise state"

    def test_normalize_sports_query_keeps_team_from_a_sentence(self):
        assert normalize_sports_query("when does boise state play") == "boise state"
        assert normalize_sports_query("Boise State schedule") == "boise state"
        assert normalize_sports_query("next Boise State game") == "boise state"

    def test_intent_from_request_uses_team_name_not_the_question(self):
        intent = intent_from_request(
            {"kind": "sports", "query": "when does boise state play"},
            user_message="when does boise state play?",
        )
        assert intent is not None
        assert intent.query == "boise state"
        assert intent.schedule is True

    def test_intent_from_request_maps_current_facts_office(self):
        intent = intent_from_request({"kind": "current_facts", "query": "who is the president"})
        assert intent is not None
        assert intent.query == "President_of_the_United_States"

    def test_team_search_queries_includes_short_school_name(self):
        queries = team_search_queries("university of utah")
        assert "university of utah" in queries
        assert "utah" in queries

    def test_team_search_queries_strips_university_and_sport_together(self):
        queries = team_search_queries("University of Utah football")
        assert "utah" in queries
        assert "university of utah football" in queries

    def test_lookup_request_hint_lists_named_feeds(self):
        hint = lookup_request_hint()
        assert "lookup_request" in hint
        assert "sports" in hint
        assert "weather" in hint
        assert "news" in hint
        assert "Boise State" in hint
        assert "team or league name only" in hint

    def test_weather_missing_place_notes(self):
        assert "city or town" in weather_missing_place_notes().lower()


class TestSessionContext:
    GAME_HISTORY = [
        {"role": "user", "content": "Who is Boise State playing this weekend?"},
        {
            "role": "assistant",
            "content": (
                "Boise State Broncos at Oregon Ducks (Scheduled)"
                " — Autzen Stadium, Eugene, OR — Sat, September 5th at 3:30 PM EDT"
            ),
        },
    ]

    def test_build_session_context_from_game_reply(self):
        context = build_session_context(self.GAME_HISTORY)
        assert context.team == "boise state"
        assert context.place == "Eugene, OR"
        assert context.venue == "Eugene, OR"
        assert context.event_time is not None
        assert "3:30 PM" in context.event_time

    def test_is_referential(self):
        assert is_referential("What will the weather be like at that game?")
        assert is_referential("Did they win?")
        assert not is_referential("What's the weather in Denver?")

    def test_empty_weather_request_uses_game_place(self):
        context = build_session_context(self.GAME_HISTORY)
        intent = intent_from_request({"kind": "weather", "query": ""}, context=context)
        assert context.team == "boise state"
        assert context.place == "Eugene, OR"
        assert intent is not None
        assert intent.query == "Eugene, OR"

    def test_empty_sports_request_uses_session_team(self):
        context = build_session_context(self.GAME_HISTORY)
        intent = intent_from_request({"kind": "sports", "query": ""}, context=context)
        assert intent is not None
        assert intent.query == "boise state"

    def test_weather_request_with_place_does_not_use_stale_game(self):
        context = build_session_context(self.GAME_HISTORY)
        intent = intent_from_request(
            {"kind": "weather", "query": "Denver, CO"},
            context=context,
            home_location="Denver, CO",
        )
        assert intent is not None
        assert intent.query == "Denver, CO"

    def test_paraphrased_game_bullets_still_extract_place(self):
        history = [
            {"role": "user", "content": "Who is Boise State playing this weekend?"},
            {
                "role": "assistant",
                "content": (
                    "- Game: Boise State Broncos at Oregon Ducks\n"
                    "- Venue: Autzen Stadium, Eugene, OR\n"
                ),
            },
        ]
        context = build_session_context(history)
        assert context.place == "Eugene, OR"
        assert context.team == "boise state"


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

    def test_sports_scoreboard_retries_after_a_specific_day(self):
        attempts = sports_scoreboard_date_attempts("20260904")
        assert attempts[0] == "20260904"
        assert attempts[1] != "20260904"
        assert attempts[1] is not None
        assert "-" in attempts[1]

    def test_sports_notes_keep_next_game_when_requested_day_missed(self):
        result = format_sports_notes(
            "College Football",
            ["Boise State Broncos at Oregon Ducks (Scheduled) — Sat, September 5th at 3:30 PM EDT"],
            "Oregon Ducks",
            schedule=True,
            miss_note="No game on the requested day. Next listed game:",
        )
        assert result.found is True
        assert "No game on the requested day" in result.notes
        assert "Oregon Ducks" in result.notes

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

    def test_parse_wikipedia_incumbent(self):
        wikitext = "| office = President\n| incumbent = [[Donald Trump]]\n| incumbentsince = January 20, 2025\n"
        name, since = _parse_wikipedia_incumbent(wikitext)
        assert name == "Donald Trump"
        assert "2025" in since

    def test_current_facts_notes(self):
        result = format_current_facts_notes("President of the United States", "Donald Trump", "January 20, 2025")
        prompt = lookup_prompt_notes(result)
        assert "Donald Trump" in result.summary
        assert "training data" in prompt


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

        async def fake_fetch(_intent, **_kwargs):
            nonlocal called
            called = True
            return None

        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.fetch_lookup", fake_fetch)
        notes, tools, intent, result = await resolve_live_lookup(
            LOOKUP_REQUEST,
            live_lookups=False,
            preset=YOUNG,
            strictness=3,
        )
        assert notes == ""
        assert tools == []
        assert called is False

    @pytest.mark.asyncio
    async def test_no_request_does_not_fetch(self, monkeypatch):
        called = False

        async def fake_fetch(_intent, **_kwargs):
            nonlocal called
            called = True
            return None

        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.fetch_lookup", fake_fetch)
        notes, tools, intent, result = await resolve_live_lookup(
            "What's the weather in Denver?",
            live_lookups=True,
            preset=YOUNG,
            strictness=3,
        )
        assert notes == ""
        assert tools == []
        assert called is False

    @pytest.mark.asyncio
    async def test_enabled_request_injects_notes_and_card(self, monkeypatch):
        result = format_weather_notes("Denver", WEATHER_GEO, WEATHER_FORECAST)

        async def fake_fetch(_intent, **_kwargs):
            return result

        async def fake_filter_output(text, *_args, **_kwargs):
            return PipelineResult(allowed=True, content=text)

        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.fetch_lookup", fake_fetch)
        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.filter_output", fake_filter_output)
        notes, tools, intent, result = await resolve_live_lookup(
            '```homeward\n{"type":"lookup_request","kind":"weather","query":"Denver"}\n```',
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

        async def fake_fetch(_intent, **_kwargs):
            nonlocal fetched
            fetched = True
            return None

        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.fetch_lookup", fake_fetch)
        notes, tools, intent, result = await resolve_live_lookup(
            '```homeward\n{"type":"lookup_request","kind":"weather","query":""}\n```',
            live_lookups=True,
            preset=YOUNG,
            strictness=3,
        )
        assert "city or town" in notes.lower()
        assert tools == []
        assert fetched is False

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

        async def fake_fetch(_intent, **_kwargs):
            return result

        async def fake_filter_output(_text, *_args, **_kwargs):
            return PipelineResult(allowed=False, block_reason="blocked", stage="output_rules")

        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.fetch_lookup", fake_fetch)
        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.filter_output", fake_filter_output)
        notes, tools, intent, result = await resolve_live_lookup(
            '```homeward\n{"type":"lookup_request","kind":"news","query":"current events"}\n```',
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

        async def fake_fetch(_intent, **_kwargs):
            nonlocal fetched
            fetched = True
            return None

        captured: dict[str, str] = {}

        async def fake_generate(messages, *_args, **_kwargs):
            captured["user_turn"] = messages[-1]["content"]
            return LOOKUP_REQUEST

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
    async def test_process_chat_speaks_lookup_facts_without_the_model(self, monkeypatch):
        lookup = format_weather_notes("Denver", WEATHER_GEO, WEATHER_FORECAST)
        generated = False

        async def fake_filter_input(*_args, **_kwargs):
            return PipelineResult(allowed=True, content="What's the weather in Denver?")

        async def fake_fetch(_intent, **_kwargs):
            return lookup

        async def fake_generate(*_args, **_kwargs):
            nonlocal generated
            generated = True
            return "It is 12 degrees and snowing."

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
        assert generated is False
        assert "70" in (result.content or "")
        assert "12 degrees" not in (result.content or "")

    @pytest.mark.asyncio
    async def test_process_chat_skips_fetch_when_model_answers_directly(self, monkeypatch):
        fetched = False

        async def fake_filter_input(*_args, **_kwargs):
            return PipelineResult(allowed=True, content="Why is the sky blue?")

        async def fake_fetch(_intent, **_kwargs):
            nonlocal fetched
            fetched = True
            return None

        async def fake_generate(*_args, **_kwargs):
            return "Sunlight scatters in the air."

        async def fake_filter_output(text, *_args, **_kwargs):
            return PipelineResult(allowed=True, content=text)

        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.filter_input", fake_filter_input)
        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.fetch_lookup", fake_fetch)
        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.generate_response", fake_generate)
        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.filter_output", fake_filter_output)

        result = await process_chat(
            "Why is the sky blue?",
            [],
            YOUNG,
            3,
            "Emma",
            7,
            live_lookups=True,
        )
        assert result.allowed
        assert fetched is False
        assert "scatters" in (result.content or "")

    @pytest.mark.asyncio
    async def test_stream_yields_lookup_card_after_model_request(self, monkeypatch):
        lookup = format_weather_notes("Denver", WEATHER_GEO, WEATHER_FORECAST)

        async def fake_filter_input(*_args, **_kwargs):
            return PipelineResult(allowed=True, content="What's the weather in Denver?")

        async def fake_fetch(_intent, **_kwargs):
            return lookup

        async def fake_filter_output(text, *_args, **_kwargs):
            return PipelineResult(allowed=True, content=text)

        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.filter_input", fake_filter_input)
        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.fetch_lookup", fake_fetch)
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

    @pytest.mark.asyncio
    async def test_stream_heartbeats_while_model_decides_to_look_up(self, monkeypatch):
        import asyncio

        lookup = format_weather_notes("Denver", WEATHER_GEO, WEATHER_FORECAST)

        async def fake_filter_input(*_args, **_kwargs):
            return PipelineResult(allowed=True, content="What's the weather in Denver?")

        async def slow_fetch(_intent, **_kwargs):
            await asyncio.sleep(0.05)
            return lookup

        async def fake_filter_output(text, *_args, **_kwargs):
            return PipelineResult(allowed=True, content=text)

        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.LOOKUP_HEARTBEAT_SECONDS", 0.01)
        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.filter_input", fake_filter_input)
        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.fetch_lookup", slow_fetch)
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

        looking = [
            item for item in events
            if isinstance(item, StatusEvent) and item.phase == "lookup"
        ]
        assert len(looking) >= 2
