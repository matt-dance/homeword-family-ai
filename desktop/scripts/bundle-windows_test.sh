#!/usr/bin/env bash
# Skip-downloads layout checks for the Windows payload + Inno Setup script.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$ROOT/desktop/scripts/bundle-windows.sh"
EXE_SCRIPT="$ROOT/desktop/scripts/exe-windows.sh"
ISS="$ROOT/desktop/pack/homeward.iss"

test -x "$SCRIPT"
test -x "$EXE_SCRIPT"
test -f "$ISS"
test -f "$ROOT/desktop/pack/windows-smartscreen.txt"

"$SCRIPT" --help | grep -q "Homeward-windows"
"$EXE_SCRIPT" --help | grep -q "Homeward-windows-amd64.exe"
"$EXE_SCRIPT" --help | grep -q "Inno Setup"

# amd64 only
if HOMEWARD_BUNDLE_SKIP_DOWNLOADS=1 "$SCRIPT" arm64 >/dev/null 2>&1; then
  echo "bundle-windows.sh arm64 should fail (amd64 only)" >&2
  exit 1
fi

# Inno Setup must be a per-user wizard that writes HKCU Run, warns about
# SmartScreen, and never binds port 80 or ships model weights.
grep -q 'PrivilegesRequired=lowest' "$ISS"
grep -q '{localappdata}\\Programs\\Homeward' "$ISS"
grep -q 'Software\\Microsoft\\Windows\\CurrentVersion\\Run' "$ISS"
grep -q 'Homeward-windows-amd64' "$ISS"
grep -q 'windows-smartscreen.txt' "$ISS"
grep -q '43123' "$ROOT/desktop/pack/windows-smartscreen.txt"
if grep -qiE 'port 80|port-80|:80[^0-9]' "$ISS" "$ROOT/desktop/pack/windows-smartscreen.txt"; then
  echo "Windows installer must not advertise port 80" >&2
  exit 1
fi
if grep -qiE 'llama3\.2:3b|ollama pull|/blobs/sha256' "$ISS" "$SCRIPT"; then
  echo "Windows packer must not embed chat model weights" >&2
  exit 1
fi
grep -q 'ollama-windows-amd64.zip' "$SCRIPT"
grep -q 'SmartScreen' "$ROOT/desktop/pack/windows-smartscreen.txt"

WORK="$(mktemp -d)"
cleanup() {
  rm -rf "$WORK"
}
trap cleanup EXIT

OUT_DIR="$WORK/out"
STAGE="$OUT_DIR/Homeward-windows-amd64"

HOMEWARD_BUNDLE_SKIP_DOWNLOADS=1 HOMEWARD_BUNDLE_OUT_DIR="$OUT_DIR" "$SCRIPT" amd64

test -d "$STAGE/resources/policies"
test -f "$STAGE/resources/policies/young_explorer.yaml"
test -d "$STAGE/resources/web"
test -d "$STAGE/resources/runtime/python"
test -d "$STAGE/resources/runtime/node"
test -d "$STAGE/resources/runtime/ollama"
test -d "$STAGE/resources/runtime/ffmpeg/bin"
test -d "$STAGE/resources/runtime/espeak/bin"

# Skip-downloads still cross-compiles the Windows supervisor when Go is present.
test -f "$STAGE/Homeward.exe"
python3 -c 'import sys; p=open(sys.argv[1],"rb").read(2); sys.exit(0 if p==b"MZ" else 1)' "$STAGE/Homeward.exe"

# Family data path is %LOCALAPPDATA%\Homeward, never %USERPROFILE%\.ollama.
if grep -q '[.]ollama' "$SCRIPT" "$EXE_SCRIPT" "$ISS"; then
  echo "Windows packer must not reference .ollama" >&2
  exit 1
fi

HOMEWARD_BUNDLE_SKIP_DOWNLOADS=1 HOMEWARD_BUNDLE_OUT_DIR="$OUT_DIR" \
  HOMEWARD_EXE_SKIP_BUNDLE=1 HOMEWARD_EXE_SKIP_COMPILE=1 \
  "$EXE_SCRIPT" amd64
