"""Local read-aloud (Piper TTS) tests."""

from unittest.mock import patch

import pytest
from httpx import AsyncClient

from homeward_gateway.voice.speak import (
    SELF_TEST_PHRASE,
    piper_available,
    run_speak_self_test,
    sanitize_for_speech,
    synthesize_wav_bytes,
)


class TestSpeakAPI:
    @pytest.mark.asyncio
    async def test_speak_status(self, client: AsyncClient):
        resp = await client.get("/api/v1/chat/speak/status")
        assert resp.status_code == 200
        data = resp.json()
        assert "available" in data
        assert "voice" in data

    @pytest.mark.asyncio
    async def test_speak_text_mocked(self, client: AsyncClient):
        fake_wav = b"RIFF" + b"\x00" * 100
        with patch("homeward_gateway.api.routes.synthesize_wav_bytes", return_value=fake_wav):
            resp = await client.post(
                "/api/v1/chat/speak",
                json={"text": "Hello stars"},
            )
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("audio/wav")
        assert resp.content == fake_wav

    @pytest.mark.asyncio
    async def test_speak_empty_text(self, client: AsyncClient):
        resp = await client.post("/api/v1/chat/speak", json={"text": "🤘"})
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_speak_self_test_mocked(self, client: AsyncClient):
        ok_payload = {"ok": True, "voice": "en_US-lessac-medium", "bytes": 120000, "message": "ok"}
        with patch("homeward_gateway.api.routes.run_speak_self_test", return_value=ok_payload):
            resp = await client.get("/api/v1/chat/speak/self-test")
        assert resp.status_code == 200
        assert resp.json()["ok"] is True


class TestSpeakHelpers:
    def test_sanitize_for_speech_strips_emoji(self):
        assert sanitize_for_speech("Rock and roll 🤘 yeah") == "Rock and roll yeah"

    def test_sanitize_for_speech_empty(self):
        assert sanitize_for_speech("🤘✨") == ""


@pytest.mark.skipif(not piper_available(), reason="piper-tts not installed")
class TestSpeakIntegration:
    @pytest.mark.slow
    def test_run_speak_self_test(self):
        result = run_speak_self_test()
        assert result["ok"] is True
        assert result["bytes"] > 1000

    @pytest.mark.slow
    def test_synthesize_wav_bytes(self):
        audio = synthesize_wav_bytes(SELF_TEST_PHRASE)
        assert audio[:4] == b"RIFF"
        assert len(audio) > 1000
