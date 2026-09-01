"""Text normalization and basic sanitization."""

import html
import re
import unicodedata

# Zero-width and control characters
_CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_ZERO_WIDTH_RE = re.compile(r"[\u200b-\u200f\u2028-\u202f\u2060-\u206f\ufeff]")
_EXCESS_SPACE_RE = re.compile(r"\s+")


def normalize(text: str, max_length: int = 4000) -> str:
    """Normalize and sanitize input text."""
    if not text:
        return ""

    # Unicode normalization
    text = unicodedata.normalize("NFKC", text)

    # Decode HTML entities
    text = html.unescape(text)

    # Remove control and zero-width characters
    text = _CONTROL_RE.sub("", text)
    text = _ZERO_WIDTH_RE.sub("", text)

    # Collapse whitespace
    text = _EXCESS_SPACE_RE.sub(" ", text).strip()

    # Length limit
    if len(text) > max_length:
        text = text[:max_length]

    return text


def normalize_output(text: str, max_length: int = 24_000) -> str:
    """Sanitize model output without collapsing markdown or cutting mid-reply."""
    if not text:
        return ""

    text = unicodedata.normalize("NFKC", text)
    text = html.unescape(text)
    text = _CONTROL_RE.sub("", text)
    text = _ZERO_WIDTH_RE.sub("", text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if len(text) > max_length:
        text = text[:max_length]
    return text
