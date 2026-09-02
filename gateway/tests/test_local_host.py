"""Host-only parent surface: locality detection and route gating."""

import pytest
from fastapi import HTTPException
from httpx import AsyncClient
from starlette.requests import Request

from homeward_gateway.auth.local_host import (
    client_ip_from_request,
    is_local_client,
    is_local_request,
    is_loopback,
    require_local_request,
    server_interface_ips,
)
from tests.conftest import DEFAULT_PASSWORD, create_child, setup_parent

LAN_HEADERS = {"X-Homeward-Client-Host": "homeward.local", "X-Homeward-Client-Ip": "192.168.1.99"}


def _request(headers: dict | None = None, client_host: str = "127.0.0.1") -> Request:
    scope = {
        "type": "http",
        "headers": [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()],
        "client": (client_host, 0),
        "method": "GET",
        "path": "/",
        "query_string": b"",
        "server": ("test", 80),
        "scheme": "http",
    }
    return Request(scope)


class TestLocalHostHelpers:
    def test_is_loopback(self):
        assert is_loopback("127.0.0.1")
        assert is_loopback("localhost")
        assert is_loopback("::1")
        assert is_loopback("::ffff:127.0.0.1")
        assert not is_loopback("homeward.local")
        assert not is_loopback("192.168.1.10")

    def test_is_local_client_same_machine(self):
        sample = next(iter(server_interface_ips()))
        assert is_local_client(sample)
        assert not is_local_client("")

    def test_proxy_forwarded_lan_ip_is_remote(self):
        req = _request(LAN_HEADERS, client_host="127.0.0.1")
        assert is_local_request(req) is False
        assert client_ip_from_request(req) == "192.168.1.99"

    def test_proxy_forwarded_same_machine_ip_is_local(self):
        sample = next(iter(server_interface_ips()))
        req = _request({"X-Homeward-Client-Ip": sample}, client_host="127.0.0.1")
        assert is_local_request(req) is True

    def test_proxy_forwarded_loopback_host_is_local(self):
        req = _request({"X-Homeward-Client-Host": "localhost"}, client_host="127.0.0.1")
        assert is_local_request(req) is True

    def test_lan_peer_cannot_spoof_headers(self):
        """A device talking to the gateway port directly is judged by its TCP peer only."""
        spoofed = {"X-Homeward-Client-Ip": "127.0.0.1", "X-Homeward-Client-Host": "localhost"}
        req = _request(spoofed, client_host="192.168.1.50")
        assert is_local_request(req) is False
        assert client_ip_from_request(req) == "192.168.1.50"

    def test_loopback_peer_without_headers_is_local(self):
        assert is_local_request(_request(client_host="127.0.0.1")) is True

    def test_require_local_request_raises(self):
        with pytest.raises(HTTPException) as exc:
            require_local_request(_request(client_host="192.168.1.2"))
        assert exc.value.status_code == 403


class TestParentSurfaceIsHostOnly:
    @pytest.mark.asyncio
    async def test_login_rejected_from_lan(self, client: AsyncClient):
        await setup_parent(client)
        resp = await client.post(
            "/api/v1/auth/login", json={"password": DEFAULT_PASSWORD}, headers=LAN_HEADERS
        )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_setup_rejected_from_lan(self, client: AsyncClient):
        resp = await client.post("/api/v1/setup", json={"password": DEFAULT_PASSWORD}, headers=LAN_HEADERS)
        assert resp.status_code == 403

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "method, path, body",
        [
            ("GET", "/api/v1/children", None),
            ("POST", "/api/v1/children", {"name": "Zed", "age": 8, "strictness": 3}),
            ("GET", "/api/v1/dashboard/sessions", None),
            ("GET", "/api/v1/dashboard/blocked", None),
            ("GET", "/api/v1/settings/advanced", None),
            ("POST", "/api/v1/settings/advanced", {"ai_tone": "warm"}),
            ("GET", "/api/v1/settings/home-location", None),
            ("POST", "/api/v1/ollama/pull", {"model": "llama3.2:3b"}),
            ("GET", "/api/v1/ollama/status", None),
            ("GET", "/api/v1/ollama/recommendations", None),
            ("GET", "/api/v1/auth/me", None),
            ("POST", "/api/v1/auth/logout", None),
        ],
    )
    async def test_parent_routes_reject_lan_even_with_cookie(
        self, client: AsyncClient, method: str, path: str, body: dict | None
    ):
        await setup_parent(client)  # client now holds a valid parent cookie
        resp = await client.request(method, path, json=body, headers=LAN_HEADERS)
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_dashboard_allows_same_machine(self, client: AsyncClient):
        await setup_parent(client)
        await create_child(client)
        ip = next(iter(server_interface_ips()))
        resp = await client.get(
            "/api/v1/dashboard/sessions",
            headers={"X-Homeward-Client-Host": "homeward.local", "X-Homeward-Client-Ip": ip},
        )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_dashboard_sessions_filter_by_child(self, client: AsyncClient):
        await setup_parent(client)
        first = await create_child(client, name="Alex")
        second = await create_child(client, name="Sam")
        resp = await client.get(f"/api/v1/dashboard/sessions?child_id={first['id']}")
        assert resp.status_code == 200
        assert second["id"] not in {item["child_id"] for item in resp.json()}

    @pytest.mark.asyncio
    async def test_kid_routes_stay_open_on_lan(self, client: AsyncClient):
        await setup_parent(client)
        child = await create_child(client)
        public = await client.get("/api/v1/children/public", headers=LAN_HEADERS)
        assert public.status_code == 200
        starters = await client.get(f"/api/v1/children/{child['id']}/starters", headers=LAN_HEADERS)
        assert starters.status_code == 200
        session = await client.post(
            "/api/v1/chat/sessions", json={"child_id": child["id"]}, headers=LAN_HEADERS
        )
        assert session.status_code == 200
