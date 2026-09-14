"""Local-only routing: leftover cloud env must not send kid chats to OpenAI."""

import importlib

import pytest

from homeward_gateway.config import Settings, settings
from homeward_gateway.models.router import complete_chat_turn, generate_response, stream_response
from homeward_gateway.pipeline.policy import load_all_presets


def _leftover_cloud_settings(monkeypatch) -> Settings:
    monkeypatch.setenv("HOMEWARD_CLOUD_ENABLED", "true")
    monkeypatch.setenv("HOMEWARD_OPENAI_API_KEY", "sk-leftover-from-old-feature")
    return Settings(_env_file=None)


def test_router_imports_without_litellm_installed():
    """Local Ollama must collect/start even when the optional cloud extra is absent."""
    router = importlib.import_module("homeward_gateway.models.router")
    assert router.strip_thinking("<think>hidden</think>Hi") == "Hi"
    assert not hasattr(router, "_use_cloud")
    assert not hasattr(router, "_litellm")


def test_litellm_cloud_module_is_gone():
    with pytest.raises(ModuleNotFoundError):
        importlib.import_module("homeward_gateway.models.litellm_target")


def test_settings_do_not_bind_leftover_cloud_env(monkeypatch):
    """HOMEWARD_CLOUD_* leftover installer env is not a parent control."""
    constructed = _leftover_cloud_settings(monkeypatch)
    assert not hasattr(constructed, "cloud_enabled")
    assert not hasattr(constructed, "openai_api_key")
    assert not hasattr(settings, "cloud_enabled")
    assert not hasattr(settings, "openai_api_key")


@pytest.mark.asyncio
async def test_generate_response_local_with_leftover_cloud_env(monkeypatch):
    """Allowed generate must stay on Ollama even if leftover HOMEWARD_CLOUD_* is set."""
    called: dict = {}

    async def fake_chat_completion(model, messages):
        called["model"] = model
        called["messages"] = messages
        return "Cats purr when they are happy."

    leftover = _leftover_cloud_settings(monkeypatch)
    monkeypatch.setattr("homeward_gateway.models.router.settings", leftover)
    monkeypatch.setattr("homeward_gateway.models.router.chat_completion", fake_chat_completion)

    result = await generate_response(
        [{"role": "user", "content": "fun fact about cats"}],
        "Avery",
        8,
        load_all_presets()["young_explorer"],
    )

    assert result == "Cats purr when they are happy."
    assert called["model"] == leftover.ollama_model
    assert called["messages"][0]["role"] == "system"
    assert called["messages"][1]["content"] == "fun fact about cats"


@pytest.mark.asyncio
async def test_complete_chat_turn_local_with_leftover_cloud_env(monkeypatch):
    leftover = _leftover_cloud_settings(monkeypatch)
    called: dict = {}

    async def fake_chat_message(model, messages, tools=None, temperature=0.2):
        called["model"] = model
        called["tools"] = tools
        return {"role": "assistant", "content": "hi"}

    monkeypatch.setattr("homeward_gateway.models.router.settings", leftover)
    monkeypatch.setattr("homeward_gateway.models.router.chat_message", fake_chat_message)

    result = await complete_chat_turn([{"role": "user", "content": "hi"}], tools=[{"type": "function"}])

    assert result == {"role": "assistant", "content": "hi"}
    assert called["model"] == leftover.ollama_model
    assert called["tools"] == [{"type": "function"}]


@pytest.mark.asyncio
async def test_stream_response_local_with_leftover_cloud_env(monkeypatch):
    leftover = _leftover_cloud_settings(monkeypatch)

    async def fake_stream(model, messages):
        assert model == leftover.ollama_model
        yield "hello"

    monkeypatch.setattr("homeward_gateway.models.router.settings", leftover)
    monkeypatch.setattr("homeward_gateway.models.router.stream_chat_completion", fake_stream)

    tokens = [
        token
        async for token in stream_response(
            [{"role": "user", "content": "hi"}],
            "Avery",
            8,
            load_all_presets()["young_explorer"],
        )
    ]

    assert tokens == ["hello"]
