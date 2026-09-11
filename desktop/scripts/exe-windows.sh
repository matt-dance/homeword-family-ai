#!/usr/bin/env bash
# Build dist/windows/amd64/Homeward-windows-amd64.exe with Inno Setup.
# Never embeds Ollama model weights. Unsigned — SmartScreen will warn.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: exe-windows.sh [amd64]

Wrap the Windows payload in an Inno Setup installer.

  HOMEWARD_EXE_SKIP_BUNDLE=1
      Skip running bundle-windows.sh (payload must already exist).

  HOMEWARD_BUNDLE_SKIP_DOWNLOADS=1
      Layout-only payload. Compiling still needs Inno Setup; the
      result is not a family installer.

  HOMEWARD_VERSION
      AppVersion passed to Inno Setup (default 0.1.0).

Output: dist/windows/amd64/Homeward-windows-amd64.exe

A family Windows installer must be produced on Windows with Inno Setup 6.
The installer is unsigned; Windows SmartScreen will warn.
Public web port is 43123 (not 80).
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

ARCH_RAW="${1:-amd64}"
case "$ARCH_RAW" in
  x86_64|amd64)
    ARCH="amd64"
    ;;
  *)
    echo "unsupported arch: $ARCH_RAW (windows v1 is amd64 only)" >&2
    exit 1
    ;;
esac

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUT_DIR="${HOMEWARD_BUNDLE_OUT_DIR:-$REPO/dist/windows/$ARCH}"
if [[ "$OUT_DIR" != /* && "$OUT_DIR" != [A-Za-z]:* ]]; then
  OUT_DIR="$REPO/$OUT_DIR"
fi
STAGE="$OUT_DIR/Homeward-windows-amd64"
ISS="$REPO/desktop/pack/homeward.iss"
BUNDLE_SCRIPT="$SCRIPT_DIR/bundle-windows.sh"
VERSION="${HOMEWARD_VERSION:-0.1.0}"
EXE="$OUT_DIR/Homeward-windows-amd64.exe"

is_windows_host() {
  case "$(uname -s 2>/dev/null || true)" in
    MINGW*|MSYS*|CYGWIN*|Windows_NT) return 0 ;;
  esac
  [[ "${OS:-}" == "Windows_NT" ]]
}

unix_to_iss_path() {
  local p="$1"
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -w "$p"
    return 0
  fi
  python3 -c 'import os,sys; print(os.path.abspath(sys.argv[1]))' "$p"
}

find_iscc() {
  if command -v ISCC >/dev/null 2>&1; then
    command -v ISCC
    return 0
  fi
  if command -v iscc >/dev/null 2>&1; then
    command -v iscc
    return 0
  fi
  local candidate
  for candidate in \
    "/c/Program Files (x86)/Inno Setup 6/ISCC.exe" \
    "/c/Program Files/Inno Setup 6/ISCC.exe" \
    "C:/Program Files (x86)/Inno Setup 6/ISCC.exe" \
    "C:/Program Files/Inno Setup 6/ISCC.exe"; do
    if [[ -x "$candidate" || -f "$candidate" ]]; then
      printf '%s' "$candidate"
      return 0
    fi
  done
  return 1
}

run_iscc() {
  local source_dir output_dir iss_path
  local -a defs
  source_dir="$(unix_to_iss_path "$STAGE")"
  output_dir="$(unix_to_iss_path "$OUT_DIR")"
  iss_path="$(unix_to_iss_path "$ISS")"
  defs=(
    "/DMyAppVersion=$VERSION"
    "/DHomewardSourceDir=$source_dir"
    "/DHomewardOutputDir=$output_dir"
  )
  if [[ -f "$REPO/desktop/pack/icon.ico" ]]; then
    defs+=( "/DHomewardIcon=$(unix_to_iss_path "$REPO/desktop/pack/icon.ico")" )
  elif [[ -f "$STAGE/resources/icon.ico" ]]; then
    defs+=( "/DHomewardIcon=$(unix_to_iss_path "$STAGE/resources/icon.ico")" )
  fi

  if iscc_bin="$(find_iscc)"; then
    echo "compiling Inno Setup with $iscc_bin"
    "$iscc_bin" "${defs[@]}" "$iss_path"
    return 0
  fi

  if command -v wine >/dev/null 2>&1 && [[ -n "${HOMEWARD_WINE_ISCC:-}" && -f "$HOMEWARD_WINE_ISCC" ]]; then
    echo "compiling Inno Setup with wine"
    wine "$HOMEWARD_WINE_ISCC" "${defs[@]}" "$iss_path"
    return 0
  fi

  if command -v docker >/dev/null 2>&1; then
    echo "compiling Inno Setup with docker amake/innosetup"
    docker run --rm \
      -v "$REPO:/work" \
      -v "$OUT_DIR:/out" \
      amake/innosetup \
      "/DMyAppVersion=$VERSION" \
      "/DHomewardSourceDir=/out/Homeward-windows-amd64" \
      "/DHomewardOutputDir=/out" \
      /work/desktop/pack/homeward.iss
    return 0
  fi

  return 1
}

if [[ "${HOMEWARD_EXE_SKIP_BUNDLE:-0}" != "1" ]]; then
  "$BUNDLE_SCRIPT" "$ARCH"
fi

if [[ ! -d "$STAGE/resources/policies" ]]; then
  echo "missing Windows payload: $STAGE (run bundle-windows.sh first)" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

if [[ "${HOMEWARD_EXE_SKIP_COMPILE:-0}" == "1" ]]; then
  echo "skip Inno Setup compile (HOMEWARD_EXE_SKIP_COMPILE=1)"
  echo "payload is at $STAGE"
  exit 0
fi

if ! run_iscc; then
  echo "Inno Setup compiler (ISCC) not found." >&2
  echo "Install Inno Setup 6 on Windows, or set docker, or HOMEWARD_EXE_SKIP_COMPILE=1 for payload-only." >&2
  exit 1
fi

if [[ ! -f "$EXE" ]]; then
  # ISCC may write next to the .iss when OutputDir mapping differs.
  alt="$REPO/desktop/pack/Homeward-windows-amd64.exe"
  if [[ -f "$alt" ]]; then
    mv "$alt" "$EXE"
  fi
fi

if [[ ! -f "$EXE" ]]; then
  echo "expected installer $EXE was not produced" >&2
  exit 1
fi

echo "wrote $EXE"
