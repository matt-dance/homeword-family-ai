"""System prompt assembly: what must and must not be present per mode.

Asserts on structure (name present/absent, sections toggled) rather than
copywriting, so prompt wording can be tuned without churning tests.
"""

from homeward_gateway.models import prompts
from homeward_gateway.models.prompts import build_system_prompt
from homeward_gateway.pipeline.policy import load_all_presets

PRESETS = load_all_presets()


def test_prompt_includes_child_name_age_and_preset_style():
    preset = PRESETS["young_explorer"]
    prompt = build_system_prompt("Emma", 7, preset)
    assert "Emma" in prompt
    assert "7 years old" in prompt
    assert prompts._PRESET_STYLE["young_explorer"] in prompt
    assert prompts._BASE_SAFETY in prompt


def test_each_preset_gets_its_own_style():
    styles = {pid: build_system_prompt("Kid", 10, PRESETS[pid]) for pid in PRESETS}
    for pid, prompt in styles.items():
        assert prompts._PRESET_STYLE[pid] in prompt


def test_homework_mode_toggles_section():
    preset = PRESETS["curious_explorer"]
    assert prompts._HOMEWORK_MODE in build_system_prompt("Sam", 10, preset, homework_mode=True)
    assert prompts._HOMEWORK_MODE not in build_system_prompt("Sam", 10, preset)


def test_continue_conversation_swaps_greeting_for_no_repeat():
    preset = PRESETS["young_explorer"]
    fresh = build_system_prompt("Lincoln", 8, preset, continue_conversation=False)
    ongoing = build_system_prompt("Lincoln", 8, preset, continue_conversation=True)
    assert prompts._NEW_CHAT_GREETING.format(child_name="Lincoln") in fresh
    assert prompts._CONTINUE_CHAT.format(child_name="Lincoln") in ongoing
    assert prompts._NEW_CHAT_GREETING.format(child_name="Lincoln") not in ongoing


def test_home_label_adds_context_only_when_set():
    preset = PRESETS["young_explorer"]
    with_home = build_system_prompt("Lincoln", 8, preset, home_label="Denver, Colorado, United States")
    without = build_system_prompt("Lincoln", 8, preset)
    assert "Denver, Colorado" in with_home
    assert "Denver" not in without


def test_tone_and_verbosity_select_hint_variants():
    preset = PRESETS["young_explorer"]
    prompt = build_system_prompt("Lincoln", 8, preset, ai_tone="concise", ai_verbosity=1)
    assert prompts._TONE_HINTS["concise"] in prompt
    assert prompts._VERBOSITY_HINTS[1] in prompt
    assert prompts._TONE_HINTS["warm"] not in prompt


def test_unknown_tone_and_out_of_range_verbosity_fall_back():
    preset = PRESETS["young_explorer"]
    prompt = build_system_prompt("Lincoln", 8, preset, ai_tone="shouty", ai_verbosity=99)
    assert prompts._TONE_HINTS["balanced"] in prompt
    assert prompts._VERBOSITY_HINTS[5] in prompt


def test_tool_hint_is_appended():
    preset = PRESETS["teen_guided"]
    prompt = build_system_prompt("Max", 15, preset, tool_hint="CURRENT TIME: 3:15 PM")
    assert prompt.endswith("CURRENT TIME: 3:15 PM")


def test_quick_chat_never_uses_personal_name():
    preset = PRESETS["young_explorer"]
    fresh = build_system_prompt("Lincoln", 8, preset, quick_chat=True, continue_conversation=False)
    ongoing = build_system_prompt("Lincoln", 8, preset, quick_chat=True, continue_conversation=True)
    assert "Lincoln" not in fresh
    assert "Lincoln" not in ongoing
    assert prompts._QUICK_CHAT_IDENTITY in fresh
    assert prompts._QUICK_CHAT_GREETING in fresh
    assert prompts._QUICK_CHAT_CONTINUE in ongoing
    assert prompts._QUICK_CHAT_GREETING not in ongoing
