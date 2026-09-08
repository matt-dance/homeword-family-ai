"""Grounding judge: retrieve first for checkable facts. Fakes only — no live LLM."""

import pytest

from homeward_gateway.chat.grounding import (
    GroundingDecision,
    latest_user_topic,
    parse_evidence_json,
    parse_grounding_json,
    tool_call_from_grounding,
)
from homeward_gateway.chat.lookups import (
    format_news_notes,
    format_sports_notes,
    format_web_notes,
    format_weather_notes,
)
from homeward_gateway.chat.lookup_tools import LookupToolCall, execute_lookup_tool
from homeward_gateway.chat.tool_loop import (
    decide_lookup_tool,
    lookup_tool_fact_hint,
    run_lookup_tool_loop,
)
from homeward_gateway.pipeline.pipeline import (
    PipelineResult,
    StatusEvent,
    ToolEvent,
    process_chat,
    process_chat_stream,
)
from homeward_gateway.pipeline.policy import load_all_presets


YOUNG = load_all_presets()["young_explorer"]

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

BOISE_HISTORY = [
    {"role": "user", "content": "tell me about boise state football"},
    {"role": "assistant", "content": "Boise State plays college football."},
]
NEWS_THEN_BLACK_HOLES = [
    {"role": "user", "content": "what's in the news today"},
    {"role": "assistant", "content": "Gloria Steinem died at 92."},
    {"role": "user", "content": "tell me about black holes"},
    {"role": "assistant", "content": "Black holes have gravity so strong light cannot escape."},
]


async def _allow(text: str) -> str | None:
    return text


def _sports_decision(query: str = "Boise State football") -> GroundingDecision:
    return GroundingDecision(
        needs_grounding=True,
        freshness="days",
        query=query,
        prefer="sports",
    )


def _no_grounding() -> GroundingDecision:
    return GroundingDecision(
        needs_grounding=False,
        freshness="none",
        query="",
        prefer="any",
    )


class TestParseGroundingJson:
    def test_parses_sports_grounding(self):
        decision = parse_grounding_json(
            '{"needs_grounding": true, "freshness": "days", '
            '"query": "Boise State football", "prefer": "sports"}'
        )
        assert decision == _sports_decision()

    def test_invalid_or_empty_is_none(self):
        assert parse_grounding_json("") is None
        assert parse_grounding_json("not json") is None
        assert parse_grounding_json("[]") is None

    def test_missing_needs_grounding_biases_true(self):
        decision = parse_grounding_json(
            '{"freshness": "hours", "query": "boise state", "prefer": "sports"}'
        )
        assert decision is not None
        assert decision.needs_grounding is True

    def test_evidence_json_answers_question(self):
        assert parse_evidence_json('{"answers_question": true}') is True
        assert parse_evidence_json('{"answers_question": false}') is False
        assert parse_evidence_json("not json") is None

    def test_unknown_prefer_becomes_any(self):
        decision = parse_grounding_json(
            '{"needs_grounding": true, "freshness": "days", '
            '"query": "boise", "prefer": "podcast"}'
        )
        assert decision is not None
        assert decision.prefer == "any"


class TestLatestUserTopic:
    def test_tell_me_more_follows_boise_not_empty(self):
        assert "boise" in latest_user_topic(BOISE_HISTORY, "tell me more").lower()

    def test_tell_me_more_follows_black_holes_not_leftover_news(self):
        topic = latest_user_topic(NEWS_THEN_BLACK_HOLES, "tell me more")
        assert "black hole" in topic.lower()
        assert "news" not in topic.lower()

    def test_new_question_is_its_own_topic(self):
        topic = latest_user_topic(BOISE_HISTORY, "who was the QB")
        assert "qb" in topic.lower()


class TestToolCallFromGrounding:
    def test_maps_prefer_to_named_tools(self):
        sports = tool_call_from_grounding(_sports_decision(), open_web_search=True)
        assert sports == LookupToolCall("get_sports", {"team": "Boise State football", "when": ""})
        news = tool_call_from_grounding(
            GroundingDecision(True, "hours", "current events", "news"),
            open_web_search=True,
        )
        assert news == LookupToolCall("get_current_events", {})
        weather = tool_call_from_grounding(
            GroundingDecision(True, "hours", "Denver", "weather"),
            open_web_search=False,
            message="What's the weather in Denver today?",
        )
        assert weather is not None
        assert weather.name == "get_weather"
        assert weather.args["place"] == "Denver"

    def test_web_and_any_use_search_web_even_when_flag_off(self):
        web = tool_call_from_grounding(
            GroundingDecision(True, "hours", "iran war", "web"),
            open_web_search=False,
        )
        assert web == LookupToolCall("search_web", {"query": "iran war"})
        any_call = tool_call_from_grounding(
            GroundingDecision(True, "days", "Boise State conference", "any"),
            open_web_search=True,
        )
        assert any_call == LookupToolCall("search_web", {"query": "Boise State conference"})

    def test_no_grounding_maps_to_none(self):
        assert tool_call_from_grounding(_no_grounding(), open_web_search=True) is None

    def test_explicit_web_request_uses_search_web(self):
        explicit = tool_call_from_grounding(
            GroundingDecision(True, "hours", "boise state", "sports"),
            open_web_search=True,
            message="can you look that up on the web?",
        )
        assert explicit == LookupToolCall("search_web", {"query": "boise state"})
        score = tool_call_from_grounding(
            GroundingDecision(True, "days", "boise state", "sports"),
            open_web_search=True,
            message="what was the score of their last game",
        )
        assert score == LookupToolCall("get_sports", {"team": "boise state", "when": ""})

    def test_sports_hours_cannot_opt_out_of_grounding(self):
        decision = parse_grounding_json(
            '{"needs_grounding": false, "freshness": "hours", '
            '"query": "boise state football", "prefer": "sports"}'
        )
        assert decision is not None
        assert decision.needs_grounding is True


class TestDecideLookupToolJudge:
    @pytest.mark.asyncio
    async def test_boise_tell_me_about_grounds_sports(self):
        async def judge(_message, _history=None, **_kwargs):
            return _sports_decision()

        call = await decide_lookup_tool(
            "tell me about boise state football",
            None,
            open_web_search=True,
            judge=judge,
        )
        assert call is not None
        assert call.name == "get_sports"
        assert "boise" in call.args["team"].lower()

    @pytest.mark.asyncio
    async def test_who_was_the_qb_after_boise_grounds(self):
        async def judge(message, history=None, **_kwargs):
            prior = " ".join(
                str(item.get("content") or "") for item in (history or [])
            )
            assert "boise" in prior.lower()
            assert "qb" in message.lower()
            return GroundingDecision(True, "days", "Boise State quarterback", "sports")

        call = await decide_lookup_tool(
            "who was the QB",
            BOISE_HISTORY,
            open_web_search=True,
            judge=judge,
        )
        assert call is not None
        assert call.name == "get_sports"
        assert "boise" in call.args["team"].lower()

    @pytest.mark.asyncio
    async def test_black_holes_and_story_do_not_ground(self):
        async def judge(_message, _history=None, **_kwargs):
            return _no_grounding()

        for question in (
            "what is a black hole",
            "tell me a story about a curious fox",
        ):
            call = await decide_lookup_tool(
                question,
                None,
                open_web_search=True,
                judge=judge,
            )
            assert call is None, question

    @pytest.mark.asyncio
    async def test_tell_me_more_after_boise_grounds(self):
        async def judge(message, history=None, **_kwargs):
            topic = latest_user_topic(history, message)
            assert "boise" in topic.lower()
            return _sports_decision()

        call = await decide_lookup_tool(
            "tell me more",
            BOISE_HISTORY,
            open_web_search=True,
            judge=judge,
        )
        assert call is not None
        assert call.name == "get_sports"

    @pytest.mark.asyncio
    async def test_tell_me_more_after_black_holes_does_not_reground_news(self):
        async def judge(message, history=None, **_kwargs):
            topic = latest_user_topic(history, message)
            assert "black hole" in topic.lower()
            return _no_grounding()

        call = await decide_lookup_tool(
            "tell me more",
            NEWS_THEN_BLACK_HOLES,
            open_web_search=True,
            judge=judge,
        )
        assert call is None

    @pytest.mark.asyncio
    async def test_valid_judge_false_skips_regex_news(self):
        async def judge(_message, _history=None, **_kwargs):
            return _no_grounding()

        call = await decide_lookup_tool(
            "what are some news stories from today",
            None,
            open_web_search=True,
            judge=judge,
        )
        assert call is None

    @pytest.mark.asyncio
    async def test_empty_judge_falls_back_to_regex(self):
        async def judge(_message, _history=None, **_kwargs):
            return None

        call = await decide_lookup_tool(
            "what are some news stories from today",
            None,
            open_web_search=True,
            judge=judge,
        )
        assert call is not None
        assert call.name == "get_current_events"


class TestMissCascade:
    @pytest.mark.asyncio
    async def test_news_miss_falls_back_to_open_web_search(self, monkeypatch):
        kinds: list[str] = []

        async def fake_fetch(intent):
            kinds.append(intent.kind)
            if intent.kind == "news":
                return format_news_notes([])
            assert intent.kind == "web"
            return format_web_notes(
                intent.query,
                [
                    {
                        "title": "Gloria Steinem dies at 92",
                        "snippet": "The activist died at the age of 92.",
                        "url": "https://example.com/steinem",
                    }
                ],
            )

        monkeypatch.setattr("homeward_gateway.chat.lookup_tools.fetch_lookup", fake_fetch)
        outcome = await execute_lookup_tool(
            LookupToolCall("get_current_events", {}),
            live_lookups=True,
            open_web_search=True,
            message="what are some news stories from today",
            filter_notes=_allow,
        )
        assert kinds == ["news", "web"]
        assert "Gloria Steinem" in outcome.notes
        assert outcome.cards[0]["source_label"] == "Open web search"
        assert "SearxNG" not in outcome.notes

    @pytest.mark.asyncio
    async def test_sports_scoreboard_hit_still_searches_web_for_quarterback(self, monkeypatch):
        kinds: list[str] = []

        async def fake_fetch(intent):
            kinds.append(intent.kind)
            if intent.kind == "sports":
                return format_sports_notes(
                    "College Football",
                    ["Memphis Tigers at Boise State Broncos (Scheduled)"],
                    "boise state",
                )
            assert "quarterback" in intent.query.lower()
            assert "last game score" not in intent.query.lower()
            return format_web_notes(
                intent.query,
                [
                    {
                        "title": "Maddux Madsen named Boise State starter",
                        "snippet": "Maddux Madsen is the starting quarterback.",
                        "url": "https://example.com/qb",
                    }
                ],
            )

        monkeypatch.setattr("homeward_gateway.chat.lookup_tools.fetch_lookup", fake_fetch)
        outcome = await execute_lookup_tool(
            LookupToolCall("get_sports", {"team": "boise state"}),
            live_lookups=True,
            open_web_search=True,
            message="who is the starting quarterback of boise state",
            filter_notes=_allow,
            assess=lambda _message, _notes: False,
        )
        assert kinds == ["sports", "web"]
        assert "Maddux Madsen" in outcome.notes
        assert outcome.cards[0]["source_label"] == "Open web search"

    @pytest.mark.asyncio
    async def test_sports_hit_that_answers_score_does_not_search_web(self, monkeypatch):
        kinds: list[str] = []

        async def fake_fetch(intent):
            kinds.append(intent.kind)
            return format_sports_notes(
                "College Football",
                ["Boise State Broncos 27 at Oregon Ducks 34 (Final)"],
                "boise state",
            )

        monkeypatch.setattr("homeward_gateway.chat.lookup_tools.fetch_lookup", fake_fetch)
        outcome = await execute_lookup_tool(
            LookupToolCall("get_sports", {"team": "boise state"}),
            live_lookups=True,
            open_web_search=True,
            message="what was the score of their last game",
            filter_notes=_allow,
            assess=lambda _message, _notes: True,
        )
        assert kinds == ["sports"]
        assert "34" in outcome.notes
        assert outcome.cards[0]["source"] == "espn-scoreboard"

    @pytest.mark.asyncio
    async def test_weather_place_error_does_not_cascade_to_web(self, monkeypatch):
        kinds: list[str] = []

        async def fake_fetch(intent):
            kinds.append(intent.kind)
            return None

        monkeypatch.setattr("homeward_gateway.chat.lookup_tools.fetch_lookup", fake_fetch)
        outcome = await execute_lookup_tool(
            LookupToolCall("get_weather", {"place": "Atlantis"}),
            live_lookups=True,
            open_web_search=True,
            message="What's the weather in Atlantis?",
            filter_notes=_allow,
        )
        assert kinds == ["weather"]
        assert "Atlantis" in outcome.notes
        assert outcome.cards == []


class TestEvidenceOnlyHint:
    def test_grounding_hint_forbids_invented_facts(self):
        hint = lookup_tool_fact_hint(has_tool_results=False, needs_grounding=True)
        assert "could not find" in hint.lower()
        assert "cannot use the web" in hint.lower()
        assert "conference" in hint.lower()
        assert "SearxNG" not in hint
        with_notes = lookup_tool_fact_hint(has_tool_results=True, needs_grounding=True)
        assert "notes" in with_notes.lower()
        assert "invent" in with_notes.lower()

    def test_timeless_turns_get_no_grounding_hint(self):
        assert lookup_tool_fact_hint(has_tool_results=False, needs_grounding=False) == ""

    @pytest.mark.asyncio
    async def test_process_chat_injects_evidence_hint_when_grounding(self, monkeypatch):
        captured: dict[str, str] = {}

        async def judge(*_args, **_kwargs):
            return _sports_decision()

        async def fake_filter_input(*_args, **_kwargs):
            return PipelineResult(allowed=True, content="tell me about boise state football")

        async def fake_fetch(intent):
            if intent.kind == "sports":
                return format_sports_notes("College Football", [], "Boise State", schedule=False)
            return format_web_notes(
                intent.query,
                [
                    {
                        "title": "Boise State football",
                        "snippet": "The Broncos play in the Mountain West Conference.",
                        "url": "https://example.com/boise",
                    }
                ],
            )

        async def fake_generate(messages, *_args, **kwargs):
            captured["tool_hint"] = kwargs.get("tool_hint") or ""
            captured["messages"] = messages
            return "Boise State plays in the Mountain West Conference."

        async def fake_filter_output(text, *_args, **_kwargs):
            return PipelineResult(allowed=True, content=text)

        monkeypatch.setattr("homeward_gateway.chat.tool_loop.call_grounding_judge", judge)
        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.filter_input", fake_filter_input)
        monkeypatch.setattr("homeward_gateway.chat.lookup_tools.fetch_lookup", fake_fetch)
        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.generate_response", fake_generate)
        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.filter_output", fake_filter_output)

        result = await process_chat(
            "tell me about boise state football",
            [],
            YOUNG,
            3,
            "Emma",
            7,
            live_lookups=True,
            open_web_search=True,
        )
        assert result.allowed
        hint = captured["tool_hint"].lower()
        assert "could not check" in hint or "notes" in hint
        assert "invent" in hint
        assert "conference" in hint
        assert "SearxNG" not in captured["tool_hint"]
        tool_blob = " ".join(
            item.get("content") or ""
            for item in captured["messages"]
            if item.get("role") == "tool"
        )
        assert "Mountain West" in tool_blob
        assert any(card.get("type") == "lookup" for card in (result.tools or []))


class TestHonestWebOff:
    @pytest.mark.asyncio
    async def test_checkable_web_topic_refuses_when_flag_off(self, monkeypatch):
        fetched: list[str] = []

        async def judge(*_args, **_kwargs):
            return GroundingDecision(True, "hours", "iran war", "web")

        async def fake_fetch(_intent):
            fetched.append("web")
            return None

        monkeypatch.setattr("homeward_gateway.chat.lookup_tools.fetch_lookup", fake_fetch)
        result = await run_lookup_tool_loop(
            "what is going on in the current iran war",
            None,
            live_lookups=True,
            open_web_search=False,
            chat_model="llama3.2:3b",
            filter_notes=_allow,
            judge=judge,
        )
        assert fetched == []
        assert result.needs_grounding is True
        blob = " ".join(item.get("content") or "" for item in result.extra_messages)
        assert "could not check" in blob.lower()
        assert "SearxNG" not in blob
        assert result.cards == []

    @pytest.mark.asyncio
    async def test_process_chat_web_off_does_not_answer_from_memory(self, monkeypatch):
        captured: dict[str, str] = {}

        async def judge(*_args, **_kwargs):
            return GroundingDecision(True, "days", "Boise State conference", "any")

        async def fake_filter_input(*_args, **_kwargs):
            return PipelineResult(allowed=True, content="what conference is Boise State in")

        async def fake_fetch(_intent):
            raise AssertionError("must not fetch web when the parent flag is off")

        async def fake_generate(messages, *_args, **kwargs):
            captured["tool_hint"] = kwargs.get("tool_hint") or ""
            captured["messages"] = messages
            return "I could not check."

        async def fake_filter_output(text, *_args, **_kwargs):
            return PipelineResult(allowed=True, content=text)

        monkeypatch.setattr("homeward_gateway.chat.tool_loop.call_grounding_judge", judge)
        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.filter_input", fake_filter_input)
        monkeypatch.setattr("homeward_gateway.chat.lookup_tools.fetch_lookup", fake_fetch)
        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.generate_response", fake_generate)
        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.filter_output", fake_filter_output)

        result = await process_chat(
            "what conference is Boise State in",
            [],
            YOUNG,
            3,
            "Emma",
            7,
            live_lookups=True,
            open_web_search=False,
        )
        assert result.allowed
        assert "could not find" in captured["tool_hint"].lower()
        notes = " ".join(
            item.get("content") or ""
            for item in captured["messages"]
            if item.get("role") == "tool"
        )
        assert "could not check" in notes.lower()
        assert "SearxNG" not in notes
        assert "SearxNG" not in captured["tool_hint"]


class TestJudgeIsPrimary:
    @pytest.mark.asyncio
    async def test_structured_tool_router_is_not_consulted(self, monkeypatch):
        called = False

        async def judge(*_args, **_kwargs):
            return _sports_decision()

        async def old_router(*_args, **_kwargs):
            nonlocal called
            called = True
            return LookupToolCall("get_current_events", {})

        monkeypatch.setattr("homeward_gateway.chat.tool_loop.call_structured_router", old_router)
        call = await decide_lookup_tool(
            "tell me about boise state football",
            None,
            open_web_search=True,
            judge=judge,
        )
        assert called is False
        assert call is not None
        assert call.name == "get_sports"

    @pytest.mark.asyncio
    async def test_native_model_uses_judge_not_model_tool_picker(self, monkeypatch):
        kinds: list[str] = []

        async def judge(*_args, **_kwargs):
            return GroundingDecision(True, "hours", "Denver", "weather")

        async def fake_fetch(intent):
            kinds.append(intent.kind)
            return format_weather_notes("Denver", WEATHER_GEO, WEATHER_FORECAST)

        async def chat_turn(_messages, tools=None):
            raise AssertionError("judge path must not open a native tool picker")

        monkeypatch.setattr("homeward_gateway.chat.lookup_tools.fetch_lookup", fake_fetch)
        result = await run_lookup_tool_loop(
            "What's the weather in Denver?",
            None,
            live_lookups=True,
            open_web_search=False,
            chat_model="qwen2.5:14b",
            filter_notes=_allow,
            judge=judge,
            chat_turn=chat_turn,
        )
        assert kinds == ["weather"]
        assert result.native is False
        assert result.needs_grounding is True
        assert result.cards[0]["source"] == "open-meteo"


class TestStreamingAndCards:
    @pytest.mark.asyncio
    async def test_stream_uses_judge_hint_and_keeps_lookup_card(self, monkeypatch):
        captured: dict[str, str] = {}

        async def judge(*_args, **_kwargs):
            return GroundingDecision(True, "hours", "Denver", "weather")

        async def fake_filter_input(*_args, **_kwargs):
            return PipelineResult(allowed=True, content="What's the weather in Denver?")

        async def fake_fetch(intent):
            assert intent.kind == "weather"
            return format_weather_notes("Denver", WEATHER_GEO, WEATHER_FORECAST)

        async def fake_stream(*_args, **kwargs):
            captured["tool_hint"] = kwargs.get("tool_hint") or ""
            yield "It is about 70 degrees in Denver."

        async def fake_filter_output(text, *_args, **_kwargs):
            return PipelineResult(allowed=True, content=text)

        monkeypatch.setattr("homeward_gateway.chat.tool_loop.call_grounding_judge", judge)
        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.filter_input", fake_filter_input)
        monkeypatch.setattr("homeward_gateway.chat.lookup_tools.fetch_lookup", fake_fetch)
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

        hint = captured["tool_hint"].lower()
        assert "invent" in hint
        assert "notes" in hint or "could not check" in hint
        assert "SearxNG" not in captured["tool_hint"]
        statuses = [
            item.message
            for item in events
            if isinstance(item, StatusEvent) and item.message
        ]
        assert "Still putting the answer together…" in statuses
        tool_events = [item for item in events if isinstance(item, ToolEvent)]
        lookup_cards = [
            card
            for event in tool_events
            for card in event.tools
            if card.get("type") == "lookup"
        ]
        assert lookup_cards
        assert lookup_cards[0]["source_label"] == "Open-Meteo weather"
        assert lookup_cards[0]["source"] == "open-meteo"
