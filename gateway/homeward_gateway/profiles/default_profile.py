"""Default profile selection for quick chat and new devices."""

from __future__ import annotations

from homeward_gateway.db.database import ChildProfile


def resolve_default_child(
    children: list[ChildProfile],
    default_profile_child_id: int | None = None,
) -> ChildProfile | None:
    """Pick the household default profile for quick chat entry."""
    if not children:
        return None

    if default_profile_child_id is not None:
        for child in children:
            if child.id == default_profile_child_id:
                return child

    for child in children:
        if child.pin is None:
            return child

    return children[0]
