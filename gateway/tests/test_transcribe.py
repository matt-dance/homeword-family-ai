"""Local voice transcription tests."""

from unittest.mock import patch

import pytest
from httpx import AsyncClient

from tests.conftest import create_child, setup_parent


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
