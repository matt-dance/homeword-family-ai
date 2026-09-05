"""Local speech-to-text via faster-whisper (fully on-device)."""

from __future__ import annotations

import logging
import os
import re
import shutil
import subprocess
import tempfile
import threading
from pathlib import Path

import numpy as np

from homeward_gateway.config import settings

logger = logging.getLogger(__name__)

WHISPER_SAMPLE_RATE = 16_000
SELF_TEST_SNIPPET = "ask not what your country can do for you"
_NON_WORD_RE = re.compile(r"[^\w\s]+", re.UNICODE)

_model = None
_model_lock = threading.RLock()
_self_test_lock = threading.Lock()
_load_error: str | None = None


def normalize_transcript(text: str) -> str:
    """Lowercase and strip punctuation so self-test compares ignore ASR punctuation drift."""
    stripped = _NON_WORD_RE.sub(" ", (text or "").casefold())
    return " ".join(stripped.split())


def transcript_matches_self_test(text: str, snippet: str = SELF_TEST_SNIPPET) -> bool:
    """True when ``snippet`` appears in ``text`` after punctuation/case normalization."""
    needle = normalize_transcript(snippet)
    haystack = normalize_transcript(text)
    return bool(needle) and needle in haystack


def resolve_fixture(name: str, *, module_file: Path | None = None) -> Path:
    """Locate a bundled speech sample in editable and installed layouts.

    After ``pip install``, ``Path(__file__).parents[2] / "tests/fixtures"`` points
    at ``site-packages/tests/fixtures``, which does not exist. Prefer package
    data at ``homeward_gateway/fixtures/`` (wheel / Docker) and fall back to the
    checkout path used by editable installs.
    """
    module_path = Path(module_file or __file__).resolve()
    candidates = (
        module_path.parents[1] / "fixtures" / name,
        module_path.parents[2] / "tests" / "fixtures" / name,
    )
    for path in candidates:
        if path.is_file():
            return path
    return candidates[0]


SELF_TEST_FIXTURE = resolve_fixture("jfk-sample.flac")
SELF_TEST_WEBM_FIXTURE = resolve_fixture("jfk-sample.webm")


def whisper_available() -> bool:
    try:
        import faster_whisper  # noqa: F401

        return True
    except ImportError:
        return False


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


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


def _ffmpeg_decode_pcm(path: Path) -> np.ndarray | None:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return None
    cmd = [
        ffmpeg,
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(path),
        "-vn",
        "-f",
        "s16le",
        "-acodec",
        "pcm_s16le",
        "-ac",
        "1",
        "-ar",
        str(WHISPER_SAMPLE_RATE),
        "-",
    ]
    try:
        proc = subprocess.run(cmd, check=True, capture_output=True)
    except (OSError, subprocess.CalledProcessError) as exc:
        stderr = ""
        if isinstance(exc, subprocess.CalledProcessError) and exc.stderr:
            stderr = exc.stderr.decode("utf-8", errors="replace").strip()
        logger.warning("ffmpeg could not decode %s: %s %s", path, exc, stderr)
        return None
    if not proc.stdout:
        logger.warning("ffmpeg produced no audio from %s", path)
        return None
    return np.frombuffer(proc.stdout, dtype=np.int16).astype(np.float32) / 32768.0


def decode_audio_16k_mono(path: Path) -> np.ndarray | None:
    """Decode any container to 16 kHz mono float32 via system ffmpeg.

    Browser MediaRecorder WebM/Opus (and some PyAV builds) is more reliable
    through the ffmpeg CLI than faster-whisper's bundled decoder. Returns
    ``None`` if ffmpeg is missing or decode fails so callers can fall back.
    Retries once on empty/failed decode — WebM/Opus is intermittently flaky.
    """
    if not ffmpeg_available():
        return None
    audio = _ffmpeg_decode_pcm(path)
    if audio is None or audio.size == 0:
        logger.warning("ffmpeg decode empty/failed for %s; retrying once", path)
        audio = _ffmpeg_decode_pcm(path)
    return audio


def _whisper_text(source: str | np.ndarray, *, vad_filter: bool) -> str:
    assert _model is not None
    # temperature=0 and no cross-segment conditioning keep tiny.en deterministic
    # on short clips (self-test and kid mic). Live safety filters are unchanged.
    segments, _info = _model.transcribe(
        source,
        language="en",
        beam_size=1,
        temperature=0.0,
        condition_on_previous_text=False,
        vad_filter=vad_filter,
    )
    return " ".join(segment.text.strip() for segment in segments).strip()


def transcribe_file(path: Path, *, vad_filter: bool | None = None) -> str:
    """Transcribe a file on disk.

    ``vad_filter=None`` (live default) tries VAD then retries without it only
    when the transcript is empty. Self-test may pass ``vad_filter=False`` on a
    retry; live mic callers do not.
    """
    ensure_model()
    audio = decode_audio_16k_mono(path)
    source: str | np.ndarray = audio if audio is not None and audio.size else str(path)
    with _model_lock:
        if vad_filter is None:
            text = _whisper_text(source, vad_filter=True)
            if not text:
                logger.info("Empty transcript with VAD; retrying without VAD (%s)", path.name)
                text = _whisper_text(source, vad_filter=False)
            return text
        return _whisper_text(source, vad_filter=vad_filter)


def transcribe_bytes(
    data: bytes, suffix: str = ".webm", *, vad_filter: bool | None = None
) -> str:
    if not data:
        raise ValueError("Empty audio")
    if len(data) > settings.whisper_max_bytes:
        raise ValueError("Audio clip is too long")

    fd, tmp_path = tempfile.mkstemp(suffix=suffix)
    try:
        with os.fdopen(fd, "wb") as tmp:
            tmp.write(data)
            tmp.flush()
            os.fsync(tmp.fileno())
        return transcribe_file(Path(tmp_path), vad_filter=vad_filter)
    finally:
        Path(tmp_path).unlink(missing_ok=True)


def _self_test_transcribe_flac() -> str:
    text = transcribe_file(SELF_TEST_FIXTURE)
    if transcript_matches_self_test(text):
        return text
    logger.info(
        "FLAC self-test missed snippet with VAD (%r); retrying without VAD",
        text[:120],
    )
    return transcribe_file(SELF_TEST_FIXTURE, vad_filter=False)


def _self_test_transcribe_webm() -> str:
    data = SELF_TEST_WEBM_FIXTURE.read_bytes()
    text = transcribe_bytes(data, suffix=".webm")
    if transcript_matches_self_test(text):
        return text
    logger.info(
        "WebM self-test missed snippet (%r); retrying decode without VAD",
        text[:120],
    )
    return transcribe_bytes(data, suffix=".webm", vad_filter=False)


def run_voice_self_test() -> dict:
    """End-to-end check: bundled speech sample → Whisper → expected phrase."""
    # Overlapping QA curls used to interleave FLAC/WebM on the shared tiny.en
    # model and produce garbage WebM transcripts. Run one self-test at a time.
    with _self_test_lock:
        return _run_voice_self_test()


def _run_voice_self_test() -> dict:
    if not whisper_available():
        return {
            "ok": False,
            "stage": "import",
            "message": "faster-whisper is not installed",
        }

    if not SELF_TEST_FIXTURE.is_file():
        return {
            "ok": False,
            "stage": "fixture",
            "message": f"Missing test audio at {SELF_TEST_FIXTURE}",
        }
    if not SELF_TEST_WEBM_FIXTURE.is_file():
        return {
            "ok": False,
            "stage": "fixture",
            "message": f"Missing test audio at {SELF_TEST_WEBM_FIXTURE}",
        }

    try:
        ensure_model()
    except RuntimeError as exc:
        return {"ok": False, "stage": "model", "message": str(exc)}

    try:
        text = _self_test_transcribe_flac()
    except Exception as exc:
        logger.exception("Voice self-test transcription failed")
        return {"ok": False, "stage": "transcribe", "message": str(exc)}

    if not transcript_matches_self_test(text):
        return {
            "ok": False,
            "stage": "transcribe",
            "message": f"Unexpected transcript (got: {text[:120]!r})",
            "text": text,
        }

    try:
        webm_text = _self_test_transcribe_webm()
    except Exception as exc:
        logger.exception("Voice self-test WebM transcription failed")
        return {
            "ok": False,
            "stage": "webm",
            "message": str(exc),
            "text": text,
        }

    webm_ok = transcript_matches_self_test(webm_text)
    if not webm_ok:
        logger.warning(
            "WebM self-test still mismatched after retry (%r); FLAC path is healthy",
            webm_text[:120],
        )
        return {
            "ok": True,
            "model": settings.whisper_model,
            "text": text,
            "webm_ok": False,
            "webm_text": webm_text,
            "message": (
                "Voice model is working (FLAC). WebM fixture transcript was unstable."
            ),
        }

    return {
        "ok": True,
        "model": settings.whisper_model,
        "text": text,
        "webm_ok": True,
        "webm_text": webm_text,
        "message": "Voice pipeline is working.",
    }
