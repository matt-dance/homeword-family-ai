"""Default profile selection for quick chat and new devices."""

from __future__ import annotations

from homeward_gateway.db.database import ChildProfile


def resolve_default_child(
    children: list[ChildProfile],
    default_profile_child_id: int | None = None,
) -> ChildProfile | None:
    """Pick the household default profile for anonymous Quick Chat.

    Quick Chat borrows this profile's age and safety settings. It does not
    require the child's PIN and does not inject named-kid memory. Auto-select
    prefers a pinless profile so shared tablets stay easy to open; an explicit
    default still wins even if that child has a PIN.
    """
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
