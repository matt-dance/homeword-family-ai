#!/usr/bin/env bash
# Make homeward.local work on this computer AND for other devices on your Wi‑Fi.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOSTNAME="homeward.local"
PORT=43123

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

# 2) Network: mDNS so phones/tablets can open homeward.local too.
if [[ -n "${LAN_IP}" ]]; then
  echo "This computer's LAN IP: ${LAN_IP}"
else
  echo "Could not detect LAN IP — mDNS may still work once you are on Wi‑Fi."
fi

if command -v avahi-publish >/dev/null 2>&1 && [[ -n "${LAN_IP}" ]]; then
  echo ""
  echo "Starting mDNS (Avahi) in the background..."
  pkill -f "avahi-publish -a ${HOSTNAME}" 2>/dev/null || true
  nohup avahi-publish -a "${HOSTNAME}" "${LAN_IP}" >/tmp/homeward-mdns.log 2>&1 &
  echo "✓ Other devices on your network can use: http://${HOSTNAME}:${PORT}"
elif [[ -f "${ROOT}/gateway/.venv/bin/python" ]]; then
  echo ""
  echo "Installing zeroconf (one time) and starting mDNS broadcaster..."
  "${ROOT}/gateway/.venv/bin/pip" install -q zeroconf
  pkill -f "publish-mdns.py" 2>/dev/null || true
  nohup "${ROOT}/gateway/.venv/bin/python" "${ROOT}/scripts/publish-mdns.py" >/tmp/homeward-mdns.log 2>&1 &
  sleep 1
  echo "✓ Other devices on your network can use: http://${HOSTNAME}:${PORT}"
else
  echo ""
  echo "To enable homeward.local on other devices, run in a separate terminal:"
  echo "  pip install zeroconf && python3 ${ROOT}/scripts/publish-mdns.py"
  echo "Or install Avahi and run:"
  echo "  avahi-publish -a ${HOSTNAME} ${LAN_IP:-YOUR-LAN-IP}"
fi

echo ""
echo "On this computer:  http://${HOSTNAME}:${PORT}"
echo "Kid chat (any device on Wi‑Fi): http://${HOSTNAME}:${PORT}/chat"
echo "Parent dashboard: only works on this computer"
