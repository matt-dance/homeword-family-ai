"""Session summaries for the parent dashboard."""

from __future__ import annotations

import logging

import litellm

from homeward_gateway.config import settings

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

    if settings.cloud_enabled and settings.openai_api_key:
        llm_model = "gpt-4o-mini"
        api_key = settings.openai_api_key
        api_base = None
    else:
        llm_model = f"ollama/{chat_model or settings.ollama_model}"
        api_key = "ollama"
        api_base = settings.ollama_base_url

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
        response = await litellm.acompletion(
            model=llm_model,
            messages=[{"role": "user", "content": prompt}],
            api_key=api_key,
            api_base=api_base,
            timeout=min(settings.llm_timeout, 30),
            max_tokens=80,
            temperature=0.3,
        )
        content = (response.choices[0].message.content or "").strip()
        if content:
            return content[:300]
    except Exception as exc:
        logger.warning("Session summary LLM failed: %s", exc)

    return _fallback_summary(child_name, message_count, blocked_count)
