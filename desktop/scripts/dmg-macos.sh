#!/usr/bin/env bash
# Build dist/macos/Homeward-macos-<arch>.dmg from Homeward.app.
# Real UDZO disk image with volume name "Homeward" and an Applications
# drop target — not a zip of the .app. Never embeds Ollama model weights.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: dmg-macos.sh [arm64|amd64] [--sign]

Wrap Homeward.app in a compressed UDZO disk image.

  Volume name:  Homeward
  Layout:       Homeward.app + Applications (drag the app to install)
  Output:       dist/macos/Homeward-macos-<arch>.dmg

  arm64|amd64   Target architecture (default: host arch when on macOS)
  --sign        Codesign the app, notarize the DMG, and staple the ticket
                (requires HOMEWARD_CODESIGN_IDENTITY and HOMEWARD_NOTARY_PROFILE)

  HOMEWARD_DMG_SKIP_BUNDLE=1
      Skip running bundle-macos.sh (Homeward.app must already exist).

A family DMG cannot be produced except on a Mac. This is not a zip of
the .app; it is an Apple disk image so a parent can drag Homeward into
Applications.
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

ARCH_RAW=""
SIGN=0
for arg in "$@"; do
  case "$arg" in
    --sign)
      SIGN=1
      ;;
    arm64|aarch64|amd64|x86_64)
      ARCH_RAW="$arg"
      ;;
    *)
      echo "unknown argument: $arg" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "$ARCH_RAW" ]]; then
  ARCH_RAW="$(uname -m 2>/dev/null || echo arm64)"
fi

case "$ARCH_RAW" in
  arm64|aarch64)
    ARCH="arm64"
    ;;
  x86_64|amd64)
    ARCH="amd64"
    ;;
  *)
    echo "unsupported arch: $ARCH_RAW (use arm64 or amd64)" >&2
    exit 1
    ;;
esac

HOST="$(uname -s)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/../.." && pwd)"
APP="$REPO/dist/macos/$ARCH/Homeward.app"
DMG="$REPO/dist/macos/Homeward-macos-$ARCH.dmg"
ENTITLEMENTS="$REPO/desktop/pack/homeward.entitlements"
BUNDLE_SCRIPT="$SCRIPT_DIR/bundle-macos.sh"
VOLNAME="Homeward"
ICNS="$APP/Contents/Resources/icon.icns"

have_dmg_tool() {
  command -v hdiutil >/dev/null 2>&1 || command -v create-dmg >/dev/null 2>&1
}

if [[ "$HOST" != "Darwin" ]] || ! have_dmg_tool; then
  echo "must build on a Mac" >&2
  exit 1
fi

if [[ "$SIGN" == "1" ]]; then
  if [[ -z "${HOMEWARD_CODESIGN_IDENTITY:-}" || -z "${HOMEWARD_NOTARY_PROFILE:-}" ]]; then
    echo "HOMEWARD_CODESIGN_IDENTITY and HOMEWARD_NOTARY_PROFILE are required with --sign" >&2
    exit 2
  fi
fi

if [[ "${HOMEWARD_DMG_SKIP_BUNDLE:-0}" != "1" ]]; then
  "$BUNDLE_SCRIPT" "$ARCH"
fi

if [[ ! -d "$APP" ]]; then
  echo "missing app bundle: $APP (run bundle-macos.sh first)" >&2
  exit 1
fi

sign_app() {
  local target="$1"
  codesign --deep --force --options runtime \
    --entitlements "$ENTITLEMENTS" \
    --sign "$HOMEWARD_CODESIGN_IDENTITY" \
    "$target"
  codesign --verify --verbose=2 "$target"
}

STAGE="$(mktemp -d)"
cleanup() {
  rm -rf "$STAGE"
}
trap cleanup EXIT

# Stage only the .app. create-dmg --app-drop-link adds Applications.
# The hdiutil fallback adds the Applications symlink itself.
mkdir -p "$STAGE"
ditto "$APP" "$STAGE/Homeward.app"

if [[ "$SIGN" == "1" ]]; then
  sign_app "$STAGE/Homeward.app"
fi

rm -f "$DMG"
mkdir -p "$(dirname "$DMG")"

create_udzo_with_create_dmg() {
  local args=(
    --volname "$VOLNAME"
    --window-pos 200 120
    --window-size 660 420
    --icon-size 128
    --icon "Homeward.app" 160 200
    --hide-extension "Homeward.app"
    --app-drop-link 500 200
    --overwrite
  )
  if [[ -f "$ICNS" ]]; then
    args+=(--volicon "$ICNS")
  fi
  create-dmg "${args[@]}" "$DMG" "$STAGE"
}

create_udzo_with_hdiutil() {
  ln -s /Applications "$STAGE/Applications"
  hdiutil create \
    -volname "$VOLNAME" \
    -fs HFS+ \
    -srcfolder "$STAGE" \
    -ov \
    -format UDZO \
    "$DMG"
}

if command -v create-dmg >/dev/null 2>&1; then
  create_udzo_with_create_dmg
else
  create_udzo_with_hdiutil
fi

if [[ "$SIGN" == "1" ]]; then
  xcrun notarytool submit "$DMG" \
    --keychain-profile "$HOMEWARD_NOTARY_PROFILE" \
    --wait
  xcrun stapler staple "$DMG"
fi

echo "wrote $DMG"
