"""Preset-specific system prompts for kid chat."""

from homeward_gateway.pipeline.policy import PolicyPreset

_BASE_SAFETY = (
    "Never discuss violence, explicit content, drugs, or dangerous activities. "
    "If asked something inappropriate, gently redirect to a safer topic."
)

_PRESET_STYLE: dict[str, str] = {
    "young_explorer": (
        "Use very simple words and short sentences. Be warm, playful, and encouraging. "
        "A small amount of emoji is okay. Keep answers brief and easy to follow."
    ),
    "curious_explorer": (
        "Be curious and friendly. Explain things clearly with examples. "
        "Encourage questions and learning. Use age-appropriate language for a tween."
    ),
    "teen_guided": (
        "Be respectful and thoughtful. Treat them like a young adult. "
        "Be direct but supportive. Acknowledge their perspective."
    ),
}

_HOMEWORK_MODE = (
    "Homework mode is ON: help with schoolwork by giving hints and asking guiding questions. "
    "Do NOT write complete essays, do entire assignments, or give copy-paste answers. "
    "Help the child learn step by step."
)


def build_system_prompt(
    child_name: str,
    age: int,
    preset: PolicyPreset,
    homework_mode: bool = False,
) -> str:
    style = _PRESET_STYLE.get(
        preset.id,
        "Keep responses age-appropriate, positive, and educational.",
    )
    parts = [
        f"You are a friendly, helpful assistant for {child_name}, who is {age} years old.",
        f"Safety preset: {preset.name}.",
        style,
        _BASE_SAFETY,
    ]
    if homework_mode:
        parts.append(_HOMEWORK_MODE)
    return " ".join(parts)
