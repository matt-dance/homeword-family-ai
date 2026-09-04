"""Tests for direct Ollama chat client."""

import asyncio

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


@pytest.mark.asyncio
async def test_chat_completion_times_out_without_first_token(monkeypatch):
    from homeward_gateway.models import ollama_chat as oc

    async def silent(*_args, **_kwargs):
        if False:
            yield ""
        await asyncio.sleep(10)

    monkeypatch.setattr(oc, "stream_chat_completion", silent)
    monkeypatch.setattr(oc.settings, "llm_first_token_timeout", 0.05)

    with pytest.raises(RuntimeError, match="timeout"):
        await oc.chat_completion("llama3.2:3b", [{"role": "user", "content": "hi"}])


@pytest.mark.asyncio
async def test_chat_completion_returns_collected_tokens(monkeypatch):
    from homeward_gateway.models import ollama_chat as oc

    async def tokens(*_args, **_kwargs):
        yield "Hello"
        yield " world"

    monkeypatch.setattr(oc, "stream_chat_completion", tokens)

    text = await oc.chat_completion("llama3.2:3b", [{"role": "user", "content": "hi"}])
    assert text == "Hello world"
