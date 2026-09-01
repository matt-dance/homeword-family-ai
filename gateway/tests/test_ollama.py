"""Tests for Ollama model catalog."""

from homeward_gateway.ollama.catalog import estimate_min_ram_gb, pick_recommended_model


def test_pick_recommended_quality_for_16gb():
    model = pick_recommended_model(16.0, set())
    assert model == "llama3.1:8b"


def test_pick_recommended_premium_for_36gb():
    model = pick_recommended_model(36.0, set())
    assert model == "qwen2.5:14b"


def test_pick_recommended_light_for_low_ram():
    model = pick_recommended_model(4.0, set())
    assert model in {"llama3.2:1b", "gemma2:2b", "phi3:mini"}


def test_pick_recommended_prefers_installed():
    model = pick_recommended_model(36.0, {"llama3.2:1b"})
    assert model == "qwen2.5:14b"


def test_pick_classifier_model_prefers_small():
    from homeward_gateway.ollama.catalog import pick_classifier_model

    model = pick_classifier_model(
        "qwen3.8:27b-mlx",
        ["qwen3.8:27b-mlx", "llama3.2:3b", "llama3.2:1b"],
    )
    assert model == "llama3.2:1b"


def test_estimate_min_ram_from_name():
    assert estimate_min_ram_gb("qwen3.8:27b-mlx") == 32
    assert estimate_min_ram_gb("llama3.2:3b") == 4
