"""LLM model router — builds the system prompt and calls local Ollama."""

import logging
from typing import AsyncIterator

from homeward_gateway.config import settings
from homeward_gateway.models.ollama_chat import chat_completion, stream_chat_completion
from homeward_gateway.models.prompts import build_system_prompt
from homeward_gateway.pipeline.policy import PolicyPreset

logger = logging.getLogger(__name__)


class EmptyModelResponseError(RuntimeError):
    """Model returned no visible answer tokens."""


def strip_thinking(text: str) -> str:
    """Drop hidden reasoning blocks some models leak into the reply."""
    import re

    cleaned = re.sub(r"<think>[\s\S]*?</think>", "", text, flags=re.IGNORECASE)
    cleaned = re.sub(r"<\|?think\|?>[\s\S]*?<\|?/think\|?>", "", cleaned, flags=re.IGNORECASE)
    return cleaned.strip()


def _build_messages(
    messages: list[dict],
    child_name: str,
    age: int,
    preset: PolicyPreset,
    homework_mode: bool,
    tool_hint: str,
    home_label: str | None,
    ai_tone: str,
    ai_verbosity: int,
    quick_chat: bool,
    memory_items: list[dict] | None = None,
    continue_conversation: bool | None = None,
) -> list[dict]:
    if continue_conversation is None:
        continue_conversation = len(messages) > 1
    system = build_system_prompt(
        child_name, age, preset, homework_mode, tool_hint=tool_hint,
        continue_conversation=continue_conversation,
        home_label=home_label,
        ai_tone=ai_tone,
        ai_verbosity=ai_verbosity,
        quick_chat=quick_chat,
        memory_items=memory_items,
    )
    return [{"role": "system", "content": system}] + messages


async def generate_response(
    messages: list[dict],
    child_name: str,
    age: int,
    preset: PolicyPreset,
    model: str | None = None,
    homework_mode: bool = False,
    tool_hint: str = "",
    home_label: str | None = None,
    ai_tone: str = "balanced",
    ai_verbosity: int = 3,
    quick_chat: bool = False,
    memory_items: list[dict] | None = None,
    continue_conversation: bool | None = None,
) -> str:
    """Generate a non-streaming LLM response via Ollama."""
    full_messages = _build_messages(
        messages, child_name, age, preset, homework_mode, tool_hint,
        home_label, ai_tone, ai_verbosity, quick_chat, memory_items,
        continue_conversation,
    )
    resolved_model = model or settings.ollama_model

    try:
        content = await chat_completion(resolved_model, full_messages)
        cleaned = strip_thinking(content)
        if not cleaned:
            raise EmptyModelResponseError("empty model response")
        return cleaned
    except Exception as e:
        logger.error("LLM error: %s", e)
        raise


async def stream_response(
    messages: list[dict],
    child_name: str,
    age: int,
    preset: PolicyPreset,
    model: str | None = None,
    homework_mode: bool = False,
    tool_hint: str = "",
    home_label: str | None = None,
    ai_tone: str = "balanced",
    ai_verbosity: int = 3,
    quick_chat: bool = False,
    memory_items: list[dict] | None = None,
    continue_conversation: bool | None = None,
) -> AsyncIterator[str]:
    """Stream LLM response tokens."""
    full_messages = _build_messages(
        messages, child_name, age, preset, homework_mode, tool_hint,
        home_label, ai_tone, ai_verbosity, quick_chat, memory_items,
        continue_conversation,
    )
    resolved_model = model or settings.ollama_model

    total = 0
    try:
        async for token in stream_chat_completion(resolved_model, full_messages):
            total += len(token)
            yield token
        if total == 0:
            raise EmptyModelResponseError("model stream returned no answer tokens")
    except Exception as e:
        logger.error("LLM stream error: %s", e)
        raise
