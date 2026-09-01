"""LLM model router via LiteLLM."""

import logging
from typing import AsyncIterator

import litellm

from homeward_gateway.config import settings

logger = logging.getLogger(__name__)
litellm.set_verbose = False


def _build_system_prompt(child_name: str, age: int, preset_name: str) -> str:
    return (
        f"You are a friendly, helpful assistant for {child_name}, who is {age} years old. "
        f"Safety level: {preset_name}. "
        "Keep responses age-appropriate, positive, and educational. "
        "Never discuss violence, explicit content, drugs, or dangerous activities. "
        "If asked something inappropriate, gently redirect to a safer topic. "
        "Be encouraging and use simple language when appropriate."
    )


async def generate_response(
    messages: list[dict],
    child_name: str,
    age: int,
    preset_name: str,
    max_length: int = 800,
) -> str:
    """Generate a non-streaming LLM response via Ollama (default) or cloud if enabled."""
    system = _build_system_prompt(child_name, age, preset_name)
    full_messages = [{"role": "system", "content": system}] + messages

    if settings.cloud_enabled and settings.openai_api_key:
        model = "gpt-4o-mini"
        api_key = settings.openai_api_key
    else:
        model = f"ollama/{settings.ollama_model}"
        api_key = "ollama"

    try:
        response = await litellm.acompletion(
            model=model,
            messages=full_messages,
            api_key=api_key,
            api_base=settings.ollama_base_url if not settings.cloud_enabled else None,
            timeout=settings.llm_timeout,
            max_tokens=min(max_length, 1200),
            temperature=0.7,
        )
        content = response.choices[0].message.content or ""
        return content[:max_length]
    except Exception as e:
        logger.error("LLM error: %s", e)
        raise


async def stream_response(
    messages: list[dict],
    child_name: str,
    age: int,
    preset_name: str,
    max_length: int = 800,
) -> AsyncIterator[str]:
    """Stream LLM response tokens."""
    system = _build_system_prompt(child_name, age, preset_name)
    full_messages = [{"role": "system", "content": system}] + messages

    if settings.cloud_enabled and settings.openai_api_key:
        model = "gpt-4o-mini"
        api_key = settings.openai_api_key
    else:
        model = f"ollama/{settings.ollama_model}"
        api_key = "ollama"

    total = 0
    try:
        response = await litellm.acompletion(
            model=model,
            messages=full_messages,
            api_key=api_key,
            api_base=settings.ollama_base_url if not settings.cloud_enabled else None,
            timeout=settings.llm_timeout,
            max_tokens=min(max_length, 1200),
            temperature=0.7,
            stream=True,
        )
        async for chunk in response:
            delta = chunk.choices[0].delta.content or ""
            if delta:
                total += len(delta)
                if total > max_length:
                    break
                yield delta
    except Exception as e:
        logger.error("LLM stream error: %s", e)
        raise
