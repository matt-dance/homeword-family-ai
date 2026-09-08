#!/usr/bin/env bash
# Assemble dist/linux/amd64/Homeward-linux-amd64 and its .tar.gz.
# Linux family v1 is amd64 only. Never embeds Ollama model weights.
#
# A family tarball should be produced with Docker (Ubuntu) so the
# supervisor can link GTK/AppIndicator and CPython/gateway are Linux.
# HOMEWARD_BUNDLE_SKIP_DOWNLOADS=1 is a layout helper; it cannot produce
# a family tarball.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: bundle-linux.sh [amd64]

Assemble Homeward-linux-amd64 under dist/linux/amd64/ and write
Homeward-linux-amd64.tar.gz.

  HOMEWARD_BUNDLE_SKIP_DOWNLOADS=1
      Create the directory tree, copy policies, and write install/uninstall
      scripts without fetching Node, CPython, Ollama, ffmpeg, or espeak.
      Does not fail if the linux homeward supervisor is missing.

A family Linux tarball should be produced with Docker (Ubuntu), especially
from macOS (CGO/GTK cannot be linked here). Skip mode cannot produce one.

Linux v1 is amd64 only.
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
    echo "unsupported arch: $ARCH_RAW (linux v1 is amd64 only)" >&2
    exit 1
    ;;
esac

SKIP="${HOMEWARD_BUNDLE_SKIP_DOWNLOADS:-0}"
HOST="$(uname -s)"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUT_DIR="$REPO/dist/linux/$ARCH"
STAGE="$OUT_DIR/Homeward-linux-amd64"
TARBALL="$OUT_DIR/Homeward-linux-amd64.tar.gz"
RES="$STAGE/resources"
RUNTIME="$RES/runtime"

maybe_reexec_docker() {
  if [[ "${HOMEWARD_BUNDLE_IN_CONTAINER:-0}" == "1" ]]; then
    return 0
  fi
  if [[ "$SKIP" == "1" ]]; then
    return 0
  fi
  if [[ "$HOST" == "Linux" ]]; then
    return 0
  fi
  if ! command -v docker >/dev/null 2>&1; then
    echo "A family Linux tarball should be produced with Docker (Ubuntu)." >&2
    echo "Install Docker Desktop and re-run, or run this script on Linux amd64." >&2
    echo "Skip-downloads layout: HOMEWARD_BUNDLE_SKIP_DOWNLOADS=1 $0 amd64" >&2
    exit 1
  fi
  echo "re-executing inside Ubuntu (linux amd64; CGO/GTK + linux runtimes)"
  exec docker run --rm \
    --platform linux/amd64 \
    -v "$REPO:/src" \
    -w /src \
    -e HOMEWARD_BUNDLE_IN_CONTAINER=1 \
    -e HOMEWARD_BUNDLE_SKIP_DOWNLOADS=0 \
    -e HOMEWARD_NODE_VERSION="${HOMEWARD_NODE_VERSION:-}" \
    -e HOMEWARD_OLLAMA_VERSION="${HOMEWARD_OLLAMA_VERSION:-}" \
    ubuntu:24.04 \
    bash /src/desktop/scripts/bundle-linux.sh amd64
}

maybe_reexec_docker

bootstrap_container() {
  if [[ "${HOMEWARD_BUNDLE_IN_CONTAINER:-0}" != "1" ]]; then
    return 0
  fi
  if [[ "$SKIP" == "1" ]]; then
    return 0
  fi
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y --no-install-recommends \
    ca-certificates curl tar xz-utils git \
    gcc pkg-config \
    libgtk-3-dev libayatana-appindicator3-dev \
    espeak-ng \
    python3
  if ! command -v go >/dev/null 2>&1; then
    local tmp
    tmp="$(mktemp -d)"
    curl -fsSL -o "$tmp/go.tgz" https://go.dev/dl/go1.22.12.linux-amd64.tar.gz
    rm -rf /usr/local/go
    tar -C /usr/local -xzf "$tmp/go.tgz"
    rm -rf "$tmp"
  fi
  export PATH="/usr/local/go/bin:${PATH}"
  if ! command -v uv >/dev/null 2>&1; then
    curl -LsSf https://astral.sh/uv/install.sh | sh
  fi
  export PATH="${HOME}/.local/bin:${PATH}"
}

if [[ "$SKIP" != "1" ]]; then
  bootstrap_container
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
if [[ -f "$REPO/desktop/pack/icon.png" ]]; then
  cp "$REPO/desktop/pack/icon.png" "$RES/icon.png"
fi

cp "$SCRIPT_DIR/install-linux.sh" "$STAGE/install.sh"
cp "$SCRIPT_DIR/uninstall-linux.sh" "$STAGE/uninstall.sh"
chmod +x "$STAGE/install.sh" "$STAGE/uninstall.sh"

is_linux_amd64_elf() {
  local f="$1"
  [[ -f "$f" ]] || return 1
  if command -v file >/dev/null 2>&1; then
    file -b "$f" | grep -q 'ELF 64-bit.*x86-64\|ELF 64-bit LSB.*x86-64'
    return $?
  fi
  python3 -c '
import sys
p = open(sys.argv[1], "rb").read(20)
sys.exit(0 if p[:4] == b"\x7fELF" and p[4] == 2 and int.from_bytes(p[18:20], "little") == 62 else 1)
' "$f"
}

find_linux_supervisor() {
  local c
  for c in "$REPO/desktop/homeward" "$REPO/desktop/bin/homeward"; do
    if is_linux_amd64_elf "$c"; then
      printf '%s' "$c"
      return 0
    fi
  done
  return 1
}

build_supervisor() {
  (
    cd "$REPO/desktop"
    GOOS=linux GOARCH="$GOARCH" CGO_ENABLED=1 \
      go build -o "$STAGE/homeward" ./cmd/homeward
  )
}

copy_or_build_supervisor() {
  local src=""
  if src="$(find_linux_supervisor)"; then
    cp "$src" "$STAGE/homeward"
    chmod +x "$STAGE/homeward"
    return 0
  fi
  if [[ "$(uname -s)" == "Linux" ]]; then
    build_supervisor
    chmod +x "$STAGE/homeward"
    return 0
  fi
  if [[ "$SKIP" == "1" ]]; then
    echo "skip homeward binary (no linux amd64 ELF at desktop build output; HOMEWARD_BUNDLE_SKIP_DOWNLOADS=1)"
    return 0
  fi
  echo "linux amd64 homeward supervisor missing (build on Linux or in Docker)" >&2
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
  local node_bin="$RUNTIME/node/bin"
  (
    if [[ -x "$node_bin/npm" ]]; then
      PATH="$node_bin:$PATH"
      export PATH
    fi
    cd "$REPO/web" && npm ci && npm run build
  )
  copy_web_standalone
}

realpath_portable() {
  python3 -c 'import os, sys; print(os.path.realpath(sys.argv[1]))' "$1"
}

find_cpython_prefix() {
  local dir="$1"
  local d
  for d in "$dir"/cpython-*; do
    if [[ -d "$d" ]] && { [[ -e "$d/bin/python" ]] || [[ -e "$d/bin/python3" ]] || [[ -e "$d/bin/python3.12" ]]; }; then
      printf '%s' "$d"
      return 0
    fi
  done
  return 1
}

install_node() {
  local version="${HOMEWARD_NODE_VERSION:-22.22.2}"
  local tarball="node-v${version}-linux-${NODE_ARCH}.tar.gz"
  local url="https://nodejs.org/dist/v${version}/${tarball}"
  local tmp
  tmp="$(mktemp -d)"
  echo "downloading Node ${version} (linux-${NODE_ARCH})"
  curl -fsSL -o "$tmp/$tarball" "$url"
  tar -xzf "$tmp/$tarball" -C "$tmp"
  local src
  src="$(find "$tmp" -maxdepth 1 -type d -name 'node-v*' | head -n 1)"
  if [[ -z "$src" ]]; then
    echo "Node tarball layout unexpected" >&2
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
  echo "installing standalone CPython 3.12 into the tarball (not the builder uv cache)"
  local managed prefix resolved
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
  if [[ ! -e "$RUNTIME/python/bin/python" ]]; then
    if [[ -e "$RUNTIME/python/bin/python3" ]]; then
      ln -s python3 "$RUNTIME/python/bin/python"
    elif [[ -e "$RUNTIME/python/bin/python3.12" ]]; then
      ln -s python3.12 "$RUNTIME/python/bin/python"
    else
      echo "standalone CPython prefix has no bin/python*" >&2
      exit 1
    fi
  fi
  resolved="$(realpath_portable "$RUNTIME/python/bin/python")"
  case "$resolved" in
    "$STAGE"/*) ;;
    *)
      echo "embedded CPython resolves outside the tarball: $resolved" >&2
      exit 1
      ;;
  esac
  rm -f "$RUNTIME/python"/lib/python3.*/EXTERNALLY-MANAGED
  uv pip install --python "$RUNTIME/python/bin/python" --break-system-packages "$REPO/gateway"
  rm -rf "$managed"
}

install_ollama() {
  # Official engine tarball only — never model weights / blobs / GGUF.
  local version="${HOMEWARD_OLLAMA_VERSION:-v0.33.3}"
  local tmp dest
  tmp="$(mktemp -d)"
  dest="$RUNTIME/ollama"
  local url="https://github.com/ollama/ollama/releases/download/${version}/ollama-linux-amd64.tgz"
  echo "downloading official Ollama ${version} (engine only, no model weights)"
  if ! curl -fsSL -o "$tmp/ollama.tgz" "$url"; then
    curl -fsSL -o "$tmp/ollama.tgz" \
      "https://github.com/ollama/ollama/releases/download/${version}/ollama-linux-amd64.tar.gz"
  fi
  tar -xzf "$tmp/ollama.tgz" -C "$dest"
  if [[ -f "$dest/bin/ollama" && ! -f "$dest/ollama" ]]; then
    mv "$dest/bin/ollama" "$dest/ollama"
  elif [[ ! -f "$dest/ollama" ]]; then
    local bin
    bin="$(find "$dest" -type f -name ollama | head -n 1 || true)"
    if [[ -n "$bin" && "$bin" != "$dest/ollama" ]]; then
      cp "$bin" "$dest/ollama"
    fi
  fi
  if [[ ! -f "$dest/ollama" ]]; then
    echo "ollama binary missing from official tarball" >&2
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
  # Static official-style build so the tarball does not need distro ffmpeg.
  local tmp src
  tmp="$(mktemp -d)"
  echo "downloading static linux amd64 ffmpeg"
  if curl -fsSL -A "homeward-bundle" \
    -o "$tmp/ffmpeg.tar.xz" \
    "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz"; then
    tar -xJf "$tmp/ffmpeg.tar.xz" -C "$tmp"
    src="$(find "$tmp" -type f -name ffmpeg | head -n 1 || true)"
    if [[ -n "$src" ]]; then
      cp "$src" "$RUNTIME/ffmpeg/bin/ffmpeg"
      chmod +x "$RUNTIME/ffmpeg/bin/ffmpeg"
      rm -rf "$tmp"
      return 0
    fi
  fi
  rm -rf "$tmp"
  if command -v ffmpeg >/dev/null 2>&1; then
    echo "static ffmpeg download failed; copying host ffmpeg (may need distro libs)"
    cp "$(command -v ffmpeg)" "$RUNTIME/ffmpeg/bin/ffmpeg"
    chmod +x "$RUNTIME/ffmpeg/bin/ffmpeg"
    return 0
  fi
  echo "ffmpeg missing (download static linux build or install ffmpeg)" >&2
  exit 1
}

copy_espeak_data() {
  local data
  for data in \
    /usr/share/espeak-ng-data \
    /usr/lib/x86_64-linux-gnu/espeak-ng-data \
    /usr/lib/espeak-ng-data; do
    if [[ -d "$data" ]]; then
      mkdir -p "$RUNTIME/espeak/share"
      rm -rf "$RUNTIME/espeak/share/espeak-ng-data"
      cp -R "$data" "$RUNTIME/espeak/share/espeak-ng-data"
      return 0
    fi
  done
  return 1
}

bundle_espeak_libs() {
  local bin="$1"
  local libdir="$RUNTIME/espeak/lib"
  mkdir -p "$libdir"
  if ! command -v ldd >/dev/null 2>&1; then
    return 0
  fi
  local line lib base
  while IFS= read -r line; do
    lib="$(printf '%s' "$line" | awk '/=>/ {print $3}')"
    [[ -z "$lib" || ! -f "$lib" ]] && continue
    base="$(basename "$lib")"
    case "$base" in
      libc.so*|libm.so*|libdl.so*|libpthread.so*|libresolv.so*|librt.so*|ld-linux*)
        continue
        ;;
    esac
    cp -L "$lib" "$libdir/$base"
  done < <(ldd "$bin" 2>/dev/null || true)
  if [[ -d "$libdir" ]] && [[ -n "$(ls -A "$libdir" 2>/dev/null || true)" ]]; then
    mv "$bin" "$RUNTIME/espeak/bin/espeak-ng.bin"
    cat > "$RUNTIME/espeak/bin/espeak-ng" <<'EOF'
#!/bin/sh
HERE="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
export LD_LIBRARY_PATH="$HERE/../lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
exec "$HERE/espeak-ng.bin" "$@"
EOF
    chmod +x "$RUNTIME/espeak/bin/espeak-ng" "$RUNTIME/espeak/bin/espeak-ng.bin"
  fi
}

install_espeak() {
  local src=""
  if command -v espeak-ng >/dev/null 2>&1; then
    src="$(command -v espeak-ng)"
  elif [[ -x /usr/bin/espeak-ng ]]; then
    src=/usr/bin/espeak-ng
  fi
  if [[ -z "$src" ]]; then
    echo "espeak-ng missing (install espeak-ng in the Ubuntu build container)" >&2
    exit 1
  fi
  mkdir -p "$RUNTIME/espeak/bin" "$RUNTIME/espeak/share"
  cp "$src" "$RUNTIME/espeak/bin/espeak-ng"
  chmod +x "$RUNTIME/espeak/bin/espeak-ng"
  bundle_espeak_libs "$RUNTIME/espeak/bin/espeak-ng"
  if ! copy_espeak_data; then
    echo "espeak-ng-data missing (expected under /usr/share or /usr/lib)" >&2
    exit 1
  fi
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
  echo "A family Linux tarball cannot be produced in skip mode."
  if [[ ! -d "$REPO/web/node_modules" ]]; then
    echo "skip npm (web/node_modules missing; HOMEWARD_BUNDLE_SKIP_DOWNLOADS=1)"
  fi
  copy_web_standalone
fi

chmod_if_present() {
  local path="$1"
  if [[ -e "$path" ]]; then
    chmod +x "$path"
  fi
}

chmod_if_present "$STAGE/homeward"
chmod_if_present "$STAGE/install.sh"
chmod_if_present "$STAGE/uninstall.sh"
chmod_if_present "$RUNTIME/node/bin/node"
chmod_if_present "$RUNTIME/python/bin/python"
chmod_if_present "$RUNTIME/python/bin/python3"
chmod_if_present "$RUNTIME/ollama/ollama"
chmod_if_present "$RUNTIME/ffmpeg/bin/ffmpeg"
chmod_if_present "$RUNTIME/espeak/bin/espeak-ng"

test -d "$RES/policies"
test -x "$STAGE/install.sh"
test -x "$STAGE/uninstall.sh"

if [[ "$SKIP" == "1" ]]; then
  if [[ -e "$STAGE/homeward" ]]; then
    test -x "$STAGE/homeward"
  fi
  if [[ -e "$RES/web/server.js" ]]; then
    test -f "$RES/web/server.js"
  fi
  echo "skip ffmpeg verify (HOMEWARD_BUNDLE_SKIP_DOWNLOADS=1)"
  echo "A family Linux tarball cannot be produced in skip mode."
else
  "$RUNTIME/ffmpeg/bin/ffmpeg" -version >/dev/null
  test -x "$STAGE/homeward"
  test -f "$RES/web/server.js"
  test -d "$RES/policies"
fi

mkdir -p "$OUT_DIR"
rm -f "$TARBALL"
(
  cd "$OUT_DIR"
  COPYFILE_DISABLE=1 tar -czf "Homeward-linux-amd64.tar.gz" "Homeward-linux-amd64"
)

echo "assembled $STAGE"
echo "wrote $TARBALL"
