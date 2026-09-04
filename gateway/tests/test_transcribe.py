"""Local voice transcription tests."""

import shutil
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
    resolve_fixture,
    run_voice_self_test,
    transcribe_bytes,
    transcribe_file,
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


class TestWebmDecode:
    def test_transcribe_bytes_writes_complete_temp_file(self):
        seen: dict[str, object] = {}

        def fake_transcribe(path: Path) -> str:
            seen["exists"] = path.is_file()
            seen["data"] = path.read_bytes()
            seen["suffix"] = path.suffix
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

            def transcribe(self, source, language="en", beam_size=1, vad_filter=True):
                self.calls.append(vad_filter)
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

    @pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not installed")
    @pytest.mark.skipif(not SELF_TEST_WEBM_FIXTURE.is_file(), reason="webm fixture missing")
    def test_webm_fixture_decodes_to_16k_mono_speech(self):
        audio = decode_audio_16k_mono(SELF_TEST_WEBM_FIXTURE)
        assert audio is not None
        assert audio.ndim == 1
        assert audio.size >= WHISPER_SAMPLE_RATE * 5
        rms = float(np.sqrt(np.mean(np.square(audio))))
        assert rms > 0.01


@pytest.mark.skipif(not whisper_available(), reason="faster-whisper not installed")
@pytest.mark.skipif(not SELF_TEST_FIXTURE.is_file(), reason="speech fixture missing")
class TestTranscribeIntegration:
    @pytest.mark.slow
    def test_run_voice_self_test(self):
        result = run_voice_self_test()
        assert result["ok"] is True
        assert SELF_TEST_SNIPPET in result["text"].lower()
        assert result["webm_ok"] is True

    @pytest.mark.slow
    def test_transcribe_fixture_flac(self):
        text = transcribe_file(Path(SELF_TEST_FIXTURE))
        assert SELF_TEST_SNIPPET in text.lower()

    @pytest.mark.slow
    @pytest.mark.skipif(not SELF_TEST_WEBM_FIXTURE.is_file(), reason="webm fixture missing")
    def test_transcribe_fixture_webm(self):
        text = transcribe_bytes(SELF_TEST_WEBM_FIXTURE.read_bytes(), suffix=".webm")
        assert SELF_TEST_SNIPPET in text.lower()
