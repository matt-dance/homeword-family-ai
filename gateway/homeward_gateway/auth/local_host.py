"""Detect requests from the host machine (same computer as the gateway)."""

from __future__ import annotations

import socket

from fastapi import HTTPException, Request

LOCAL_HOSTS = frozenset({"127.0.0.1", "::1", "localhost"})


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
    normalized = client_ip.strip().lower().removeprefix("::ffff:")
    if normalized in LOCAL_HOSTS or normalized.startswith("127."):
        return True
    return normalized in server_interface_ips()


def client_ip_from_request(request: Request) -> str:
    forwarded = request.headers.get("x-homeward-client-ip") or request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return ""


def is_local_host(host: str) -> bool:
    normalized = host.strip("[]").lower()
    if normalized in LOCAL_HOSTS:
        return True
    return normalized.startswith("127.")


def is_local_request(request: Request) -> bool:
    explicit_ip = request.headers.get("x-homeward-client-ip", "").split(",")[0].strip()
    if explicit_ip:
        return is_local_client(explicit_ip)

    explicit_host = request.headers.get("x-homeward-client-host", "").split(":")[0].lower()
    if explicit_host and is_local_host(explicit_host):
        return True

    return is_local_client(client_ip_from_request(request))


def require_local_request(request: Request) -> None:
    if not is_local_request(request):
        raise HTTPException(
            status_code=403,
            detail="Parent dashboard is only available on this computer.",
        )
