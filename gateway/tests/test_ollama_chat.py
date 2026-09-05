"""Tests for direct Ollama chat client."""

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
