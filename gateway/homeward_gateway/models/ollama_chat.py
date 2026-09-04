"""Direct Ollama chat API — reliable think:false streaming for reasoning models."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import AsyncIterator

import httpx

from homeward_gateway.config import settings
from homeward_gateway.models.response_limits import GENERATION_MAX_TOKENS

logger = logging.getLogger(__name__)


def llm_timeout_for_model(model: str | None) -> float:
    """Large local models need more time for the first token and full reply."""
    from homeward_gateway.ollama.catalog import estimate_min_ram_gb

    min_ram = estimate_min_ram_gb(model or settings.ollama_model)
    if min_ram >= 32:
        return max(settings.llm_timeout, 180.0)
    if min_ram >= 16:
        return max(settings.llm_timeout, 120.0)
    return settings.llm_timeout


def _chat_payload(model: str, messages: list[dict], *, stream: bool, temperature: float) -> dict:
    return {
        "model": model,
        "messages": messages,
        "stream": stream,
        "think": False,
        "keep_alive": "30m",
        "options": {
            "temperature": temperature,
            "num_predict": GENERATION_MAX_TOKENS,
        },
    }


async def chat_completion(
    model: str,
    messages: list[dict],
    *,
    temperature: float = 0.7,
) -> str:
    """Collect a full reply, failing closed if the model stays silent.

    Non-stream POST /api/v1/chat used to wait on a single Ollama response for
    60–180s. Next.js rewrites typically die around 30s with a bare HTTP 500
    before the gateway could return kid-safe JSON. Stream internally so a
    first-token miss matches stream-path timeout semantics.
    """
    first_token_timeout = getattr(settings, "llm_first_token_timeout", 25.0)
    collected: list[str] = []
    stream = stream_chat_completion(model, messages, temperature=temperature)
    try:
        try:
            first = await asyncio.wait_for(anext(stream), timeout=first_token_timeout)
        except StopAsyncIteration:
            return ""
        except TimeoutError as exc:
            raise RuntimeError("LLM produced no tokens before timeout") from exc
        collected.append(first)
        async for token in stream:
            collected.append(token)
        return "".join(collected)
    finally:
        await stream.aclose()


async def stream_chat_completion(
    model: str,
    messages: list[dict],
    *,
    temperature: float = 0.7,
) -> AsyncIterator[str]:
    timeout = httpx.Timeout(llm_timeout_for_model(model), connect=10.0)
    url = f"{settings.ollama_base_url.rstrip('/')}/api/chat"
    async with httpx.AsyncClient(timeout=timeout) as client:
        async with client.stream(
            "POST",
            url,
            json=_chat_payload(model, messages, stream=True, temperature=temperature),
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line:
                    continue
                try:
                    data = json.loads(line)
                except json.JSONDecodeError:
                    logger.warning("Skipping malformed Ollama stream line")
                    continue
                content = (data.get("message") or {}).get("content") or ""
                if content:
                    yield content
