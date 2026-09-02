"""Advertise homeward.local on the LAN via mDNS (Bonjour)."""

from __future__ import annotations

import logging
import socket
import sys
import threading
import time
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from zeroconf import ServiceInfo, Zeroconf

logger = logging.getLogger(__name__)

_zc: Zeroconf | None = None
_info: ServiceInfo | None = None
_lock = threading.Lock()


def lan_ip() -> str | None:
    """Best-effort LAN IPv4 for mDNS."""
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        probe.connect(("8.8.8.8", 80))
        return probe.getsockname()[0]
    except OSError:
        return None
    finally:
        probe.close()


def homeward_url(hostname: str = "homeward.local", port: int = 80) -> str:
    if port == 80:
        return f"http://{hostname}"
    return f"http://{hostname}:{port}"


def start(hostname: str = "homeward.local", port: int = 80) -> bool:
    """Register homeward.local on the LAN. Safe to call more than once."""
    global _zc, _info

    with _lock:
        if _zc is not None:
            return True

        try:
            from zeroconf import ServiceInfo, Zeroconf
        except ImportError:
            logger.warning(
                "zeroconf not installed — homeward.local will not resolve on other devices. "
                "Install with: pip install zeroconf"
            )
            return False

        ip = lan_ip()
        if not ip:
            logger.warning("Could not detect LAN IP — mDNS not started")
            return False

        host = hostname if hostname.endswith(".") else f"{hostname}."
        _info = ServiceInfo(
            "_http._tcp.local.",
            "Homeward._http._tcp.local.",
            addresses=[socket.inet_aton(ip)],
            port=port,
            properties={"path": "/chat"},
            server=host,
        )
        _zc = Zeroconf()
        _zc.register_service(_info)
        logger.info(
            "mDNS broadcasting %s → %s (port %s)",
            homeward_url(hostname, port),
            ip,
            port,
        )
        return True


def stop() -> None:
    """Unregister mDNS service."""
    global _zc, _info

    with _lock:
        if _zc is None:
            return
        try:
            if _info is not None:
                _zc.unregister_service(_info)
        except Exception as exc:
            logger.debug("mDNS unregister: %s", exc)
        finally:
            _zc.close()
            _zc = None
            _info = None
            logger.info("mDNS broadcaster stopped")


def run_forever(hostname: str = "homeward.local", port: int = 80) -> int:
    """CLI entry: advertise until interrupted."""
    if not start(hostname, port):
        return 1
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        pass
    finally:
        stop()
    return 0


def main() -> None:
    import os

    hostname = os.environ.get("HOMEWARD_MDNS_HOSTNAME", "homeward.local")
    port = int(os.environ.get("HOMEWARD_MDNS_PORT", os.environ.get("HOMEWARD_PORT", "80")))
    raise SystemExit(run_forever(hostname, port))


if __name__ == "__main__":
    main()
