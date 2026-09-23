"""Tests for mDNS helpers."""

from homeward_gateway.config import settings
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


def test_lan_ip_prefers_sidecar_published_address(tmp_path, monkeypatch):
    path = tmp_path / "lan_ip"
    path.write_text("192.168.1.40\n")
    monkeypatch.setenv("HOMEWARD_LAN_IP_FILE", str(path))
    monkeypatch.setattr(mdns, "_probe_namespace_ip", lambda: "172.18.0.2")
    assert mdns.lan_ip() == "192.168.1.40"


def test_lan_ip_skips_docker_bridge_probe_without_sidecar(monkeypatch):
    original = settings.docker_mode
    monkeypatch.setattr(mdns, "published_lan_ip", lambda: None)
    monkeypatch.setattr(mdns, "_probe_namespace_ip", lambda: "172.18.0.2")
    try:
        settings.docker_mode = True
        assert mdns.lan_ip() is None
    finally:
        settings.docker_mode = original


def test_publish_lan_ip_round_trip(tmp_path, monkeypatch):
    path = tmp_path / "lan_ip"
    monkeypatch.setenv("HOMEWARD_LAN_IP_FILE", str(path))
    mdns.publish_lan_ip("10.0.0.12")
    assert mdns.published_lan_ip() == "10.0.0.12"
    mdns.publish_lan_ip("127.0.0.1")
    assert mdns.published_lan_ip() == "10.0.0.12"
