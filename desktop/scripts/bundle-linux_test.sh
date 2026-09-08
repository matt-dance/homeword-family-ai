#!/usr/bin/env bash
# Skip-downloads layout + install/uninstall path checks for the Linux tarball.
# Assembles and stubs under a temp OUT_DIR so a real tip-pack homeward ELF
# in dist/linux/amd64/Homeward-linux-amd64 is never overwritten.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$ROOT/desktop/scripts/bundle-linux.sh"
TIP_STAGE="$ROOT/dist/linux/amd64/Homeward-linux-amd64"
TIP_HOMEWARD="$TIP_STAGE/homeward"

test -x "$SCRIPT"

# Official Linux engine is .tar.zst (v0.33.3+); .tgz / .tar.gz 404.
if grep -qE 'ollama-linux-amd64\.(tgz|tar\.gz)' "$SCRIPT"; then
  echo "install_ollama still hardcodes .tgz/.tar.gz (404 on current Ollama)" >&2
  exit 1
fi
grep -q 'ollama-linux-amd64.tar.zst' "$SCRIPT"
grep -q 'tar --zstd' "$SCRIPT"

# arm64 is not a v1 family target.
if HOMEWARD_BUNDLE_SKIP_DOWNLOADS=1 "$SCRIPT" arm64 >/dev/null 2>&1; then
  echo "bundle-linux.sh arm64 should fail (amd64 only)" >&2
  exit 1
fi

WORK="$(mktemp -d)"
FAKE="$(mktemp -d)"
cleanup() {
  rm -rf "$WORK" "$FAKE"
}
trap cleanup EXIT

# Snapshot a pre-existing tip-pack supervisor so we can prove this test
# never clobbers it (skip-downloads + stub used to write that path).
TIP_CKSUM=""
if [[ -f "$TIP_HOMEWARD" ]]; then
  TIP_CKSUM="$(cksum "$TIP_HOMEWARD")"
fi

OUT_DIR="$WORK/out"
STAGE="$OUT_DIR/Homeward-linux-amd64"
TARBALL="$OUT_DIR/Homeward-linux-amd64.tar.gz"
DISPOSABLE="$WORK/install-stage"

HOMEWARD_BUNDLE_SKIP_DOWNLOADS=1 HOMEWARD_BUNDLE_OUT_DIR="$OUT_DIR" "$SCRIPT" amd64

test -x "$STAGE/install.sh"
test -x "$STAGE/uninstall.sh"
test -d "$STAGE/resources/policies"
test -f "$STAGE/resources/policies/young_explorer.yaml"
test -d "$STAGE/resources/web"
test -d "$STAGE/resources/runtime/python"
test -d "$STAGE/resources/runtime/node"
test -d "$STAGE/resources/runtime/ollama"
test -d "$STAGE/resources/runtime/ffmpeg/bin"
test -d "$STAGE/resources/runtime/espeak/bin"
test -d "$STAGE/resources/runtime/espeak/share"
test -f "$TARBALL"

# Skip mode must succeed even when the sibling has not built a linux supervisor.
if [[ -e "$STAGE/homeward" ]]; then
  test -x "$STAGE/homeward"
fi

# install.sh / uninstall.sh must name the approved XDG paths.
grep -q '[.]local/share/homeward/app' "$STAGE/install.sh"
grep -q '[.]local/bin' "$STAGE/install.sh"
grep -q '[.]config/autostart/homeward[.]desktop' "$STAGE/install.sh"
grep -q -- '--open' "$STAGE/install.sh"
grep -q '[.]local/share/homeward/app' "$STAGE/uninstall.sh"
grep -q '[.]local/bin/homeward' "$STAGE/uninstall.sh"
grep -q '[.]config/autostart/homeward[.]desktop' "$STAGE/uninstall.sh"
grep -q -- '--wipe-data' "$STAGE/uninstall.sh"
# Family data lives under ~/.local/share/homeward, never ~/.ollama.
if grep -q '[.]ollama' "$STAGE/install.sh" "$STAGE/uninstall.sh"; then
  echo "install/uninstall must not reference ~/.ollama" >&2
  exit 1
fi

# Stub/install/uninstall run on a disposable copy, never the tip pack or the
# skip-downloads stage (that copy may hold a real linux ELF).
cp -R "$STAGE" "$DISPOSABLE"

write_supervisor_stub() {
  local dest="$1"
  local tip=""
  if [[ -e "$TIP_HOMEWARD" ]]; then
    tip="$(python3 -c 'import os, sys; print(os.path.realpath(sys.argv[1]))' "$TIP_HOMEWARD")"
  fi
  local resolved
  resolved="$(python3 -c 'import os, sys; print(os.path.realpath(sys.argv[1]))' "$dest")"
  if [[ -n "$tip" && "$resolved" == "$tip" ]]; then
    echo "refusing to stub tip pack homeward at $TIP_HOMEWARD" >&2
    exit 1
  fi
  cat > "$dest" <<'EOF'
#!/bin/sh
echo "homeward $*" >> "${HOMEWARD_TEST_LOG:-/dev/null}"
exit 0
EOF
  chmod +x "$dest"
}

write_supervisor_stub "$DISPOSABLE/homeward"

HOME="$FAKE" HOMEWARD_TEST_LOG="$FAKE/supervisor.log" "$DISPOSABLE/install.sh"

test -x "$FAKE/.local/share/homeward/app/homeward"
test -d "$FAKE/.local/share/homeward/app/resources/policies"
test -x "$FAKE/.local/bin/homeward"
test -f "$FAKE/.config/autostart/homeward.desktop"
grep -q "$FAKE/.local/share/homeward/app/homeward\|$FAKE/.local/bin/homeward" \
  "$FAKE/.config/autostart/homeward.desktop"

# Shim must exec the real supervisor.
HOME="$FAKE" HOMEWARD_TEST_LOG="$FAKE/supervisor.log" "$FAKE/.local/bin/homeward" --version
grep -q -- '--version' "$FAKE/supervisor.log"

# Do not copy family data into the app tree; leave a data file for uninstall.
printf 'keep\n' > "$FAKE/.local/share/homeward/family.db"
test ! -e "$FAKE/.local/share/homeward/app/family.db"

HOME="$FAKE" "$DISPOSABLE/uninstall.sh"
test ! -e "$FAKE/.local/share/homeward/app"
test ! -e "$FAKE/.local/bin/homeward"
test ! -e "$FAKE/.config/autostart/homeward.desktop"
test -f "$FAKE/.local/share/homeward/family.db"

HOME="$FAKE" HOMEWARD_TEST_LOG="$FAKE/supervisor.log" "$DISPOSABLE/install.sh"
HOME="$FAKE" "$DISPOSABLE/uninstall.sh" --wipe-data
test ! -e "$FAKE/.local/share/homeward"
test ! -e "$FAKE/.local/bin/homeward"
test ! -e "$FAKE/.config/autostart/homeward.desktop"

if [[ -n "$TIP_CKSUM" ]]; then
  if [[ ! -f "$TIP_HOMEWARD" ]] || [[ "$(cksum "$TIP_HOMEWARD")" != "$TIP_CKSUM" ]]; then
    echo "layout test must not modify tip pack homeward at $TIP_HOMEWARD" >&2
    exit 1
  fi
fi
