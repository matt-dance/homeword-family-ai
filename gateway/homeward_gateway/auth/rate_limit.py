"""Simple rate limiting for sensitive auth endpoints."""

from __future__ import annotations

import time
from collections import defaultdict

_WINDOW_SECONDS = 900  # 15 minutes
_MAX_ATTEMPTS = 5

_attempts: dict[str, list[float]] = defaultdict(list)


def _prune(key: str, now: float) -> None:
    cutoff = now - _WINDOW_SECONDS
    _attempts[key] = [ts for ts in _attempts[key] if ts > cutoff]


def check_rate_limit(key: str) -> None:
    from fastapi import HTTPException

    now = time.time()
    _prune(key, now)
    if len(_attempts[key]) >= _MAX_ATTEMPTS:
        raise HTTPException(
            status_code=429,
            detail="Too many attempts. Please wait 15 minutes and try again.",
        )


def record_attempt(key: str) -> None:
    now = time.time()
    _prune(key, now)
    _attempts[key].append(now)


def reset_attempts(key: str) -> None:
    _attempts.pop(key, None)
