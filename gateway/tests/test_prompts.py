"""Tests for preset-specific prompts."""

from homeward_gateway.models.prompts import build_system_prompt
from homeward_gateway.pipeline.policy import load_all_presets


def test_young_explorer_prompt_is_playful():
    preset = load_all_presets()["young_explorer"]
    prompt = build_system_prompt("Emma", 7, preset)
    assert "playful" in prompt.lower()
    assert "Emma" in prompt
    assert "finish" in prompt.lower()
    assert "Markdown" in prompt


def test_homework_mode_adds_hint_instructions():
    preset = load_all_presets()["curious_explorer"]
    prompt = build_system_prompt("Sam", 10, preset, homework_mode=True)
    assert "Homework mode" in prompt
    assert "hints" in prompt.lower()


def test_continue_conversation_skips_repeat_greeting():
    preset = load_all_presets()["young_explorer"]
    fresh = build_system_prompt("Lincoln", 8, preset, continue_conversation=False)
    ongoing = build_system_prompt("Lincoln", 8, preset, continue_conversation=True)
    assert "first message" in fresh.lower()
    assert "do not greet again" in ongoing.lower()
    assert "first message" not in ongoing.lower()


def test_home_label_adds_context():
    preset = load_all_presets()["young_explorer"]
    prompt = build_system_prompt("Lincoln", 8, preset, home_label="Denver, Colorado, United States")
    assert "Denver, Colorado" in prompt
    assert "home" in prompt.lower()


def test_ai_tone_and_verbosity_hints():
    preset = load_all_presets()["young_explorer"]
    prompt = build_system_prompt("Lincoln", 8, preset, ai_tone="concise", ai_verbosity=1)
    assert "direct" in prompt.lower()
    assert "very short" in prompt.lower()


def test_quick_chat_omits_personal_name():
    preset = load_all_presets()["young_explorer"]
    fresh = build_system_prompt("Lincoln", 8, preset, quick_chat=True, continue_conversation=False)
    ongoing = build_system_prompt("Lincoln", 8, preset, quick_chat=True, continue_conversation=True)
    assert "Lincoln" not in fresh
    assert "Lincoln" not in ongoing
    assert "Quick Chat" in fresh
    assert "anonymous" in fresh.lower()
    assert "do not greet again" in ongoing.lower()
