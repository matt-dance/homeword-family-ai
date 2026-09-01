"""Helpers for LLM generation. Length is guided in the prompt, not hard-cut."""

# High ceiling so the model can finish a thought. Style length lives in the prompt.
GENERATION_MAX_TOKENS = 4096
OUTPUT_SAFETY_CHARS = 24_000


def chars_to_max_tokens(max_chars: int) -> int:
    """Legacy helper kept for tests — generation uses GENERATION_MAX_TOKENS."""
    return min(max(256, max_chars // 3), 1200)


def trim_response(text: str, max_chars: int) -> str:
    """Optional trim at a sentence boundary. Not used on live kid replies."""
    if len(text) <= max_chars:
        return text
    chunk = text[:max_chars]
    for sep in (". ", "! ", "? ", ".\n", "\n"):
        pos = chunk.rfind(sep)
        if pos >= int(max_chars * 0.6):
            return chunk[: pos + len(sep.strip())].strip()
    return chunk.rstrip() + "…"
