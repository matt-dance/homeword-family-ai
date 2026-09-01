"""Response length helpers for LLM output."""


def chars_to_max_tokens(max_chars: int) -> int:
    """Approximate token budget from a character limit."""
    return min(max(256, max_chars // 3), 1200)


def trim_response(text: str, max_chars: int) -> str:
    """Trim long responses at a sentence boundary when possible."""
    if len(text) <= max_chars:
        return text
    chunk = text[:max_chars]
    for sep in (". ", "! ", "? ", ".\n", "\n"):
        pos = chunk.rfind(sep)
        if pos >= int(max_chars * 0.6):
            return chunk[: pos + len(sep.strip())].strip()
    return chunk.rstrip() + "…"
