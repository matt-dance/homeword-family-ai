"""Tests for preset-specific prompts."""

from homeward_gateway.models.prompts import build_system_prompt
from homeward_gateway.pipeline.policy import load_all_presets


def test_young_explorer_prompt_is_playful():
    preset = load_all_presets()["young_explorer"]
    prompt = build_system_prompt("Emma", 7, preset)
    assert "playful" in prompt.lower()
    assert "Emma" in prompt


def test_homework_mode_adds_hint_instructions():
    preset = load_all_presets()["curious_explorer"]
    prompt = build_system_prompt("Sam", 10, preset, homework_mode=True)
    assert "Homework mode" in prompt
    assert "hints" in prompt.lower()
