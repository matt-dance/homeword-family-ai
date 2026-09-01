"""Policy preset loading and matching."""

import re
from dataclasses import dataclass, field
from pathlib import Path

import yaml

from homeward_gateway.config import settings


@dataclass
class PolicyPreset:
    id: str
    name: str
    description: str
    age_min: int
    age_max: int
    strictness_default: int
    strictness_min: int
    strictness_max: int
    blocked_topics: list[str] = field(default_factory=list)
    blocked_keywords: list[str] = field(default_factory=list)
    jailbreak_patterns: list[str] = field(default_factory=list)
    allowed_topics: list[str] = field(default_factory=list)
    max_response_length: int = 800


def _load_preset(path: Path) -> PolicyPreset:
    with open(path) as f:
        data = yaml.safe_load(f)
    return PolicyPreset(
        id=data["id"],
        name=data["name"],
        description=data["description"],
        age_min=data["age_range"]["min"],
        age_max=data["age_range"]["max"],
        strictness_default=data["strictness"]["default"],
        strictness_min=data["strictness"]["min"],
        strictness_max=data["strictness"]["max"],
        blocked_topics=data["rules"].get("blocked_topics", []),
        blocked_keywords=data["rules"].get("blocked_keywords", []),
        jailbreak_patterns=data["rules"].get("jailbreak_patterns", []),
        allowed_topics=data["rules"].get("allowed_topics", []),
        max_response_length=data["rules"].get("max_response_length", 800),
    )


def load_all_presets(policies_dir: Path | None = None) -> dict[str, PolicyPreset]:
    directory = policies_dir or settings.policies_dir
    presets: dict[str, PolicyPreset] = {}
    for path in directory.glob("*.yaml"):
        preset = _load_preset(path)
        presets[preset.id] = preset
    return presets


def preset_for_age(age: int, presets: dict[str, PolicyPreset] | None = None) -> PolicyPreset | None:
    all_presets = presets or load_all_presets()
    for preset in all_presets.values():
        if preset.age_min <= age <= preset.age_max:
            return preset
    return None


def check_policy_match(
    text: str,
    preset: PolicyPreset,
    strictness: int,
) -> tuple[bool, str | None]:
    """Return (allowed, block_reason). Fail-closed on blocked content."""
    lower = text.lower()

    # Jailbreak patterns — always checked
    for pattern in preset.jailbreak_patterns:
        if pattern.lower() in lower:
            return False, f"jailbreak pattern detected: {pattern}"

    # Blocked keywords — scale with strictness
    keyword_threshold = max(1, strictness - 1)
    keyword_hits = sum(1 for kw in preset.blocked_keywords if kw.lower() in lower)
    if keyword_hits >= keyword_threshold:
        return False, "blocked keyword detected"

    # Blocked topics — at higher strictness
    if strictness >= 3:
        for topic in preset.blocked_topics:
            if topic.lower() in lower:
                return False, f"blocked topic: {topic}"

    return True, None


def compile_jailbreak_regex(preset: PolicyPreset) -> list[re.Pattern[str]]:
    patterns = []
    for p in preset.jailbreak_patterns:
        try:
            patterns.append(re.compile(re.escape(p), re.IGNORECASE))
        except re.error:
            continue
    return patterns
