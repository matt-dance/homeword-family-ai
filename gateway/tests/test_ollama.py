"""Tests for Ollama model catalog."""

from homeward_gateway.ollama.catalog import pick_recommended_model


def test_pick_recommended_prefers_balanced_for_16gb():
    model = pick_recommended_model(16.0, set())
    assert model == "llama3.2:3b"


def test_pick_recommended_light_for_low_ram():
    model = pick_recommended_model(4.0, set())
    assert model in {"llama3.2:1b", "gemma2:2b", "phi3:mini"}


def test_pick_recommended_prefers_installed():
    model = pick_recommended_model(16.0, {"llama3.2:1b"})
    assert model == "llama3.2:1b"
