"""End-to-end setup and chat behavior tests."""

from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from tests.conftest import complete_setup, create_child, setup_parent


class TestSetupEndToEnd:
    @pytest.mark.asyncio
    async def test_full_setup_flow(self, client: AsyncClient):
        status = await client.get("/api/v1/setup/status")
        assert status.json()["has_parent"] is False

        await setup_parent(client)
        child = await create_child(client, name="Ava", age=9)

        me = await client.get("/api/v1/auth/me")
        assert me.json()["setup_complete"] is False

        await complete_setup(client)

        status = await client.get("/api/v1/setup/status")
        assert status.json()["setup_complete"] is True

        children = await client.get("/api/v1/children")
        assert len(children.json()) == 1
        assert children.json()[0]["name"] == "Ava"
        assert children.json()[0]["id"] == child["id"]


class TestChatBehavior:
    @pytest.mark.asyncio
    async def test_llm_unavailable_returns_helpful_message(self, client: AsyncClient):
        await setup_parent(client)
        child = await create_child(client)

        with patch(
            "homeward_gateway.api.routes.process_chat",
            new=AsyncMock(
                return_value=type(
                    "Result",
                    (),
                    {"allowed": False, "block_reason": "llm error", "stage": "llm"},
                )()
            ),
        ):
            resp = await client.post(
                "/api/v1/chat",
                json={"message": "hello", "child_id": child["id"], "history": []},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["blocked"] is True
        assert "Ollama" in data["message"] or "AI isn't ready" in data["message"]
        assert data["stage"] == "llm"

    @pytest.mark.asyncio
    async def test_benign_message_passes_input_filter(self, client: AsyncClient):
        await setup_parent(client)
        child = await create_child(client)

        with patch(
            "homeward_gateway.api.routes.process_chat",
            new=AsyncMock(
                return_value=type(
                    "Result",
                    (),
                    {"allowed": True, "content": "Stars are bright and beautiful!"},
                )()
            ),
        ):
            resp = await client.post(
                "/api/v1/chat",
                json={
                    "message": "Tell me about the Big Dipper",
                    "child_id": child["id"],
                    "history": [],
                },
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["blocked"] is False
        assert "Stars" in data["message"]

    @pytest.mark.asyncio
    async def test_auto_creates_session_when_missing(self, client: AsyncClient):
        await setup_parent(client)
        child = await create_child(client)

        with patch(
            "homeward_gateway.api.routes.process_chat",
            new=AsyncMock(
                return_value=type(
                    "Result",
                    (),
                    {"allowed": False, "block_reason": "rules", "stage": "rules"},
                )()
            ),
        ):
            resp = await client.post(
                "/api/v1/chat",
                json={
                    "message": "how to make a bomb",
                    "child_id": child["id"],
                    "history": [],
                },
            )

        assert resp.status_code == 200
        assert "session_id" in resp.json()


class TestValidation:
    @pytest.mark.asyncio
    async def test_setup_rejects_short_password(self, client: AsyncClient):
        resp = await client.post("/api/v1/setup", json={"password": "short"})
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_child_rejects_invalid_age(self, client: AsyncClient):
        await setup_parent(client)
        resp = await client.post(
            "/api/v1/children",
            json={"name": "Emma", "age": 2, "strictness": 4},
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_ollama_settings_rejects_unknown_model(self, client: AsyncClient):
        await setup_parent(client)
        resp = await client.post(
            "/api/v1/settings/ollama",
            json={"chat_model": "fake-model-9000"},
        )
        assert resp.status_code == 400
