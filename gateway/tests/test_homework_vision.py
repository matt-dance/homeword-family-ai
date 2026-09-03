"""Parent-gated homework camera hint endpoint (TDD)."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from homeward_gateway.auth import rate_limit
from homeward_gateway.vision.homework import (
    EXPECTED_VISION_MODEL,
    HOMEWORK_VISION_PROMPT,
    IMAGE_SUFFIXES,
    MAX_IMAGE_BYTES,
    VISION_UNAVAILABLE_MESSAGE,
    generate_homework_hint,
    pick_vision_model,
    validate_image,
)
from tests.conftest import create_child, setup_parent

LAN = {"X-Homeward-Client-Ip": "192.168.1.42"}

# Minimal 1x1 PNG — used only in tests, never committed as a worksheet photo.
TINY_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00"
    b"\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
)


async def _homework_child(client: AsyncClient, *, pin: str | None = None) -> dict:
    await setup_parent(client)
    payload: dict = {
        "name": "Sam",
        "age": 10,
        "strictness": 3,
        "homework_mode": True,
    }
    if pin:
        payload["pin"] = pin
    resp = await client.post("/api/v1/children", json=payload)
    assert resp.status_code == 200
    return resp.json()


def _hint_files(data: bytes = TINY_PNG, filename: str = "worksheet.png", content_type: str = "image/png"):
    return {"image": (filename, data, content_type)}


class TestValidateImage:
    def test_accepts_png_magic_and_type(self):
        validate_image(TINY_PNG, "image/png", "worksheet.png")

    def test_rejects_empty(self):
        with pytest.raises(ValueError, match="empty"):
            validate_image(b"", "image/png", "worksheet.png")

    def test_rejects_oversized(self):
        blob = b"\x89PNG" + b"x" * (MAX_IMAGE_BYTES + 1)
        with pytest.raises(ValueError, match="too large"):
            validate_image(blob, "image/png", "worksheet.png")

    def test_rejects_unknown_type(self):
        with pytest.raises(ValueError, match="image"):
            validate_image(TINY_PNG, "application/pdf", "notes.pdf")

    def test_rejects_non_image_suffix(self):
        with pytest.raises(ValueError, match="image"):
            validate_image(b"%PDF-1.4", "application/pdf", "hw.pdf")

    def test_known_suffixes_are_images(self):
        assert ".png" in IMAGE_SUFFIXES
        assert ".jpg" in IMAGE_SUFFIXES
        assert ".webp" in IMAGE_SUFFIXES


class TestPickVisionModel:
    def test_prefers_expected_llava(self):
        assert pick_vision_model(["llama3.2:3b", "llava:7b"]) == EXPECTED_VISION_MODEL

    def test_accepts_alias(self):
        assert pick_vision_model(["moondream:latest"]) == "moondream:latest"

    def test_none_when_only_text_models(self):
        assert pick_vision_model(["llama3.2:3b", "mistral:7b"]) is None


class TestHomeworkVisionPrompt:
    def test_guides_without_giving_answers(self):
        lowered = HOMEWORK_VISION_PROMPT.lower()
        assert "hint" in lowered
        assert "final answer" in lowered
        assert EXPECTED_VISION_MODEL == "llava:7b"

    @pytest.mark.asyncio
    async def test_generate_sends_image_in_memory_only(self, tmp_path, monkeypatch):
        captured: dict = {}

        class FakeResponse:
            status_code = 200

            def json(self):
                return {"response": "What number do you start with?"}

        class FakeClient:
            def __init__(self, *args, **kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, *args):
                return False

            async def post(self, url, json):
                captured["url"] = url
                captured["json"] = json
                return FakeResponse()

        monkeypatch.setattr("homeward_gateway.vision.homework.httpx.AsyncClient", FakeClient)

        async def fake_url():
            return "http://127.0.0.1:11434"

        monkeypatch.setattr(
            "homeward_gateway.vision.homework.ollama_service.resolved_ollama_url",
            fake_url,
        )

        hint = await generate_homework_hint(
            image_bytes=TINY_PNG,
            model="llava:7b",
            question="problem 2",
        )
        assert "start with" in hint
        assert "images" in captured["json"]
        assert isinstance(captured["json"]["images"][0], str)
        leftover = list(tmp_path.iterdir())
        assert leftover == []


class TestHomeworkHintAPI:
    @pytest.mark.asyncio
    async def test_status_requires_homework_mode(self, client: AsyncClient):
        await setup_parent(client)
        child = await create_child(client)
        resp = await client.get(f"/api/v1/chat/homework/status?child_id={child['id']}")
        assert resp.status_code == 403
        assert "homework" in resp.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_status_ok_when_homework_mode_on(self, client: AsyncClient):
        child = await _homework_child(client)
        with patch(
            "homeward_gateway.vision.homework.list_installed_models",
            new=AsyncMock(return_value=[]),
        ):
            resp = await client.get(f"/api/v1/chat/homework/status?child_id={child['id']}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["homework_mode"] is True
        assert data["available"] is False
        assert data["expected_model"] == EXPECTED_VISION_MODEL
        assert "vision model" in (data["message"] or "").lower()

    @pytest.mark.asyncio
    async def test_hint_requires_homework_mode(self, client: AsyncClient):
        await setup_parent(client)
        child = await create_child(client)
        resp = await client.post(
            "/api/v1/chat/homework/hint",
            data={"child_id": child["id"]},
            files=_hint_files(),
        )
        assert resp.status_code == 403
        assert "homework" in resp.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_hint_requires_pin_unlock(self, client: AsyncClient):
        child = await _homework_child(client, pin="1234")
        resp = await client.post(
            "/api/v1/chat/homework/hint",
            data={"child_id": child["id"]},
            files=_hint_files(),
            headers=LAN,
        )
        assert resp.status_code == 403
        assert "pin" in resp.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_hint_rejects_oversized_image(self, client: AsyncClient):
        child = await _homework_child(client)
        huge = b"\x89PNG" + b"x" * (MAX_IMAGE_BYTES + 10)
        resp = await client.post(
            "/api/v1/chat/homework/hint",
            data={"child_id": child["id"]},
            files=_hint_files(huge),
        )
        assert resp.status_code == 400
        assert "large" in resp.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_hint_rejects_non_image_type(self, client: AsyncClient):
        child = await _homework_child(client)
        resp = await client.post(
            "/api/v1/chat/homework/hint",
            data={"child_id": child["id"]},
            files=_hint_files(b"%PDF-1.4 fake", "notes.pdf", "application/pdf"),
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_hint_without_vision_model_returns_clear_message(self, client: AsyncClient):
        child = await _homework_child(client)
        with patch(
            "homeward_gateway.api.homework_routes.generate_homework_hint",
            new=AsyncMock(),
        ) as mocked:
            with patch(
                "homeward_gateway.api.homework_routes.list_installed_models",
                new=AsyncMock(return_value=["llama3.2:3b"]),
            ):
                resp = await client.post(
                    "/api/v1/chat/homework/hint",
                    data={"child_id": child["id"]},
                    files=_hint_files(),
                    headers=LAN,
                )
        assert resp.status_code == 200
        data = resp.json()
        assert data["vision_available"] is False
        assert data["model"] is None
        assert VISION_UNAVAILABLE_MESSAGE in data["hint"]
        mocked.assert_not_called()

    @pytest.mark.asyncio
    async def test_hint_with_mocked_vision_returns_guiding_hint(self, client: AsyncClient):
        child = await _homework_child(client)
        with patch(
            "homeward_gateway.api.homework_routes.list_installed_models",
            new=AsyncMock(return_value=["llava:7b"]),
        ), patch(
            "homeward_gateway.api.homework_routes.generate_homework_hint",
            new=AsyncMock(return_value="Look at the first number. What do you add next?"),
        ) as mocked:
            resp = await client.post(
                "/api/v1/chat/homework/hint",
                data={"child_id": child["id"], "question": "I'm stuck on problem 2"},
                files=_hint_files(),
                headers=LAN,
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["vision_available"] is True
        assert data["model"] == "llava:7b"
        assert "add next" in data["hint"]
        assert "final answer" not in data["hint"].lower()
        mocked.assert_awaited_once()
        kwargs = mocked.await_args.kwargs
        assert kwargs["image_bytes"] == TINY_PNG
        assert "problem 2" in kwargs["question"]
        # Never persist — call is in-memory bytes only.
        assert "path" not in kwargs

    @pytest.mark.asyncio
    async def test_hint_is_rate_limited_like_transcribe(self, client: AsyncClient):
        child = await _homework_child(client)
        rate_limit._attempts.clear()
        for _ in range(rate_limit._MAX_ATTEMPTS):
            resp = await client.post(
                "/api/v1/chat/homework/hint",
                data={"child_id": child["id"]},
                files=_hint_files(b"", "empty.png", "image/png"),
            )
            assert resp.status_code == 400
        locked = await client.post(
            "/api/v1/chat/homework/hint",
            data={"child_id": child["id"]},
            files=_hint_files(),
        )
        assert locked.status_code == 429

    @pytest.mark.asyncio
    async def test_hint_reachable_from_lan_not_parent_only(self, client: AsyncClient):
        child = await _homework_child(client)
        with patch(
            "homeward_gateway.api.homework_routes.list_installed_models",
            new=AsyncMock(return_value=[]),
        ):
            resp = await client.post(
                "/api/v1/chat/homework/hint",
                data={"child_id": child["id"]},
                files=_hint_files(),
                headers=LAN,
            )
        assert resp.status_code == 200
        assert "vision model" in resp.json()["hint"].lower()

    @pytest.mark.asyncio
    async def test_unknown_child_is_404(self, client: AsyncClient):
        await setup_parent(client)
        resp = await client.post(
            "/api/v1/chat/homework/hint",
            data={"child_id": 9999},
            files=_hint_files(),
        )
        assert resp.status_code == 404
