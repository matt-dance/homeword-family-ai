"""Local text-to-speech via Piper (fully on-device)."""

from __future__ import annotations

import io
import logging
import shutil
import subprocess
import sys
import threading
import wave
from pathlib import Path

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


def _model_path() -> Path:
    return PIPER_DIR / f"{settings.piper_voice}.onnx"


def get_speak_status() -> dict:
    if not piper_available():
        return {
            "available": False,
            "ready": False,
            "voice": settings.piper_voice,
            "message": "Local read-aloud is not installed on this Homeward server.",
        }
    if _load_error:
        return {
            "available": True,
            "ready": False,
            "voice": settings.piper_voice,
            "message": _load_error,
        }
    ready = _model is not None or _model_path().is_file()
    return {
        "available": True,
        "ready": ready,
        "voice": settings.piper_voice,
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
    _model = PiperVoice.load(str(path))
    logger.info("Piper voice ready")


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

    cleaned = re.sub(r"[\U00010000-\U0010ffff]", "", text)
    cleaned = re.sub(r"[\u2600-\u27BF]", "", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def synthesize_wav_bytes(text: str) -> bytes:
    cleaned = sanitize_for_speech(text)
    if not cleaned:
        raise ValueError("Nothing to read aloud")

    ensure_model()
    assert _model is not None

    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        _model.synthesize_wav(cleaned, wav_file)

    data = buffer.getvalue()
    if not data:
        raise RuntimeError("Read-aloud produced empty audio")
    return data


def run_speak_self_test() -> dict:
    if not piper_available():
        return {"ok": False, "stage": "import", "message": "piper-tts is not installed"}

    try:
        audio = synthesize_wav_bytes(SELF_TEST_PHRASE)
    except Exception as exc:
        logger.exception("Speak self-test failed")
        return {"ok": False, "stage": "synthesize", "message": str(exc)}

    if len(audio) < 1000:
        return {
            "ok": False,
            "stage": "synthesize",
            "message": f"Audio too small ({len(audio)} bytes)",
        }

    return {
        "ok": True,
        "voice": settings.piper_voice,
        "bytes": len(audio),
        "message": "Read-aloud pipeline is working.",
    }
