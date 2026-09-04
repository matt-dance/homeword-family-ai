"""LLM model router — Ollama direct or cloud via LiteLLM."""

import asyncio
import logging
from typing import AsyncIterator

import litellm

from homeward_gateway.config import settings
from homeward_gateway.models.litellm_target import resolve_litellm_target
from homeward_gateway.models.ollama_chat import chat_completion, stream_chat_completion
from homeward_gateway.models.prompts import build_system_prompt
from homeward_gateway.models.response_limits import GENERATION_MAX_TOKENS
from homeward_gateway.pipeline.policy import PolicyPreset

logger = logging.getLogger(__name__)
litellm.set_verbose = False


class EmptyModelResponseError(RuntimeError):
    """Model returned no visible answer tokens."""


def strip_thinking(text: str) -> str:
    """Drop hidden reasoning blocks some models leak into the reply."""
    import re

    cleaned = re.sub(r"<think>[\s\S]*?</think>", "", text, flags=re.IGNORECASE)
    cleaned = re.sub(r"<\|?think\|?>[\s\S]*?<\|?/think\|?>", "", cleaned, flags=re.IGNORECASE)
    return cleaned.strip()


def _use_cloud() -> bool:
    return bool(settings.cloud_enabled and settings.openai_api_key)


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
) -> list[dict]:
    system = build_system_prompt(
        child_name, age, preset, homework_mode, tool_hint=tool_hint,
        continue_conversation=len(messages) > 1,
        home_label=home_label,
        ai_tone=ai_tone,
        ai_verbosity=ai_verbosity,
        quick_chat=quick_chat,
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
) -> str:
    """Generate a non-streaming LLM response via Ollama (default) or cloud if enabled."""
    full_messages = _build_messages(
        messages, child_name, age, preset, homework_mode, tool_hint,
        home_label, ai_tone, ai_verbosity, quick_chat,
    )
    resolved_model = model or settings.ollama_model

    try:
        if _use_cloud():
            llm_model, api_key, api_base, llm_extra = resolve_litellm_target(model)
            response = await litellm.acompletion(
                model=llm_model,
                messages=full_messages,
                api_key=api_key,
                api_base=api_base,
                timeout=settings.llm_timeout,
                max_tokens=GENERATION_MAX_TOKENS,
                temperature=0.7,
                **llm_extra,
            )
            content = response.choices[0].message.content or ""
        else:
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
) -> AsyncIterator[str]:
    """Stream LLM response tokens."""
    full_messages = _build_messages(
        messages, child_name, age, preset, homework_mode, tool_hint,
        home_label, ai_tone, ai_verbosity, quick_chat,
    )
    resolved_model = model or settings.ollama_model

    total = 0
    first_token_timeout = getattr(settings, "llm_first_token_timeout", 25.0)
    try:
        if _use_cloud():
            llm_model, api_key, api_base, llm_extra = resolve_litellm_target(model)
            response = await litellm.acompletion(
                model=llm_model,
                messages=full_messages,
                api_key=api_key,
                api_base=api_base,
                timeout=settings.llm_timeout,
                max_tokens=GENERATION_MAX_TOKENS,
                temperature=0.7,
                stream=True,
                **llm_extra,
            )
            stream_iter = response.__aiter__()

            async def _next_chunk():
                try:
                    return await stream_iter.__anext__(), False
                except StopAsyncIteration:
                    return None, True

            while True:
                timeout = first_token_timeout if total == 0 else settings.llm_timeout
                try:
                    chunk, done = await asyncio.wait_for(_next_chunk(), timeout=timeout)
                except (TimeoutError, asyncio.TimeoutError) as exc:
                    if total == 0:
                        raise RuntimeError("LLM stream produced no tokens before timeout") from exc
                    raise RuntimeError("LLM stream stalled") from exc
                if done:
                    break
                delta = chunk.choices[0].delta.content or ""
                if delta:
                    total += len(delta)
                    yield delta
        else:
            async for token in stream_chat_completion(resolved_model, full_messages):
                total += len(token)
                yield token
        if total == 0:
            raise EmptyModelResponseError("model stream returned no answer tokens")
    except Exception as e:
        logger.error("LLM stream error: %s", e)
        raise
