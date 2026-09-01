"""Local read-aloud (Piper TTS) tests."""

from unittest.mock import patch

import pytest
from httpx import AsyncClient

from homeward_gateway.voice.speak import (
    SELF_TEST_PHRASE,
    build_word_timings,
    piper_available,
    run_speak_self_test,
    sanitize_for_speech,
    synthesize_speech,
)


class TestSpeakAPI:
    @pytest.mark.asyncio
    async def test_speak_status(self, client: AsyncClient):
        resp = await client.get("/api/v1/chat/speak/status")
        assert resp.status_code == 200
        data = resp.json()
        assert "available" in data
        assert "voice" in data
        assert "synced_highlighting" in data

    @pytest.mark.asyncio
    async def test_speak_text_mocked(self, client: AsyncClient):
        payload = {
            "audio_base64": "UklGRi4=",
            "words": [{"word": "Hello", "start": 0.0, "end": 0.4}],
            "duration": 0.4,
        }
        with patch("homeward_gateway.api.routes.synthesize_speech_payload", return_value=payload):
            resp = await client.post(
                "/api/v1/chat/speak",
                json={"text": "Hello stars"},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["words"][0]["word"] == "Hello"
        assert "audio_base64" in data

    @pytest.mark.asyncio
    async def test_speak_empty_text(self, client: AsyncClient):
        resp = await client.post("/api/v1/chat/speak", json={"text": "🤘"})
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_speak_self_test_mocked(self, client: AsyncClient):
        ok_payload = {
            "ok": True,
            "voice": "en_US-lessac-medium",
            "bytes": 120000,
            "word_count": 5,
            "synced_highlighting": True,
            "message": "ok",
        }
        with patch("homeward_gateway.api.routes.run_speak_self_test", return_value=ok_payload):
            resp = await client.get("/api/v1/chat/speak/self-test")
        assert resp.status_code == 200
        assert resp.json()["ok"] is True


class TestSpeakHelpers:
    def test_sanitize_for_speech_strips_emoji(self):
        assert sanitize_for_speech("Rock and roll 🤘 yeah") == "Rock and roll yeah"

    def test_sanitize_for_speech_empty(self):
        assert sanitize_for_speech("🤘✨") == ""

    def test_build_word_timings_groups_by_spaces(self):
        class Align:
            def __init__(self, phoneme, num_samples):
                self.phoneme = phoneme
                self.num_samples = num_samples

        class Chunk:
            sample_rate = 22050
            phoneme_alignments = [
                Align("h", 1000),
                Align(" ", 500),
                Align("w", 1000),
            ]

        timings = build_word_timings("hi world", [Chunk()])
        assert len(timings) == 2
        assert timings[0]["word"] == "hi"
        assert timings[0]["end"] == pytest.approx(1000 / 22050)
        assert timings[1]["word"] == "world"
        assert timings[1]["start"] == pytest.approx(1500 / 22050)


@pytest.mark.skipif(not piper_available(), reason="piper-tts not installed")
class TestSpeakIntegration:
    @pytest.mark.slow
    def test_run_speak_self_test(self):
        result = run_speak_self_test()
        assert result["ok"] is True
        assert result["word_count"] > 0
        assert result["synced_highlighting"] is True

    @pytest.mark.slow
    def test_synthesize_speech_includes_word_timings(self):
        result = synthesize_speech(SELF_TEST_PHRASE)
        assert result["audio_wav"][:4] == b"RIFF"
        assert len(result["words"]) >= 4
        assert result["words"][0]["start"] == 0.0
        assert result["duration"] > 0
