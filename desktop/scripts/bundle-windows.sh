#!/usr/bin/env bash
# Assemble dist/windows/amd64/Homeward-windows-amd64 (Windows family payload).
# Windows family v1 is amd64 only. Never embeds Ollama model weights.
#
# A family installer must be produced on Windows (Git Bash) so the
# supervisor can link the tray (CGO) and CPython/gateway are Windows
# binaries. HOMEWARD_BUNDLE_SKIP_DOWNLOADS=1 is a layout helper; it
# cannot produce a family installer.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: bundle-windows.sh [amd64]

Assemble Homeward-windows-amd64 under dist/windows/amd64/.

  HOMEWARD_BUNDLE_SKIP_DOWNLOADS=1
      Create the directory tree and copy policies without fetching
      Node, CPython, Ollama, ffmpeg, or espeak. A family installer
      cannot be produced in skip mode.

  HOMEWARD_BUNDLE_OUT_DIR=<dir>
      Write Homeward-windows-amd64 under this directory instead of
      dist/windows/amd64. Layout tests use a temp dir.

A family Windows installer must be produced on Windows. Skip mode
cannot produce one.

Windows v1 is amd64 only. Public web port is 43123 (not 80).
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
    GOARCH="amd64"
    NODE_ARCH="x64"
    ;;
  *)
    echo "unsupported arch: $ARCH_RAW (windows v1 is amd64 only)" >&2
    exit 1
    ;;
esac

SKIP="${HOMEWARD_BUNDLE_SKIP_DOWNLOADS:-0}"

is_windows_host() {
  case "$(uname -s 2>/dev/null || true)" in
    MINGW*|MSYS*|CYGWIN*|Windows_NT) return 0 ;;
  esac
  [[ "${OS:-}" == "Windows_NT" ]]
}

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUT_DIR="${HOMEWARD_BUNDLE_OUT_DIR:-$REPO/dist/windows/$ARCH}"
if [[ "$OUT_DIR" != /* && "$OUT_DIR" != [A-Za-z]:* ]]; then
  OUT_DIR="$REPO/$OUT_DIR"
fi
STAGE="$OUT_DIR/Homeward-windows-amd64"
RES="$STAGE/resources"
RUNTIME="$RES/runtime"

if ! is_windows_host && [[ "$SKIP" != "1" ]]; then
  echo "A family Windows installer must be produced on Windows." >&2
  echo "Skip-downloads layout: HOMEWARD_BUNDLE_SKIP_DOWNLOADS=1 $0 amd64" >&2
  exit 1
fi

rm -rf "$STAGE"
mkdir -p \
  "$STAGE" \
  "$RUNTIME/python" \
  "$RUNTIME/node" \
  "$RUNTIME/ollama" \
  "$RUNTIME/ffmpeg/bin" \
  "$RUNTIME/espeak/bin" \
  "$RUNTIME/espeak/share/espeak-ng-data" \
  "$RES/policies" \
  "$RES/web"

cp -R "$REPO/policies/." "$RES/policies/"
if [[ -f "$REPO/desktop/pack/icon.svg" ]]; then
  cp "$REPO/desktop/pack/icon.svg" "$RES/icon.svg"
fi
if [[ -f "$REPO/desktop/pack/icon.ico" ]]; then
  cp "$REPO/desktop/pack/icon.ico" "$RES/icon.ico"
fi

extract_zip() {
  local zip="$1" dest="$2"
  mkdir -p "$dest"
  python3 -c 'import zipfile, sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])' "$zip" "$dest"
}

is_windows_pe() {
  local f="$1"
  [[ -f "$f" ]] || return 1
  python3 -c '
import sys
p = open(sys.argv[1], "rb").read(2)
sys.exit(0 if p == b"MZ" else 1)
' "$f"
}

find_windows_supervisor() {
  local c
  for c in "$REPO/desktop/Homeward.exe" "$REPO/desktop/bin/Homeward.exe"; do
    if is_windows_pe "$c"; then
      printf '%s' "$c"
      return 0
    fi
  done
  return 1
}

build_supervisor() {
  local cgo=0
  if is_windows_host; then
    cgo="${CGO_ENABLED:-0}"
  fi
  echo "building windows amd64 Homeward.exe (CGO_ENABLED=$cgo)"
  (
    cd "$REPO/desktop"
    GOOS=windows GOARCH="$GOARCH" CGO_ENABLED="$cgo" \
      go build -ldflags="-H=windowsgui" -o "$STAGE/Homeward.exe" ./cmd/homeward
  )
}

copy_or_build_supervisor() {
  local src=""
  if src="$(find_windows_supervisor)"; then
    cp "$src" "$STAGE/Homeward.exe"
    return 0
  fi
  if build_supervisor; then
    return 0
  fi
  if [[ "$SKIP" == "1" ]]; then
    echo "skip Homeward.exe (no windows amd64 PE at desktop build output; HOMEWARD_BUNDLE_SKIP_DOWNLOADS=1)"
    return 0
  fi
  echo "windows amd64 Homeward.exe supervisor missing (build on Windows)" >&2
  exit 1
}

copy_or_build_supervisor

copy_web_standalone() {
  local standalone="$REPO/web/.next/standalone"
  if [[ ! -d "$standalone" ]]; then
    return 0
  fi
  cp -R "$standalone/." "$RES/web/"
  if [[ -d "$REPO/web/.next/static" ]]; then
    mkdir -p "$RES/web/.next/static"
    cp -R "$REPO/web/.next/static/." "$RES/web/.next/static/"
  fi
  if [[ -d "$REPO/web/public" ]]; then
    mkdir -p "$RES/web/public"
    cp -R "$REPO/web/public/." "$RES/web/public/"
  fi
}

build_web() {
  local node_bin="$RUNTIME/node"
  (
    if [[ -x "$node_bin/npm" || -x "$node_bin/npm.cmd" ]]; then
      PATH="$node_bin:$PATH"
      export PATH
    fi
    cd "$REPO/web" && npm ci && npm run build
  )
  copy_web_standalone
}

find_cpython_prefix() {
  local dir="$1"
  local d
  for d in "$dir"/cpython-*; do
    if [[ -d "$d" ]] && { [[ -f "$d/python.exe" ]] || [[ -e "$d/bin/python" ]]; }; then
      printf '%s' "$d"
      return 0
    fi
  done
  return 1
}

install_node() {
  local version="${HOMEWARD_NODE_VERSION:-22.22.2}"
  local zip="node-v${version}-win-${NODE_ARCH}.zip"
  local url="https://nodejs.org/dist/v${version}/${zip}"
  local tmp
  tmp="$(mktemp -d)"
  echo "downloading Node ${version} (win-${NODE_ARCH})"
  curl -fsSL -o "$tmp/$zip" "$url"
  extract_zip "$tmp/$zip" "$tmp"
  local src
  src="$(find "$tmp" -maxdepth 1 -type d -name 'node-v*' | head -n 1)"
  if [[ -z "$src" ]]; then
    echo "Node zip layout unexpected" >&2
    exit 1
  fi
  cp -R "$src/." "$RUNTIME/node/"
  rm -rf "$tmp"
}

install_python_gateway() {
  if ! command -v uv >/dev/null 2>&1; then
    echo "uv is required to embed CPython 3.12 and install gateway" >&2
    exit 1
  fi
  echo "installing standalone CPython 3.12 into the Windows payload"
  local managed prefix
  managed="$RUNTIME/.uv-managed-python"
  rm -rf "$managed"
  mkdir -p "$managed"
  UV_PYTHON_INSTALL_DIR="$managed" uv python install 3.12
  if ! prefix="$(find_cpython_prefix "$managed")"; then
    echo "uv python install 3.12 did not produce a cpython-* prefix under $managed" >&2
    exit 1
  fi
  rm -rf "$RUNTIME/python"
  mkdir -p "$RUNTIME/python"
  cp -R "$prefix/." "$RUNTIME/python/"
  if [[ ! -f "$RUNTIME/python/python.exe" ]]; then
    echo "standalone CPython prefix has no python.exe" >&2
    exit 1
  fi
  rm -f "$RUNTIME/python"/Lib/EXTERNALLY-MANAGED
  uv pip install --python "$RUNTIME/python/python.exe" --break-system-packages "$REPO/gateway"
  rm -rf "$managed"
}

install_ollama() {
  # Official engine zip only — never model weights / blobs / GGUF.
  local version="${HOMEWARD_OLLAMA_VERSION:-v0.33.3}"
  local tmp dest
  tmp="$(mktemp -d)"
  dest="$RUNTIME/ollama"
  local url="https://github.com/ollama/ollama/releases/download/${version}/ollama-windows-amd64.zip"
  echo "downloading official Ollama ${version} (engine only, no model weights)"
  curl -fsSL -L -o "$tmp/ollama.zip" "$url"
  extract_zip "$tmp/ollama.zip" "$dest"
  if [[ -f "$dest/bin/ollama.exe" && ! -f "$dest/ollama.exe" ]]; then
    mv "$dest/bin/ollama.exe" "$dest/ollama.exe"
  elif [[ ! -f "$dest/ollama.exe" ]]; then
    local bin
    bin="$(find "$dest" -type f -name ollama.exe | head -n 1 || true)"
    if [[ -n "$bin" && "$bin" != "$dest/ollama.exe" ]]; then
      cp "$bin" "$dest/ollama.exe"
    fi
  fi
  if [[ ! -f "$dest/ollama.exe" ]]; then
    echo "ollama.exe missing from official zip" >&2
    exit 1
  fi
  local license=""
  license="$(find "$dest" "$tmp" -iname LICENSE -o -iname LICENSE.txt 2>/dev/null | head -n 1 || true)"
  if [[ -n "$license" ]]; then
    cp "$license" "$dest/LICENSE"
  else
    curl -fsSL -o "$dest/LICENSE" \
      "https://raw.githubusercontent.com/ollama/ollama/${version}/LICENSE"
  fi
  rm -rf "$tmp"
}

install_ffmpeg() {
  local tmp src url
  tmp="$(mktemp -d)"
  url="${HOMEWARD_FFMPEG_WINDOWS_URL:-https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip}"
  echo "downloading Windows ffmpeg essentials"
  if curl -fsSL -L -A "homeward-bundle" -o "$tmp/ffmpeg.zip" "$url"; then
    extract_zip "$tmp/ffmpeg.zip" "$tmp"
    src="$(find "$tmp" -type f -name ffmpeg.exe | head -n 1 || true)"
    if [[ -n "$src" ]]; then
      cp "$src" "$RUNTIME/ffmpeg/bin/ffmpeg.exe"
      rm -rf "$tmp"
      return 0
    fi
  fi
  rm -rf "$tmp"
  if command -v ffmpeg.exe >/dev/null 2>&1; then
    cp "$(command -v ffmpeg.exe)" "$RUNTIME/ffmpeg/bin/ffmpeg.exe"
    return 0
  fi
  echo "ffmpeg.exe missing (download Windows essentials zip or put ffmpeg on PATH)" >&2
  exit 1
}

install_espeak() {
  local version="${HOMEWARD_ESPEAK_VERSION:-1.52.0}"
  local tmp msi url src data
  tmp="$(mktemp -d)"
  url="https://github.com/espeak-ng/espeak-ng/releases/download/${version}/espeak-ng.msi"
  echo "downloading espeak-ng ${version} Windows MSI"
  if curl -fsSL -L -o "$tmp/espeak-ng.msi" "$url"; then
    if command -v 7z >/dev/null 2>&1; then
      7z x -y -o"$tmp/msi" "$tmp/espeak-ng.msi" >/dev/null
    elif command -v msiexec.exe >/dev/null 2>&1; then
      msiexec.exe /a "$tmp/espeak-ng.msi" TARGETDIR="$(cygpath -w "$tmp/msi" 2>/dev/null || echo "$tmp/msi")" /qn || true
    elif command -v msiextract >/dev/null 2>&1; then
      mkdir -p "$tmp/msi"
      msiextract -C "$tmp/msi" "$tmp/espeak-ng.msi" >/dev/null
    fi
  fi
  src="$(find "$tmp" -type f -name espeak-ng.exe | head -n 1 || true)"
  if [[ -z "$src" ]] && command -v espeak-ng.exe >/dev/null 2>&1; then
    src="$(command -v espeak-ng.exe)"
  fi
  if [[ -z "$src" ]]; then
    echo "espeak-ng.exe missing (install espeak-ng or keep 7z/msiexec on PATH)" >&2
    rm -rf "$tmp"
    exit 1
  fi
  cp "$src" "$RUNTIME/espeak/bin/espeak-ng.exe"
  data="$(find "$tmp" -type d -name espeak-ng-data | head -n 1 || true)"
  if [[ -n "$data" ]]; then
    rm -rf "$RUNTIME/espeak/share/espeak-ng-data"
    cp -R "$data" "$RUNTIME/espeak/share/espeak-ng-data"
  fi
  rm -rf "$tmp"
}

if [[ "$SKIP" != "1" ]]; then
  install_node
  build_web
  install_python_gateway
  install_ollama
  install_ffmpeg
  install_espeak
else
  echo "skip Node/uv/Ollama/ffmpeg/espeak downloads (HOMEWARD_BUNDLE_SKIP_DOWNLOADS=1)"
  echo "A family Windows installer cannot be produced in skip mode."
  if [[ ! -d "$REPO/web/node_modules" ]]; then
    echo "skip npm (web/node_modules missing; HOMEWARD_BUNDLE_SKIP_DOWNLOADS=1)"
  fi
  copy_web_standalone
fi

test -d "$RES/policies"
test -f "$RES/policies/young_explorer.yaml"

if [[ "$SKIP" == "1" ]]; then
  if [[ -e "$STAGE/Homeward.exe" ]]; then
    test -f "$STAGE/Homeward.exe"
  fi
  if [[ -e "$RES/web/server.js" ]]; then
    test -f "$RES/web/server.js"
  fi
  echo "skip ffmpeg verify (HOMEWARD_BUNDLE_SKIP_DOWNLOADS=1)"
  echo "A family Windows installer cannot be produced in skip mode."
else
  test -f "$STAGE/Homeward.exe"
  test -f "$RUNTIME/ffmpeg/bin/ffmpeg.exe"
  test -f "$RES/web/server.js"
  test -d "$RES/policies"
fi

echo "assembled $STAGE"
