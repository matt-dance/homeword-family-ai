"""Local voice transcription tests."""

from pathlib import Path
from unittest.mock import patch

import pytest
from httpx import AsyncClient

from homeward_gateway.voice.transcribe import (
    SELF_TEST_FIXTURE,
    SELF_TEST_SNIPPET,
    run_voice_self_test,
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
