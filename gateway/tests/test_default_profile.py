"""Tests for default profile helper."""

from homeward_gateway.db.database import ChildProfile
from homeward_gateway.profiles.default_profile import resolve_default_child


def _child(child_id: int, *, pin: str | None = None, name: str = "Kid") -> ChildProfile:
    return ChildProfile(
        id=child_id,
        parent_id=1,
        name=name,
        age=8,
        preset_id="young_explorer",
        strictness=3,
        pin=pin,
        slug=name.lower(),
    )


def test_resolve_default_child_prefers_configured():
    children = [_child(1, pin="1234"), _child(2)]
    assert resolve_default_child(children, 1).id == 1


def test_resolve_default_child_falls_back_to_no_pin():
    children = [_child(1, pin="1234"), _child(2)]
    assert resolve_default_child(children).id == 2


def test_resolve_default_child_uses_first_when_all_have_pin():
    children = [_child(1, pin="1"), _child(2, pin="2")]
    assert resolve_default_child(children).id == 1
