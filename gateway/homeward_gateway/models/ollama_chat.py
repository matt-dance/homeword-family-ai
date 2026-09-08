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

# Do not let generator aclose wait on a wedged Ollama TCP stream.
CLOSE_TIMEOUT_SECONDS = 2.0


def first_token_timeout_seconds() -> float:
    return float(getattr(settings, "llm_first_token_timeout", 45.0))


def _close_timeout_seconds() -> float:
    return float(CLOSE_TIMEOUT_SECONDS)


async def _await_or_abandon(coro, timeout: float) -> object:
    """Wait up to ``timeout``, then cancel and leak rather than hang forever.

    ``asyncio.wait_for`` still awaits generator ``aclose``/``__aexit__`` after
    it cancels, which is how a wedged Ollama connection became a 120s empty
    gateway timeout. ``asyncio.wait`` does not auto-extend past the deadline.
    """
    task = asyncio.ensure_future(coro)
    done, _pending = await asyncio.wait({task}, timeout=timeout)
    if task in done:
        return task.result()
    task.cancel()
    await asyncio.wait({task}, timeout=_close_timeout_seconds())
    raise TimeoutError("timed out")


async def aclose_quietly(stream: object, *, timeout: float | None = None) -> None:
    """Cancel an async generator without stalling the kid-facing nap path."""
    close = getattr(stream, "aclose", None)
    if close is None:
        return
    limit = _close_timeout_seconds() if timeout is None else timeout
    try:
        await _await_or_abandon(close(), timeout=limit)
    except (TimeoutError, asyncio.TimeoutError, Exception):
        logger.warning("Timed out closing an LLM stream; dropping the Ollama connection")


async def anext_bounded(stream: AsyncIterator[str], timeout: float) -> str:
    """Like ``anext``, but a hanging generator cleanup cannot exceed ``timeout`` plus a short close budget."""
    try:
        return await _await_or_abandon(anext(stream), timeout=timeout)
    except TimeoutError as exc:
        raise TimeoutError("LLM stream produced no tokens before timeout") from exc


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


def _httpx_timeout(model: str) -> httpx.Timeout:
    """Read timeout is for *subsequent* tokens after the first visible one.

    Time-to-first-token (including waiting for HTTP headers) is a separate
    wall clock so a busy Ollama cannot stack header-wait + first-token + aclose
    into a silent 120s gateway timeout.
    """
    read_timeout = llm_timeout_for_model(model)
    return httpx.Timeout(connect=10.0, read=read_timeout, write=30.0, pool=5.0)


async def chat_message(
    model: str,
    messages: list[dict],
    *,
    tools: list[dict] | None = None,
    temperature: float = 0.2,
) -> dict:
    """One non-streaming /api/chat turn. Used for native tool-calling rounds."""
    url = f"{settings.ollama_base_url.rstrip('/')}/api/chat"
    payload = _chat_payload(model, messages, stream=False, temperature=temperature)
    if tools:
        payload["tools"] = tools
    async with httpx.AsyncClient(timeout=_httpx_timeout(model)) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        return (resp.json() or {}).get("message") or {}


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
    collected: list[str] = []
    stream = stream_chat_completion(model, messages, temperature=temperature)
    try:
        async for token in stream:
            collected.append(token)
        return "".join(collected)
    finally:
        await aclose_quietly(stream)


async def stream_chat_completion(
    model: str,
    messages: list[dict],
    *,
    temperature: float = 0.7,
) -> AsyncIterator[str]:
    first_token_timeout = first_token_timeout_seconds()
    url = f"{settings.ollama_base_url.rstrip('/')}/api/chat"

    async def _raw_tokens() -> AsyncIterator[str]:
        async with httpx.AsyncClient(timeout=_httpx_timeout(model)) as client:
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

    stream = _raw_tokens()
    deadline = asyncio.get_running_loop().time() + first_token_timeout
    saw_token = False
    try:
        while True:
            try:
                if not saw_token:
                    remaining = deadline - asyncio.get_running_loop().time()
                    if remaining <= 0:
                        raise RuntimeError("LLM stream produced no tokens before timeout")
                    token = await anext_bounded(stream, remaining)
                else:
                    token = await anext(stream)
            except StopAsyncIteration:
                break
            except (TimeoutError, asyncio.TimeoutError) as exc:
                if not saw_token:
                    raise RuntimeError("LLM stream produced no tokens before timeout") from exc
                raise RuntimeError("LLM stream stalled") from exc
            saw_token = True
            yield token
    finally:
        await aclose_quietly(stream)
