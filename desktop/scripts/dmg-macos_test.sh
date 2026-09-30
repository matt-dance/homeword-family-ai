#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$ROOT/desktop/scripts/dmg-macos.sh"
NESTED="$ROOT/desktop/scripts/macos-codesign-nested.sh"
SETUP="$ROOT/desktop/scripts/ci-macos-codesign-setup.sh"
VERIFY="$ROOT/desktop/scripts/macos-codesign-verify.sh"
ENT="$ROOT/desktop/pack/homeward.entitlements"

test -x "$SCRIPT"
test -x "$NESTED"
test -x "$SETUP"
test -x "$VERIFY"
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
"$SETUP" --help | grep -q -- "--cleanup"
"$VERIFY" --help | grep -q "Developer ID"

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

# BSD mktemp rejects a suffix after XXXXXX (e.g. XXXXXX.p8).
python3 - "$SCRIPT" "$SETUP" <<'PY'
import re, sys
pat = re.compile(r"mktemp.*XXXXXX\.[A-Za-z0-9]+")
for path in sys.argv[1:]:
    text = open(path, encoding="utf-8").read()
    if pat.search(text):
        raise SystemExit(f"{path}: mktemp template must end with XXXXXX (BSD; no .p8 suffix)")
print("mktemp templates are BSD-safe")
PY

# Sign the DMG itself before notarytool; do not put --options runtime on the DMG.
grep -q 'codesign --force --sign "$HOMEWARD_CODESIGN_IDENTITY" --timestamp "$DMG"' "$SCRIPT"
python3 - "$SCRIPT" <<'PY'
import sys
src = open(sys.argv[1], encoding="utf-8").read()
block = src.split('if [[ "$SIGN" == "1" ]]; then')[-1]
if "codesign --force --sign" not in block or "notary_submit" not in block:
    raise SystemExit("signed path must codesign the DMG and call notary_submit")
if block.index("codesign --force --sign") > block.index("notary_submit"):
    raise SystemExit("DMG must be signed before notary_submit")
if "--options runtime" in block.split("notary_submit", 1)[0] and "codesign --force --sign" in block:
    # hardened runtime is for Mach-O via macos-codesign-nested.sh, not the DMG
    pass
dmg_line = [ln for ln in block.splitlines() if "codesign --force --sign" in ln]
if not dmg_line:
    raise SystemExit("missing DMG codesign line")
if "--options" in dmg_line[0]:
    raise SystemExit("DMG codesign must not use --options runtime")
print("DMG codesign precedes notarytool")
PY

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

HOMEWARD_CODESIGN_VERIFY_DRY_RUN=1 \
  "$VERIFY" "$APP" > "$WORK/verify-out.txt"
grep -q 'Contents/Resources/runtime/espeak/bin/espeak-ng' "$WORK/verify-out.txt"
grep -q 'Contents/Resources/runtime/ffmpeg/bin/ffmpeg' "$WORK/verify-out.txt"
grep -q 'python3.12' "$WORK/verify-out.txt"
grep -q 'libpython3.12.dylib' "$WORK/verify-out.txt"
grep -q 'Authority=Developer ID Application' "$WORK/verify-out.txt"
grep -q 'Timestamp=' "$WORK/verify-out.txt"
grep -q 'hardened runtime' "$WORK/verify-out.txt"
if grep -q -- '--deep' "$WORK/verify-out.txt"; then
  echo "verify dry-run must not sign --deep" >&2
  exit 1
fi

# --env-file must persist the previous default keychain captured before
# the temp keychain is selected, so wrap-step --cleanup can restore it.
python3 - "$SETUP" <<'PY'
from pathlib import Path
import sys

src = Path(sys.argv[1]).read_text(encoding="utf-8")
lines = src.splitlines()
try:
    call_cap = next(i for i, ln in enumerate(lines) if ln.strip() == "capture_prev_default_keychain")
    call_write = next(i for i, ln in enumerate(lines) if ln.strip() == "write_env_file")
    mutate = next(
        i
        for i, ln in enumerate(lines)
        if ln.strip() == 'security default-keychain -s "$KEYCHAIN_PATH"'
    )
except StopIteration as exc:
    raise SystemExit("setup missing capture/write_env_file/default-keychain -s $KEYCHAIN_PATH") from exc
if call_cap > call_write:
    raise SystemExit("must capture previous default keychain before writing --env-file")
if call_write > mutate:
    raise SystemExit("--env-file write must happen before selecting the temp default keychain")
if "HOMEWARD_CODESIGN_PREV_DEFAULT_KEYCHAIN=$(printf '%q' \"$PREV_DEFAULT_KEYCHAIN\")" not in src:
    raise SystemExit("write_exports must include captured HOMEWARD_CODESIGN_PREV_DEFAULT_KEYCHAIN")
print("previous default keychain captured before --env-file")
PY
P12_B64="$(python3 -c 'import base64; print(base64.b64encode(b"\x30" + b"\x00" * 24).decode())')"
ENVF="$WORK/codesign.env"
PREV_KC="$WORK/login.keychain-db"
HOMEWARD_CI_CODESIGN_DRY_RUN=1 \
HOMEWARD_CI_CODESIGN_DIR="$WORK/ci" \
HOMEWARD_CODESIGN_PREV_DEFAULT_KEYCHAIN="$PREV_KC" \
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
grep -q -- '-T /usr/bin/codesign' "$WORK/setup-out.txt"
if grep -E 'security import .* -A( |$)' "$WORK/setup-out.txt"; then
  echo "security import must not use -A (any application)" >&2
  exit 1
fi
grep -q 'APPLE_API_KEY_PATH=' "$ENVF"
grep -q 'KEYID123' "$ENVF"
grep -q 'issuer-uuid-from-alias' "$ENVF"
grep -q 'HOMEWARD_CODESIGN_KEYCHAIN=' "$ENVF"
grep -q 'HOMEWARD_CODESIGN_PREV_DEFAULT_KEYCHAIN=' "$ENVF"
grep -F -q "$PREV_KC" "$ENVF"
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
test "$HOMEWARD_CODESIGN_PREV_DEFAULT_KEYCHAIN" = "$PREV_KC"

# Cleanup must restore the previous default from the sourced env-file.
HOMEWARD_CI_CODESIGN_DRY_RUN=1 \
  "$SETUP" --cleanup > "$WORK/cleanup-out.txt"
grep -q 'delete-keychain' "$WORK/cleanup-out.txt"
grep -q 'default-keychain' "$WORK/cleanup-out.txt"
grep -F -q "$PREV_KC" "$WORK/cleanup-out.txt"
if grep -q 'store-credentials' "$WORK/cleanup-out.txt"; then
  echo "cleanup must not store a notary keychain profile" >&2
  exit 1
fi

# Capture via a stub security(1) even when PREV is unset — same as a Mac runner.
FAKE_SEC="$WORK/fake-security"
cat > "$FAKE_SEC" <<'EOF'
#!/usr/bin/env bash
if [[ "${1:-}" == "default-keychain" ]]; then
  echo '"/Users/runner/Library/Keychains/login.keychain-db"'
  exit 0
fi
echo "unexpected security argv: $*" >&2
exit 1
EOF
chmod +x "$FAKE_SEC"
ENVF2="$WORK/codesign-from-security.env"
HOMEWARD_CI_CODESIGN_DRY_RUN=1 \
HOMEWARD_CI_CODESIGN_DIR="$WORK/ci2" \
HOMEWARD_SECURITY_CMD="$FAKE_SEC" \
MACOS_CERTIFICATE_P12="$P12_B64" \
MACOS_CERTIFICATE_PASSWORD="p12-pass" \
APPLE_API_KEY=$'-----BEGIN PRIVATE KEY-----\nMII-TEST\n-----END PRIVATE KEY-----' \
APPLE_API_KEY_ID="KEYID123" \
APPLE_API_ISSUER="issuer-uuid" \
  "$SETUP" --env-file "$ENVF2" > "$WORK/setup-security-out.txt"
grep -F -q '/Users/runner/Library/Keychains/login.keychain-db' "$ENVF2"

echo "dmg-macos nested codesign / notarytool wiring ok"
