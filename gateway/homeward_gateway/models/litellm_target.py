"""Shared LiteLLM routing for local Ollama vs cloud."""

from homeward_gateway.config import settings


def resolve_litellm_target(model: str | None) -> tuple[str, str, str | None, dict]:
    """Return (model, api_key, api_base, extra_kwargs) for litellm.acompletion."""
    if settings.cloud_enabled and settings.openai_api_key:
        return "gpt-4o-mini", settings.openai_api_key, None, {}

    llm_model = f"ollama/{model or settings.ollama_model}"
    # Reasoning models (e.g. Qwen3) stream internal "thinking" with empty content;
    # kid chat must get answer tokens immediately.
    return llm_model, "ollama", settings.ollama_base_url, {"extra_body": {"think": False}}
