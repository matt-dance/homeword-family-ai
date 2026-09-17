#!/usr/bin/env bash
# Import Developer ID P12 into a temporary keychain and write an App Store
# Connect API key file for notarytool --key / --key-id / --issuer.
#
# Headless CI cannot use `notarytool store-credentials` (keychain profile
# creation fails with "User interaction is not allowed").
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ci-macos-codesign-setup.sh [--env-file PATH]

Non-interactive Developer ID + notarytool API-key setup for Release CI.

Required env:
  MACOS_CERTIFICATE_P12         base64-encoded Developer ID .p12
  MACOS_CERTIFICATE_PASSWORD    PKCS#12 password
  APPLE_API_KEY                 AuthKey_*.p8 contents (or APPLE_API_KEY_PATH)
  APPLE_API_KEY_ID
  APPLE_API_ISSUER              issuer UUID (aliases: APPLE_API_ISSUER_ID,
                                APPLE_API_KEY_ISSUER)

Writes a .p8 and prints shell exports (APPLE_API_KEY_PATH, issuer, key id).
With --env-file, also writes those exports to PATH (source from the same job).

  HOMEWARD_CI_CODESIGN_DRY_RUN=1  write the .p8 / env file and print the
                                  security(1) plan; do not call security
EOF
}

ENV_FILE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h)
      usage
      exit 0
      ;;
    --env-file)
      ENV_FILE="${2:-}"
      shift 2
      ;;
    *)
      echo "unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

APPLE_API_ISSUER="${APPLE_API_ISSUER:-${APPLE_API_ISSUER_ID:-${APPLE_API_KEY_ISSUER:-}}}"
APPLE_API_KEY_ID="${APPLE_API_KEY_ID:-}"

if [[ -z "${MACOS_CERTIFICATE_P12:-}" || -z "${MACOS_CERTIFICATE_PASSWORD:-}" ]]; then
  echo "MACOS_CERTIFICATE_P12 and MACOS_CERTIFICATE_PASSWORD are required" >&2
  exit 2
fi
if [[ -z "${APPLE_API_KEY_ID:-}" || -z "${APPLE_API_ISSUER:-}" ]]; then
  echo "APPLE_API_KEY_ID and APPLE_API_ISSUER (or APPLE_API_ISSUER_ID / APPLE_API_KEY_ISSUER) are required" >&2
  exit 2
fi
if [[ -z "${APPLE_API_KEY:-}" && -z "${APPLE_API_KEY_PATH:-}" ]]; then
  echo "APPLE_API_KEY or APPLE_API_KEY_PATH is required" >&2
  exit 2
fi

WORKDIR="${HOMEWARD_CI_CODESIGN_DIR:-${RUNNER_TEMP:-}}"
if [[ -z "$WORKDIR" ]]; then
  WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/homeward-codesign.XXXXXX")"
fi
mkdir -p "$WORKDIR"
chmod 700 "$WORKDIR"

P12_PATH="${HOMEWARD_CI_P12_PATH:-$WORKDIR/developer-id.p12}"
KEYCHAIN_PATH="${HOMEWARD_CODESIGN_KEYCHAIN:-$WORKDIR/homeward-signing.keychain-db}"
KEYCHAIN_PASSWORD="${HOMEWARD_CODESIGN_KEYCHAIN_PASSWORD:-}"
if [[ -z "$KEYCHAIN_PASSWORD" ]]; then
  KEYCHAIN_PASSWORD="$(python3 -c 'import secrets; print(secrets.token_urlsafe(24))')"
fi

if [[ -z "${APPLE_API_KEY_PATH:-}" ]]; then
  APPLE_API_KEY_PATH="$WORKDIR/AuthKey_${APPLE_API_KEY_ID}.p8"
fi

python3 - "$P12_PATH" <<'PY'
import base64, os, sys

dest = sys.argv[1]
raw = "".join(os.environ["MACOS_CERTIFICATE_P12"].split())
pad = (-len(raw)) % 4
if pad:
    raw += "=" * pad
decoded = base64.b64decode(raw.encode("ascii"))
open(dest, "wb").write(decoded)
os.chmod(dest, 0o600)
PY

if [[ -n "${APPLE_API_KEY:-}" ]]; then
  python3 - "$APPLE_API_KEY_PATH" <<'PY'
import os, sys

dest = sys.argv[1]
key = os.environ["APPLE_API_KEY"]
if not key.endswith("\n"):
    key += "\n"
open(dest, "w", encoding="utf-8").write(key)
os.chmod(dest, 0o600)
PY
fi

if [[ ! -f "$APPLE_API_KEY_PATH" ]]; then
  echo "missing App Store Connect API key file: $APPLE_API_KEY_PATH" >&2
  exit 2
fi

write_exports() {
  cat <<EOF
export APPLE_API_KEY_PATH=$(printf '%q' "$APPLE_API_KEY_PATH")
export APPLE_API_KEY_ID=$(printf '%q' "$APPLE_API_KEY_ID")
export APPLE_API_ISSUER=$(printf '%q' "$APPLE_API_ISSUER")
export HOMEWARD_CODESIGN_KEYCHAIN=$(printf '%q' "$KEYCHAIN_PATH")
EOF
}

print_security_plan() {
  cat <<EOF
security create-keychain -p <redacted> $(printf '%q' "$KEYCHAIN_PATH")
security set-keychain-settings -lut 21600 $(printf '%q' "$KEYCHAIN_PATH")
security unlock-keychain -p <redacted> $(printf '%q' "$KEYCHAIN_PATH")
security import $(printf '%q' "$P12_PATH") -P <redacted> -A -t cert -f pkcs12 -k $(printf '%q' "$KEYCHAIN_PATH") -T /usr/bin/codesign -T /usr/bin/security -T /usr/bin/productbuild
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k <redacted> $(printf '%q' "$KEYCHAIN_PATH")
security list-keychains -d user -s $(printf '%q' "$KEYCHAIN_PATH") <existing-user-keychains>
security find-identity -v -p codesigning $(printf '%q' "$KEYCHAIN_PATH")
EOF
}

if [[ -n "$ENV_FILE" ]]; then
  write_exports > "$ENV_FILE"
fi

if [[ "${HOMEWARD_CI_CODESIGN_DRY_RUN:-0}" == "1" ]]; then
  echo "dry-run: skip security(1); notarytool uses API key flags (not --keychain-profile)"
  print_security_plan
  write_exports
  exit 0
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "ci-macos-codesign-setup.sh must run on macOS" >&2
  exit 1
fi

# Do not call `xcrun notarytool store-credentials` — it prompts and fails
# headless with "User interaction is not allowed".
security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
security set-keychain-settings -lut 21600 "$KEYCHAIN_PATH"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
security import "$P12_PATH" \
  -P "$MACOS_CERTIFICATE_PASSWORD" \
  -A \
  -t cert \
  -f pkcs12 \
  -k "$KEYCHAIN_PATH" \
  -T /usr/bin/codesign \
  -T /usr/bin/security \
  -T /usr/bin/productbuild
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"

# Keep existing user keychains on the search list; put ours first.
EXISTING="$(security list-keychains -d user | tr -d '"')"
# shellcheck disable=SC2086
security list-keychains -d user -s "$KEYCHAIN_PATH" $EXISTING
security default-keychain -s "$KEYCHAIN_PATH"

identities="$(security find-identity -v -p codesigning "$KEYCHAIN_PATH")"
printf '%s\n' "$identities"
if [[ -n "${HOMEWARD_CODESIGN_IDENTITY:-}" ]]; then
  if ! printf '%s\n' "$identities" | grep -F -q "$HOMEWARD_CODESIGN_IDENTITY"; then
    echo "HOMEWARD_CODESIGN_IDENTITY not found in $KEYCHAIN_PATH after import: $HOMEWARD_CODESIGN_IDENTITY" >&2
    exit 1
  fi
elif ! printf '%s\n' "$identities" | grep -q 'Developer ID Application'; then
  echo "Developer ID Application identity not found in $KEYCHAIN_PATH after import" >&2
  exit 1
fi

rm -f "$P12_PATH"

write_exports
if [[ -n "${GITHUB_ENV:-}" ]]; then
  {
    echo "APPLE_API_KEY_PATH=$APPLE_API_KEY_PATH"
    echo "APPLE_API_KEY_ID=$APPLE_API_KEY_ID"
    echo "APPLE_API_ISSUER=$APPLE_API_ISSUER"
    echo "HOMEWARD_CODESIGN_KEYCHAIN=$KEYCHAIN_PATH"
  } >> "$GITHUB_ENV"
fi
