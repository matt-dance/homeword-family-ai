"""Local speech-to-text via faster-whisper (fully on-device)."""

from __future__ import annotations

import logging
import tempfile
import threading
from pathlib import Path

from homeward_gateway.config import settings

logger = logging.getLogger(__name__)

_model = None
_model_lock = threading.Lock()
_load_error: str | None = None


def whisper_available() -> bool:
    try:
        import faster_whisper  # noqa: F401

        return True
    except ImportError:
        return False


def get_whisper_status() -> dict:
    if not whisper_available():
        return {
            "available": False,
            "ready": False,
            "model": settings.whisper_model,
            "message": "Local voice typing is not installed on this Homeward server.",
        }
    if _load_error:
        return {
            "available": True,
            "ready": False,
            "model": settings.whisper_model,
            "message": _load_error,
        }
    return {
        "available": True,
        "ready": _model is not None,
        "model": settings.whisper_model,
        "message": None if _model else "Voice model will download on first use.",
    }


def _load_model():
    global _model, _load_error
    from faster_whisper import WhisperModel

    cache_dir = settings.data_dir / "whisper"
    cache_dir.mkdir(parents=True, exist_ok=True)
    logger.info("Loading Whisper model %s", settings.whisper_model)
    _model = WhisperModel(
        settings.whisper_model,
        device="cpu",
        compute_type="int8",
        download_root=str(cache_dir),
    )
    logger.info("Whisper model ready")


def ensure_model() -> None:
    global _load_error
    if _model is not None:
        return
    if not whisper_available():
        raise RuntimeError("faster-whisper is not installed")

    with _model_lock:
        if _model is not None:
            return
        try:
            _load_model()
            _load_error = None
        except Exception as exc:
            _load_error = f"Could not load voice model: {exc}"
            logger.exception("Whisper load failed")
            raise RuntimeError(_load_error) from exc


def transcribe_file(path: Path) -> str:
    ensure_model()
    assert _model is not None
    segments, _info = _model.transcribe(
        str(path),
        language="en",
        beam_size=1,
        vad_filter=True,
    )
    text = " ".join(segment.text.strip() for segment in segments).strip()
    return text


def transcribe_bytes(data: bytes, suffix: str = ".webm") -> str:
    if not data:
        raise ValueError("Empty audio")
    if len(data) > settings.whisper_max_bytes:
        raise ValueError("Audio clip is too long")

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=True) as tmp:
        tmp.write(data)
        tmp.flush()
        return transcribe_file(Path(tmp.name))
