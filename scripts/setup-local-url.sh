#!/usr/bin/env bash
# Optional helper: map homeward.local on this computer via /etc/hosts.
# Install does not run this. On this computer use http://localhost for setup
# and the dashboard. Kids on Wi-Fi use http://homeward.local/chat (mDNS).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOSTNAME="homeward.local"
PORT="${HOMEWARD_PORT:-80}"

homeward_url() {
  if [[ "${PORT}" == "80" ]]; then
    echo "http://${HOSTNAME}"
  else
    echo "http://${HOSTNAME}:${PORT}"
  fi
}

lan_ip() {
  ipconfig getifaddr en0 2>/dev/null \
    || ipconfig getifaddr en1 2>/dev/null \
    || hostname -I 2>/dev/null | awk '{print $1}' \
    || echo ""
}

LAN_IP="$(lan_ip)"

echo "Homeward local URL setup"
echo "========================"
echo ""

# 1) Host machine: prefer loopback so the parent dashboard stays on this computer.
if grep -qE "[[:space:]]${HOSTNAME}([[:space:]]|$)" /etc/hosts 2>/dev/null; then
  echo "✓ ${HOSTNAME} already in /etc/hosts"
else
  echo "Adding 127.0.0.1 ${HOSTNAME} to /etc/hosts (admin password required)..."
  echo "127.0.0.1 ${HOSTNAME}" | sudo tee -a /etc/hosts >/dev/null
  echo "✓ /etc/hosts updated on this computer"
fi

echo ""

# 2) Network: mDNS is started automatically when the gateway runs.
echo "mDNS: homeward.local is broadcast automatically when the gateway starts."
if [[ -n "${LAN_IP}" ]]; then
  echo "This computer's LAN IP: ${LAN_IP}"
  echo "Other devices on Wi‑Fi can use: $(homeward_url)/chat"
else
  echo "Could not detect LAN IP — ensure the gateway is running on Wi‑Fi."
fi

echo ""
echo "On this computer:  $(homeward_url)"
echo "Kid chat (any device on Wi‑Fi): $(homeward_url)/chat"
echo "Parent dashboard: only works on this computer"
