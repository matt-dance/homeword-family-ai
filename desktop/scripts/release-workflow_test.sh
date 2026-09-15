#!/usr/bin/env bash
# Guard the tag-triggered GitHub Release wiring (no family downloads).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WF="$ROOT/.github/workflows/release.yml"
README="$ROOT/README.md"
DESKTOP_README="$ROOT/desktop/README.md"

test -f "$WF"
test -x "$ROOT/desktop/scripts/bundle-linux.sh"
test -x "$ROOT/desktop/scripts/exe-windows.sh"
test -x "$ROOT/desktop/scripts/dmg-macos.sh"
test -x "$ROOT/desktop/scripts/ci-setup-linux.sh"
test -x "$ROOT/desktop/scripts/ci-setup-windows.sh"
test -x "$ROOT/desktop/scripts/ci-setup-macos.sh"
test -x "$ROOT/desktop/scripts/release-version.sh"

# Tag trigger; GitHub-hosted runners only (no GCP / self-hosted Windows).
grep -q 'tags:' "$WF"
grep -q 'v\*' "$WF"
grep -qE '^[[:space:]]+runs-on: ubuntu-latest$' "$WF"
grep -qE '^[[:space:]]+runs-on: windows-latest$' "$WF"
grep -qE '^[[:space:]]+runs-on: macos-latest$' "$WF"

if grep -q 'HOMEWARD_WINDOWS_RUNNER' "$WF"; then
  echo "Windows must stay on GitHub-hosted windows-latest (no runner override)" >&2
  exit 1
fi
if grep -E "runs-on:[[:space:]]*\[?[[:space:]]*self-hosted" "$WF"; then
  echo "release workflow must use GitHub-hosted runners" >&2
  exit 1
fi
if grep -vE '^[[:space:]]*#' "$WF" | grep -qiE 'signtool|\.pfx|trusted-signing|ossmsft'; then
  echo "Windows signing (SignTool / Azure / PFX) is out of scope" >&2
  exit 1
fi
grep -q 'Get-AuthenticodeSignature' "$WF"
grep -q 'NotSigned' "$WF"

# Existing packagers — not a zip of the .app, not a skip-downloads stub.
grep -q 'bundle-linux.sh amd64' "$WF"
grep -q 'exe-windows.sh amd64' "$WF"
grep -q 'dmg-macos.sh' "$WF"
grep -q 'UDZO' "$WF"
grep -q 'Homeward-linux-amd64.tar.gz' "$WF"
grep -q 'Homeward-windows-amd64.exe' "$WF"
grep -q 'Homeward-macos-\*.dmg' "$WF"
grep -q 'softprops/action-gh-release' "$WF"
grep -q 'contents: write' "$WF"

# Linux at least publishes if Win/Mac fail.
grep -q 'needs.linux.result == .success.' "$WF"
grep -q 'always()' "$WF"

# Family-facing download URL.
url='https://github.com/matt-dance/homeword-family-ai/releases/latest'
grep -q "$url" "$README"
grep -q "$url" "$DESKTOP_README"
grep -q "$url" "$WF"

# Artifact names in contributor docs.
grep -q 'Homeward-windows-amd64.exe' "$DESKTOP_README"
grep -q 'Homeward-macos-' "$DESKTOP_README"
grep -q 'Homeward-linux-amd64.tar.gz' "$DESKTOP_README"

# Version helper: tags drop the leading v; untagged checkouts are 0.0.0-dev.
ver="$("$ROOT/desktop/scripts/release-version.sh")"
if [[ -z "$ver" ]]; then
  echo "release-version.sh printed nothing" >&2
  exit 1
fi
GITHUB_REF_TYPE=tag GITHUB_REF_NAME=v1.2.3 \
  "$ROOT/desktop/scripts/release-version.sh" | grep -qx '1.2.3'
GITHUB_ACTIONS=1 GITHUB_REF_TYPE=branch GITHUB_REF_NAME=main \
  "$ROOT/desktop/scripts/release-version.sh" | grep -qx '0.0.0-dev'

echo "release workflow wiring ok"
