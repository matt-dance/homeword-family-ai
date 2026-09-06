#!/usr/bin/env bash
# Assemble dist/macos/<arch>/Homeward.app (macOS family builds only).
# A family DMG cannot be produced except on a Mac.
# HOMEWARD_BUNDLE_SKIP_DOWNLOADS=1 cannot produce a family DMG.
# Never embeds Ollama model weights.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: bundle-macos.sh [arm64|amd64]

Assemble Homeward.app under dist/macos/<arch>/.

  HOMEWARD_BUNDLE_SKIP_DOWNLOADS=1
      Create the Contents tree and copy policies without fetching
      Node, CPython, Ollama, ffmpeg, or espeak. A family DMG cannot
      be produced in skip mode.

A family DMG cannot be produced except on a Mac.
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

ARCH_RAW="${1:-$(uname -m)}"
case "$ARCH_RAW" in
  arm64|aarch64)
    ARCH="arm64"
    GOARCH="arm64"
    NODE_ARCH="arm64"
    ;;
  x86_64|amd64)
    ARCH="amd64"
    GOARCH="amd64"
    NODE_ARCH="x64"
    ;;
  *)
    echo "unsupported arch: $ARCH_RAW (use arm64 or amd64)" >&2
    exit 1
    ;;
esac

SKIP="${HOMEWARD_BUNDLE_SKIP_DOWNLOADS:-0}"
HOST="$(uname -s)"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/../.." && pwd)"
APP="$REPO/dist/macos/$ARCH/Homeward.app"
CONTENTS="$APP/Contents"
MACOS_DIR="$CONTENTS/MacOS"
RES="$CONTENTS/Resources"
RUNTIME="$RES/runtime"

if [[ "$HOST" != "Darwin" && "$SKIP" != "1" ]]; then
  echo "must build on a Mac" >&2
  exit 1
fi

rm -rf "$APP"
mkdir -p \
  "$MACOS_DIR" \
  "$RUNTIME/python" \
  "$RUNTIME/node" \
  "$RUNTIME/ollama" \
  "$RUNTIME/ffmpeg/bin" \
  "$RUNTIME/espeak" \
  "$RES/policies" \
  "$RES/web"

cp "$REPO/desktop/pack/Info.plist" "$CONTENTS/Info.plist"
cp -R "$REPO/policies/." "$RES/policies/"

build_supervisor() {
  (
    cd "$REPO/desktop"
    GOOS=darwin GOARCH="$GOARCH" CGO_ENABLED=1 \
      go build -o "$MACOS_DIR/Homeward" ./cmd/homeward
  )
}

if [[ "$HOST" == "Darwin" ]]; then
  build_supervisor
elif [[ "$SKIP" == "1" ]]; then
  echo "skip go build (not Darwin; HOMEWARD_BUNDLE_SKIP_DOWNLOADS=1)"
  echo "A family DMG cannot be produced except on a Mac."
else
  echo "must build on a Mac" >&2
  exit 1
fi

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

if [[ "$SKIP" == "1" ]]; then
  if [[ ! -d "$REPO/web/node_modules" ]]; then
    echo "skip npm (web/node_modules missing; HOMEWARD_BUNDLE_SKIP_DOWNLOADS=1)"
  fi
  copy_web_standalone
else
  (cd "$REPO/web" && npm ci && npm run build)
  copy_web_standalone
fi

relpath_to_frameworks() {
  # @executable_path relative from a binary under Resources/runtime/<name>/bin
  printf '%s' '@executable_path/../../../Frameworks'
}

bundle_dylibs() {
  local bin="$1"
  local frameworks="$CONTENTS/Frameworks"
  mkdir -p "$frameworks"
  if command -v dylibbundler >/dev/null 2>&1; then
    dylibbundler -od -b -x "$bin" -d "$frameworks" -p "$(relpath_to_frameworks)/"
    return 0
  fi
  if ! command -v install_name_tool >/dev/null 2>&1 || ! command -v otool >/dev/null 2>&1; then
    echo "warning: neither dylibbundler nor install_name_tool available for $bin" >&2
    return 0
  fi
  local lib base
  while read -r lib; do
    case "$lib" in
      /opt/homebrew/*|/usr/local/*|/opt/local/*)
        base="$(basename "$lib")"
        if [[ -f "$lib" ]]; then
          cp "$lib" "$frameworks/$base"
          install_name_tool -change "$lib" "$(relpath_to_frameworks)/$base" "$bin"
        fi
        ;;
    esac
  done < <(otool -L "$bin" | awk '/^\t/ {print $1}')
}

brew_prefix() {
  if [[ -n "${HOMEBREW_PREFIX:-}" ]]; then
    printf '%s' "$HOMEBREW_PREFIX"
    return 0
  fi
  if command -v brew >/dev/null 2>&1; then
    brew --prefix
    return 0
  fi
  if [[ -d /opt/homebrew ]]; then
    printf '%s' /opt/homebrew
    return 0
  fi
  if [[ -d /usr/local/Homebrew || -d /usr/local/opt ]]; then
    printf '%s' /usr/local
    return 0
  fi
  return 1
}

install_node() {
  local version="${HOMEWARD_NODE_VERSION:-22.22.2}"
  local tarball="node-v${version}-darwin-${NODE_ARCH}.tar.gz"
  local url="https://nodejs.org/dist/v${version}/${tarball}"
  local tmp
  tmp="$(mktemp -d)"
  echo "downloading Node ${version} (${NODE_ARCH})"
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
  echo "installing CPython 3.12 and gateway venv"
  uv python install 3.12
  uv venv --python 3.12 "$RUNTIME/python"
  uv pip install --python "$RUNTIME/python/bin/python" "$REPO/gateway"
}

install_ollama() {
  # Official engine tarball only — never model weights / blobs / GGUF.
  local version="${HOMEWARD_OLLAMA_VERSION:-v0.33.3}"
  local tmp tgz dest
  tmp="$(mktemp -d)"
  dest="$RUNTIME/ollama"
  local url="https://github.com/ollama/ollama/releases/download/${version}/ollama-darwin.tgz"
  local arch_url="https://github.com/ollama/ollama/releases/download/${version}/ollama-darwin-${ARCH}.tgz"
  echo "downloading official Ollama ${version} (engine only, no model weights)"
  if ! curl -fsSL -o "$tmp/ollama.tgz" "$arch_url"; then
    curl -fsSL -o "$tmp/ollama.tgz" "$url"
  fi
  tar -xzf "$tmp/ollama.tgz" -C "$dest"
  local bin=""
  if [[ -f "$dest/ollama" ]]; then
    bin="$dest/ollama"
  elif [[ -f "$dest/bin/ollama" ]]; then
    mv "$dest/bin/ollama" "$dest/ollama"
    bin="$dest/ollama"
  else
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
    cp "$license" "$RES/ollama-LICENSE"
  else
    curl -fsSL -o "$RES/ollama-LICENSE" \
      "https://raw.githubusercontent.com/ollama/ollama/${version}/LICENSE"
  fi
  rm -rf "$tmp"
}

install_ffmpeg_espeak() {
  local prefix ffmpeg espeak
  prefix="$(brew_prefix)" || {
    echo "Homebrew prefix not found (need ffmpeg and espeak-ng)" >&2
    exit 1
  }
  ffmpeg=""
  for candidate in \
    "$prefix/opt/ffmpeg/bin/ffmpeg" \
    "$prefix/bin/ffmpeg"; do
    if [[ -x "$candidate" ]]; then
      ffmpeg="$candidate"
      break
    fi
  done
  if [[ -z "$ffmpeg" ]]; then
    echo "ffmpeg missing from Homebrew prefix $prefix" >&2
    exit 1
  fi
  cp "$ffmpeg" "$RUNTIME/ffmpeg/bin/ffmpeg"
  bundle_dylibs "$RUNTIME/ffmpeg/bin/ffmpeg"

  mkdir -p "$RUNTIME/espeak/bin"
  espeak=""
  for candidate in \
    "$prefix/opt/espeak-ng/bin/espeak-ng" \
    "$prefix/bin/espeak-ng"; do
    if [[ -x "$candidate" ]]; then
      espeak="$candidate"
      break
    fi
  done
  if [[ -z "$espeak" ]]; then
    echo "espeak-ng missing from Homebrew prefix $prefix" >&2
    exit 1
  fi
  cp "$espeak" "$RUNTIME/espeak/bin/espeak-ng"
  bundle_dylibs "$RUNTIME/espeak/bin/espeak-ng"
  local data
  for data in \
    "$prefix/opt/espeak-ng/share/espeak-ng-data" \
    "$prefix/share/espeak-ng-data"; do
    if [[ -d "$data" ]]; then
      mkdir -p "$RUNTIME/espeak/share"
      cp -R "$data" "$RUNTIME/espeak/share/espeak-ng-data"
      break
    fi
  done
}

write_placeholder_png() {
  local out="$1"
  local size="${2:-22}"
  python3 - "$out" "$size" <<'PY'
import pathlib, struct, sys, zlib

out = pathlib.Path(sys.argv[1])
w = h = int(sys.argv[2])
# #4F46E5
pixel = b"\x4f\x46\xe5"

def chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

raw = b"".join(b"\x00" + pixel * w for _ in range(h))
png = b"\x89PNG\r\n\x1a\n"
png += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
png += chunk(b"IDAT", zlib.compress(raw, 9))
png += chunk(b"IEND", b"")
out.write_bytes(png)
PY
}

svg_to_png() {
  local svg="$1"
  local png="$2"
  local dim="$3"
  if command -v rsvg-convert >/dev/null 2>&1; then
    rsvg-convert -w "$dim" -h "$dim" "$svg" -o "$png"
    return 0
  fi
  if command -v magick >/dev/null 2>&1; then
    magick -background none -resize "${dim}x${dim}" "$svg" "$png"
    return 0
  fi
  if command -v convert >/dev/null 2>&1; then
    convert -background none -resize "${dim}x${dim}" "$svg" "$png"
    return 0
  fi
  return 1
}

install_icons() {
  local svg="$REPO/desktop/pack/icon.svg"
  local tray="$RES/trayIcon.png"
  if svg_to_png "$svg" "$tray" 22; then
    :
  elif [[ "$SKIP" == "1" ]]; then
    write_placeholder_png "$tray" 22
  else
    write_placeholder_png "$tray" 22
  fi

  if ! command -v iconutil >/dev/null 2>&1; then
    echo "skip icon.icns (iconutil not available)"
    return 0
  fi
  local iconset tmp png
  tmp="$(mktemp -d)"
  iconset="$tmp/Homeward.iconset"
  mkdir -p "$iconset"
  local pair dim name
  for pair in 16:icon_16x16 32:icon_16x16@2x 32:icon_32x32 64:icon_32x32@2x \
    128:icon_128x128 256:icon_128x128@2x 256:icon_256x256 512:icon_256x256@2x \
    512:icon_512x512 1024:icon_512x512@2x; do
    dim="${pair%%:*}"
    name="${pair##*:}"
    png="$iconset/${name}.png"
    if ! svg_to_png "$svg" "$png" "$dim"; then
      write_placeholder_png "$png" "$dim"
    fi
  done
  iconutil -c icns "$iconset" -o "$RES/icon.icns"
  rm -rf "$tmp"
}

if [[ "$SKIP" != "1" ]]; then
  install_node
  install_python_gateway
  install_ollama
  install_ffmpeg_espeak
else
  echo "skip Node/uv/Ollama/ffmpeg/espeak downloads (HOMEWARD_BUNDLE_SKIP_DOWNLOADS=1)"
  echo "A family DMG cannot be produced in skip mode."
fi

install_icons

chmod_if_present() {
  local path="$1"
  if [[ -e "$path" ]]; then
    chmod +x "$path"
  fi
}

chmod_if_present "$MACOS_DIR/Homeward"
chmod_if_present "$RUNTIME/node/bin/node"
chmod_if_present "$RUNTIME/python/bin/python"
chmod_if_present "$RUNTIME/python/bin/python3"
chmod_if_present "$RUNTIME/ollama/ollama"
chmod_if_present "$RUNTIME/ffmpeg/bin/ffmpeg"
chmod_if_present "$RUNTIME/espeak/bin/espeak-ng"

# Any other Mach-O / executable bits already marked as files under runtime.
while IFS= read -r -d '' f; do
  if [[ -f "$f" && -x "$f" ]]; then
    chmod +x "$f"
  fi
done < <(find "$RUNTIME" -type f -perm -111 -print0 2>/dev/null || true)

test -d "$RES/policies"

if [[ "$SKIP" == "1" ]]; then
  if [[ -e "$MACOS_DIR/Homeward" ]]; then
    test -x "$MACOS_DIR/Homeward"
  fi
  if [[ -e "$RES/web/server.js" ]]; then
    test -f "$RES/web/server.js"
  fi
  echo "skip ffmpeg verify (HOMEWARD_BUNDLE_SKIP_DOWNLOADS=1)"
  echo "A family DMG cannot be produced in skip mode."
else
  "$RUNTIME/ffmpeg/bin/ffmpeg" -version >/dev/null
  test -x "$MACOS_DIR/Homeward"
  test -f "$RES/web/server.js"
  test -d "$RES/policies"
fi

echo "assembled $APP"
