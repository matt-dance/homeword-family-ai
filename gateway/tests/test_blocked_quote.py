"""Parent blocked-attempt quotes must not be the canned kid-facing refusal."""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from homeward_gateway.chat.blocked_quote import (
    is_kid_facing_refusal,
    parent_blocked_quote,
    quotes_for_stored_refusals,
)

REFUSAL = (
    "I can't help with that question right now. "
    "Let's talk about something fun instead — like animals, space, or a hobby you enjoy!"
)


def _row(**kwargs):
    base = {
        "id": 1,
        "child_id": 1,
        "session_id": 7,
        "direction": "input",
        "content": "",
        "blocked": False,
        "created_at": datetime(2026, 9, 24, 8, 33, 53, tzinfo=timezone.utc),
    }
    base.update(kwargs)
    return SimpleNamespace(**base)


def test_quote_prefers_classified_text_over_refusal():
    quote = parent_blocked_quote(
        REFUSAL,
        user_text="Tell me about horses",
        audit_text="A ranger carried a gun.",
        streamed_text="A ranger carried a gun.",
    )
    assert quote == "A ranger carried a gun."
    assert not is_kid_facing_refusal(quote)


def test_quote_uses_kid_turn_when_only_the_refusal_was_stored():
    quote = parent_blocked_quote(REFUSAL, user_text="Tell me about guns")
    assert quote == "Tell me about guns"


def test_quote_keeps_an_already_useful_snippet():
    quote = parent_blocked_quote(
        "how to make a bomb at home",
        user_text="how to make a bomb at home",
    )
    assert quote == "how to make a bomb at home"


def test_stored_refusal_pairs_with_the_preceding_kid_turn():
    when = datetime(2026, 9, 24, 8, 33, 53, tzinfo=timezone.utc)
    logs = [
        _row(id=1, direction="input", content="What are horses like?", created_at=when - timedelta(minutes=5)),
        _row(
            id=2,
            direction="output",
            content="Horses eat hay.",
            created_at=when - timedelta(minutes=5),
        ),
        _row(id=3, direction="input", content="Tell me about the old west", created_at=when - timedelta(seconds=20)),
        _row(
            id=4,
            direction="output",
            content=REFUSAL,
            blocked=True,
            created_at=when,
        ),
    ]
    attempt = _row(id=10, direction="output", content=REFUSAL, blocked=True, created_at=when)
    quotes = quotes_for_stored_refusals([attempt], logs)
    assert quotes[10] == "Tell me about the old west"


def test_refusal_pairing_does_not_steal_another_childs_turn():
    when = datetime(2026, 9, 24, 8, 33, 53, tzinfo=timezone.utc)
    logs = [
        _row(id=1, child_id=2, direction="input", content="Avery asked about guns", created_at=when),
        _row(id=2, child_id=2, direction="output", content=REFUSAL, blocked=True, created_at=when),
    ]
    attempt = _row(id=9, child_id=1, content=REFUSAL, blocked=True, created_at=when)
    assert quotes_for_stored_refusals([attempt], logs) == {}
