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
if data.get("word_count", 0) < 1:
    sys.exit("Read-aloud self-test missing word timings")
print("Read-aloud self-test PASSED")
print("Word timings:", data.get("word_count"))
PY

echo
echo "== Speak endpoint returns synced payload =="
curl -s -o /tmp/homeward-speak-sample.json -w "HTTP:%{http_code}\n" \
  -X POST "$GATEWAY_URL/api/v1/chat/speak" \
  -H "Content-Type: application/json" \
  -d '{"text":"Rock and roll is great."}'

python3 - <<'PY'
import base64, json, os, sys
data = json.load(open("/tmp/homeward-speak-sample.json"))
words = data.get("words") or []
audio = base64.b64decode(data.get("audio_base64") or "")
if len(audio) < 1000:
    sys.exit(f"Speak sample too small: {len(audio)} bytes")
if audio[:4] != b"RIFF":
    sys.exit("Speak sample is not a WAV file")
if len(words) < 3:
    sys.exit(f"Expected word timings, got {len(words)}")
if words[0].get("start") != 0:
    sys.exit("First word should start at 0")
print("Speak endpoint PASSED with", len(words), "synced words")
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
