#!/usr/bin/env python3
"""Advertise homeward.local on the local network via mDNS (Bonjour)."""

from __future__ import annotations

import socket
import sys


def lan_ip() -> str:
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        probe.connect(("8.8.8.8", 80))
        return probe.getsockname()[0]
    finally:
        probe.close()


def main() -> int:
    try:
        from zeroconf import ServiceInfo, Zeroconf
    except ImportError:
        print(
            "Install zeroconf first: pip install zeroconf",
            file=sys.stderr,
        )
        return 1

    ip = lan_ip()
    hostname = "homeward.local."
    port = 43123

    info = ServiceInfo(
        "_http._tcp.local.",
        "Homeward._http._tcp.local.",
        addresses=[socket.inet_aton(ip)],
        port=port,
        properties={"path": "/chat"},
        server=hostname,
    )

    zc = Zeroconf()
    zc.register_service(info)
    print(f"Broadcasting http://homeward.local:{port} → {ip} (Ctrl+C to stop)")
    try:
        while True:
            import time

            time.sleep(3600)
    except KeyboardInterrupt:
        pass
    finally:
        zc.unregister_service(info)
        zc.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
