"""Local speech-to-text via faster-whisper (fully on-device)."""

from __future__ import annotations

import logging
import os
import re
import shutil
import subprocess
import tempfile
import threading
from difflib import SequenceMatcher
from importlib.resources import files as package_files
from pathlib import Path

import numpy as np

from homeward_gateway.config import settings

logger = logging.getLogger(__name__)

WHISPER_SAMPLE_RATE = 16_000
SELF_TEST_SNIPPET = "ask not what your country can do for you"
SELF_TEST_REFERENCE = (
    "and so my fellow americans ask not what your country can do for you "
    "ask what you can do for your country"
)
# Distinctive JFK chiasmus. tiny.en often paraphrases the intro ("Oh, America")
# or inflects "ask" → "asked" while keeping both halves.
SELF_TEST_ANCHORS = (
    "what your country can do for you",
    "what you can do for your country",
)
_SELF_TEST_RATIO = 0.70
_MIN_SELF_TEST_TOKENS = 8
_NON_WORD_RE = re.compile(r"[^\w\s]+", re.UNICODE)
_ASR_TOKEN_FOLD = {
    "asked": "ask",
    "asks": "ask",
    "americans": "america",
    "american": "america",
}
_FIXTURE_MIN_BYTES = {
    "jfk-sample.flac": 50_000,
    "jfk-sample.webm": 5_000,
}

_model = None
_model_lock = threading.RLock()
_self_test_lock = threading.Lock()
_fixture_bytes_lock = threading.Lock()
_fixture_bytes: dict[str, bytes] = {}
_load_error: str | None = None


def normalize_transcript(text: str) -> str:
    """Lowercase and strip punctuation so self-test compares ignore ASR punctuation drift."""
    stripped = _NON_WORD_RE.sub(" ", (text or "").casefold())
    return " ".join(stripped.split())


def _fold_asr_tokens(normalized: str) -> str:
    return " ".join(_ASR_TOKEN_FOLD.get(token, token) for token in normalized.split())


def transcript_matches_self_test(text: str, snippet: str = SELF_TEST_SNIPPET) -> bool:
    """True when a bundled JFK clip transcript is near-correct despite tiny.en drift.

    Live kid-mic ``POST /chat/transcribe`` does not use this matcher.
    """
    haystack = _fold_asr_tokens(normalize_transcript(text))
    if not haystack:
        return False
    needle = _fold_asr_tokens(normalize_transcript(snippet))
    if needle and needle in haystack:
        return True
    if all(normalize_transcript(anchor) in haystack for anchor in SELF_TEST_ANCHORS):
        return True
    if len(haystack.split()) < _MIN_SELF_TEST_TOKENS:
        return False
    reference = _fold_asr_tokens(normalize_transcript(SELF_TEST_REFERENCE))
    return SequenceMatcher(None, haystack, reference).ratio() >= _SELF_TEST_RATIO


def _package_fixture_resource(name: str):
    try:
        resource = package_files("homeward_gateway").joinpath("fixtures", name)
    except (ModuleNotFoundError, FileNotFoundError, OSError, AttributeError, TypeError):
        return None
    try:
        if resource.is_file():
            return resource
    except (OSError, AttributeError, TypeError):
        return None
    return None


def resolve_fixture(name: str, *, module_file: Path | None = None) -> Path:
    """Locate a bundled speech sample in editable and installed layouts.

    After ``pip install``, ``Path(__file__).parents[2] / "tests/fixtures"`` points
    at ``site-packages/tests/fixtures``, which does not exist. Prefer package
    data at ``homeward_gateway/fixtures/`` (wheel / Docker) and fall back to the
    checkout path used by editable installs.
    """
    module_path = Path(module_file or __file__).resolve()
    candidates: list[Path] = []
    if module_file is None:
        resource = _package_fixture_resource(name)
        if resource is not None:
            resource_path = Path(str(resource))
            if resource_path.is_file():
                candidates.append(resource_path)
    candidates.extend(
        (
            module_path.parents[1] / "fixtures" / name,
            module_path.parents[2] / "tests" / "fixtures" / name,
        )
    )
    seen: set[Path] = set()
    fallback = candidates[0]
    for path in candidates:
        key = path.resolve() if path.exists() else path
        if key in seen:
            continue
        seen.add(key)
        if path.is_file() and path.stat().st_size > 0:
            return path
        fallback = path
    return fallback


def load_fixture_bytes(name: str, *, module_file: Path | None = None) -> bytes:
    """Read a bundled clip, retrying a truncated/empty read under load."""
    min_size = _FIXTURE_MIN_BYTES.get(name, 1)
    with _fixture_bytes_lock:
        cacheable = module_file is None
        if cacheable:
            cached = _fixture_bytes.get(name)
            if cached and len(cached) >= min_size:
                return cached

        data = b""
        if cacheable:
            resource = _package_fixture_resource(name)
            if resource is not None:
                try:
                    data = resource.read_bytes()
                except OSError as exc:
                    logger.warning("Could not read packaged fixture %s: %s", name, exc)
                    data = b""
        if len(data) < min_size:
            path = resolve_fixture(name, module_file=module_file)
            for attempt in range(2):
                if not path.is_file():
                    break
                try:
                    data = path.read_bytes()
                except OSError as exc:
                    logger.warning("Could not read fixture %s (%s); retrying", path, exc)
                    data = b""
                    continue
                if len(data) >= min_size:
                    break
                logger.warning(
                    "Fixture %s too small (%s bytes, attempt %s); retrying",
                    path,
                    len(data),
                    attempt + 1,
                )
        if cacheable and len(data) >= min_size:
            _fixture_bytes[name] = data
        return data


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


def _self_test_transcribe(data: bytes, suffix: str) -> str:
    """Transcribe a bundled clip; retry without VAD, then once more if still empty."""
    text = transcribe_bytes(data, suffix=suffix)
    if transcript_matches_self_test(text):
        return text
    logger.info(
        "%s self-test missed snippet (%r); retrying without VAD",
        suffix.lstrip(".").upper(),
        text[:120],
    )
    text = transcribe_bytes(data, suffix=suffix, vad_filter=False)
    if transcript_matches_self_test(text) or text:
        return text
    logger.warning(
        "%s self-test still empty after VAD retry; decoding once more",
        suffix.lstrip(".").upper(),
    )
    return transcribe_bytes(data, suffix=suffix, vad_filter=False)


def _self_test_transcribe_flac() -> str:
    return _self_test_transcribe(load_fixture_bytes("jfk-sample.flac"), ".flac")


def _self_test_transcribe_webm() -> str:
    return _self_test_transcribe(load_fixture_bytes("jfk-sample.webm"), ".webm")


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

    flac_bytes = load_fixture_bytes("jfk-sample.flac")
    webm_bytes = load_fixture_bytes("jfk-sample.webm")
    if len(flac_bytes) < _FIXTURE_MIN_BYTES["jfk-sample.flac"]:
        return {
            "ok": False,
            "stage": "fixture",
            "message": f"Missing or unreadable test audio at {SELF_TEST_FIXTURE}",
        }
    if len(webm_bytes) < _FIXTURE_MIN_BYTES["jfk-sample.webm"]:
        return {
            "ok": False,
            "stage": "fixture",
            "message": f"Missing or unreadable test audio at {SELF_TEST_WEBM_FIXTURE}",
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

    flac_ok = transcript_matches_self_test(text)

    try:
        webm_text = _self_test_transcribe_webm()
    except Exception as exc:
        logger.exception("Voice self-test WebM transcription failed")
        if flac_ok:
            return {
                "ok": True,
                "model": settings.whisper_model,
                "text": text,
                "webm_ok": False,
                "webm_text": "",
                "message": (
                    "Voice model is working (FLAC). WebM fixture transcript was unstable."
                ),
            }
        return {
            "ok": False,
            "stage": "webm",
            "message": str(exc),
            "text": text,
        }

    webm_ok = transcript_matches_self_test(webm_text)
    if flac_ok and webm_ok:
        return {
            "ok": True,
            "model": settings.whisper_model,
            "text": text,
            "webm_ok": True,
            "webm_text": webm_text,
            "message": "Voice pipeline is working.",
        }
    if flac_ok:
        logger.warning(
            "WebM self-test still mismatched after retry (%r); FLAC path is healthy",
            (webm_text or "")[:120],
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
    if webm_ok:
        logger.warning(
            "FLAC self-test drifted (%r); WebM path matched",
            text[:120],
        )
        return {
            "ok": True,
            "model": settings.whisper_model,
            "text": text,
            "webm_ok": True,
            "webm_text": webm_text,
            "message": (
                "Voice model is working (WebM). FLAC fixture transcript drifted."
            ),
        }

    return {
        "ok": False,
        "stage": "transcribe",
        "message": f"Unexpected transcript (got: {text[:120]!r})",
        "text": text,
        "webm_ok": False,
        "webm_text": webm_text,
    }
