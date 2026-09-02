"""Tests for default profile resolution and advanced settings."""

import pytest
from httpx import AsyncClient

from tests.conftest import DEFAULT_PASSWORD, create_child, setup_parent


class TestDefaultProfile:
    @pytest.mark.asyncio
    async def test_default_profile_public(self, client: AsyncClient):
        await setup_parent(client)
        child = await create_child(client, name="Sam", age=10)
        resp = await client.get("/api/v1/children/default")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == child["id"]
        assert data["is_default"] is True

    @pytest.mark.asyncio
    async def test_public_list_marks_default(self, client: AsyncClient):
        await setup_parent(client)
        child = await create_child(client, name="Sam", age=10)
        login = await client.post("/api/v1/auth/login", json={"password": DEFAULT_PASSWORD})
        assert login.status_code == 200
        await client.post(
            "/api/v1/settings/advanced",
            json={"default_profile_child_id": child["id"]},
        )
        resp = await client.get("/api/v1/children/public")
        assert resp.status_code == 200
        profiles = resp.json()
        default = [p for p in profiles if p["is_default"]]
        assert len(default) == 1
        assert default[0]["id"] == child["id"]


class TestAdvancedSettings:
    @pytest.mark.asyncio
    async def test_get_and_update_advanced_settings(self, client: AsyncClient):
        await setup_parent(client)
        child = await create_child(client, name="Emma", age=8)
        login = await client.post("/api/v1/auth/login", json={"password": DEFAULT_PASSWORD})
        assert login.status_code == 200

        get_resp = await client.get("/api/v1/settings/advanced")
        assert get_resp.status_code == 200
        assert get_resp.json()["classifier_enabled"] is True

        post_resp = await client.post(
            "/api/v1/settings/advanced",
            json={
                "default_profile_child_id": child["id"],
                "classifier_enabled": False,
                "ai_tone": "concise",
                "ai_verbosity": 2,
            },
        )
        assert post_resp.status_code == 200
        data = post_resp.json()
        assert data["default_profile_child_id"] == child["id"]
        assert data["classifier_enabled"] is False
        assert data["ai_tone"] == "concise"
        assert data["ai_verbosity"] == 2
