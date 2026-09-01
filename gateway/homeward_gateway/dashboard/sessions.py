"""Group conversation logs into parent-facing chat sessions."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from homeward_gateway.db.database import ConversationLog

SESSION_GAP = timedelta(minutes=30)


def _legacy_session_id(child_id: int, started_at: datetime) -> str:
    ts = started_at.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%S")
    return f"legacy-{child_id}-{ts}"


def group_legacy_logs(logs: list[ConversationLog]) -> list[dict[str, Any]]:
    """Group orphan logs into session-like buckets by inactivity gap."""
    ordered = sorted(logs, key=lambda log: log.created_at)
    sessions: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None

    for log in ordered:
        if (
            current is None
            or current["child_id"] != log.child_id
            or log.created_at - current["last_at"] > SESSION_GAP
        ):
            current = {
                "id": _legacy_session_id(log.child_id, log.created_at),
                "legacy": True,
                "child_id": log.child_id,
                "preview": None,
                "message_count": 0,
                "started_at": log.created_at,
                "last_at": log.created_at,
                "log_ids": [],
            }
            sessions.append(current)

        current["log_ids"].append(log.id)
        current["message_count"] += 1
        current["last_at"] = log.created_at
        if log.direction == "input" and not current["preview"]:
            current["preview"] = log.content[:200]

    for item in sessions:
        item["started_at"] = item["started_at"].isoformat()
        item["last_at"] = item["last_at"].isoformat()
        if not item["preview"]:
            item["preview"] = "Conversation"
    return sessions


def find_legacy_session(logs: list[ConversationLog], session_id: str) -> list[ConversationLog]:
    grouped = group_legacy_logs(logs)
    match = next((s for s in grouped if s["id"] == session_id), None)
    if not match:
        return []
    log_ids = set(match["log_ids"])
    return [log for log in logs if log.id in log_ids]
