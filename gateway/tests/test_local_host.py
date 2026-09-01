"""Tests for local-host detection."""

import pytest
from fastapi import HTTPException
from httpx import AsyncClient
from starlette.requests import Request

from homeward_gateway.auth.local_host import (
    is_local_client,
    is_local_host,
    is_local_request,
    require_local_request,
    server_interface_ips,
)
from tests.conftest import create_child, setup_parent


def _request(
    headers: dict | None = None,
    client_host: str = "127.0.0.1",
) -> Request:
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
    def test_is_local_host(self):
        assert is_local_host("127.0.0.1") is True
        assert is_local_host("localhost") is True
        assert is_local_host("homeward.local") is False
        assert is_local_host("192.168.1.10") is False

    def test_is_local_client_loopback(self):
        assert is_local_client("127.0.0.1") is True

    def test_is_local_client_same_machine(self):
        ips = server_interface_ips()
        sample = next(iter(ips))
        assert is_local_client(sample) is True

    def test_is_local_request_from_client_ip_header(self):
        req = _request(
            {"X-Homeward-Client-Ip": "192.168.55.100", "X-Homeward-Client-Host": "homeward.local"},
            client_host="127.0.0.1",
        )
        assert is_local_request(req) is False

    def test_is_local_request_same_machine_via_lan_ip(self):
        ips = server_interface_ips()
        sample = next(iter(ips))
        req = _request(
            {"X-Homeward-Client-Ip": sample, "X-Homeward-Client-Host": "homeward.local"},
            client_host="127.0.0.1",
        )
        assert is_local_request(req) is True

    def test_require_local_request_raises(self):
        with pytest.raises(HTTPException) as exc:
            require_local_request(_request(client_host="192.168.1.2"))
        assert exc.value.status_code == 403


class TestDashboardLocalHost:
    @pytest.mark.asyncio
    async def test_dashboard_sessions_rejects_remote(self, client: AsyncClient):
        await setup_parent(client)
        await create_child(client)
        resp = await client.get(
            "/api/v1/dashboard/sessions",
            headers={
                "X-Homeward-Client-Host": "homeward.local",
                "X-Homeward-Client-Ip": "192.168.1.99",
            },
        )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_dashboard_sessions_allows_same_machine(self, client: AsyncClient):
        await setup_parent(client)
        await create_child(client)
        ip = next(iter(server_interface_ips()))
        resp = await client.get(
            "/api/v1/dashboard/sessions",
            headers={
                "X-Homeward-Client-Host": "homeward.local",
                "X-Homeward-Client-Ip": ip,
            },
        )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_dashboard_sessions_filter_by_child(self, client: AsyncClient):
        await setup_parent(client)
        first = await create_child(client, name="Alex")
        second = await create_child(client, name="Sam")
        ip = next(iter(server_interface_ips()))
        resp = await client.get(
            f"/api/v1/dashboard/sessions?child_id={first['id']}",
            headers={"X-Homeward-Client-Ip": ip},
        )
        assert resp.status_code == 200
        for item in resp.json():
            assert item["child_id"] == first["id"]
        assert second["id"] not in {item["child_id"] for item in resp.json()}
