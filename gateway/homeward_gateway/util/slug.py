"""URL-safe slugs for child profile routes."""

from __future__ import annotations

import re

_slug_re = re.compile(r"[^a-z0-9]+")


def slugify_name(name: str) -> str:
    slug = _slug_re.sub("-", name.lower().strip()).strip("-")
    return slug or "child"


def unique_slug(base: str, taken: set[str]) -> str:
    if base not in taken:
        return base
    index = 2
    while f"{base}-{index}" in taken:
        index += 1
    return f"{base}-{index}"
