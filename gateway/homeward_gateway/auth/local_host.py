"""Detect requests from the host machine (same computer as the gateway).

The parent dashboard is host-only. Kid chat is open to the home LAN.

The web app proxies browser requests to the gateway and forwards the real
client address in ``X-Homeward-Client-Ip``. Those headers are only trusted
when the request actually comes from the proxy; a LAN device talking to the
gateway port directly cannot claim to be the host by adding headers.
"""

from __future__ import annotations

import socket

from fastapi import HTTPException, Request

from homeward_gateway.config import settings

LOOPBACK_HOSTS = frozenset({"127.0.0.1", "::1", "localhost"})


def _normalize_ip(value: str) -> str:
    return value.strip().strip("[]").lower().removeprefix("::ffff:")


def is_loopback(value: str) -> bool:
    normalized = _normalize_ip(value)
    return normalized in LOOPBACK_HOSTS or normalized.startswith("127.")


def server_interface_ips() -> set[str]:
    """IPv4 addresses assigned to this machine."""
    ips = {"127.0.0.1"}
    try:
        probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        probe.connect(("8.8.8.8", 80))
        ips.add(probe.getsockname()[0])
        probe.close()
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ips.add(info[4][0])
    except OSError:
        pass
    return ips


def is_local_client(client_ip: str) -> bool:
    if not client_ip:
        return False
    if is_loopback(client_ip):
        return True
    return _normalize_ip(client_ip) in server_interface_ips()


def peer_ip(request: Request) -> str:
    return request.client.host if request.client and request.client.host else ""


def _peer_is_trusted_proxy(request: Request) -> bool:
    # Native: the Next.js proxy runs on this machine, so it connects over loopback.
    # Docker: the gateway port is not published, so every peer is the web container.
    return settings.docker_mode or is_loopback(peer_ip(request))


def client_ip_from_request(request: Request) -> str:
    """Real client address: proxy-forwarded when trusted, otherwise the TCP peer."""
    if _peer_is_trusted_proxy(request):
        forwarded = request.headers.get("x-homeward-client-ip", "")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return peer_ip(request)


def is_local_request(request: Request) -> bool:
    if _peer_is_trusted_proxy(request):
        forwarded = request.headers.get("x-homeward-client-ip", "")
        if forwarded:
            return is_local_client(forwarded.split(",")[0])
        host = request.headers.get("x-homeward-client-host", "").split(":")[0]
        if host:
            return is_loopback(host)
    return is_local_client(peer_ip(request))


def require_local_request(request: Request) -> None:
    if not is_local_request(request):
        raise HTTPException(
            status_code=403,
            detail="Parent dashboard is only available on this computer.",
        )
