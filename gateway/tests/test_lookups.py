"""Named live lookups: detection, formatters, and parent-toggle gating."""

import pytest

from homeward_gateway.chat.lookups import (
    LookupResult,
    build_session_context,
    coerce_open_web_search,
    detect_current_facts_intent,
    detect_lookup_intent,
    detect_web_search_intent,
    format_current_facts_notes,
    format_web_notes,
    parse_searxng_results,
    rewrite_web_query,
    format_news_notes,
    format_sports_notes,
    format_weather_notes,
    is_referential,
    lookup_card,
    lookup_context_hint,
    lookup_prompt_notes,
    parse_featured_headlines,
    parse_in_the_news_template,
    parse_scoreboard_events,
    resolve_lookup_intent,
    resolve_weather_place,
    weather_missing_place_notes,
    _parse_wikipedia_incumbent,
)
from homeward_gateway.chat.session_state import SessionState
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

    def test_resolve_weather_place_from_assistant_game_context(self):
        history = [
            {"role": "user", "content": "Who is Boise State playing this weekend?"},
            {
                "role": "assistant",
                "content": (
                    "Boise State is playing the Oregon Ducks at Autzen Stadium "
                    "in Eugene, OR, on Saturday, September 5th at 3:30 PM EDT."
                ),
            },
        ]
        place = resolve_weather_place(
            "What will the weather be like at that game?",
            history,
        )
        assert place == "Eugene, OR"

    def test_resolve_weather_place_from_sports_lookup_line(self):
        history = [
            {"role": "user", "content": "Who is Boise State playing this weekend?"},
            {
                "role": "assistant",
                "content": (
                    "Boise State Broncos at Oregon Ducks (Scheduled)"
                    " — Autzen Stadium, Eugene, OR — Sat, September 5th at 3:30 PM EDT"
                ),
            },
        ]
        place = resolve_weather_place(
            "What will the weather be like at the game?",
            history,
        )
        assert place == "Eugene, OR"

    def test_resolve_weather_place_does_not_use_stale_game_for_general_question(self):
        history = [
            {"role": "user", "content": "Who is Boise State playing this weekend?"},
            {
                "role": "assistant",
                "content": "Boise State is playing at Autzen Stadium in Eugene, OR.",
            },
        ]
        place = resolve_weather_place(
            "What's the weather tomorrow?",
            history,
            home_location="Denver, CO",
        )
        assert place == "Denver, CO"

    def test_weather_missing_place_notes(self):
        assert "city or town" in weather_missing_place_notes().lower()

    def test_news(self):
        intent = detect_lookup_intent("What's in the news today?")
        assert intent is not None
        assert intent.kind == "news"

    def test_news_stories_from_today(self):
        for question in (
            "what are some news stories from today",
            "what are some of the latest news stories today?",
            "look up on the web a news story from today",
        ):
            intent = detect_lookup_intent(question)
            assert intent is not None, question
            assert intent.kind == "news", question
            assert detect_web_search_intent(question) is None, question

    def test_web_search_iran_war_not_weather_or_sports(self):
        intent = detect_web_search_intent("what is going on in the current iran war")
        assert intent is not None
        assert intent.kind == "web"
        assert "iran" in intent.query.lower()
        assert "war" in intent.query.lower()
        assert "current" not in intent.query.lower()
        assert detect_web_search_intent("What's the weather in Denver?") is None
        assert detect_web_search_intent("Did the Broncos win last night?") is None
        assert coerce_open_web_search(False, True) is False
        assert coerce_open_web_search(True, True) is True
        assert rewrite_web_query("what is going on in the current iran war") == "iran war"

    def test_current_facts_president(self):
        intent = detect_current_facts_intent("Who is the president of the United States right now?")
        assert intent is not None
        assert intent.kind == "current_facts"
        assert intent.query == "President_of_the_United_States"
        resolved, _ctx = resolve_lookup_intent("Who is the president of the United States right now?")
        assert resolved is not None
        assert resolved.kind == "current_facts"

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

    def test_resolve_lookup_weather_from_game_context(self):
        intent, context = resolve_lookup_intent(
            "What will the weather be like at that game?",
            self.GAME_HISTORY,
        )
        assert intent is not None
        assert intent.kind == "weather"
        assert intent.query == "Eugene, OR"
        assert context.team == "boise state"

    def test_resolve_lookup_sports_followup(self):
        intent, context = resolve_lookup_intent("Did they win?", self.GAME_HISTORY)
        assert intent is not None
        assert intent.kind == "sports"
        assert intent.query == "boise state"
        assert intent.schedule is False

    def test_last_game_score_is_recent_scores_not_schedule(self):
        intent, _context = resolve_lookup_intent(
            "what was the score of their last game",
            self.GAME_HISTORY,
        )
        assert intent is not None
        assert intent.kind == "sports"
        assert intent.query == "boise state"
        assert intent.schedule is False
        assert intent.date_range is not None
        assert "-" in intent.date_range

        named = detect_lookup_intent("what was the score of Boise State's last game")
        assert named is not None
        assert named.kind == "sports"
        assert named.schedule is False

    def test_resolve_lookup_does_not_use_stale_place_for_general_weather(self):
        intent, _context = resolve_lookup_intent(
            "What's the weather tomorrow?",
            self.GAME_HISTORY,
            home_location="Denver, CO",
        )
        assert intent is not None
        assert intent.kind == "weather"
        assert intent.query == "Denver, CO"

    def test_lookup_context_hint_for_referential_weather(self):
        intent, context = resolve_lookup_intent(
            "What will the weather be like there?",
            self.GAME_HISTORY,
        )
        assert intent is not None
        hint = lookup_context_hint(
            "What will the weather be like there?",
            intent,
            context,
            referential=True,
        )
        prompt = lookup_prompt_notes(format_weather_notes("Eugene", WEATHER_GEO, WEATHER_FORECAST), context_hint=hint)
        assert "Eugene, OR" in hint or "earlier in this chat" in hint
        assert "earlier in this chat" in prompt

    def test_resolve_weather_from_paraphrased_game_bullets(self):
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
        intent, context = resolve_lookup_intent(
            "What will the weather be like at the game?",
            history,
        )
        assert context.place == "Eugene, OR"
        assert context.team == "boise state"
        assert intent is not None
        assert intent.kind == "weather"
        assert intent.query == "Eugene, OR"


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
            "news": [
                {
                    "story": "<p>A rover finds a new rock on Mars.</p>",
                    "links": [{"titles": {"normalized": "Mars rover"}}],
                }
            ],
            "onthisday": [
                {
                    "year": 2011,
                    "text": "Yak-Service Flight 9633 crashes near Yaroslavl, Russia.",
                }
            ],
            "mostread": {
                "articles": [{"titles": {"normalized": "Barack Obama"}}],
            },
        }
        headlines = parse_featured_headlines(payload)
        assert any("Mars" in item for item in headlines)
        assert not any("Yak-Service" in item for item in headlines)
        assert not any("Obama" in item for item in headlines)

    def test_parse_featured_headlines_ignores_onthisday_when_news_is_empty(self):
        payload = {
            "news": [],
            "onthisday": [
                {
                    "year": 2011,
                    "text": "Yak-Service Flight 9633 crashes near Yaroslavl, Russia.",
                }
            ],
        }
        assert parse_featured_headlines(payload) == []

    def test_parse_in_the_news_template_uses_featured_bullets_only(self):
        wikitext = """
{{Main page image/ITN|image=Example.jpg}}
*<!--Sep 02--> American journalist '''[[Gloria Steinem]]''' ''(pictured)'' dies at the {{nowrap|age of 92}}.
*<!--Aug 31--> Icelanders reject [[European Union]] membership negotiations.
{{In the news/footer
|currentevents =
* [[Russo-Ukrainian war (2022–present)|Russo-Ukrainian war]]
}}
"""
        headlines = parse_in_the_news_template(wikitext)
        assert any("Gloria Steinem" in item and "92" in item for item in headlines)
        assert any("Icelanders" in item for item in headlines)
        assert not any("Russo-Ukrainian" in item for item in headlines)


class TestResolveLiveLookup:
    @pytest.mark.asyncio
    async def test_disabled_does_not_fetch(self, monkeypatch):
        called = False

        async def fake_fetch(_intent):
            nonlocal called
            called = True
            return None

        monkeypatch.setattr("homeward_gateway.chat.lookup_tools.fetch_lookup", fake_fetch)
        notes, tools, intent, result = await resolve_live_lookup(
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

        monkeypatch.setattr("homeward_gateway.chat.lookup_tools.fetch_lookup", fake_fetch)
        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.filter_output", fake_filter_output)
        notes, tools, intent, result = await resolve_live_lookup(
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

        monkeypatch.setattr("homeward_gateway.chat.lookup_tools.fetch_lookup", fake_fetch)
        notes, tools, intent, result = await resolve_live_lookup(
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

        monkeypatch.setattr("homeward_gateway.chat.lookup_tools.fetch_lookup", fake_fetch)
        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.filter_output", fake_filter_output)
        notes, tools, intent, result = await resolve_live_lookup(
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

        monkeypatch.setattr("homeward_gateway.chat.lookup_tools.fetch_lookup", fake_fetch)
        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.filter_output", fake_filter_output)
        notes, tools, intent, result = await resolve_live_lookup(
            "What's in the news today?",
            live_lookups=True,
            preset=YOUNG,
            strictness=4,
        )
        assert "not kid-safe" in notes
        assert tools == []

    def test_parse_searxng_results_skips_empty(self):
        items = parse_searxng_results(
            {
                "results": [
                    {
                        "title": "2026 Iran war",
                        "content": "The United States and Israel have been at war with Iran.",
                        "url": "https://en.wikipedia.org/wiki/2026_Iran_war",
                    },
                    {"title": "", "content": "nope", "url": "https://example.com"},
                    {"title": "Skip", "content": "ftp file", "url": "ftp://example.com/x"},
                ]
            }
        )
        assert len(items) == 1
        assert "Iran" in items[0]["snippet"]
        notes = format_web_notes("iran war", items)
        assert notes.kind == "web"
        assert notes.source_label == "Open web search"
        assert "SearxNG" not in notes.notes

    @pytest.mark.asyncio
    async def test_open_web_iran_war_uses_search(self, monkeypatch):
        captured: dict[str, str] = {}

        async def fake_fetch(intent):
            captured["kind"] = intent.kind
            captured["query"] = intent.query
            return format_web_notes(
                intent.query,
                [
                    {
                        "title": "2026 Iran war",
                        "snippet": "The United States and Israel have been at war with Iran.",
                        "url": "https://en.wikipedia.org/wiki/2026_Iran_war",
                    }
                ],
            )

        async def fake_filter_output(text, *_args, **_kwargs):
            return PipelineResult(allowed=True, content=text)

        monkeypatch.setattr("homeward_gateway.chat.lookup_tools.fetch_lookup", fake_fetch)
        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.filter_output", fake_filter_output)
        notes, tools, intent, result = await resolve_live_lookup(
            "what is going on in the current iran war",
            live_lookups=True,
            open_web_search=True,
            preset=YOUNG,
            strictness=3,
        )
        assert captured["kind"] == "web"
        assert "iran" in captured["query"].lower()
        assert "war" in notes.lower()
        assert "protest" not in notes.lower()
        assert tools[0]["source_label"] == "Open web search"
        assert result is not None
        assert result.kind == "web"

    @pytest.mark.asyncio
    async def test_news_stories_use_wikipedia_even_when_open_web_on(self, monkeypatch):
        captured: dict[str, str] = {}

        async def fake_fetch(intent):
            captured["kind"] = intent.kind
            return format_news_notes(["Gloria Steinem dies at the age of 92"])

        async def fake_filter_output(text, *_args, **_kwargs):
            return PipelineResult(allowed=True, content=text)

        monkeypatch.setattr("homeward_gateway.chat.lookup_tools.fetch_lookup", fake_fetch)
        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.filter_output", fake_filter_output)
        notes, tools, intent, result = await resolve_live_lookup(
            "what are some news stories from today",
            live_lookups=True,
            open_web_search=True,
            preset=YOUNG,
            strictness=3,
        )
        assert captured["kind"] == "news"
        assert intent is not None
        assert intent.kind == "news"
        assert result is not None
        assert result.kind == "news"
        assert "Gloria Steinem" in notes
        assert tools[0]["source_label"] == "Wikipedia Current Events"

    @pytest.mark.asyncio
    async def test_open_web_off_does_not_search_iran_war(self, monkeypatch):
        called = False

        async def fake_fetch(_intent):
            nonlocal called
            called = True
            return None

        monkeypatch.setattr("homeward_gateway.chat.lookup_tools.fetch_lookup", fake_fetch)
        notes, tools, intent, result = await resolve_live_lookup(
            "what is going on in the current iran war",
            live_lookups=True,
            open_web_search=False,
            preset=YOUNG,
            strictness=3,
        )
        assert called is False
        assert "could not check" in notes.lower()
        assert "SearxNG" not in notes
        assert tools == []
        assert intent is not None
        assert intent.kind == "web"

    @pytest.mark.asyncio
    async def test_open_web_weather_still_uses_named_api(self, monkeypatch):
        result = format_weather_notes("Denver", WEATHER_GEO, WEATHER_FORECAST)
        kinds: list[str] = []

        async def fake_fetch(intent):
            kinds.append(intent.kind)
            return result

        async def fake_filter_output(text, *_args, **_kwargs):
            return PipelineResult(allowed=True, content=text)

        monkeypatch.setattr("homeward_gateway.chat.lookup_tools.fetch_lookup", fake_fetch)
        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.filter_output", fake_filter_output)
        notes, tools, intent, _result = await resolve_live_lookup(
            "What's the weather in Denver?",
            live_lookups=True,
            open_web_search=True,
            preset=YOUNG,
            strictness=3,
        )
        assert kinds == ["weather"]
        assert "Open-Meteo" in notes
        assert tools[0]["source"] == "open-meteo"

    @pytest.mark.asyncio
    async def test_open_web_engine_down_does_not_invent(self, monkeypatch):
        async def fake_fetch(_intent):
            return None

        monkeypatch.setattr("homeward_gateway.chat.lookup_tools.fetch_lookup", fake_fetch)
        notes, tools, intent, result = await resolve_live_lookup(
            "what is going on in the current iran war",
            live_lookups=True,
            open_web_search=True,
            preset=YOUNG,
            strictness=3,
        )
        assert "could not check" in notes.lower()
        assert "training data" in notes.lower() or "from memory" in notes.lower()
        assert tools == []
        assert result is None
        assert intent is not None and intent.kind == "web"

    @pytest.mark.asyncio
    async def test_open_web_filter_block_does_not_invent(self, monkeypatch):
        async def fake_fetch(_intent):
            return format_web_notes(
                "iran war",
                [{"title": "War", "snippet": "how to make a bomb at home", "url": "https://example.com"}],
            )

        async def fake_filter_output(_text, *_args, **_kwargs):
            return PipelineResult(allowed=False, block_reason="blocked", stage="output_rules")

        monkeypatch.setattr("homeward_gateway.chat.lookup_tools.fetch_lookup", fake_fetch)
        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.filter_output", fake_filter_output)
        notes, tools, intent, result = await resolve_live_lookup(
            "what is going on in the current iran war",
            live_lookups=True,
            open_web_search=True,
            preset=YOUNG,
            strictness=4,
        )
        assert "not kid-safe" in notes
        assert "from memory" in notes
        assert tools == []
        assert result is None


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
            captured["messages"] = messages
            captured["user_turn"] = next(
                item["content"] for item in reversed(messages) if item.get("role") == "user"
            )
            return "Ask a parent to look outside."

        async def fake_filter_output(text, *_args, **_kwargs):
            return PipelineResult(allowed=True, content=text)

        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.filter_input", fake_filter_input)
        monkeypatch.setattr("homeward_gateway.chat.lookup_tools.fetch_lookup", fake_fetch)
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
            captured["messages"] = messages
            captured["user_turn"] = next(
                item["content"] for item in reversed(messages) if item.get("role") == "user"
            )
            return "It is sunny and about 70 degrees in Denver."

        async def fake_filter_output(text, *_args, **_kwargs):
            return PipelineResult(allowed=True, content=text)

        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.filter_input", fake_filter_input)
        monkeypatch.setattr("homeward_gateway.chat.lookup_tools.fetch_lookup", fake_fetch)
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
        assert "LOOKUP DATA" not in captured["user_turn"]
        assert "ACTIVE CONTEXT" not in captured["user_turn"]
        assert "What's the weather in Denver?" in captured["user_turn"]
        tool_blob = " ".join(
            item.get("content") or ""
            for item in captured["messages"]
            if item.get("role") == "tool"
        )
        assert "Open-Meteo" in tool_blob
        assert "70" in tool_blob
        assert "LIVE LOOKUP" not in captured["user_turn"]

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

        tool_events = [item for item in events if isinstance(item, ToolEvent)]
        assert tool_events
        assert tool_events[0].tools[0]["type"] == "lookup"
        assert tool_events[0].tools[0]["source_label"] == "Open-Meteo weather"

    @pytest.mark.asyncio
    async def test_process_chat_news_stories_use_wikipedia_not_web(self, monkeypatch):
        captured: dict[str, object] = {}

        async def fake_filter_input(*_args, **_kwargs):
            return PipelineResult(allowed=True, content="what are some news stories from today")

        async def fake_fetch(intent):
            captured["kind"] = intent.kind
            return format_news_notes(["Gloria Steinem dies at the age of 92"])

        async def fake_generate(messages, *_args, **_kwargs):
            captured["messages"] = messages
            return "Here are a few headlines from Wikipedia."

        async def fake_filter_output(text, *_args, **_kwargs):
            return PipelineResult(allowed=True, content=text)

        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.filter_input", fake_filter_input)
        monkeypatch.setattr("homeward_gateway.chat.lookup_tools.fetch_lookup", fake_fetch)
        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.generate_response", fake_generate)
        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.filter_output", fake_filter_output)

        result = await process_chat(
            "what are some news stories from today",
            [],
            YOUNG,
            3,
            "Emma",
            7,
            live_lookups=True,
            open_web_search=True,
        )
        assert result.allowed
        assert captured["kind"] == "news"
        tool_blob = " ".join(
            item.get("content") or ""
            for item in captured["messages"]
            if item.get("role") == "tool"
        )
        assert "Gloria Steinem" in tool_blob
        assert "Wikipedia Current Events" in tool_blob
        assert "SearxNG" not in tool_blob
        user_turn = next(
            item["content"]
            for item in reversed(captured["messages"])
            if item.get("role") == "user"
        )
        assert "LOOKUP DATA" not in user_turn
        assert any(card.get("source_label") == "Wikipedia Current Events" for card in (result.tools or []))

    @pytest.mark.asyncio
    async def test_tell_me_more_after_new_topic_does_not_refetch_news(self, monkeypatch):
        fetched: list[str] = []

        async def fake_filter_input(*_args, **_kwargs):
            return PipelineResult(allowed=True, content="tell me more")

        async def fake_fetch(intent):
            fetched.append(intent.kind)
            return format_news_notes(["Gloria Steinem dies at the age of 92"])

        captured: dict[str, object] = {}

        async def fake_generate(messages, *_args, **_kwargs):
            captured["messages"] = messages
            return "Black holes warp spacetime so strongly that light cannot escape."

        async def fake_filter_output(text, *_args, **_kwargs):
            return PipelineResult(allowed=True, content=text)

        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.filter_input", fake_filter_input)
        monkeypatch.setattr("homeward_gateway.chat.lookup_tools.fetch_lookup", fake_fetch)
        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.generate_response", fake_generate)
        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.filter_output", fake_filter_output)

        stale = SessionState(
            topic="what's in the news today",
            subject="current events",
            last_lookup_kind="news",
            last_fact_summary="Gloria Steinem dies at 92",
        )
        after_topic = stale.with_topic("tell me about black holes")
        history = [
            {"role": "user", "content": "what's in the news today"},
            {"role": "assistant", "content": "Gloria Steinem died at 92."},
            {"role": "user", "content": "tell me about black holes"},
            {"role": "assistant", "content": "Black holes have gravity so strong light cannot escape."},
        ]
        result = await process_chat(
            "tell me more",
            history,
            YOUNG,
            3,
            "Emma",
            7,
            live_lookups=True,
            open_web_search=True,
            session_state=after_topic,
        )
        assert result.allowed
        assert fetched == []
        user_turn = next(
            item["content"]
            for item in reversed(captured["messages"])
            if item.get("role") == "user"
        )
        assert "black holes" in user_turn.lower()
        assert "gloria" not in user_turn.lower()
        assert "current events" not in user_turn.lower()
        assert not any(item.get("role") == "tool" for item in captured["messages"])

    @pytest.mark.asyncio
    async def test_native_model_answers_from_tool_turn(self, monkeypatch):
        lookup = format_weather_notes("Denver", WEATHER_GEO, WEATHER_FORECAST)
        turns = [
            {
                "role": "assistant",
                "content": "",
                "tool_calls": [
                    {
                        "function": {
                            "name": "get_weather",
                            "arguments": {"place": "Denver", "when": "today"},
                        }
                    }
                ],
            },
            {
                "role": "assistant",
                "content": "It is sunny and about 70 degrees in Denver.",
            },
        ]

        async def fake_fetch(intent):
            assert intent.kind == "weather"
            return lookup

        async def fake_complete(messages, *, tools=None, model=None, temperature=0.2):
            assert tools
            return turns.pop(0)

        async def fake_filter_input(*_args, **_kwargs):
            return PipelineResult(allowed=True, content="What's the weather in Denver?")

        async def fake_filter_output(text, *_args, **_kwargs):
            return PipelineResult(allowed=True, content=text)

        async def unexpected_generate(*_args, **_kwargs):
            raise AssertionError("native loop should not call generate_response")

        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.filter_input", fake_filter_input)
        monkeypatch.setattr("homeward_gateway.chat.lookup_tools.fetch_lookup", fake_fetch)
        monkeypatch.setattr("homeward_gateway.models.router.complete_chat_turn", fake_complete)
        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.generate_response", unexpected_generate)
        monkeypatch.setattr("homeward_gateway.pipeline.pipeline.filter_output", fake_filter_output)

        result = await process_chat(
            "What's the weather in Denver?",
            [],
            YOUNG,
            3,
            "Emma",
            7,
            live_lookups=True,
            chat_model="qwen2.5:14b",
        )
        assert result.allowed
        assert "70" in (result.content or "")
        assert any(card.get("source") == "open-meteo" for card in (result.tools or []))
        assert turns == []
