#!/usr/bin/env bash
# Build dist/macos/Homeward-macos-<arch>.dmg from Homeward.app.
# Never embeds Ollama model weights.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: dmg-macos.sh [arm64|amd64] [--sign]

Wrap Homeward.app in a read-only DMG with an /Applications symlink.

  arm64|amd64   Target architecture (default: host arch when on macOS)
  --sign      Codesign the app, notarize the DMG, and staple the ticket
              (requires HOMEWARD_CODESIGN_IDENTITY and HOMEWARD_NOTARY_PROFILE)

  HOMEWARD_DMG_SKIP_BUNDLE=1
      Skip running bundle-macos.sh (Homeward.app must already exist).

Output: dist/macos/Homeward-macos-<arch>.dmg

A family DMG cannot be produced except on a Mac.
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
STAGED_APP="$STAGE/Homeward.app"
cleanup() {
  rm -rf "$STAGE"
}
trap cleanup EXIT

ditto "$APP" "$STAGED_APP"
ln -s /Applications "$STAGE/Applications"

if [[ "$SIGN" == "1" ]]; then
  sign_app "$STAGED_APP"
fi

rm -f "$DMG"
mkdir -p "$(dirname "$DMG")"

if command -v create-dmg >/dev/null 2>&1; then
  create-dmg \
    --volname "Homeward" \
    --overwrite \
    "$DMG" \
    "$STAGE"
else
  hdiutil create \
    -volname "Homeward" \
    -srcfolder "$STAGE" \
    -ov \
    -format UDZO \
    "$DMG"
fi

if [[ "$SIGN" == "1" ]]; then
  xcrun notarytool submit "$DMG" \
    --keychain-profile "$HOMEWARD_NOTARY_PROFILE" \
    --wait
  xcrun stapler staple "$DMG"
fi

echo "wrote $DMG"
