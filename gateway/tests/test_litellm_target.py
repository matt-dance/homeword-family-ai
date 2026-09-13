"""Tests for LiteLLM target resolution and local-only cloud routing."""

import importlib
from types import SimpleNamespace

import pytest

from homeward_gateway.config import Settings, settings
from homeward_gateway.models.litellm_target import resolve_litellm_target
from homeward_gateway.models.router import _use_cloud, generate_response
from homeward_gateway.pipeline.policy import load_all_presets


def _absent_cloud_settings(**overrides):
    """Settings shape after #62: local Ollama fields only, no cloud attrs."""
    values = {
        "ollama_model": "llama3.2:3b",
        "ollama_base_url": "http://127.0.0.1:11434",
        "llm_timeout": 60.0,
        "llm_first_token_timeout": 45.0,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def test_router_imports_without_litellm_installed():
    """Local Ollama must collect/start even when the optional cloud extra is absent."""
    router = importlib.import_module("homeward_gateway.models.router")
    assert router.strip_thinking("<think>hidden</think>Hi") == "Hi"


def test_settings_default_cloud_off_for_local_ollama():
    """Fail-closed defaults: cloud stays off so local Ollama is the generate path."""
    local = Settings()
    assert local.cloud_enabled is False
    assert local.openai_api_key == ""
    assert settings.cloud_enabled is False
    assert settings.openai_api_key == ""


def test_use_cloud_false_when_cloud_settings_default_or_absent(monkeypatch):
    """#70: missing or default-false cloud fields must not AttributeError."""
    assert _use_cloud() is False

    local_only = _absent_cloud_settings()
    assert not hasattr(local_only, "cloud_enabled")
    assert not hasattr(local_only, "openai_api_key")
    monkeypatch.setattr("homeward_gateway.models.router.settings", local_only)
    assert _use_cloud() is False


def test_resolve_litellm_target_when_cloud_settings_absent(monkeypatch):
    monkeypatch.setattr(
        "homeward_gateway.models.litellm_target.settings",
        _absent_cloud_settings(),
    )

    model, api_key, api_base, extra = resolve_litellm_target(None)

    assert model == "ollama/llama3.2:3b"
    assert api_key == "ollama"
    assert api_base == "http://127.0.0.1:11434"
    assert extra == {"extra_body": {"think": False}}


def test_ollama_target_disables_thinking(monkeypatch):
    monkeypatch.setattr(
        "homeward_gateway.models.litellm_target.settings.cloud_enabled",
        False,
    )

    model, api_key, api_base, extra = resolve_litellm_target("qwen3.8:27b-mlx")

    assert model == "ollama/qwen3.8:27b-mlx"
    assert api_key == "ollama"
    assert api_base is not None
    assert extra == {"extra_body": {"think": False}}


def test_cloud_target_has_no_think_override(monkeypatch):
    monkeypatch.setattr(
        "homeward_gateway.models.litellm_target.settings.cloud_enabled",
        True,
    )
    monkeypatch.setattr(
        "homeward_gateway.models.litellm_target.settings.openai_api_key",
        "sk-test",
    )

    model, api_key, api_base, extra = resolve_litellm_target("qwen3.8:27b-mlx")

    assert model == "gpt-4o-mini"
    assert api_key == "sk-test"
    assert api_base is None
    assert extra == {}


@pytest.mark.asyncio
async def test_generate_response_local_when_cloud_settings_absent(monkeypatch):
    """Allowed generate must not nap on settings.cloud_enabled after #62."""
    called: dict = {}

    async def fake_chat_completion(model, messages):
        called["model"] = model
        called["messages"] = messages
        return "Cats purr when they are happy."

    def unexpected_litellm():
        raise AssertionError("cloud LiteLLM path must not run for local Ollama")

    monkeypatch.setattr("homeward_gateway.models.router.settings", _absent_cloud_settings())
    monkeypatch.setattr("homeward_gateway.models.router.chat_completion", fake_chat_completion)
    monkeypatch.setattr("homeward_gateway.models.router._litellm", unexpected_litellm)

    assert _use_cloud() is False
    result = await generate_response(
        [{"role": "user", "content": "fun fact about cats"}],
        "Avery",
        8,
        load_all_presets()["young_explorer"],
    )

    assert result == "Cats purr when they are happy."
    assert called["model"] == "llama3.2:3b"
    assert called["messages"][0]["role"] == "system"
    assert called["messages"][1]["content"] == "fun fact about cats"
