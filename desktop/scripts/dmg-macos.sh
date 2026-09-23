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
  --sign        Leaf-first codesign nested Mach-O, notarize the DMG, staple
                (requires HOMEWARD_CODESIGN_IDENTITY and notary credentials)

  HOMEWARD_DMG_SKIP_BUNDLE=1
      Skip running bundle-macos.sh (Homeward.app must already exist).

Signing (--sign):
  HOMEWARD_CODESIGN_IDENTITY    Developer ID Application identity
  Notary (one of):
    APPLE_API_KEY_PATH or APPLE_API_KEY, plus APPLE_API_KEY_ID and
    APPLE_API_ISSUER (aliases: APPLE_API_ISSUER_ID, APPLE_API_KEY_ISSUER)
      → notarytool --key --key-id --issuer (headless CI)
    HOMEWARD_NOTARY_PROFILE
      → notarytool --keychain-profile (local Mac with a stored profile)

DMG creation prefers hdiutil. create-dmg is a non-fatal fallback
(Finder AppleScript can timeout with -1712).

A family DMG cannot be produced except on a Mac. This is not a zip of
the .app; it is an Apple disk image so a parent can drag Homeward into
Applications.
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

# Test hook: print notarytool argv (no Apple network, no Darwin).
# API key flags win over --keychain-profile when both are set.
if [[ "${1:-}" == "--print-notary-args" ]]; then
  dmg="${2:-Homeward-macos-arm64.dmg}"
  issuer="${APPLE_API_ISSUER:-${APPLE_API_ISSUER_ID:-${APPLE_API_KEY_ISSUER:-}}}"
  key_path="${APPLE_API_KEY_PATH:-}"
  if [[ -n "${APPLE_API_KEY:-}" && -z "$key_path" ]]; then
    key_path="\$APPLE_API_KEY"
  fi
  if [[ -n "$key_path" && -n "${APPLE_API_KEY_ID:-}" && -n "$issuer" ]]; then
    printf '%s\n' "xcrun notarytool submit ${dmg} --key ${key_path} --key-id ${APPLE_API_KEY_ID} --issuer ${issuer} --wait"
    exit 0
  fi
  if [[ -n "${HOMEWARD_NOTARY_PROFILE:-}" ]]; then
    printf '%s\n' "xcrun notarytool submit ${dmg} --keychain-profile ${HOMEWARD_NOTARY_PROFILE} --wait"
    exit 0
  fi
  echo "notarytool: missing API key flags and HOMEWARD_NOTARY_PROFILE" >&2
  exit 2
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
NESTED_SIGN="$SCRIPT_DIR/macos-codesign-nested.sh"
VOLNAME="Homeward"
ICNS="$APP/Contents/Resources/icon.icns"
NOTARY_KEY_FILE=""

have_dmg_tool() {
  command -v hdiutil >/dev/null 2>&1 || command -v create-dmg >/dev/null 2>&1
}

notary_issuer() {
  printf '%s' "${APPLE_API_ISSUER:-${APPLE_API_ISSUER_ID:-${APPLE_API_KEY_ISSUER:-}}}"
}

notary_api_key_ready() {
  local issuer key_id
  issuer="$(notary_issuer)"
  key_id="${APPLE_API_KEY_ID:-}"
  if [[ -z "$key_id" || -z "$issuer" ]]; then
    return 1
  fi
  [[ -n "${APPLE_API_KEY_PATH:-}" || -n "${APPLE_API_KEY:-}" ]]
}

require_sign_env() {
  if [[ -z "${HOMEWARD_CODESIGN_IDENTITY:-}" ]]; then
    echo "HOMEWARD_CODESIGN_IDENTITY is required with --sign" >&2
    exit 2
  fi
  if notary_api_key_ready; then
    return 0
  fi
  if [[ -n "${HOMEWARD_NOTARY_PROFILE:-}" ]]; then
    return 0
  fi
  echo "with --sign, set App Store Connect API key env (APPLE_API_KEY or APPLE_API_KEY_PATH, APPLE_API_KEY_ID, APPLE_API_ISSUER) or HOMEWARD_NOTARY_PROFILE" >&2
  exit 2
}

# Prefer API key flags. --keychain-profile needs a stored profile that
# `notarytool store-credentials` cannot create headless.
notary_submit() {
  local dmg="$1"
  local issuer key_path
  issuer="$(notary_issuer)"
  key_path="${APPLE_API_KEY_PATH:-}"
  if [[ -n "${APPLE_API_KEY:-}" && -z "$key_path" ]]; then
    # BSD mktemp requires XXXXXX at the end of the template (no .p8 suffix).
    # notarytool accepts the PEM contents regardless of extension.
    NOTARY_KEY_FILE="$(mktemp "${TMPDIR:-/tmp}/homeward-authkey.XXXXXX")"
    python3 - "$NOTARY_KEY_FILE" <<'PY'
import os, sys
path = sys.argv[1]
key = os.environ["APPLE_API_KEY"]
if not key.endswith("\n"):
    key += "\n"
open(path, "w", encoding="utf-8").write(key)
os.chmod(path, 0o600)
PY
    key_path="$NOTARY_KEY_FILE"
  fi
  if [[ -n "$key_path" && -n "${APPLE_API_KEY_ID:-}" && -n "$issuer" ]]; then
    xcrun notarytool submit "$dmg" \
      --key "$key_path" \
      --key-id "$APPLE_API_KEY_ID" \
      --issuer "$issuer" \
      --wait
    return 0
  fi
  if [[ -n "${HOMEWARD_NOTARY_PROFILE:-}" ]]; then
    xcrun notarytool submit "$dmg" \
      --keychain-profile "$HOMEWARD_NOTARY_PROFILE" \
      --wait
    return 0
  fi
  echo "notarytool: missing API key flags and HOMEWARD_NOTARY_PROFILE" >&2
  exit 2
}

if [[ "$HOST" != "Darwin" ]] || ! have_dmg_tool; then
  echo "must build on a Mac" >&2
  exit 1
fi

if [[ "$SIGN" == "1" ]]; then
  require_sign_env
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
  HOMEWARD_ENTITLEMENTS="$ENTITLEMENTS" "$NESTED_SIGN" --sign "$target"
}

STAGE="$(mktemp -d)"
cleanup() {
  rm -rf "$STAGE"
  if [[ -n "$NOTARY_KEY_FILE" ]]; then
    rm -f "$NOTARY_KEY_FILE"
  fi
}
trap cleanup EXIT

# Stage only the .app. hdiutil adds an Applications symlink. create-dmg
# --app-drop-link is the fallback path only.
mkdir -p "$STAGE"
ditto "$APP" "$STAGE/Homeward.app"

if [[ "$SIGN" == "1" ]]; then
  if command -v xattr >/dev/null 2>&1; then
    xattr -cr "$STAGE/Homeward.app" || true
  fi
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

# hdiutil is primary. create-dmg is optional and must not be required:
# its Finder AppleScript has timed out with -1712 on a real Mac.
if command -v hdiutil >/dev/null 2>&1; then
  if ! create_udzo_with_hdiutil; then
    if command -v create-dmg >/dev/null 2>&1; then
      echo "hdiutil create failed; falling back to create-dmg" >&2
      rm -f "$STAGE/Applications"
      create_udzo_with_create_dmg
    else
      echo "hdiutil create failed" >&2
      exit 1
    fi
  fi
elif command -v create-dmg >/dev/null 2>&1; then
  create_udzo_with_create_dmg
else
  echo "need hdiutil or create-dmg" >&2
  exit 1
fi

if [[ "$SIGN" == "1" ]]; then
  # Sign the disk image itself (no --options runtime; that flag is for Mach-O).
  codesign --force --sign "$HOMEWARD_CODESIGN_IDENTITY" --timestamp "$DMG"
  notary_submit "$DMG"
  xcrun stapler staple "$DMG"
fi

echo "wrote $DMG"
