"""House join codes, device cookies, and QR join URLs."""

from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from homeward_gateway.auth import rate_limit
from homeward_gateway.config import settings
from homeward_gateway.db import database as db_module
from homeward_gateway.db.database import HouseCode
from homeward_gateway.network import mdns
from tests.conftest import create_child, setup_parent

LAN = {"X-Homeward-Client-Host": "homeward.local", "X-Homeward-Client-Ip": "192.168.1.42"}
LAN_IP = "192.168.10.20"


@pytest.fixture
def lan_join_ip(monkeypatch):
    monkeypatch.setattr("homeward_gateway.network.mdns.lan_ip", lambda: LAN_IP)
    monkeypatch.setattr("homeward_gateway.auth.pairing.lan_ip", lambda: LAN_IP)
    monkeypatch.setattr(settings, "web_port", 43123)
    return LAN_IP


class TestJoinUrl:
    def test_join_url_uses_ipv4_not_hostname(self):
        url = mdns.join_url("4821", ip="10.0.0.12", port=43123)
        assert url == "http://10.0.0.12:43123/join?code=4821"
        assert "homeward.local" not in url
        assert mdns.join_url("4821", ip="homeward.local", port=43123) is None
        assert mdns.join_url("4821", ip="127.0.0.1", port=43123) is None

    def test_join_url_omits_port_80(self):
        assert mdns.join_url("4821", ip="10.0.0.12", port=80) == "http://10.0.0.12/join?code=4821"


class TestPairingAPI:
    @pytest.mark.asyncio
    async def test_pairing_requires_parent_and_host(self, client: AsyncClient, lan_join_ip):
        resp = await client.get("/api/v1/pairing")
        assert resp.status_code == 401
        await setup_parent(client)
        lan = await client.get("/api/v1/pairing", headers=LAN)
        assert lan.status_code == 403

    @pytest.mark.asyncio
    async def test_good_code_sets_httponly_device_cookie(self, client: AsyncClient, lan_join_ip):
        await setup_parent(client)
        info = await client.get("/api/v1/pairing")
        assert info.status_code == 200
        body = info.json()
        code = body["house_code"]
        assert len(code) == 4 and code.isdigit()
        assert body["join_url"] == f"http://{lan_join_ip}:43123/join?code={code}"
        assert "homeward.local" not in body["join_url"]
        assert body["lan_ip"] == lan_join_ip

        rate_limit._attempts.clear()
        joined = await client.post(
            "/api/v1/pairing/join",
            json={"code": code},
            headers={**LAN, "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"},
        )
        assert joined.status_code == 200
        cookie = joined.headers.get("set-cookie", "")
        assert settings.device_cookie_name in cookie
        assert "httponly" in cookie.lower()
        assert "path=/" in cookie.lower()

        listed = await client.get("/api/v1/pairing")
        devices = listed.json()["devices"]
        assert len(devices) == 1
        assert devices[0]["label"] == "iPhone"

    @pytest.mark.asyncio
    async def test_bad_code_rejected(self, client: AsyncClient, lan_join_ip):
        await setup_parent(client)
        info = await client.get("/api/v1/pairing")
        code = info.json()["house_code"]
        wrong = "0000" if code != "0000" else "1111"
        rate_limit._attempts.clear()
        resp = await client.post("/api/v1/pairing/join", json={"code": wrong}, headers=LAN)
        assert resp.status_code == 403
        assert "set-cookie" not in resp.headers
        assert "PIN" not in resp.json()["detail"]
        assert "house code" in resp.json()["detail"].lower()
        malformed = await client.post("/api/v1/pairing/join", json={"code": "12ab"}, headers=LAN)
        assert malformed.status_code == 422

    @pytest.mark.asyncio
    async def test_expired_code_rejected(self, client: AsyncClient, lan_join_ip):
        await setup_parent(client)
        info = await client.get("/api/v1/pairing")
        code = info.json()["house_code"]
        past = datetime.now(timezone.utc) - timedelta(minutes=1)
        async with db_module.async_session_factory() as session:
            row = (await session.execute(select(HouseCode).order_by(HouseCode.id.desc()))).scalars().first()
            assert row is not None
            row.expires_at = past
            await session.commit()

        rate_limit._attempts.clear()
        resp = await client.post("/api/v1/pairing/join", json={"code": code}, headers=LAN)
        assert resp.status_code == 403
        assert "set-cookie" not in resp.headers

    @pytest.mark.asyncio
    async def test_rotated_code_dies_devices_keep_cookie(self, client: AsyncClient, lan_join_ip):
        await setup_parent(client)
        first = (await client.get("/api/v1/pairing")).json()
        old_code = first["house_code"]
        rate_limit._attempts.clear()
        joined = await client.post("/api/v1/pairing/join", json={"code": old_code}, headers=LAN)
        assert joined.status_code == 200
        device_id = joined.json()["device_id"]

        rotated = await client.post("/api/v1/pairing/rotate")
        assert rotated.status_code == 200
        new_code = rotated.json()["house_code"]
        assert new_code != old_code
        assert rotated.json()["join_url"].endswith(f"/join?code={new_code}")
        assert "homeward.local" not in rotated.json()["join_url"]
        assert any(d["id"] == device_id for d in rotated.json()["devices"])

        rate_limit._attempts.clear()
        stale = await client.post("/api/v1/pairing/join", json={"code": old_code}, headers=LAN)
        assert stale.status_code == 403

        listed = await client.get("/api/v1/pairing")
        assert any(d["id"] == device_id for d in listed.json()["devices"])

    @pytest.mark.asyncio
    async def test_forget_device(self, client: AsyncClient, lan_join_ip):
        await setup_parent(client)
        code = (await client.get("/api/v1/pairing")).json()["house_code"]
        rate_limit._attempts.clear()
        joined = await client.post("/api/v1/pairing/join", json={"code": code}, headers=LAN)
        device_id = joined.json()["device_id"]
        forgotten = await client.delete(f"/api/v1/pairing/devices/{device_id}")
        assert forgotten.status_code == 200
        listed = await client.get("/api/v1/pairing")
        assert listed.json()["devices"] == []
        missing = await client.delete(f"/api/v1/pairing/devices/{device_id}")
        assert missing.status_code == 404

    @pytest.mark.asyncio
    async def test_join_open_on_lan_chat_open_without_pairing(self, client: AsyncClient, lan_join_ip):
        await setup_parent(client)
        child = await create_child(client)
        session = await client.post(
            "/api/v1/chat/sessions", json={"child_id": child["id"]}, headers=LAN
        )
        assert session.status_code == 200
        code = (await client.get("/api/v1/pairing")).json()["house_code"]
        rate_limit._attempts.clear()
        joined = await client.post("/api/v1/pairing/join", json={"code": code}, headers=LAN)
        assert joined.status_code == 200

    @pytest.mark.asyncio
    async def test_rotate_and_join_are_not_named_pin(self, client: AsyncClient, lan_join_ip):
        await setup_parent(client)
        info = (await client.get("/api/v1/pairing")).json()
        assert "pin" not in info
        assert "house_code" in info
        rotate = (await client.post("/api/v1/pairing/rotate")).json()
        assert "pin" not in rotate
        assert "house_code" in rotate
