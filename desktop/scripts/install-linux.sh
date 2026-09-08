#!/usr/bin/env bash
# Install Homeward from an extracted linux amd64 tarball (no root).
# Run from the extracted Homeward-linux-amd64/ directory.
set -euo pipefail

if [[ "$(id -u)" == "0" ]]; then
  echo "do not run install.sh as root" >&2
  exit 1
fi

if [[ -z "${HOME:-}" ]]; then
  echo "HOME is required" >&2
  exit 1
fi

HERE="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$HOME/.local/share/homeward/app"
BIN_DIR="$HOME/.local/bin"
DESKTOP="$HOME/.config/autostart/homeward.desktop"
APP_BIN="$APP_DIR/homeward"
SHIM="$BIN_DIR/homeward"

if [[ ! -f "$HERE/homeward" ]]; then
  echo "missing homeward supervisor in $HERE" >&2
  exit 1
fi
if [[ ! -d "$HERE/resources" ]]; then
  echo "missing resources/ in $HERE" >&2
  exit 1
fi

mkdir -p "$BIN_DIR" "$(dirname "$DESKTOP")"
rm -rf "$APP_DIR"
mkdir -p "$APP_DIR"

cp "$HERE/homeward" "$APP_BIN"
chmod +x "$APP_BIN"
cp -R "$HERE/resources" "$APP_DIR/resources"

cat > "$SHIM" <<EOF
#!/bin/sh
exec "$APP_BIN" "\$@"
EOF
chmod +x "$SHIM"

ICON_LINE=""
for icon in "$APP_DIR/resources/icon.png" "$APP_DIR/resources/icon.svg"; do
  if [[ -f "$icon" ]]; then
    ICON_LINE="Icon=$icon"
    break
  fi
done

{
  printf '%s\n' '[Desktop Entry]'
  printf '%s\n' 'Type=Application'
  printf '%s\n' 'Name=Homeward'
  printf '%s\n' "Exec=$APP_BIN"
  if [[ -n "$ICON_LINE" ]]; then
    printf '%s\n' "$ICON_LINE"
  fi
  printf '%s\n' 'Terminal=false'
  printf '%s\n' 'X-GNOME-Autostart-enabled=true'
} > "$DESKTOP"

if [[ -x "$APP_BIN" ]]; then
  nohup "$APP_BIN" --open >/dev/null 2>&1 &
  echo "started Homeward"
fi

echo "installed $APP_DIR"
echo "shim $SHIM"
echo "autostart $DESKTOP"
