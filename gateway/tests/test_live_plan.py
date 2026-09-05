"""Gateway plans live lookups from the child's words and locks spoken facts."""

from datetime import datetime, timezone

import pytest

from homeward_gateway.chat.live_plan import lock_spoken_reply, plan_live_lookup
from homeward_gateway.chat.lookups import LookupResult, SessionContext, format_weather_notes
from homeward_gateway.chat.sports_schedule import (
    parse_team_schedule,
    select_sports_game,
    speak_sports,
)
from homeward_gateway.pipeline.pipeline import PipelineResult, ToolEvent, process_chat, process_chat_stream
from homeward_gateway.pipeline.policy import load_all_presets

from tests.test_lookups import WEATHER_FORECAST, WEATHER_GEO

YOUNG = load_all_presets()["young_explorer"]

OREGON_SCHEDULE = {
    "events": [
        {
            "date": "2026-09-05T19:30Z",
            "name": "Boise State Broncos at Oregon Ducks",
            "competitions": [
                {
                    "status": {
                        "type": {
                            "name": "STATUS_SCHEDULED",
                            "completed": False,
                            "description": "Scheduled",
                        }
                    },
                    "venue": {
                        "fullName": "Autzen Stadium",
                        "address": {"city": "Eugene", "state": "OR"},
                    },
                    "competitors": [
                        {"homeAway": "home", "team": {"displayName": "Oregon Ducks"}},
                        {"homeAway": "away", "team": {"displayName": "Boise State Broncos"}},
                    ],
                }
            ],
        }
    ]
}


class TestPlanLiveLookup:
    def test_sports_question_uses_team_name_and_tomorrow(self):
        intent = plan_live_lookup("who do the oregon ducks play tomorrow")
        assert intent is not None
        assert intent.kind == "sports"
        assert "oregon" in intent.query.lower()
        assert intent.when == "tomorrow"

    def test_when_do_they_play_is_next_game(self):
        intent = plan_live_lookup("when does boise state play")
        assert intent is not None
        assert intent.query == "boise state"
        assert intent.when == "next"

    def test_follow_up_uses_session_team(self):
        intent = plan_live_lookup(
            "when is their next game",
            context=SessionContext(team="oregon ducks"),
        )
        assert intent is not None
        assert intent.kind == "sports"
        assert "oregon" in intent.query.lower()
        assert intent.when == "next"

    def test_weather_question_is_weather(self):
        intent = plan_live_lookup("What's the weather in Denver?")
        assert intent is not None
        assert intent.kind == "weather"
        assert "Denver" in intent.query

    def test_ordinary_question_is_not_a_lookup(self):
        assert plan_live_lookup("Why is the sky blue?") is None
        assert plan_live_lookup("who is the quarterback for boise state") is None


class TestSportsSchedule:
    def test_tomorrow_miss_returns_next_game(self):
        games = parse_team_schedule(OREGON_SCHEDULE, subject="Oregon Ducks")
        game, day_miss = select_sports_game(
            games,
            when="tomorrow",
            now=datetime(2026, 9, 3, 23, 0, tzinfo=timezone.utc),
            tz="America/Denver",
        )
        assert day_miss is True
        assert game is not None
        assert game.opponent == "Boise State Broncos"
        spoken = speak_sports("Oregon Ducks", game, when="tomorrow", day_miss=True, tz="America/Denver")
        assert "do not play tomorrow" in spoken.lower()
        assert "Boise State" in spoken
        assert "Autzen" in spoken
        assert "Saturday" in spoken

    def test_final_score_uses_display_value(self):
        payload = {
            "events": [
                {
                    "date": "2026-09-03T02:00Z",
                    "name": "Idaho Vandals at Utah Utes",
                    "competitions": [
                        {
                            "status": {"type": {"completed": True, "description": "Final"}},
                            "venue": {
                                "fullName": "Rice-Eccles Stadium",
                                "address": {"city": "Salt Lake City", "state": "UT"},
                            },
                            "competitors": [
                                {
                                    "homeAway": "home",
                                    "team": {"displayName": "Utah Utes"},
                                    "score": {"value": 66.0, "displayValue": "66"},
                                },
                                {
                                    "homeAway": "away",
                                    "team": {"displayName": "Idaho Vandals"},
                                    "score": {"value": 14.0, "displayValue": "14"},
                                },
                            ],
                        }
                    ],
                }
            ]
        }
        games = parse_team_schedule(payload, subject="Utah Utes")
        spoken = speak_sports("Utah Utes", games[0], when="today", day_miss=False, tz="America/Denver")
        assert "66" in spoken
        assert "14" in spoken
        assert "displayValue" not in spoken
        assert "{" not in spoken

    def test_next_game_is_first_scheduled(self):
        games = parse_team_schedule(OREGON_SCHEDULE, subject="Oregon Ducks")
        game, day_miss = select_sports_game(
            games,
            when="next",
            now=datetime(2026, 9, 3, 23, 0, tzinfo=timezone.utc),
            tz="America/Denver",
        )
        assert day_miss is False
        assert game is not None
        spoken = speak_sports("Oregon Ducks", game, when="next", day_miss=False, tz="America/Denver")
        assert "Boise State" in spoken
        assert "do not play tomorrow" not in spoken.lower()


class TestLockSpokenReply:
    def test_keeps_exact_facts_and_drops_invented_teams(self):
        spoken = (
            "Oregon Ducks do not play tomorrow. Their next game is Boise State Broncos "
            "on Saturday. The game is at Autzen Stadium, Eugene, OR."
        )
        invented = (
            f"{spoken} According to ESPN, they also play the Washington Huskies tomorrow "
            "at Matthew Knight Arena."
        )
        assert lock_spoken_reply(invented, spoken) == spoken

    def test_keeps_a_safe_follow_up_question(self):
        spoken = "Oregon Ducks play Boise State Broncos on Saturday at Autzen Stadium, Eugene, OR."
        wrapped = f"{spoken} Want to hear more about the stadium?"
        assert lock_spoken_reply(wrapped, spoken) == wrapped


class TestProcessChatSpokenFacts:
    @pytest.mark.asyncio
    async def test_sports_answer_is_spoken_even_if_model_invents(self, monkeypatch):
        games = parse_team_schedule(OREGON_SCHEDULE, subject="Oregon Ducks")
        game, day_miss = select_sports_game(
            games,
            when="tomorrow",
            now=datetime(2026, 9, 3, 23, 0, tzinfo=timezone.utc),
            tz="America/Denver",
        )
        spoken = speak_sports("Oregon Ducks", game, when="tomorrow", day_miss=day_miss, tz="America/Denver")
        lookup = LookupResult(
            kind="sports",
            source="espn-schedule",
            source_label="Public sports schedule",
            query="Oregon Ducks",
            summary=spoken,
            notes=spoken,
            spoken=spoken,
        )

        async def fake_filter_input(*_args, **_kwargs):
            return PipelineResult(allowed=True, content="who do the oregon ducks play tomorrow")

        async def fake_fetch(_intent, **_kwargs):
            return lookup

        async def fake_generate(*_args, **_kwargs):
            return "According to ESPN, the Oregon Ducks play the Washington Huskies tomorrow."

        async def fake_filter_output(text, *_args, **_kwargs):
            return PipelineResult(allowed=True, content=text)

        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.filter_input", fake_filter_input)
        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.fetch_lookup", fake_fetch)
        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.generate_response", fake_generate)
        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.filter_output", fake_filter_output)

        result = await process_chat(
            "who do the oregon ducks play tomorrow",
            [],
            YOUNG,
            3,
            "Lincoln",
            8,
            live_lookups=True,
        )
        assert result.allowed
        assert "Boise State" in (result.content or "")
        assert "Autzen" in (result.content or "")
        assert "Washington" not in (result.content or "")

    @pytest.mark.asyncio
    async def test_weather_fetches_without_a_model_card(self, monkeypatch):
        lookup = format_weather_notes("Denver", WEATHER_GEO, WEATHER_FORECAST)
        fetched = False

        async def fake_filter_input(*_args, **_kwargs):
            return PipelineResult(allowed=True, content="What's the weather in Denver?")

        async def fake_fetch(_intent, **_kwargs):
            nonlocal fetched
            fetched = True
            return lookup

        async def fake_generate(*_args, **_kwargs):
            raise AssertionError("model should not author live weather")

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
        assert fetched is True
        assert result.allowed
        assert "70" in (result.content or "")

    @pytest.mark.asyncio
    async def test_stream_yields_lookup_card_from_child_question(self, monkeypatch):
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
        text = "".join(item for item in events if isinstance(item, str))
        assert "70" in text or any(
            getattr(item, "content", None) and "70" in item.content
            for item in events
            if isinstance(item, PipelineResult)
        )
