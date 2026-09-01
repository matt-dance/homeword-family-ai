#!/usr/bin/env bash
# Automated voice pipeline smoke test — no microphone required.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GATEWAY_URL="${GATEWAY_URL:-http://127.0.0.1:8000}"

echo "== Homeward voice self-test =="
echo "Gateway: $GATEWAY_URL"

status_code="$(curl -s -o /tmp/homeward-voice-self-test.json -w "%{http_code}" \
  "$GATEWAY_URL/api/v1/chat/transcribe/self-test")"

cat /tmp/homeward-voice-self-test.json
echo

if [[ "$status_code" != "200" ]]; then
  echo "Voice self-test FAILED (HTTP $status_code)" >&2
  exit 1
fi

python3 - <<'PY'
import json, sys
data = json.load(open("/tmp/homeward-voice-self-test.json"))
if not data.get("ok"):
    sys.exit("Voice self-test reported ok=false")
print("Voice self-test PASSED")
print("Sample transcript:", (data.get("text") or "")[:80], "...")
PY

echo
echo "== Gateway pytest (voice tests) =="
cd "$ROOT/gateway"
export HOMEWARD_DATA_DIR="${HOMEWARD_DATA_DIR:-./data}"
export HOMEWARD_POLICIES_DIR="${HOMEWARD_POLICIES_DIR:-../policies}"
python3 -m pytest tests/test_transcribe.py -v --tb=short -m "not slow"
