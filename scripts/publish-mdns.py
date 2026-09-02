#!/usr/bin/env python3
"""Advertise homeward.local on the local network via mDNS (Bonjour)."""

from homeward_gateway.network.mdns import main

if __name__ == "__main__":
    main()
