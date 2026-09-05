"""Tests for mDNS helpers."""

from homeward_gateway.network import mdns


def test_homeward_url_omits_port_80():
    assert mdns.homeward_url() == "http://homeward.local"
    assert mdns.homeward_url("homeward.local", 43123) == "http://homeward.local:43123"


def test_lan_ip_returns_string_or_none():
    ip = mdns.lan_ip()
    assert ip is None or ("." in ip and not ip.startswith("127."))


def test_pick_lan_ip_prefers_wifi_over_vpn_utun():
    adapters = [
        ("lo0", ["127.0.0.1"]),
        ("utun4", ["10.255.1.2"]),
        ("en0", ["192.168.68.58"]),
    ]
    assert mdns.pick_lan_ip(adapters) == "192.168.68.58"


def test_pick_lan_ip_skips_link_local_and_loopback():
    adapters = [
        ("lo0", ["127.0.0.1"]),
        ("en0", ["169.254.10.20"]),
        ("en1", ["192.168.1.40"]),
    ]
    assert mdns.pick_lan_ip(adapters) == "192.168.1.40"


def test_pick_lan_ip_returns_none_when_only_tunnels():
    adapters = [
        ("lo0", ["127.0.0.1"]),
        ("utun0", ["10.255.1.2"]),
        ("utun4", ["10.8.0.2"]),
    ]
    assert mdns.pick_lan_ip(adapters) is None


def test_is_tunnel_iface_detects_common_vpn_names():
    assert mdns.is_tunnel_iface("utun4")
    assert mdns.is_tunnel_iface("tun0")
    assert mdns.is_tunnel_iface("ipsec0")
    assert mdns.is_tunnel_iface("wg0")
    assert not mdns.is_tunnel_iface("en0")
    assert not mdns.is_tunnel_iface("eth0")
    assert not mdns.is_tunnel_iface("wlan0")
