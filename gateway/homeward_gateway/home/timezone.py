"""Household timezone for clock hints and cards.

Resolution order (first valid IANA name wins):

1. Household timezone from the parent home location
2. HOMEWARD_TIMEZONE
3. TZ (standard host / container env)
4. Process local zone (from TZ or the host/container local zone; often UTC in
   Docker images unless TZ or /etc/localtime is set)

Python slim images do not ship tzdata. The gateway depends on the ``tzdata``
package so names like America/Denver resolve instead of silently becoming UTC.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from homeward_gateway.config import settings


def zoneinfo_for(name: str | None) -> ZoneInfo | None:
    candidate = (name or "").strip()
    if not candidate:
        return None
    try:
        return ZoneInfo(candidate)
    except (ZoneInfoNotFoundError, KeyError, ValueError):
        return None


def resolve_display_timezone(household: str | None = None) -> str | None:
    """Return the IANA zone used for clock hints and cards, if one is usable."""
    for candidate in (household, settings.timezone, os.environ.get("TZ")):
        zone = zoneinfo_for(candidate)
        if zone is not None:
            key = getattr(zone, "key", None)
            return str(key or candidate).strip()
    return None


def now_in_timezone(
    household: str | None = None,
    now: datetime | None = None,
) -> datetime:
    """Current instant expressed in the resolved household / host timezone."""
    zone = zoneinfo_for(resolve_display_timezone(household))
    moment = now if now is not None else datetime.now(timezone.utc)
    if moment.tzinfo is None:
        if zone is not None:
            return moment.replace(tzinfo=zone)
        return moment.astimezone()
    if zone is not None:
        return moment.astimezone(zone)
    return moment.astimezone()
