"""Tests for mDNS helpers."""

from homeward_gateway.network import mdns


def test_homeward_url_omits_port_80():
    assert mdns.homeward_url() == "http://homeward.local"
    assert mdns.homeward_url("homeward.local", 43123) == "http://homeward.local:43123"


def test_lan_ip_returns_string_or_none():
    ip = mdns.lan_ip()
    assert ip is None or ("." in ip and not ip.startswith("127."))
