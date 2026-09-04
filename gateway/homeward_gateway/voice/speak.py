"""Local text-to-speech via Kokoro (preferred) or Piper (fallback)."""

from __future__ import annotations

import base64
import io
import logging
import subprocess
import sys
import threading
import urllib.request
import wave
from pathlib import Path
from typing import Any

import numpy as np

from homeward_gateway.config import settings
from homeward_gateway.voice.voices import (
    DEFAULT_VOICE_GENDER,
    kokoro_available,
    resolve_voice,
)

logger = logging.getLogger(__name__)

_piper_models: dict[str, Any] = {}
_kokoro_model = None
_model_lock = threading.Lock()
_load_error: str | None = None

PIPER_DIR = settings.data_dir / "piper"
KOKORO_DIR = settings.data_dir / "kokoro"
KOKORO_MODEL_URL = (
    "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx"
)
KOKORO_VOICES_URL = (
    "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin"
)
SELF_TEST_PHRASE = "Homeward read aloud is working"


def piper_available() -> bool:
    try:
        import piper  # noqa: F401

        return True
    except ImportError:
        return False


def tts_available() -> bool:
    return kokoro_available() or piper_available()


def alignment_available() -> bool:
    try:
        import onnx  # noqa: F401

        return True
    except ImportError:
        return False


def _piper_model_path(voice_name: str) -> Path:
    return PIPER_DIR / f"{voice_name}.onnx"


def get_speak_status() -> dict:
    preferred = resolve_voice(DEFAULT_VOICE_GENDER)
    if not tts_available():
        return {
            "available": False,
            "ready": False,
            "engine": preferred.engine,
            "voice": preferred.name,
            "synced_highlighting": False,
            "message": "Local read-aloud is not installed on this Homeward server.",
        }
    if _load_error:
        return {
            "available": True,
            "ready": False,
            "engine": preferred.engine,
            "voice": preferred.name,
            "synced_highlighting": alignment_available(),
            "message": _load_error,
        }
    if preferred.engine == "kokoro":
        ready = _kokoro_model is not None or (KOKORO_DIR / "kokoro-v1.0.onnx").is_file()
    else:
        ready = bool(_piper_models) or _piper_model_path(preferred.name).is_file()
    return {
        "available": True,
        "ready": ready,
        "engine": preferred.engine,
        "voice": preferred.name,
        "synced_highlighting": preferred.engine == "piper" and alignment_available(),
        "message": None if ready else "Read-aloud voice will download on first use.",
    }


def _download_piper_voice(voice_name: str) -> None:
    PIPER_DIR.mkdir(parents=True, exist_ok=True)
    logger.info("Downloading Piper voice %s", voice_name)
    subprocess.run(
        [
            sys.executable,
            "-m",
            "piper.download_voices",
            voice_name,
            "--download-dir",
            str(PIPER_DIR),
        ],
        check=True,
        capture_output=True,
        text=True,
    )


def _download_file(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    logger.info("Downloading %s", dest.name)
    urllib.request.urlretrieve(url, tmp)
    tmp.replace(dest)


def _ensure_kokoro_files() -> tuple[Path, Path]:
    model = KOKORO_DIR / "kokoro-v1.0.onnx"
    voices = KOKORO_DIR / "voices-v1.0.bin"
    if not model.is_file():
        _download_file(KOKORO_MODEL_URL, model)
    if not voices.is_file():
        _download_file(KOKORO_VOICES_URL, voices)
    return model, voices


def _load_piper_voice(voice_name: str):
    from piper import PiperVoice

    path = _piper_model_path(voice_name)
    if not path.is_file():
        _download_piper_voice(voice_name)
    if not path.is_file():
        raise RuntimeError(f"Piper voice not found at {path}")
    logger.info("Loading Piper voice %s", voice_name)
    return PiperVoice.load(str(path), include_alignments=alignment_available())


def _load_kokoro_model():
    from kokoro_onnx import Kokoro

    model, voices = _ensure_kokoro_files()
    logger.info("Loading Kokoro TTS")
    return Kokoro(str(model), str(voices))


def ensure_voice(voice_name: str, engine: str) -> None:
    global _kokoro_model, _load_error
    if engine == "kokoro" and _kokoro_model is not None:
        return
    if engine == "piper" and voice_name in _piper_models:
        return

    with _model_lock:
        try:
            if engine == "kokoro":
                if _kokoro_model is None:
                    if not kokoro_available():
                        raise RuntimeError("kokoro-onnx is not installed")
                    _kokoro_model = _load_kokoro_model()
            else:
                if not piper_available():
                    raise RuntimeError("piper-tts is not installed")
                if voice_name not in _piper_models:
                    _piper_models[voice_name] = _load_piper_voice(voice_name)
            _load_error = None
        except Exception as exc:
            _load_error = f"Could not load read-aloud voice: {exc}"
            logger.exception("TTS load failed")
            raise RuntimeError(_load_error) from exc


def sanitize_for_speech(text: str) -> str:
    import re

    cleaned = re.sub(r"<think>[\s\S]*?</think>", " ", text, flags=re.IGNORECASE)
    cleaned = re.sub(r"```[\s\S]*?```", " ", cleaned)
    cleaned = re.sub(r"`([^`]+)`", r"\1", cleaned)
    cleaned = re.sub(r"!\[([^\]]*)\]\([^)]+\)", r"\1", cleaned)
    cleaned = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", cleaned)
    cleaned = re.sub(r"^#{1,6}\s+", "", cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r"[*_~>]{1,3}", "", cleaned)
    cleaned = re.sub(r"^\s*[-*+]\s+", "", cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r"^\s*\d+\.\s+", "", cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r"[\U00010000-\U0010ffff]", "", cleaned)
    cleaned = re.sub(r"[\u2600-\u27BF]", "", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def build_word_timings(text: str, chunks) -> list[dict[str, Any]]:
    """Map Piper phoneme alignments to per-word start/end times in seconds."""
    words = text.split()
    if not words:
        return []

    timeline: list[tuple[str, float, float]] = []
    elapsed = 0.0
    for chunk in chunks:
        if not chunk.phoneme_alignments:
            continue
        sample_rate = chunk.sample_rate
        for alignment in chunk.phoneme_alignments:
            duration = alignment.num_samples / sample_rate
            timeline.append((alignment.phoneme, elapsed, elapsed + duration))
            elapsed += duration

    if not timeline:
        return []

    timings: list[dict[str, Any]] = []
    word_idx = 0
    word_start = 0.0

    for phoneme, start, end in timeline:
        if phoneme == " " and word_idx < len(words):
            timings.append({"word": words[word_idx], "start": word_start, "end": start})
            word_idx += 1
            word_start = end

    while word_idx < len(words):
        timings.append({"word": words[word_idx], "start": word_start, "end": elapsed})
        word_idx += 1

    return timings


def _wav_bytes(audio: np.ndarray, sample_rate: int) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(audio.tobytes())
    wav_bytes = buffer.getvalue()
    if not wav_bytes:
        raise RuntimeError("Read-aloud produced empty audio")
    return wav_bytes


def _estimate_word_timings(text: str, duration: float) -> list[dict[str, Any]]:
    words = text.split()
    if not words or duration <= 0:
        return []
    each = duration / len(words)
    return [
        {"word": word, "start": round(index * each, 3), "end": round((index + 1) * each, 3)}
        for index, word in enumerate(words)
    ]


def _synthesize_piper(text: str, voice_name: str) -> dict[str, Any]:
    ensure_voice(voice_name, "piper")
    model = _piper_models[voice_name]
    try:
        chunks = list(model.synthesize(text, include_alignments=True))
    except Exception:
        logger.exception("Piper alignments failed; retrying without them")
        chunks = list(model.synthesize(text, include_alignments=False))
    if not chunks:
        raise RuntimeError("Read-aloud produced no audio")
    arrays = [
        np.asarray(chunk.audio_int16_array, dtype=np.int16)
        for chunk in chunks
        if len(chunk.audio_int16_array)
    ]
    if not arrays:
        raise RuntimeError("Read-aloud produced no audio")
    audio = np.concatenate(arrays)
    sample_rate = chunks[0].sample_rate
    words = build_word_timings(text, chunks)
    duration = len(audio) / sample_rate
    return {
        "audio_wav": _wav_bytes(audio, sample_rate),
        "words": words,
        "duration": duration,
    }


def _synthesize_kokoro(text: str, voice_name: str) -> dict[str, Any]:
    ensure_voice(voice_name, "kokoro")
    assert _kokoro_model is not None
    samples, sample_rate = _kokoro_model.create(text, voice=voice_name, speed=1.0)
    audio = np.asarray(samples)
    if audio.dtype != np.int16:
        audio = np.clip(audio, -1.0, 1.0)
        audio = (audio * 32767).astype(np.int16)
    if audio.size == 0:
        raise RuntimeError("Read-aloud produced no audio")
    duration = len(audio) / float(sample_rate)
    return {
        "audio_wav": _wav_bytes(audio, int(sample_rate)),
        "words": _estimate_word_timings(text, duration),
        "duration": duration,
    }


def synthesize_speech(text: str, voice_gender: str | None = None) -> dict[str, Any]:
    cleaned = sanitize_for_speech(text)
    if not cleaned:
        raise ValueError("Nothing to read aloud")

    voice = resolve_voice(voice_gender)
    try:
        if voice.engine == "kokoro":
            return _synthesize_kokoro(cleaned, voice.name)
        return _synthesize_piper(cleaned, voice.name)
    except Exception:
        if voice.engine == "kokoro" and piper_available():
            logger.exception("Kokoro failed; falling back to Piper")
            fallback = resolve_voice(voice_gender, engine="piper")
            return _synthesize_piper(cleaned, fallback.name)
        raise


def synthesize_speech_payload(text: str, voice_gender: str | None = None) -> dict[str, Any]:
    result = synthesize_speech(text, voice_gender=voice_gender)
    return {
        "audio_base64": base64.b64encode(result["audio_wav"]).decode("ascii"),
        "words": result["words"],
        "duration": result["duration"],
    }


def run_speak_self_test() -> dict:
    if not tts_available():
        return {"ok": False, "stage": "import", "message": "No local read-aloud engine is installed"}

    try:
        result = synthesize_speech(SELF_TEST_PHRASE)
    except Exception as exc:
        logger.exception("Speak self-test failed")
        return {"ok": False, "stage": "synthesize", "message": str(exc)}

    audio = result["audio_wav"]
    if len(audio) < 1000:
        return {
            "ok": False,
            "stage": "synthesize",
            "message": f"Audio too small ({len(audio)} bytes)",
        }

    words = result["words"]
    if not words:
        return {
            "ok": False,
            "stage": "alignments",
            "message": "Word timings missing — install onnx for synced highlighting",
        }

    voice = resolve_voice(DEFAULT_VOICE_GENDER)
    return {
        "ok": True,
        "engine": voice.engine,
        "voice": voice.name,
        "bytes": len(audio),
        "word_count": len(words),
        "synced_highlighting": bool(words),
        "message": "Read-aloud pipeline is working.",
    }
