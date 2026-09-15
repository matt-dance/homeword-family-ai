#!/usr/bin/env bash
# Install packager deps for a family macOS DMG (GitHub-hosted or a local Mac runner).
# Safe to re-run. Does not fetch Node/Ollama/CPython — bundle-macos.sh does that.
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "ci-setup-macos.sh must run on macOS" >&2
  exit 1
fi

if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew is required (ffmpeg, espeak-ng, dylibbundler)" >&2
  exit 1
fi

export HOMEBREW_NO_AUTO_UPDATE=1
export HOMEBREW_NO_INSTALLED_DEPENDENTS_CHECK=1
export HOMEBREW_NO_ANALYTICS=1

brew install ffmpeg espeak-ng dylibbundler

command -v ffmpeg >/dev/null
command -v espeak-ng >/dev/null
command -v hdiutil >/dev/null
echo "macos packager dependencies ready"
