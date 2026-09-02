"""Authentication unit and API tests."""

import hashlib

import pytest
from httpx import AsyncClient

from homeward_gateway.auth import rate_limit
from homeward_gateway.auth.parent_auth import (
    create_session_token,
    decode_session_token,
    hash_password,
    password_needs_rehash,
    verify_password,
)
from homeward_gateway.config import settings
from tests.conftest import DEFAULT_PASSWORD, setup_parent


class TestPasswordHashing:
    def test_hash_and_verify_success(self):
        stored = hash_password("secret-password")
        assert stored.startswith("pbkdf2_sha256$")
        assert verify_password("secret-password", stored)
        assert not verify_password("wrong-password", stored)

    def test_verify_rejects_malformed_hash(self):
        assert not verify_password("secret-password", "not-a-valid-hash")
        assert not verify_password("secret-password", "pbkdf2_sha256$oops")

    def test_hashes_are_unique(self):
        assert hash_password("same-password") != hash_password("same-password")

    def test_legacy_sha256_hash_still_verifies_and_is_flagged(self):
        salt = "abcd" * 8
        legacy = f"{salt}:{hashlib.sha256((salt + 'old-pass').encode()).hexdigest()}"
        assert verify_password("old-pass", legacy)
        assert not verify_password("nope", legacy)
        assert password_needs_rehash(legacy)
        assert not password_needs_rehash(hash_password("old-pass"))


class TestSessionTokens:
    def test_create_and_decode_token(self):
        token = create_session_token(42)
        assert decode_session_token(token) == 42

    def test_decode_rejects_tampered_token(self):
        token = create_session_token(42)
        assert decode_session_token(token + "tampered") is None


class TestAuthAPI:
    @pytest.mark.asyncio
    async def test_me_requires_auth(self, client: AsyncClient):
        resp = await client.get("/api/v1/auth/me")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_me_returns_parent_info(self, client: AsyncClient):
        await setup_parent(client)
        resp = await client.get("/api/v1/auth/me")
        assert resp.status_code == 200
        data = resp.json()
        assert data["setup_complete"] is False
        assert data["has_recovery_code"] is True

    @pytest.mark.asyncio
    async def test_session_cookie_is_httponly(self, client: AsyncClient):
        resp = await client.post("/api/v1/setup", json={"password": DEFAULT_PASSWORD})
        cookie = resp.headers.get("set-cookie", "")
        assert settings.session_cookie_name in cookie
        assert "httponly" in cookie.lower()
        assert "samesite=lax" in cookie.lower()

    @pytest.mark.asyncio
    async def test_logout_clears_session(self, client: AsyncClient):
        await setup_parent(client)
        assert (await client.get("/api/v1/auth/me")).status_code == 200

        await client.post("/api/v1/auth/login", json={"password": DEFAULT_PASSWORD})
        logout = await client.post("/api/v1/auth/logout")
        assert logout.status_code == 200

        me = await client.get("/api/v1/auth/me")
        assert me.status_code == 401

    @pytest.mark.asyncio
    async def test_login_reports_setup_complete(self, client: AsyncClient):
        await setup_parent(client)
        await client.post("/api/v1/setup/complete")

        resp = await client.post("/api/v1/auth/login", json={"password": DEFAULT_PASSWORD})
        assert resp.status_code == 200
        assert resp.json()["setup_complete"] is True

    @pytest.mark.asyncio
    async def test_login_is_rate_limited(self, client: AsyncClient):
        await setup_parent(client)
        rate_limit._attempts.clear()
        for _ in range(rate_limit._MAX_ATTEMPTS):
            resp = await client.post("/api/v1/auth/login", json={"password": "wrong-password"})
            assert resp.status_code == 401
        locked = await client.post("/api/v1/auth/login", json={"password": DEFAULT_PASSWORD})
        assert locked.status_code == 429
        rate_limit._attempts.clear()

    @pytest.mark.asyncio
    async def test_protected_dashboard_requires_auth(self, client: AsyncClient):
        resp = await client.get("/api/v1/dashboard/sessions")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_ollama_pull_requires_auth(self, client: AsyncClient):
        resp = await client.post("/api/v1/ollama/pull", json={"model": "llama3.2:3b"})
        assert resp.status_code == 401
