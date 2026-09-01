"""Local text-to-speech via Piper (fully on-device)."""

from __future__ import annotations

import base64
import io
import logging
import subprocess
import sys
import threading
import wave
from pathlib import Path
from typing import Any

import numpy as np

from homeward_gateway.config import settings

logger = logging.getLogger(__name__)

_model = None
_model_lock = threading.Lock()
_load_error: str | None = None

PIPER_DIR = settings.data_dir / "piper"
SELF_TEST_PHRASE = "Homeward read aloud is working"


def piper_available() -> bool:
    try:
        import piper  # noqa: F401

        return True
    except ImportError:
        return False


def alignment_available() -> bool:
    try:
        import onnx  # noqa: F401

        return True
    except ImportError:
        return False


def _model_path() -> Path:
    return PIPER_DIR / f"{settings.piper_voice}.onnx"


def get_speak_status() -> dict:
    if not piper_available():
        return {
            "available": False,
            "ready": False,
            "voice": settings.piper_voice,
            "synced_highlighting": False,
            "message": "Local read-aloud is not installed on this Homeward server.",
        }
    if _load_error:
        return {
            "available": True,
            "ready": False,
            "voice": settings.piper_voice,
            "synced_highlighting": alignment_available(),
            "message": _load_error,
        }
    ready = _model is not None or _model_path().is_file()
    return {
        "available": True,
        "ready": ready,
        "voice": settings.piper_voice,
        "synced_highlighting": alignment_available(),
        "message": None if ready else "Read-aloud voice will download on first use.",
    }


def _download_voice() -> None:
    PIPER_DIR.mkdir(parents=True, exist_ok=True)
    logger.info("Downloading Piper voice %s", settings.piper_voice)
    subprocess.run(
        [
            sys.executable,
            "-m",
            "piper.download_voices",
            settings.piper_voice,
            "--download-dir",
            str(PIPER_DIR),
        ],
        check=True,
        capture_output=True,
        text=True,
    )


def _load_model():
    global _model, _load_error
    from piper import PiperVoice

    path = _model_path()
    if not path.is_file():
        _download_voice()
    if not path.is_file():
        raise RuntimeError(f"Piper voice not found at {path}")

    logger.info("Loading Piper voice %s", settings.piper_voice)
    _model = PiperVoice.load(str(path), include_alignments=alignment_available())
    logger.info("Piper voice ready (alignments=%s)", alignment_available())


def ensure_model() -> None:
    global _load_error
    if _model is not None:
        return
    if not piper_available():
        raise RuntimeError("piper-tts is not installed")

    with _model_lock:
        if _model is not None:
            return
        try:
            _load_model()
            _load_error = None
        except Exception as exc:
            _load_error = f"Could not load read-aloud voice: {exc}"
            logger.exception("Piper load failed")
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


def synthesize_speech(text: str) -> dict[str, Any]:
    cleaned = sanitize_for_speech(text)
    if not cleaned:
        raise ValueError("Nothing to read aloud")

    ensure_model()
    assert _model is not None

    try:
        chunks = list(_model.synthesize(cleaned, include_alignments=True))
    except Exception:
        logger.exception("Piper alignments failed; retrying without them")
        chunks = list(_model.synthesize(cleaned, include_alignments=False))
    if not chunks:
        raise RuntimeError("Read-aloud produced no audio")

    arrays = [np.asarray(chunk.audio_int16_array, dtype=np.int16) for chunk in chunks if len(chunk.audio_int16_array)]
    if not arrays:
        raise RuntimeError("Read-aloud produced no audio")
    audio = np.concatenate(arrays)
    sample_rate = chunks[0].sample_rate
    words = build_word_timings(cleaned, chunks)
    duration = len(audio) / sample_rate

    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(audio.tobytes())

    wav_bytes = buffer.getvalue()
    if not wav_bytes:
        raise RuntimeError("Read-aloud produced empty audio")

    return {
        "audio_wav": wav_bytes,
        "words": words,
        "duration": duration,
    }


def synthesize_wav_bytes(text: str) -> bytes:
    return synthesize_speech(text)["audio_wav"]


def synthesize_speech_payload(text: str) -> dict[str, Any]:
    result = synthesize_speech(text)
    return {
        "audio_base64": base64.b64encode(result["audio_wav"]).decode("ascii"),
        "words": result["words"],
        "duration": result["duration"],
    }


def run_speak_self_test() -> dict:
    if not piper_available():
        return {"ok": False, "stage": "import", "message": "piper-tts is not installed"}

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

    return {
        "ok": True,
        "voice": settings.piper_voice,
        "bytes": len(audio),
        "word_count": len(words),
        "synced_highlighting": True,
        "message": "Read-aloud pipeline is working.",
    }
