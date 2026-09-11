"""Session summaries for the parent dashboard."""

from __future__ import annotations

import logging

from homeward_gateway.config import settings
from homeward_gateway.models.ollama_chat import chat_completion

logger = logging.getLogger(__name__)


def _fallback_summary(child_name: str, message_count: int, blocked_count: int) -> str:
    if blocked_count:
        return (
            f"{child_name} had a chat with {message_count} message(s); "
            f"{blocked_count} message(s) were blocked by safety filters."
        )
    return f"{child_name} had a friendly chat with {message_count} message(s); all passed filters."


async def summarize_session(
    child_name: str,
    exchanges: list[tuple[str, str]],
    blocked_count: int,
    chat_model: str | None = None,
) -> str:
    """One-line parent summary of a chat session."""
    message_count = len(exchanges)
    if message_count == 0:
        return f"{child_name} opened chat but did not send any messages."

    transcript_lines = []
    for user_msg, assistant_msg in exchanges[-6:]:
        transcript_lines.append(f"Child: {user_msg[:200]}")
        transcript_lines.append(f"Assistant: {assistant_msg[:200]}")
    transcript = "\n".join(transcript_lines)

    prompt = (
        "Write ONE short sentence for a parent summarizing this child's safe AI chat session. "
        "Mention topics if clear. Do not include inappropriate content. "
        f"Blocked messages this session: {blocked_count}.\n\n"
        f"{transcript}\n\nSummary:"
    )

    try:
        content = await chat_completion(
            chat_model or settings.ollama_model,
            [{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=80,
        )
        content = content.strip()
        if content:
            return content[:300]
    except Exception as exc:
        logger.warning("Session summary LLM failed: %s", exc)

    return _fallback_summary(child_name, message_count, blocked_count)
