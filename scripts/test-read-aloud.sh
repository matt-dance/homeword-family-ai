#!/usr/bin/env bash
# Automated read-aloud smoke test — no speakers or browser required.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GATEWAY_URL="${GATEWAY_URL:-http://127.0.0.1:8000}"

echo "== Homeward read-aloud self-test =="
echo "Gateway: $GATEWAY_URL"

status_code="$(curl -s -o /tmp/homeward-speak-self-test.json -w "%{http_code}" \
  "$GATEWAY_URL/api/v1/chat/speak/self-test")"

cat /tmp/homeward-speak-self-test.json
echo

if [[ "$status_code" != "200" ]]; then
  echo "Read-aloud self-test FAILED (HTTP $status_code)" >&2
  exit 1
fi

python3 - <<'PY'
import json, sys
data = json.load(open("/tmp/homeward-speak-self-test.json"))
if not data.get("ok"):
    sys.exit("Read-aloud self-test reported ok=false")
print("Read-aloud self-test PASSED")
print("Audio bytes:", data.get("bytes"))
PY

echo
echo "== Speak endpoint returns WAV =="
curl -s -o /tmp/homeward-speak-sample.wav -w "HTTP:%{http_code} SIZE:%{size_download}\n" \
  -X POST "$GATEWAY_URL/api/v1/chat/speak" \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello from Homeward read aloud."}'

python3 - <<'PY'
import os, sys
path = "/tmp/homeward-speak-sample.wav"
size = os.path.getsize(path)
if size < 1000:
    sys.exit(f"Speak sample too small: {size} bytes")
if open(path, "rb").read(4) != b"RIFF":
    sys.exit("Speak sample is not a WAV file")
print("Speak endpoint PASSED")
PY

echo
echo "== Gateway pytest (read-aloud tests) =="
cd "$ROOT/gateway"
export HOMEWARD_DATA_DIR="${HOMEWARD_DATA_DIR:-./data}"
export HOMEWARD_POLICIES_DIR="${HOMEWARD_POLICIES_DIR:-../policies}"
python3 -m pytest tests/test_speak.py -v --tb=short -m "not slow"

echo
echo "== Web vitest (read-aloud unit tests) =="
cd "$ROOT/web"
npm run test:read-aloud
