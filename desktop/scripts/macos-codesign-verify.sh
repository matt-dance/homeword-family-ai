#!/usr/bin/env bash
# Verify Developer ID + secure timestamp + hardened runtime on nested Mach-O.
#
# Used after a signed DMG is attached. codesign --deep on the .app is
# verification-only here; each nested target is also inspected.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: macos-codesign-verify.sh <Homeward.app>

Confirm every nested Mach-O (and the .app) is signed with Developer ID,
a secure timestamp, and hardened runtime. Helper for Release CI after
attach; does not codesign.

  HOMEWARD_CODESIGN_VERIFY_CMD     codesign binary (tests)
  HOMEWARD_CODESIGN_VERIFY_DRY_RUN=1
      print the checks; do not invoke codesign
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

APP="${1:-}"
if [[ -z "$APP" || ! -d "$APP" ]]; then
  echo "app bundle not found: ${APP:-<missing>}" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LISTER="$SCRIPT_DIR/macos-codesign-nested.sh"
CODESIGN_BIN="${HOMEWARD_CODESIGN_VERIFY_CMD:-codesign}"

if [[ ! -x "$LISTER" ]]; then
  echo "missing $LISTER" >&2
  exit 1
fi

need_display() {
  local text="$1"
  printf '%s\n' "$text" | grep -q 'Authority=Developer ID Application' \
    && printf '%s\n' "$text" | grep -Eq 'Timestamp=' \
    && printf '%s\n' "$text" | grep -Eq 'flags=.*runtime|Runtime Version='
}

verify_one() {
  local target="$1"
  if [[ "${HOMEWARD_CODESIGN_VERIFY_DRY_RUN:-0}" == "1" ]]; then
    echo "verify: $target"
    echo "  require Authority=Developer ID Application"
    echo "  require Timestamp="
    echo "  require hardened runtime flags"
    return 0
  fi
  "$CODESIGN_BIN" --verify --verbose=2 --strict "$target"
  local info
  info="$("$CODESIGN_BIN" -d --verbose=4 "$target" 2>&1 || true)"
  if ! need_display "$info"; then
    echo "codesign display missing Developer ID / timestamp / runtime:" >&2
    echo "$target" >&2
    printf '%s\n' "$info" >&2
    exit 1
  fi
  echo "ok: $target"
}

if [[ "${HOMEWARD_CODESIGN_VERIFY_DRY_RUN:-0}" != "1" && "$CODESIGN_BIN" == "codesign" ]]; then
  # --deep is verification-only: every nested Mach-O must already be signed.
  "$CODESIGN_BIN" --verify --verbose=2 --strict --deep "$APP"
fi

while IFS=$'\t' read -r kind target; do
  [[ -n "$kind" && -n "$target" ]] || continue
  verify_one "$target"
done < <("$LISTER" --list "$APP")

echo "nested Developer ID + timestamp + hardened runtime ok"
