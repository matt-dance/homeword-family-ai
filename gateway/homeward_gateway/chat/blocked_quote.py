"""Parent-dashboard quote for a blocked attempt.

The kid still sees Homeward's canned refusal. Parents should see the text that
was classified (or the kid's own turn), not that refusal.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Sequence

# Kid-facing copy from the chat routes. Match by prefix so a stored refusal
# still resolves when whitespace differs.
KID_FACING_REFUSAL_PREFIXES = (
    "I can't help with that question right now",
    "Homeward's brain is taking a nap right now",
    "Homeward had trouble checking that question",
)

_MATCH_WINDOW = timedelta(seconds=30)


def is_kid_facing_refusal(text: str | None) -> bool:
    stripped = (text or "").strip()
    if not stripped:
        return False
    return any(stripped.startswith(prefix) for prefix in KID_FACING_REFUSAL_PREFIXES)


def parent_blocked_quote(
    stored: str | None,
    *,
    user_text: str | None = None,
    audit_text: str | None = None,
    streamed_text: str | None = None,
) -> str:
    """Choose the parent-visible snippet for a blocked attempt.

    Prefer the classified trigger text, then text that is already a real quote,
    then the kid's turn. Skip canned refusals whenever another quote exists.
    """
    stored_text = (stored or "").strip()
    candidates: list[str | None] = [audit_text, streamed_text]
    if stored_text and not is_kid_facing_refusal(stored_text):
        candidates.append(stored_text)
    candidates.append(user_text)
    for candidate in candidates:
        text = (candidate or "").strip()
        if text and not is_kid_facing_refusal(text):
            return text
    return stored_text


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _seconds_apart(left: datetime, right: datetime) -> float:
    return abs((_as_utc(left) - _as_utc(right)).total_seconds())


def quotes_for_stored_refusals(
    attempts: Sequence[Any],
    logs: Sequence[Any],
) -> dict[int, str]:
    """Map attempt id -> preceding kid input when the stored quote is a refusal.

    Output blocks used to save the canned refusal on the attempt row. The kid's
    turn is still in the conversation log and can be shown for those rows.
    """
    pending = [
        attempt
        for attempt in attempts
        if is_kid_facing_refusal(getattr(attempt, "content", None))
    ]
    if not pending:
        return {}

    used_log_ids: set[int] = set()
    quotes: dict[int, str] = {}
    ordered = sorted(pending, key=lambda attempt: (_as_utc(attempt.created_at), attempt.id))
    for attempt in ordered:
        stored = (attempt.content or "").strip()
        candidates = [
            log
            for log in logs
            if log.id not in used_log_ids
            and log.child_id == attempt.child_id
            and log.direction == "output"
            and bool(log.blocked)
            and (log.content or "").strip() == stored
            and _seconds_apart(log.created_at, attempt.created_at) <= _MATCH_WINDOW.total_seconds()
        ]
        if not candidates:
            continue
        output = min(
            candidates,
            key=lambda log: (_seconds_apart(log.created_at, attempt.created_at), log.id),
        )
        used_log_ids.add(output.id)
        kid = _preceding_input(output, logs)
        if kid:
            quotes[attempt.id] = kid
    return quotes


def _preceding_input(output: Any, logs: Sequence[Any]) -> str | None:
    output_at = _as_utc(output.created_at)
    pool = []
    for log in logs:
        if log.direction != "input":
            continue
        if output.session_id:
            if log.session_id != output.session_id:
                continue
        elif log.child_id != output.child_id:
            continue
        if _as_utc(log.created_at) <= output_at:
            pool.append(log)
    if not pool:
        return None
    kid = max(pool, key=lambda log: (_as_utc(log.created_at), log.id))
    text = (kid.content or "").strip()
    if not text or is_kid_facing_refusal(text):
        return None
    return kid.content
