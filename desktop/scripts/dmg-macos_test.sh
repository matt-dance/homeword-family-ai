#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$ROOT/desktop/scripts/dmg-macos.sh"
NESTED="$ROOT/desktop/scripts/macos-codesign-nested.sh"
SETUP="$ROOT/desktop/scripts/ci-macos-codesign-setup.sh"
ENT="$ROOT/desktop/pack/homeward.entitlements"

test -x "$SCRIPT"
test -x "$NESTED"
test -x "$SETUP"
test -f "$ENT"

"$SCRIPT" --help | grep -q "Homeward-macos"
"$SCRIPT" --help | grep -q "Applications"
"$SCRIPT" --help | grep -q 'Volume name'
"$SCRIPT" --help | grep -q "UDZO"
"$SCRIPT" --help | grep -q "not a zip"
"$SCRIPT" --help | grep -q "Leaf-first"
"$SCRIPT" --help | grep -q "hdiutil"
"$SCRIPT" --help | grep -q "APPLE_API_KEY"
"$NESTED" --help | grep -q "leaf-first\|deepest-first"
"$SETUP" --help | grep -q "notarytool"

grep -q -- '-volname' "$SCRIPT"
grep -q 'Homeward' "$SCRIPT"
grep -q 'app-drop-link' "$SCRIPT"
grep -q 'UDZO' "$SCRIPT"
grep -q '/Applications' "$SCRIPT"
grep -q 'macos-codesign-nested.sh' "$SCRIPT"

# Family artifact must be a disk image, not a zip of the .app.
if grep -Eq 'zip[[:space:]].*Homeward\.app|ditto -c -k' "$SCRIPT"; then
  echo "dmg-macos.sh must not zip the .app" >&2
  exit 1
fi

# Signing must not rely on codesign --deep alone (or at all for --sign).
if grep -nE 'codesign[[:space:]].*--deep|--deep[[:space:]].*--sign' "$SCRIPT"; then
  echo "dmg-macos.sh must not codesign --deep" >&2
  exit 1
fi
if awk '
  /^[[:space:]]*#/ { next }
  /codesign --verify/ { next }
  /verification-only/ { next }
  /--deep/ { found=1 }
  END { exit found ? 0 : 1 }
' "$NESTED"; then
  echo "macos-codesign-nested.sh must not pass --deep when signing" >&2
  exit 1
fi
grep -q -- '--timestamp' "$NESTED"
grep -q -- '--options runtime' "$NESTED"
grep -q 'Never --deep' "$NESTED"

# hdiutil is primary; create-dmg must not be the first branch.
python3 - "$SCRIPT" <<'PY'
import re
import sys
src = open(sys.argv[1], encoding="utf-8").read()
if "# hdiutil is primary" not in src:
    raise SystemExit("expected hdiutil-primary comment in dmg-macos.sh")
dispatch = src.split("# hdiutil is primary", 1)[1]
if dispatch.index("create_udzo_with_hdiutil") > dispatch.index("create_udzo_with_create_dmg"):
    raise SystemExit("hdiutil must be invoked before create-dmg in the dispatch block")
if re.search(r"^if command -v create-dmg", dispatch, re.M):
    raise SystemExit("create-dmg must not be the primary if-branch")
print("hdiutil is primary DMG tool")
PY

# notarytool: API key flags preferred; no store-credentials.
grep -q -- '--key' "$SCRIPT"
grep -q -- '--key-id' "$SCRIPT"
grep -q -- '--issuer' "$SCRIPT"
grep -q -- '--keychain-profile' "$SCRIPT"
if grep -vE '^[[:space:]]*#' "$SCRIPT" "$SETUP" | grep -q 'store-credentials'; then
  echo "must not call notarytool store-credentials" >&2
  exit 1
fi

if "$SCRIPT" --print-notary-args /tmp/x.dmg >/dev/null 2>&1; then
  echo "--print-notary-args without credentials must fail" >&2
  exit 1
fi

api_line="$(
  APPLE_API_KEY_PATH=/tmp/AuthKey.p8 \
  APPLE_API_KEY_ID=KEYID123 \
  APPLE_API_ISSUER=00000000-1111-2222-3333-444444444444 \
  HOMEWARD_NOTARY_PROFILE=should-not-win \
  "$SCRIPT" --print-notary-args /tmp/Homeward-macos-arm64.dmg
)"
printf '%s\n' "$api_line" | grep -q -- '--key /tmp/AuthKey.p8'
printf '%s\n' "$api_line" | grep -q -- '--key-id KEYID123'
printf '%s\n' "$api_line" | grep -q -- '--issuer 00000000-1111-2222-3333-444444444444'
if printf '%s\n' "$api_line" | grep -q -- '--keychain-profile'; then
  echo "API key path must win over HOMEWARD_NOTARY_PROFILE" >&2
  exit 1
fi

alias_line="$(
  APPLE_API_KEY='-----BEGIN PRIVATE KEY-----
n
-----END PRIVATE KEY-----' \
  APPLE_API_KEY_ID=ALIASID \
  APPLE_API_ISSUER_ID=issuer-from-alias \
  "$SCRIPT" --print-notary-args staged.dmg
)"
printf '%s\n' "$alias_line" | grep -q -- '--key-id ALIASID'
printf '%s\n' "$alias_line" | grep -q -- '--issuer issuer-from-alias'

profile_line="$(
  HOMEWARD_NOTARY_PROFILE=homeward-notary \
  "$SCRIPT" --print-notary-args /tmp/Homeward-macos-arm64.dmg
)"
printf '%s\n' "$profile_line" | grep -q -- '--keychain-profile homeward-notary'

WORK="$(mktemp -d)"
cleanup() {
  rm -rf "$WORK"
}
trap cleanup EXIT

APP="$WORK/Homeward.app"
python3 - "$APP" <<'PY'
import os, sys

app = sys.argv[1]
MH_EXECUTE = 2
MH_DYLIB = 6


def write_macho(path, filetype):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    buf = bytearray(b"\xcf\xfa\xed\xfe")
    buf += (0).to_bytes(4, "little")
    buf += (0).to_bytes(4, "little")
    buf += int(filetype).to_bytes(4, "little")
    buf += b"\x00" * 48
    open(path, "wb").write(buf)


write_macho(f"{app}/Contents/MacOS/Homeward", MH_EXECUTE)
write_macho(f"{app}/Contents/Resources/runtime/espeak/bin/espeak-ng", MH_EXECUTE)
write_macho(f"{app}/Contents/Resources/runtime/ffmpeg/bin/ffmpeg", MH_EXECUTE)
write_macho(f"{app}/Contents/Resources/runtime/python/bin/python3.12", MH_EXECUTE)
write_macho(f"{app}/Contents/Resources/runtime/python/lib/libpython3.12.dylib", MH_DYLIB)
write_macho(f"{app}/Contents/Resources/runtime/ollama/ollama", MH_EXECUTE)
write_macho(f"{app}/Contents/Frameworks/libavcodec.dylib", MH_DYLIB)
os.makedirs(f"{app}/Contents/Resources/runtime/python/bin", exist_ok=True)
os.symlink("python3.12", f"{app}/Contents/Resources/runtime/python/bin/python")
open(f"{app}/Contents/Resources/readme.txt", "w", encoding="utf-8").write("not macho\n")
print("wrote fake Homeward.app")
PY

LIST="$WORK/list.txt"
"$NESTED" --list "$APP" > "$LIST"
cat "$LIST"

python3 - "$LIST" "$APP" <<'PY'
import os, sys

lines = [ln.rstrip("\n") for ln in open(sys.argv[1], encoding="utf-8") if ln.strip()]
app = os.path.abspath(sys.argv[2])
if not lines:
    raise SystemExit("empty sign list")
kinds = {}
order = []
for ln in lines:
    kind, path = ln.split("\t", 1)
    kinds[path] = kind
    order.append(path)

if kinds.get(app) != "app":
    raise SystemExit(f"app kind missing: {kinds.get(app)}")
if order[-1] != app:
    raise SystemExit(f"app must be signed last, got {order[-1]!r}")

need = {
    "Contents/MacOS/Homeward": "execute",
    "Contents/Resources/runtime/espeak/bin/espeak-ng": "tool",
    "Contents/Resources/runtime/ffmpeg/bin/ffmpeg": "tool",
    "Contents/Resources/runtime/python/bin/python3.12": "execute",
    "Contents/Resources/runtime/python/lib/libpython3.12.dylib": "dylib",
    "Contents/Resources/runtime/ollama/ollama": "tool",
    "Contents/Frameworks/libavcodec.dylib": "dylib",
}
for rel, kind in need.items():
    path = os.path.join(app, rel)
    if kinds.get(path) != kind:
        raise SystemExit(f"{rel}: expected kind {kind}, got {kinds.get(path)}")
    if order.index(path) >= order.index(app):
        raise SystemExit(f"{rel} signed after the .app")

symlink = os.path.join(app, "Contents/Resources/runtime/python/bin/python")
if symlink in kinds:
    raise SystemExit("must sign the Mach-O target, not the python symlink")
readme = os.path.join(app, "Contents/Resources/readme.txt")
if readme in kinds:
    raise SystemExit("non-Mach-O file must not be signed")

# Deeper paths before shallower (leaf-first).
depths = [p.count(os.sep) for p in order]
if depths != sorted(depths, reverse=True):
    raise SystemExit(f"sign order is not inside-out by depth: {order}")
print("leaf-first Mach-O order ok")
PY

LOG="$WORK/codesign.log"
HOMEWARD_CODESIGN_IDENTITY="Developer ID Application: Homeward Test (ABCDE12345)" \
HOMEWARD_ENTITLEMENTS="$ENT" \
HOMEWARD_CODESIGN_DRY_RUN=1 \
HOMEWARD_CODESIGN_LOG="$LOG" \
  "$NESTED" --sign "$APP" > "$WORK/sign-out.txt"

test -s "$LOG"
if grep -q -- '--deep' "$LOG"; then
  echo "dry-run sign log must not contain --deep" >&2
  cat "$LOG" >&2
  exit 1
fi
grep -q -- '--timestamp' "$LOG"
grep -q -- '--options runtime' "$LOG"
grep -q 'ABCDE12345' "$LOG"
grep -q -- '--sign' "$LOG"

python3 - "$LOG" "$APP" "$ENT" <<'PY'
import os, sys, shlex

log, app, ent = sys.argv[1:]
app = os.path.abspath(app)
lines = [shlex.split(ln) for ln in open(log, encoding="utf-8") if ln.strip()]
if not lines:
    raise SystemExit("empty codesign log")
targets = [row[-1] for row in lines]
if targets[-1] != app:
    raise SystemExit(f"last codesign target must be the .app, got {targets[-1]!r}")

def row_for(suffix):
    hits = [row for row in lines if row[-1].endswith(suffix)]
    if len(hits) != 1:
        raise SystemExit(f"expected one codesign of {suffix}, got {hits!r}")
    return hits[0]

def has_entitlements(row):
    if "--entitlements" not in row:
        return False
    idx = row.index("--entitlements")
    return row[idx + 1] == ent

py = row_for("python3.12")
dylib = row_for("libpython3.12.dylib")
ffmpeg = row_for("/ffmpeg")
espeak = row_for("espeak-ng")
app_row = lines[-1]
main_bin = row_for("Contents/MacOS/Homeward")

for row, label in (
    (py, "python3.12"),
    (main_bin, "Homeward"),
    (app_row, ".app"),
):
    if not has_entitlements(row):
        raise SystemExit(f"{label} must be signed with entitlements")
    if "--options" not in row or "runtime" not in row:
        raise SystemExit(f"{label} missing hardened runtime")
    if "--timestamp" not in row:
        raise SystemExit(f"{label} missing --timestamp")

for row, label in ((dylib, "libpython"), (ffmpeg, "ffmpeg"), (espeak, "espeak-ng")):
    if has_entitlements(row):
        raise SystemExit(f"{label} must not get app entitlements")
    if "--timestamp" not in row or "runtime" not in row:
        raise SystemExit(f"{label} missing hardened runtime / timestamp")
    if "--deep" in row:
        raise SystemExit(f"{label} used --deep")

print("codesign argv (dry-run) ok")
PY

# CI setup: write API key + print security plan without calling security(1).
P12_B64="$(python3 -c 'import base64; print(base64.b64encode(b"\x30" + b"\x00" * 24).decode())')"
ENVF="$WORK/codesign.env"
HOMEWARD_CI_CODESIGN_DRY_RUN=1 \
HOMEWARD_CI_CODESIGN_DIR="$WORK/ci" \
MACOS_CERTIFICATE_P12="$P12_B64" \
MACOS_CERTIFICATE_PASSWORD="p12-pass" \
APPLE_API_KEY=$'-----BEGIN PRIVATE KEY-----\nMII-TEST\n-----END PRIVATE KEY-----' \
APPLE_API_KEY_ID="KEYID123" \
APPLE_API_KEY_ISSUER="issuer-uuid-from-alias" \
  "$SETUP" --env-file "$ENVF" > "$WORK/setup-out.txt"

grep -q 'create-keychain' "$WORK/setup-out.txt"
grep -q 'security import' "$WORK/setup-out.txt"
grep -q 'set-key-partition-list' "$WORK/setup-out.txt"
grep -q 'find-identity' "$WORK/setup-out.txt"
grep -q 'APPLE_API_KEY_PATH=' "$ENVF"
grep -q 'KEYID123' "$ENVF"
grep -q 'issuer-uuid-from-alias' "$ENVF"
# shellcheck disable=SC1090
source "$ENVF"
test -f "$APPLE_API_KEY_PATH"
grep -q 'BEGIN PRIVATE KEY' "$APPLE_API_KEY_PATH"
grep -q 'MII-TEST' "$APPLE_API_KEY_PATH"
if grep -q 'store-credentials' "$WORK/setup-out.txt"; then
  echo "CI setup must not store a notary keychain profile" >&2
  exit 1
fi
test -s "$WORK/ci/developer-id.p12"

echo "dmg-macos nested codesign / notarytool wiring ok"
