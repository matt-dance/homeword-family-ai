#!/usr/bin/env bash
# Remove a Homeward linux install. Keeps family data unless --wipe-data.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: uninstall.sh [--wipe-data]

Stop Homeward, remove the autostart desktop file, PATH shim, and
~/.local/share/homeward/app. Family data in ~/.local/share/homeward
stays unless --wipe-data is passed.
EOF
}

WIPE=0
for arg in "$@"; do
  case "$arg" in
    --wipe-data)
      WIPE=1
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "unknown argument: $arg" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "${HOME:-}" ]]; then
  echo "HOME is required" >&2
  exit 1
fi

APP_DIR="$HOME/.local/share/homeward/app"
APP_BIN="$APP_DIR/homeward"
SHIM="$HOME/.local/bin/homeward"
DESKTOP="$HOME/.config/autostart/homeward.desktop"
DATA_DIR="$HOME/.local/share/homeward"

kill_installed_supervisor() {
  local pid comm exe
  if ! command -v ps >/dev/null 2>&1; then
    return 0
  fi
  # Only the installed supervisor or shim — not an arbitrary process name.
  while read -r pid comm; do
    [[ -z "$pid" || -z "$comm" ]] && continue
    exe="${comm%% *}"
    if [[ "$exe" == "$APP_BIN" || "$exe" == "$SHIM" ]]; then
      kill "$pid" 2>/dev/null || true
    fi
  done < <(ps -axo pid=,command= 2>/dev/null || ps -eo pid=,args= 2>/dev/null || true)
}

stop_homeward() {
  if [[ -x "$APP_BIN" ]]; then
    if [[ "$WIPE" == "1" ]]; then
      "$APP_BIN" --uninstall --wipe-data || true
    else
      "$APP_BIN" --uninstall || true
    fi
    return 0
  fi
  if [[ -x "$SHIM" ]]; then
    if [[ "$WIPE" == "1" ]]; then
      "$SHIM" --uninstall --wipe-data || true
    else
      "$SHIM" --uninstall || true
    fi
    return 0
  fi
  kill_installed_supervisor
}

stop_homeward

rm -f "$DESKTOP" "$SHIM"
rm -rf "$APP_DIR"

if [[ "$WIPE" == "1" ]]; then
  rm -rf "$DATA_DIR"
else
  echo "Homeward data remains at $DATA_DIR"
fi
