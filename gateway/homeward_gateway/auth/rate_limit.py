"""Simple rate limiting for sensitive auth endpoints."""

from __future__ import annotations

import time
from collections import defaultdict

_WINDOW_SECONDS = 900  # 15 minutes
_MAX_ATTEMPTS = 5

_attempts: dict[str, list[float]] = defaultdict(list)


def _prune(key: str, now: float, window_seconds: int = _WINDOW_SECONDS) -> None:
    cutoff = now - window_seconds
    _attempts[key] = [ts for ts in _attempts[key] if ts > cutoff]


def check_rate_limit(
    key: str,
    *,
    max_attempts: int = _MAX_ATTEMPTS,
    window_seconds: int = _WINDOW_SECONDS,
) -> None:
    from fastapi import HTTPException

    now = time.time()
    _prune(key, now, window_seconds)
    if len(_attempts[key]) >= max_attempts:
        minutes = max(1, window_seconds // 60)
        raise HTTPException(
            status_code=429,
            detail=f"Too many attempts. Please wait {minutes} minutes and try again.",
        )


def record_attempt(key: str, *, window_seconds: int = _WINDOW_SECONDS) -> None:
    now = time.time()
    _prune(key, now, window_seconds)
    _attempts[key].append(now)


def reset_attempts(key: str) -> None:
    _attempts.pop(key, None)
