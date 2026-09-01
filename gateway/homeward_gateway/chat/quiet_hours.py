"""Quiet hours scheduling for kid chat."""

from __future__ import annotations

from datetime import datetime, timezone


def _parse_hhmm(value: str | None) -> tuple[int, int] | None:
    if not value or ":" not in value:
        return None
    try:
        hour, minute = value.split(":", 1)
        return int(hour), int(minute)
    except ValueError:
        return None


def _active_days(days_csv: str | None) -> set[int]:
    """Weekdays 0=Monday through 6=Sunday."""
    if not days_csv:
        return set(range(7))
    result: set[int] = set()
    for part in days_csv.split(","):
        part = part.strip()
        if part.isdigit():
            day = int(part)
            if 0 <= day <= 6:
                result.add(day)
    return result or set(range(7))


def is_chat_available(
    *,
    enabled: bool,
    start: str | None,
    end: str | None,
    days: str | None,
    now: datetime | None = None,
) -> tuple[bool, str | None]:
    """Return (available, friendly_message_if_unavailable)."""
    if not enabled:
        return True, None

    start_parts = _parse_hhmm(start)
    end_parts = _parse_hhmm(end)
    if not start_parts or not end_parts:
        return True, None

    current = now or datetime.now()
    if current.weekday() not in _active_days(days):
        return False, "Homeward is resting today. Ask a parent when chat opens again."

    now_minutes = current.hour * 60 + current.minute
    start_minutes = start_parts[0] * 60 + start_parts[1]
    end_minutes = end_parts[0] * 60 + end_parts[1]

    if start_minutes <= end_minutes:
        in_window = start_minutes <= now_minutes < end_minutes
    else:
        # Overnight window, e.g. 22:00–07:00
        in_window = now_minutes >= start_minutes or now_minutes < end_minutes

    if in_window:
        return True, None

    return False, "Homeward is resting right now. Chat opens again during your family's chat hours."
