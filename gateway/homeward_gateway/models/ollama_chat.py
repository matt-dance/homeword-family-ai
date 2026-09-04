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
    timeout = httpx.Timeout(llm_timeout_for_model(model), connect=10.0)
    url = f"{settings.ollama_base_url.rstrip('/')}/api/chat"
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(
            url,
            json=_chat_payload(model, messages, stream=False, temperature=temperature),
        )
        resp.raise_for_status()
        data = resp.json()
        return (data.get("message") or {}).get("content") or ""


async def stream_chat_completion(
    model: str,
    messages: list[dict],
    *,
    temperature: float = 0.7,
) -> AsyncIterator[str]:
    timeout = httpx.Timeout(llm_timeout_for_model(model), connect=10.0)
    first_token_timeout = getattr(settings, "llm_first_token_timeout", 45.0)
    url = f"{settings.ollama_base_url.rstrip('/')}/api/chat"
    async with httpx.AsyncClient(timeout=timeout) as client:
        async with client.stream(
            "POST",
            url,
            json=_chat_payload(model, messages, stream=True, temperature=temperature),
        ) as resp:
            resp.raise_for_status()
            iterator = resp.aiter_lines().__aiter__()
            saw_token = False
            while True:
                try:
                    if not saw_token:
                        line = await asyncio.wait_for(iterator.__anext__(), timeout=first_token_timeout)
                    else:
                        line = await iterator.__anext__()
                except StopAsyncIteration:
                    break
                except (TimeoutError, asyncio.TimeoutError) as exc:
                    raise RuntimeError("LLM stream produced no tokens before timeout") from exc
                if not line:
                    continue
                try:
                    data = json.loads(line)
                except json.JSONDecodeError:
                    logger.warning("Skipping malformed Ollama stream line")
                    continue
                content = (data.get("message") or {}).get("content") or ""
                if content:
                    saw_token = True
                    yield content
