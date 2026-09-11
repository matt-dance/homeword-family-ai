"""Local read-aloud (Piper TTS) tests."""

import os
from unittest.mock import patch

import pytest
from httpx import AsyncClient

from homeward_gateway.voice.speak import (
    SELF_TEST_PHRASE,
    ensure_espeak_data_path,
    piper_available,
    resolve_espeak_data_path,
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

    @pytest.mark.asyncio
    async def test_speak_text_mocked(self, client: AsyncClient):
        payload = {"audio_base64": "UklGRi4=", "duration": 0.4}
        with patch("homeward_gateway.api.routes.synthesize_speech_payload", return_value=payload):
            resp = await client.post(
                "/api/v1/chat/speak",
                json={"text": "Hello stars"},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["audio_base64"] == "UklGRi4="
        assert data["duration"] == 0.4

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
            "duration": 2.5,
            "message": "ok",
        }
        with patch("homeward_gateway.api.routes.run_speak_self_test", return_value=ok_payload):
            resp = await client.get("/api/v1/chat/speak/self-test")
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    @pytest.mark.asyncio
    async def test_speak_self_test_rejects_lan(self, client: AsyncClient):
        resp = await client.get(
            "/api/v1/chat/speak/self-test",
            headers={"X-Homeward-Client-Ip": "192.168.1.42"},
        )
        assert resp.status_code == 403


class TestEspeakDataPath:
    def test_resolve_keeps_existing_env(self, tmp_path, monkeypatch):
        data = tmp_path / "custom-espeak"
        data.mkdir()
        (data / "phontab").write_bytes(b"x")
        monkeypatch.setenv("ESPEAK_DATA_PATH", str(data))
        assert resolve_espeak_data_path() == data

    def test_resolve_uses_espeak_share_sibling(self, tmp_path, monkeypatch):
        root = tmp_path / "espeak"
        bin_dir = root / "bin"
        data = root / "share" / "espeak-ng-data"
        bin_dir.mkdir(parents=True)
        data.mkdir(parents=True)
        (data / "phontab").write_bytes(b"x")
        binary = bin_dir / "espeak-ng"
        binary.write_text("#!/bin/sh\n")
        binary.chmod(0o755)
        monkeypatch.delenv("ESPEAK_DATA_PATH", raising=False)
        monkeypatch.setenv("PATH", str(bin_dir))
        assert resolve_espeak_data_path() == data

    def test_ensure_sets_process_env(self, tmp_path, monkeypatch):
        root = tmp_path / "espeak"
        bin_dir = root / "bin"
        data = root / "share" / "espeak-ng-data"
        bin_dir.mkdir(parents=True)
        data.mkdir(parents=True)
        (data / "phontab").write_bytes(b"x")
        binary = bin_dir / "espeak-ng"
        binary.write_text("#!/bin/sh\n")
        binary.chmod(0o755)
        monkeypatch.delenv("ESPEAK_DATA_PATH", raising=False)
        monkeypatch.setenv("PATH", str(bin_dir))
        assert ensure_espeak_data_path() == data
        assert os.environ["ESPEAK_DATA_PATH"] == str(data)


class TestSpeakHelpers:
    def test_sanitize_for_speech_strips_emoji(self):
        assert sanitize_for_speech("Rock and roll 🤘 yeah") == "Rock and roll yeah"

    def test_sanitize_for_speech_strips_markdown(self):
        assert sanitize_for_speech("## Dogs\nThey are **loyal**.") == "Dogs They are loyal."

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
    def test_synthesize_speech_returns_wav(self):
        result = synthesize_speech(SELF_TEST_PHRASE)
        assert result["audio_wav"][:4] == b"RIFF"
        assert result["duration"] > 0
