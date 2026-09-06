"""Local voice transcription tests."""

import shutil
import threading
import time
from pathlib import Path
from unittest.mock import patch

import numpy as np
import pytest
from httpx import AsyncClient

from homeward_gateway.voice.transcribe import (
    SELF_TEST_FIXTURE,
    SELF_TEST_SNIPPET,
    SELF_TEST_WEBM_FIXTURE,
    WHISPER_SAMPLE_RATE,
    decode_audio_16k_mono,
    normalize_transcript,
    resolve_fixture,
    run_voice_self_test,
    transcribe_bytes,
    transcribe_file,
    transcript_matches_self_test,
    whisper_available,
)


class TestTranscribeAPI:
    @pytest.mark.asyncio
    async def test_transcribe_status(self, client: AsyncClient):
        resp = await client.get("/api/v1/chat/transcribe/status")
        assert resp.status_code == 200
        data = resp.json()
        assert "available" in data
        assert "model" in data

    @pytest.mark.asyncio
    async def test_transcribe_audio_mocked(self, client: AsyncClient):
        with patch("homeward_gateway.api.routes.transcribe_bytes", return_value="hello stars"):
            resp = await client.post(
                "/api/v1/chat/transcribe",
                files={"audio": ("speech.webm", b"fake-audio-bytes", "audio/webm")},
            )
        assert resp.status_code == 200
        assert resp.json()["text"] == "hello stars"

    @pytest.mark.asyncio
    async def test_transcribe_empty_result(self, client: AsyncClient):
        with patch("homeward_gateway.api.routes.transcribe_bytes", return_value=""):
            resp = await client.post(
                "/api/v1/chat/transcribe",
                files={"audio": ("speech.webm", b"fake-audio-bytes", "audio/webm")},
            )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_transcribe_self_test_mocked(self, client: AsyncClient):
        ok_payload = {
            "ok": True,
            "model": "tiny.en",
            "text": "ask not what your country can do for you",
            "webm_ok": True,
            "message": "Voice pipeline is working.",
        }
        with patch("homeward_gateway.api.routes.run_voice_self_test", return_value=ok_payload):
            resp = await client.get("/api/v1/chat/transcribe/self-test")
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    @pytest.mark.asyncio
    async def test_transcribe_self_test_webm_soft_warn_is_200(self, client: AsyncClient):
        payload = {
            "ok": True,
            "model": "tiny.en",
            "text": "ask not what your country can do for you",
            "webm_ok": False,
            "webm_text": "and so electroc",
            "message": "Voice model is working (FLAC). WebM fixture transcript was unstable.",
        }
        with patch("homeward_gateway.api.routes.run_voice_self_test", return_value=payload):
            resp = await client.get("/api/v1/chat/transcribe/self-test")
        assert resp.status_code == 200
        body = resp.json()
        assert body["ok"] is True
        assert body["webm_ok"] is False

    @pytest.mark.asyncio
    async def test_transcribe_self_test_failure(self, client: AsyncClient):
        fail_payload = {"ok": False, "stage": "model", "message": "broken"}
        with patch("homeward_gateway.api.routes.run_voice_self_test", return_value=fail_payload):
            resp = await client.get("/api/v1/chat/transcribe/self-test")
        assert resp.status_code == 503

    @pytest.mark.asyncio
    async def test_transcribe_self_test_rejects_lan(self, client: AsyncClient):
        resp = await client.get(
            "/api/v1/chat/transcribe/self-test",
            headers={"X-Homeward-Client-Ip": "192.168.1.42"},
        )
        assert resp.status_code == 403


class TestFixtureResolution:
    def test_editable_checkout_finds_repo_fixtures(self):
        flac = resolve_fixture("jfk-sample.flac")
        webm = resolve_fixture("jfk-sample.webm")
        assert flac.is_file()
        assert webm.is_file()
        assert flac.stat().st_size > 0
        assert webm.stat().st_size > 0

    def test_installed_layout_uses_package_fixtures(self, tmp_path: Path):
        voice = tmp_path / "homeward_gateway" / "voice"
        packaged = tmp_path / "homeward_gateway" / "fixtures"
        voice.mkdir(parents=True)
        packaged.mkdir()
        target = packaged / "jfk-sample.flac"
        target.write_bytes(b"packaged-flac")
        fake_module = voice / "transcribe.py"
        fake_module.write_text("")

        path = resolve_fixture("jfk-sample.flac", module_file=fake_module)
        assert path == target
        assert path.read_bytes() == b"packaged-flac"

    def test_installed_layout_does_not_use_site_packages_tests(self, tmp_path: Path):
        """Regression: parents[2]/tests/fixtures is wrong after pip install."""
        site = tmp_path / "site-packages"
        voice = site / "homeward_gateway" / "voice"
        packaged = site / "homeward_gateway" / "fixtures"
        wrong = site / "tests" / "fixtures"
        voice.mkdir(parents=True)
        packaged.mkdir()
        wrong.mkdir(parents=True)
        (packaged / "jfk-sample.flac").write_bytes(b"packaged")
        (wrong / "jfk-sample.flac").write_bytes(b"wrong")
        fake_module = voice / "transcribe.py"
        fake_module.write_text("")

        path = resolve_fixture("jfk-sample.flac", module_file=fake_module)
        assert path.read_bytes() == b"packaged"
        assert path.parent.name == "fixtures"


class TestTranscriptMatch:
    def test_normalize_strips_punctuation_and_case(self):
        assert (
            normalize_transcript("Ask not, what your country can do for you.")
            == SELF_TEST_SNIPPET
        )
        assert normalize_transcript("ASK NOT — what your country can do for you!") == (
            SELF_TEST_SNIPPET
        )

    def test_punctuation_drift_matches(self):
        assert transcript_matches_self_test(
            "Ask not, what your country can do for you — ask what you can do for your country."
        )
        assert transcript_matches_self_test(
            "And so, my fellow Americans: ask not what your country can do for you."
        )
        assert transcript_matches_self_test(SELF_TEST_SNIPPET.upper())

    def test_garbage_transcripts_do_not_match(self):
        assert not transcript_matches_self_test("and so electroc")
        assert not transcript_matches_self_test("Mr. oceans, Senator")
        assert not transcript_matches_self_test("")
        assert not transcript_matches_self_test("   ")


class TestWebmDecode:
    def test_transcribe_bytes_writes_complete_temp_file(self):
        seen: dict[str, object] = {}

        def fake_transcribe(path: Path, *, vad_filter=None) -> str:
            seen["exists"] = path.is_file()
            seen["data"] = path.read_bytes()
            seen["suffix"] = path.suffix
            seen["vad_filter"] = vad_filter
            return "ok"

        with patch("homeward_gateway.voice.transcribe.transcribe_file", side_effect=fake_transcribe):
            result = transcribe_bytes(b"webm-bytes-here", suffix=".webm")

        assert result == "ok"
        assert seen["exists"] is True
        assert seen["data"] == b"webm-bytes-here"
        assert seen["suffix"] == ".webm"

    def test_transcribe_retries_without_vad_when_empty(self):
        dummy = np.zeros(WHISPER_SAMPLE_RATE, dtype=np.float32)
        dummy[100:400] = 0.2

        class FakeModel:
            def __init__(self) -> None:
                self.calls: list[bool] = []

            def transcribe(self, source, language="en", beam_size=1, vad_filter=True, **kwargs):
                self.calls.append(vad_filter)
                self.kwargs = kwargs
                if vad_filter:
                    return [], None

                class _Seg:
                    text = "ask not what your country can do for you"

                return [_Seg()], None

        fake = FakeModel()
        with (
            patch("homeward_gateway.voice.transcribe.ensure_model"),
            patch("homeward_gateway.voice.transcribe._model", fake),
            patch("homeward_gateway.voice.transcribe.decode_audio_16k_mono", return_value=dummy),
        ):
            text = transcribe_file(Path("speech.webm"))

        assert SELF_TEST_SNIPPET in text
        assert fake.calls == [True, False]
        assert fake.kwargs.get("temperature") == 0.0
        assert fake.kwargs.get("condition_on_previous_text") is False

    def test_live_transcribe_does_not_retry_vad_on_nonempty_garbage(self):
        """Kid mic path must not reinterpret a nonempty (even wrong) transcript."""

        class FakeModel:
            def __init__(self) -> None:
                self.calls: list[bool] = []

            def transcribe(self, source, language="en", beam_size=1, vad_filter=True, **kwargs):
                self.calls.append(vad_filter)

                class _Seg:
                    text = "and so electroc"

                return [_Seg()], None

        fake = FakeModel()
        dummy = np.zeros(WHISPER_SAMPLE_RATE, dtype=np.float32)
        dummy[100:400] = 0.2
        with (
            patch("homeward_gateway.voice.transcribe.ensure_model"),
            patch("homeward_gateway.voice.transcribe._model", fake),
            patch("homeward_gateway.voice.transcribe.decode_audio_16k_mono", return_value=dummy),
        ):
            text = transcribe_file(Path("speech.webm"))

        assert text == "and so electroc"
        assert fake.calls == [True]

    def test_decode_retries_once_when_ffmpeg_stdout_empty(self):
        class Proc:
            def __init__(self, stdout: bytes) -> None:
                self.stdout = stdout

        calls: list[list[str]] = []

        def fake_run(cmd, check=True, capture_output=True):
            calls.append(list(cmd))
            if len(calls) == 1:
                return Proc(b"")
            return Proc(b"\x00\x10" * 32)

        with (
            patch("homeward_gateway.voice.transcribe.shutil.which", return_value="/usr/bin/ffmpeg"),
            patch("homeward_gateway.voice.transcribe.subprocess.run", side_effect=fake_run),
        ):
            audio = decode_audio_16k_mono(Path("clip.webm"))

        assert len(calls) == 2
        assert "-vn" in calls[0]
        assert audio is not None
        assert audio.size == 32

    @pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not installed")
    @pytest.mark.skipif(not SELF_TEST_WEBM_FIXTURE.is_file(), reason="webm fixture missing")
    def test_webm_fixture_decodes_to_16k_mono_speech(self):
        audio = decode_audio_16k_mono(SELF_TEST_WEBM_FIXTURE)
        assert audio is not None
        assert audio.ndim == 1
        assert audio.size >= WHISPER_SAMPLE_RATE * 5
        rms = float(np.sqrt(np.mean(np.square(audio))))
        assert rms > 0.01


PUNCTUATED_JFK = (
    "Ask not, what your country can do for you — ask what you can do for your country."
)
GARBAGE_WEBM = "and so electroc"


class TestVoiceSelfTest:
    def test_accepts_punctuated_flac_and_webm(self):
        with (
            patch("homeward_gateway.voice.transcribe.whisper_available", return_value=True),
            patch("homeward_gateway.voice.transcribe.ensure_model"),
            patch(
                "homeward_gateway.voice.transcribe.transcribe_file",
                return_value=PUNCTUATED_JFK,
            ) as flac,
            patch(
                "homeward_gateway.voice.transcribe.transcribe_bytes",
                return_value=PUNCTUATED_JFK,
            ) as webm,
        ):
            result = run_voice_self_test()

        assert result["ok"] is True
        assert result["webm_ok"] is True
        assert result["text"] == PUNCTUATED_JFK
        flac.assert_called_once()
        webm.assert_called_once()

    def test_retries_webm_decode_without_vad_then_succeeds(self):
        def fake_bytes(data, suffix=".webm", *, vad_filter=None):
            if vad_filter is False:
                return PUNCTUATED_JFK
            return GARBAGE_WEBM

        with (
            patch("homeward_gateway.voice.transcribe.whisper_available", return_value=True),
            patch("homeward_gateway.voice.transcribe.ensure_model"),
            patch(
                "homeward_gateway.voice.transcribe.transcribe_file",
                return_value=PUNCTUATED_JFK,
            ),
            patch(
                "homeward_gateway.voice.transcribe.transcribe_bytes",
                side_effect=fake_bytes,
            ) as webm,
        ):
            result = run_voice_self_test()

        assert result["ok"] is True
        assert result["webm_ok"] is True
        assert webm.call_count == 2
        assert webm.call_args.kwargs.get("vad_filter") is False

    def test_webm_mismatch_after_retry_is_soft_warn(self):
        with (
            patch("homeward_gateway.voice.transcribe.whisper_available", return_value=True),
            patch("homeward_gateway.voice.transcribe.ensure_model"),
            patch(
                "homeward_gateway.voice.transcribe.transcribe_file",
                return_value=PUNCTUATED_JFK,
            ),
            patch(
                "homeward_gateway.voice.transcribe.transcribe_bytes",
                return_value=GARBAGE_WEBM,
            ) as webm,
        ):
            result = run_voice_self_test()

        assert result["ok"] is True
        assert result["webm_ok"] is False
        assert result["webm_text"] == GARBAGE_WEBM
        assert "WebM" in result["message"]
        assert webm.call_count == 2

    def test_flac_mismatch_after_retry_is_hard_fail(self):
        def fake_file(path, *, vad_filter=None):
            return GARBAGE_WEBM

        with (
            patch("homeward_gateway.voice.transcribe.whisper_available", return_value=True),
            patch("homeward_gateway.voice.transcribe.ensure_model"),
            patch(
                "homeward_gateway.voice.transcribe.transcribe_file",
                side_effect=fake_file,
            ) as flac,
            patch("homeward_gateway.voice.transcribe.transcribe_bytes"),
        ):
            result = run_voice_self_test()

        assert result["ok"] is False
        assert result["stage"] == "transcribe"
        assert flac.call_count == 2

    def test_overlapping_self_tests_do_not_interleave(self):
        in_flight = 0
        max_in_flight = 0
        gate = threading.Lock()

        def fake_file(path, *, vad_filter=None):
            nonlocal in_flight, max_in_flight
            with gate:
                in_flight += 1
                max_in_flight = max(max_in_flight, in_flight)
            time.sleep(0.05)
            with gate:
                in_flight -= 1
            return PUNCTUATED_JFK

        with (
            patch("homeward_gateway.voice.transcribe.whisper_available", return_value=True),
            patch("homeward_gateway.voice.transcribe.ensure_model"),
            patch(
                "homeward_gateway.voice.transcribe.transcribe_file",
                side_effect=fake_file,
            ),
            patch(
                "homeward_gateway.voice.transcribe.transcribe_bytes",
                return_value=PUNCTUATED_JFK,
            ),
        ):
            results: list[dict] = []

            def worker() -> None:
                results.append(run_voice_self_test())

            threads = [threading.Thread(target=worker) for _ in range(4)]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join()

        assert max_in_flight == 1
        assert len(results) == 4
        assert all(item["ok"] and item["webm_ok"] for item in results)


@pytest.mark.skipif(not whisper_available(), reason="faster-whisper not installed")
@pytest.mark.skipif(not SELF_TEST_FIXTURE.is_file(), reason="speech fixture missing")
class TestTranscribeIntegration:
    @pytest.mark.slow
    def test_run_voice_self_test(self):
        result = run_voice_self_test()
        assert result["ok"] is True
        assert transcript_matches_self_test(result["text"])
        assert result["webm_ok"] is True

    @pytest.mark.slow
    def test_transcribe_fixture_flac(self):
        text = transcribe_file(Path(SELF_TEST_FIXTURE))
        assert transcript_matches_self_test(text)

    @pytest.mark.slow
    @pytest.mark.skipif(not SELF_TEST_WEBM_FIXTURE.is_file(), reason="webm fixture missing")
    def test_transcribe_fixture_webm(self):
        text = transcribe_bytes(SELF_TEST_WEBM_FIXTURE.read_bytes(), suffix=".webm")
        assert transcript_matches_self_test(text)
