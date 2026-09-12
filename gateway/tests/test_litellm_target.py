"""Tests for LiteLLM target resolution."""

import importlib
from types import SimpleNamespace

from homeward_gateway.config import Settings
from homeward_gateway.models.litellm_target import resolve_litellm_target


def test_router_imports_without_litellm_installed():
    """Local Ollama must collect/start even when the optional cloud extra is absent."""
    router = importlib.import_module("homeward_gateway.models.router")
    assert router.strip_thinking("<think>hidden</think>Hi") == "Hi"


def test_ollama_target_disables_thinking():
    model, api_key, api_base, extra = resolve_litellm_target("qwen3.8:27b-mlx")

    assert model == "ollama/qwen3.8:27b-mlx"
    assert api_key == "ollama"
    assert api_base is not None
    assert extra == {"extra_body": {"think": False}}


def test_leftover_cloud_env_stays_on_ollama(monkeypatch):
    """HOMEWARD_CLOUD_ENABLED must not bind; leftover installer env is not a parent control."""
    monkeypatch.setenv("HOMEWARD_CLOUD_ENABLED", "true")
    monkeypatch.setenv("HOMEWARD_OPENAI_API_KEY", "sk-leftover")
    constructed = Settings(_env_file=None)
    assert getattr(constructed, "cloud_enabled", False) is False
    assert getattr(constructed, "openai_api_key", "") == ""
    monkeypatch.setattr("homeward_gateway.models.litellm_target.settings", constructed)

    model, api_key, api_base, extra = resolve_litellm_target("qwen3.8:27b-mlx")

    assert model == "ollama/qwen3.8:27b-mlx"
    assert api_key == "ollama"
    assert extra == {"extra_body": {"think": False}}


def test_cloud_target_has_no_think_override(monkeypatch):
    monkeypatch.setattr(
        "homeward_gateway.models.litellm_target.settings",
        SimpleNamespace(cloud_enabled=True, openai_api_key="sk-test"),
    )

    model, api_key, api_base, extra = resolve_litellm_target("qwen3.8:27b-mlx")

    assert model == "gpt-4o-mini"
    assert api_key == "sk-test"
    assert api_base is None
    assert extra == {}
