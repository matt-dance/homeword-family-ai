"""Home location stored on the parent account — one household per server."""

from __future__ import annotations

from dataclasses import dataclass

from homeward_gateway.db.database import ParentAccount


@dataclass(frozen=True)
class HomeContext:
    location: str | None = None
    label: str | None = None
    timezone: str | None = None


def home_context_from_parent(parent: ParentAccount | None) -> HomeContext:
    if not parent:
        return HomeContext()
    return HomeContext(
        location=parent.home_location,
        label=parent.home_location_label,
        timezone=parent.home_timezone,
    )


def home_context_hint(label: str | None) -> str:
    if not label:
        return ""
    return (
        f"This family's home is {label}. "
        "When the child asks about local weather, time, or 'here' without naming another place, "
        "use this home location."
    )
