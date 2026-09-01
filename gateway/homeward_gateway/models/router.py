"""LLM model router via LiteLLM."""

import logging
from typing import AsyncIterator

import litellm

from homeward_gateway.config import settings
from homeward_gateway.models.prompts import build_system_prompt
from homeward_gateway.models.response_limits import chars_to_max_tokens, trim_response
from homeward_gateway.pipeline.policy import PolicyPreset

logger = logging.getLogger(__name__)
litellm.set_verbose = False


async def generate_response(
    messages: list[dict],
    child_name: str,
    age: int,
    preset: PolicyPreset,
    max_length: int = 800,
    model: str | None = None,
    homework_mode: bool = False,
    tool_hint: str = "",
) -> str:
    """Generate a non-streaming LLM response via Ollama (default) or cloud if enabled."""
    system = build_system_prompt(child_name, age, preset, homework_mode, tool_hint=tool_hint)
    full_messages = [{"role": "system", "content": system}] + messages

    if settings.cloud_enabled and settings.openai_api_key:
        llm_model = "gpt-4o-mini"
        api_key = settings.openai_api_key
    else:
        llm_model = f"ollama/{model or settings.ollama_model}"
        api_key = "ollama"

    try:
        response = await litellm.acompletion(
            model=llm_model,
            messages=full_messages,
            api_key=api_key,
            api_base=settings.ollama_base_url if not settings.cloud_enabled else None,
            timeout=settings.llm_timeout,
            max_tokens=chars_to_max_tokens(max_length),
            temperature=0.7,
        )
        content = response.choices[0].message.content or ""
        return trim_response(content, max_length)
    except Exception as e:
        logger.error("LLM error: %s", e)
        raise


async def stream_response(
    messages: list[dict],
    child_name: str,
    age: int,
    preset: PolicyPreset,
    max_length: int = 800,
    model: str | None = None,
    homework_mode: bool = False,
    tool_hint: str = "",
) -> AsyncIterator[str]:
    """Stream LLM response tokens."""
    system = build_system_prompt(child_name, age, preset, homework_mode, tool_hint=tool_hint)
    full_messages = [{"role": "system", "content": system}] + messages

    if settings.cloud_enabled and settings.openai_api_key:
        llm_model = "gpt-4o-mini"
        api_key = settings.openai_api_key
    else:
        llm_model = f"ollama/{model or settings.ollama_model}"
        api_key = "ollama"

    total = 0
    try:
        response = await litellm.acompletion(
            model=llm_model,
            messages=full_messages,
            api_key=api_key,
            api_base=settings.ollama_base_url if not settings.cloud_enabled else None,
            timeout=settings.llm_timeout,
            max_tokens=chars_to_max_tokens(max_length),
            temperature=0.7,
            stream=True,
        )
        async for chunk in response:
            delta = chunk.choices[0].delta.content or ""
            if delta:
                total += len(delta)
                yield delta
        if total == 0:
            return
    except Exception as e:
        logger.error("LLM stream error: %s", e)
        raise
