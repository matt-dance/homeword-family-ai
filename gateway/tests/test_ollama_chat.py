"""Tests for direct Ollama chat client."""

import asyncio
import json
import time

import pytest

from homeward_gateway.models.ollama_chat import _chat_payload


def test_chat_payload_disables_thinking():
    payload = _chat_payload("qwen3.8:27b-mlx", [{"role": "user", "content": "hi"}], stream=True, temperature=0.7)
    assert payload["think"] is False
    assert payload["stream"] is True
    assert payload["keep_alive"] == "30m"


def test_llm_timeout_scales_for_large_models():
    from homeward_gateway.models.ollama_chat import llm_timeout_for_model

    assert llm_timeout_for_model("qwen3.8:27b-mlx") >= 120


def test_first_token_timeout_covers_llama32_cpu():
    from homeward_gateway.config import settings

    assert settings.llm_first_token_timeout >= 45


class _FakeStreamResponse:
    def __init__(self, lines, *, delay_before_enter=0.0, delay_per_line=0.0, hang_close=False):
        self._lines = list(lines)
        self._delay_before_enter = delay_before_enter
        self._delay_per_line = delay_per_line
        self._hang_close = hang_close
        self.status_code = 200

    async def __aenter__(self):
        if self._delay_before_enter:
            await asyncio.sleep(self._delay_before_enter)
        return self

    async def __aexit__(self, *_args):
        if self._hang_close:
            await asyncio.sleep(3)
        return False

    def raise_for_status(self):
        return None

    async def aiter_lines(self):
        for line in self._lines:
            if self._delay_per_line:
                await asyncio.sleep(self._delay_per_line)
            yield line


class _FakeClient:
    def __init__(self, response):
        self._response = response

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return False

    def stream(self, *_args, **_kwargs):
        return self._response


def _patch_ollama_stream(monkeypatch, response, *, first_token=0.08, close_timeout=0.05):
    import homeward_gateway.models.ollama_chat as ollama_chat

    monkeypatch.setattr(ollama_chat, "CLOSE_TIMEOUT_SECONDS", close_timeout)
    monkeypatch.setattr(ollama_chat.settings, "llm_first_token_timeout", first_token)
    monkeypatch.setattr(ollama_chat.httpx, "AsyncClient", lambda **_kwargs: _FakeClient(response))


@pytest.mark.asyncio
async def test_stream_times_out_when_headers_never_arrive(monkeypatch):
    from homeward_gateway.models.ollama_chat import stream_chat_completion

    response = _FakeStreamResponse([], delay_before_enter=2.0)
    _patch_ollama_stream(monkeypatch, response, first_token=0.05)

    started = time.monotonic()
    with pytest.raises(RuntimeError, match="no tokens before timeout"):
        async for _token in stream_chat_completion("llama3.2:3b", [{"role": "user", "content": "hi"}]):
            pass
    assert time.monotonic() - started < 1.0


@pytest.mark.asyncio
async def test_empty_ndjson_keepalives_do_not_reset_first_token_clock(monkeypatch):
    from homeward_gateway.models.ollama_chat import stream_chat_completion

    empty = json.dumps({"message": {"role": "assistant", "content": ""}})
    response = _FakeStreamResponse([empty] * 20, delay_per_line=0.04)
    _patch_ollama_stream(monkeypatch, response, first_token=0.12)

    started = time.monotonic()
    with pytest.raises(RuntimeError, match="no tokens before timeout"):
        async for _token in stream_chat_completion("llama3.2:3b", [{"role": "user", "content": "hi"}]):
            pass
    elapsed = time.monotonic() - started
    assert elapsed < 1.0
    # Wall clock, not 20 * 0.04 * first_token stacked.
    assert elapsed < 0.6


@pytest.mark.asyncio
async def test_hanging_aclose_does_not_delay_the_nap(monkeypatch):
    from homeward_gateway.models.ollama_chat import stream_chat_completion

    empty = json.dumps({"message": {"role": "assistant", "content": ""}})
    response = _FakeStreamResponse([empty], delay_per_line=2.0, hang_close=True)
    _patch_ollama_stream(monkeypatch, response, first_token=0.05, close_timeout=0.05)

    started = time.monotonic()
    with pytest.raises(RuntimeError, match="no tokens before timeout"):
        async for _token in stream_chat_completion("llama3.2:3b", [{"role": "user", "content": "hi"}]):
            pass
    assert time.monotonic() - started < 1.0


@pytest.mark.asyncio
async def test_stream_yields_tokens_when_ollama_replies(monkeypatch):
    from homeward_gateway.models.ollama_chat import stream_chat_completion

    lines = [
        json.dumps({"message": {"role": "assistant", "content": "Sky"}}),
        json.dumps({"message": {"role": "assistant", "content": " blue"}}),
    ]
    _patch_ollama_stream(monkeypatch, _FakeStreamResponse(lines), first_token=1.0)
    tokens = [
        token
        async for token in stream_chat_completion(
            "llama3.2:3b", [{"role": "user", "content": "why is the sky blue"}]
        )
    ]
    assert tokens == ["Sky", " blue"]
