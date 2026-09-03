"""Read-aloud voice mapping. Prefer Kokoro (more natural); Piper is the fallback."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

VoiceGender = Literal["female", "male"]
DEFAULT_VOICE_GENDER: VoiceGender = "female"

PIPER_VOICES = {
    "female": "en_US-lessac-medium",
    "male": "en_US-ryan-medium",
}

# Kokoro-82M built-in American voices — warmer and less flat than Piper.
KOKORO_VOICES = {
    "female": "af_heart",
    "male": "am_michael",
}


@dataclass(frozen=True)
class ResolvedVoice:
    engine: Literal["kokoro", "piper"]
    name: str
    gender: VoiceGender


def normalize_voice_gender(value: str | None) -> VoiceGender:
    if isinstance(value, str) and value.strip().lower() == "male":
        return "male"
    return "female"


def kokoro_available() -> bool:
    try:
        import kokoro_onnx  # noqa: F401

        return True
    except ImportError:
        return False


def resolve_voice(
    gender: str | None,
    *,
    engine: Literal["kokoro", "piper"] | None = None,
) -> ResolvedVoice:
    voice_gender = normalize_voice_gender(gender)
    chosen = engine
    if chosen is None:
        chosen = "kokoro" if kokoro_available() else "piper"
    names = KOKORO_VOICES if chosen == "kokoro" else PIPER_VOICES
    return ResolvedVoice(engine=chosen, name=names[voice_gender], gender=voice_gender)
