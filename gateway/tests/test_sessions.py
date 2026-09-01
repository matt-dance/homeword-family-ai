"""Tests for dashboard session grouping."""

from datetime import datetime, timedelta, timezone

from homeward_gateway.dashboard.sessions import group_legacy_logs
from homeward_gateway.db.database import ConversationLog


def _log(log_id: int, child_id: int, direction: str, content: str, minutes: int) -> ConversationLog:
    return ConversationLog(
        id=log_id,
        child_id=child_id,
        direction=direction,
        content=content,
        created_at=datetime(2026, 9, 1, 12, 0, tzinfo=timezone.utc) + timedelta(minutes=minutes),
    )


def test_group_legacy_logs_splits_on_gap():
    logs = [
        _log(1, 1, "input", "hello", 0),
        _log(2, 1, "output", "hi there", 1),
        _log(3, 1, "input", "tell me about space", 45),
        _log(4, 1, "output", "space is big", 46),
    ]
    sessions = group_legacy_logs(logs)
    assert len(sessions) == 2
    assert sessions[0]["message_count"] == 2
    assert sessions[1]["preview"] == "tell me about space"
