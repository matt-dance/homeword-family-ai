"""Tests for persisted session state and turn resolution."""

from homeward_gateway.chat.lookups import format_weather_notes
from homeward_gateway.chat.session_state import (
    ResolvedTurn,
    SessionState,
    format_user_turn,
    resolve_turn,
)

WEATHER_GEO = {
    "name": "Eugene",
    "admin1": "Oregon",
    "country": "United States",
    "latitude": 44.05,
    "longitude": -123.09,
}
WEATHER_FORECAST = {
    "current": {"temperature_2m": 60.0, "wind_speed_10m": 5.0, "weather_code": 3},
    "daily": {
        "temperature_2m_max": [65.0],
        "temperature_2m_min": [50.0],
        "precipitation_probability_max": [20],
    },
}


class TestSessionStatePersistence:
    def test_round_trip_json(self):
        state = SessionState(
            topic="Boise State game",
            place="Eugene, OR",
            team="boise state",
            last_lookup_kind="sports",
            last_fact_summary="Boise State at Oregon",
        )
        restored = SessionState.from_json(state.to_json())
        assert restored.place == "Eugene, OR"
        assert restored.team == "boise state"

    def test_merge_lookup_stores_structured_sports_facts(self):
        from homeward_gateway.chat.lookups import LookupIntent, format_sports_notes

        state = SessionState()
        result = format_sports_notes(
            "College Football",
            [
                "Boise State Broncos at Oregon Ducks (Scheduled)"
                " — Autzen Stadium, Eugene, OR — Sat, September 5th at 3:30 PM EDT"
            ],
            "Boise State",
            schedule=True,
        )
        intent = LookupIntent("sports", "boise state", schedule=True)
        merged = state.merge_lookup(intent, result)
        assert merged.team == "boise state"
        assert merged.place == "Eugene, OR"
        assert merged.last_lookup_kind == "sports"

    def test_active_context_block(self):
        state = SessionState(topic="weather at the game", place="Eugene, OR")
        block = state.active_context_block()
        assert "ACTIVE CONTEXT" in block
        assert "Eugene, OR" in block


class TestTurnResolver:
    GAME_HISTORY = [
        {"role": "user", "content": "Who is Boise State playing this weekend?"},
        {
            "role": "assistant",
            "content": "- Venue: Autzen Stadium, Eugene, OR",
        },
    ]

    def test_resolve_turn_expands_weather_follow_up(self):
        persisted = SessionState(team="boise state", place="Eugene, OR")
        resolved = resolve_turn(
            "What will the weather be like at the game?",
            self.GAME_HISTORY,
            persisted,
        )
        assert resolved.is_follow_up
        assert "Eugene, OR" in resolved.expanded_message

    def test_format_user_turn_includes_active_context(self):
        state = SessionState(place="Eugene, OR", topic="game weather")
        resolved = ResolvedTurn(
            original_message="What will the weather be like at the game?",
            expanded_message="What will the weather be like at the game in Eugene, OR?",
            is_follow_up=True,
            context_hint="The child is referring to Eugene, OR from earlier in this chat.",
            state=state,
        )
        weather = format_weather_notes("Eugene", WEATHER_GEO, WEATHER_FORECAST)
        turn = format_user_turn(
            resolved,
            filtered_content="What will the weather be like at the game?",
            lookup_notes=f"LIVE LOOKUP RESULTS\n{weather.notes}",
        )
        assert "ACTIVE CONTEXT" in turn
        assert "LOOKUP DATA" in turn
        assert "Eugene, OR" in turn

    def test_format_user_turn_skips_stale_topic_on_new_card_request(self):
        state = SessionState(topic="Quiz me about animals!")
        resolved = ResolvedTurn(
            original_message="Set a 10-second timer",
            expanded_message="Set a 10-second timer",
            is_follow_up=False,
            context_hint="",
            state=state,
        )
        turn = format_user_turn(resolved, filtered_content="Set a 10-second timer")
        assert "ACTIVE CONTEXT" not in turn
        assert "Quiz me about animals" not in turn
        assert "Set a 10-second timer" in turn

    def test_format_user_turn_skips_topic_even_if_referential_timer(self):
        state = SessionState(topic="Tell me a short story about a curious fox!")
        resolved = ResolvedTurn(
            original_message="How do I make pancakes?",
            expanded_message="How do I make pancakes?",
            is_follow_up=True,
            context_hint="The child is continuing to ask about pancakes.",
            state=state,
        )
        turn = format_user_turn(resolved, filtered_content="How do I make pancakes?")
        assert "curious fox" not in turn
        assert "How do I make pancakes?" in turn
