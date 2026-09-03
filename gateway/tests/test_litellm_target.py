"""Tests for LiteLLM target resolution."""

from homeward_gateway.models.litellm_target import resolve_litellm_target


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
