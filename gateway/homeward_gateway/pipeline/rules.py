"""Fast keyword and jailbreak rule matching."""

import re
from dataclasses import dataclass

# Global jailbreak patterns applied regardless of preset
GLOBAL_JAILBREAK_PATTERNS = [
    "ignore previous instructions",
    "ignore all previous",
    "disregard your instructions",
    "you are now DAN",
    "jailbreak",
    "bypass safety",
    "bypass filter",
    "no restrictions",
    "developer mode enabled",
    "pretend you have no rules",
    "act as an unrestricted",
    "do anything now",
    "unrestricted ai",
    "ignore safety",
]

GLOBAL_BLOCKED_KEYWORDS = [
    "child porn",
    "cp ",
    "how to make a bomb",
    "how to build a bomb",
    "synthesize meth",
    "kill yourself",
]


@dataclass
class RuleResult:
    allowed: bool
    reason: str | None = None
    stage: str = "rules"


def _compile_patterns(patterns: list[str]) -> list[re.Pattern[str]]:
    compiled = []
    for p in patterns:
        try:
            compiled.append(re.compile(re.escape(p), re.IGNORECASE))
        except re.error:
            continue
    return compiled


_GLOBAL_JAILBREAK_RE = _compile_patterns(GLOBAL_JAILBREAK_PATTERNS)
_GLOBAL_BLOCKED_RE = _compile_patterns(GLOBAL_BLOCKED_KEYWORDS)


def check_rules(text: str, extra_keywords: list[str] = None, extra_jailbreaks: list[str] = None) -> RuleResult:
    """Fast rule-based check. Returns allowed=False on match."""
    lower = text.lower()

    for pattern in _GLOBAL_JAILBREAK_RE:
        if pattern.search(lower):
            return RuleResult(allowed=False, reason=f"jailbreak: {pattern.pattern}", stage="rules")

    for pattern in _GLOBAL_BLOCKED_RE:
        if pattern.search(lower):
            return RuleResult(allowed=False, reason=f"blocked: {pattern.pattern}", stage="rules")

    if extra_jailbreaks:
        for p in extra_jailbreaks:
            if p.lower() in lower:
                return RuleResult(allowed=False, reason=f"jailbreak: {p}", stage="rules")

    if extra_keywords:
        for kw in extra_keywords:
            if kw.lower() in lower:
                return RuleResult(allowed=False, reason=f"keyword: {kw}", stage="rules")

    return RuleResult(allowed=True)
