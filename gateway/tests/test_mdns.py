"""Tests for mDNS helpers."""

from homeward_gateway.network import mdns


def test_homeward_url_omits_port_80():
    assert mdns.homeward_url() == "http://homeward.local"
    assert mdns.homeward_url("homeward.local", 43123) == "http://homeward.local:43123"


def test_join_url_never_uses_mdns_hostname():
    url = mdns.join_url("4821", ip="192.168.1.10", port=43123)
    assert url == "http://192.168.1.10:43123/join?code=4821"
    assert mdns.join_url("4821", ip="homeward.local", port=80) is None


def test_lan_ip_returns_string_or_none():
    ip = mdns.lan_ip()
    assert ip is None or ("." in ip and not ip.startswith("127."))
