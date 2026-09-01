"""Password reset and recovery code tests."""

import pytest
from httpx import AsyncClient

from homeward_gateway.auth.recovery import generate_recovery_code, normalize_recovery_code, verify_recovery_code
from homeward_gateway.auth.recovery import hash_recovery_code
from tests.conftest import DEFAULT_PASSWORD, setup_parent


class TestRecoveryCodeHelpers:
    def test_generate_recovery_code_format(self):
        code = generate_recovery_code()
        assert code.startswith("HOME-")
        assert len(normalize_recovery_code(code)) == 16

    def test_normalize_strips_separators(self):
        assert normalize_recovery_code("home-abcd-efgh-jkmn") == "HOMEABCDEFGHJKMN"

    def test_hash_and_verify(self):
        code = generate_recovery_code()
        stored = hash_recovery_code(code)
        assert verify_recovery_code(code, stored)
        assert not verify_recovery_code("HOME-XXXX-YYYY-ZZZZ", stored)


class TestPasswordResetAPI:
    @pytest.mark.asyncio
    async def test_setup_returns_recovery_code(self, client: AsyncClient):
        resp = await client.post("/api/v1/setup", json={"password": DEFAULT_PASSWORD})
        assert resp.status_code == 200
        data = resp.json()
        assert data["recovery_code"].startswith("HOME-")

    @pytest.mark.asyncio
    async def test_reset_password_with_recovery_code(self, client: AsyncClient):
        setup = await client.post("/api/v1/setup", json={"password": DEFAULT_PASSWORD})
        recovery_code = setup.json()["recovery_code"]
        new_password = "newpass456"

        reset = await client.post(
            "/api/v1/auth/reset-password",
            json={"recovery_code": recovery_code, "new_password": new_password},
        )
        assert reset.status_code == 200
        assert reset.json()["recovery_code"].startswith("HOME-")

        login_old = await client.post("/api/v1/auth/login", json={"password": DEFAULT_PASSWORD})
        assert login_old.status_code == 401

        login_new = await client.post("/api/v1/auth/login", json={"password": new_password})
        assert login_new.status_code == 200

    @pytest.mark.asyncio
    async def test_reset_rejects_invalid_code(self, client: AsyncClient):
        await setup_parent(client)
        resp = await client.post(
            "/api/v1/auth/reset-password",
            json={"recovery_code": "HOME-XXXX-YYYY-ZZZZ", "new_password": "newpass456"},
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_change_password_when_authenticated(self, client: AsyncClient):
        await setup_parent(client)
        resp = await client.post(
            "/api/v1/auth/change-password",
            json={"current_password": DEFAULT_PASSWORD, "new_password": "changed789"},
        )
        assert resp.status_code == 200

        login = await client.post("/api/v1/auth/login", json={"password": "changed789"})
        assert login.status_code == 200

    @pytest.mark.asyncio
    async def test_change_password_rejects_wrong_current(self, client: AsyncClient):
        await setup_parent(client)
        resp = await client.post(
            "/api/v1/auth/change-password",
            json={"current_password": "wrongpass", "new_password": "changed789"},
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_me_includes_recovery_status(self, client: AsyncClient):
        await setup_parent(client)
        resp = await client.get("/api/v1/auth/me")
        assert resp.status_code == 200
        assert resp.json()["has_recovery_code"] is True
