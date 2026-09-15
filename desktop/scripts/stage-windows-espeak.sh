#!/usr/bin/env bash
# Copy espeak-ng from an MSI extract tree into runtime/espeak.
#
# 7-Zip lists the espeak-ng 1.52.0 MSI as short names (espeak_ng.exe,
# libespeak_ng.dll, flattened phontab). msiexec /a restores long names
# (espeak-ng.exe) and an espeak-ng-data directory. Accept both.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: stage-windows-espeak.sh <extract-dir> <runtime/espeak>

Find espeak-ng.exe or espeak_ng.exe under extract-dir and copy it to
<runtime/espeak>/bin/espeak-ng.exe, plus libespeak-ng.dll when present
and voice data (espeak-ng-data dir, or the directory that contains phontab).
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

SRC="${1:-}"
DEST="${2:-}"
if [[ -z "$SRC" || ! -d "$SRC" || -z "$DEST" ]]; then
  echo "usage: stage-windows-espeak.sh <extract-dir> <runtime/espeak>" >&2
  exit 1
fi

find_first() {
  # Materialize the match so `find | head` cannot SIGPIPE under pipefail.
  local list="$1"
  shift
  if ! find "$SRC" -type f "$@" -print > "$list" 2>/dev/null; then
    return 1
  fi
  if [[ ! -s "$list" ]]; then
    return 1
  fi
  head -n 1 "$list"
}

WORK="$(mktemp -d)"
cleanup() {
  rm -rf "$WORK"
}
trap cleanup EXIT

src=""
if src="$(find_first "$WORK/exe" -iname 'espeak-ng.exe')"; then
  :
elif src="$(find_first "$WORK/exe" -iname 'espeak_ng.exe')"; then
  :
else
  echo "espeak-ng.exe missing in $SRC (7-Zip MSI short name is espeak_ng.exe)" >&2
  exit 1
fi

mkdir -p "$DEST/bin" "$DEST/share/espeak-ng-data"
cp "$src" "$DEST/bin/espeak-ng.exe"

dll=""
if dll="$(find_first "$WORK/dll" -iname 'libespeak-ng.dll')"; then
  cp "$dll" "$DEST/bin/libespeak-ng.dll"
elif dll="$(find_first "$WORK/dll" -iname 'libespeak_ng.dll')"; then
  cp "$dll" "$DEST/bin/libespeak-ng.dll"
fi

data=""
# Prefer a real espeak-ng-data directory (msiexec /a).
find "$SRC" -type d -iname 'espeak-ng-data' -print > "$WORK/datadirs" 2>/dev/null || true
if [[ -s "$WORK/datadirs" ]]; then
  data="$(head -n 1 "$WORK/datadirs")"
fi

if [[ -z "$data" ]]; then
  phontab=""
  if phontab="$(find_first "$WORK/phontab" -name phontab)"; then
    data="$(dirname "$phontab")"
  fi
fi

if [[ -n "$data" ]]; then
  rm -rf "$DEST/share/espeak-ng-data"
  mkdir -p "$DEST/share/espeak-ng-data"
  find "$data" -mindepth 1 -maxdepth 1 ! -iname '*.exe' ! -iname '*.dll' \
    -exec cp -R {} "$DEST/share/espeak-ng-data/" \;
fi

test -f "$DEST/bin/espeak-ng.exe"
echo "staged $DEST/bin/espeak-ng.exe"
