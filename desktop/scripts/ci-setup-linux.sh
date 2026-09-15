#!/usr/bin/env bash
# Install packager deps for a family Linux tarball (GitHub-hosted or self-hosted).
# Safe to re-run. Does not fetch Node/Ollama/CPython — bundle-linux.sh does that.
set -euo pipefail

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "ci-setup-linux.sh must run on Linux" >&2
  exit 1
fi

if [[ "$(id -u)" == "0" ]]; then
  SUDO=()
else
  SUDO=(sudo)
fi

export DEBIAN_FRONTEND=noninteractive
"${SUDO[@]}" apt-get update -qq
"${SUDO[@]}" apt-get install -y --no-install-recommends \
  ca-certificates curl tar xz-utils zstd \
  gcc pkg-config \
  libgtk-3-dev libayatana-appindicator3-dev \
  espeak-ng \
  python3

echo "linux packager dependencies ready"
pkg-config --exists gtk+-3.0
pkg-config --exists ayatana-appindicator3-0.1 || pkg-config --exists appindicator3-0.1
command -v espeak-ng >/dev/null
command -v python3 >/dev/null
