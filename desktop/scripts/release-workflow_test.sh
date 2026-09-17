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
test -x "$ROOT/desktop/scripts/ci-macos-codesign-setup.sh"
test -x "$ROOT/desktop/scripts/macos-codesign-nested.sh"
test -x "$ROOT/desktop/scripts/ci-setup-linux.sh"
test -x "$ROOT/desktop/scripts/ci-setup-windows.sh"
test -x "$ROOT/desktop/scripts/ci-setup-macos.sh"
test -x "$ROOT/desktop/scripts/release-version.sh"
test -x "$ROOT/desktop/scripts/verify-linux-tarball.sh"
test -x "$ROOT/desktop/scripts/stage-windows-espeak.sh"

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
grep -q 'verify-linux-tarball.sh' "$WF"
if grep -E 'tar[[:space:]]+-xOf.*python3' "$WF"; then
  echo "release.yml must not pipe tar -xOf into a short python read (SIGPIPE / pipefail)" >&2
  exit 1
fi
grep -q 'exe-windows.sh amd64' "$WF"
grep -q 'dmg-macos.sh' "$WF"
grep -q 'ci-macos-codesign-setup.sh' "$WF"
grep -q 'MACOS_CERTIFICATE_P12' "$WF"
grep -q 'APPLE_API_KEY' "$WF"
grep -q 'APPLE_API_KEY_ID' "$WF"
grep -q -- '--sign' "$WF"
grep -q 'signing secrets absent' "$WF"
if grep -vE '^[[:space:]]*#' "$WF" | grep -q 'store-credentials'; then
  echo "release.yml must not call notarytool store-credentials" >&2
  exit 1
fi
if grep -vE '^[[:space:]]*#' "$WF" | grep -q 'HOMEWARD_NOTARY_PROFILE'; then
  echo "release.yml must not gate CI signing on HOMEWARD_NOTARY_PROFILE" >&2
  exit 1
fi
grep -q 'UDZO' "$WF"
grep -q 'Homeward-linux-amd64.tar.gz' "$WF"
grep -q 'Homeward-windows-amd64.exe' "$WF"
grep -q 'Homeward-macos-\*.dmg' "$WF"
grep -q 'softprops/action-gh-release' "$WF"
grep -q 'contents: write' "$WF"

# Publish only when every platform installer job succeeds on a tag.
grep -q 'needs.linux.result == .success.' "$WF"
grep -q 'needs.windows.result == .success.' "$WF"
grep -q 'needs.macos.result == .success.' "$WF"
grep -q 'always()' "$WF"
grep -q 'fail_on_unmatched_files: true' "$WF"
if grep -q 'SHA256SUMS' "$WF"; then
  echo "release.yml must not upload SHA256SUMS.txt" >&2
  exit 1
fi
if grep -qiE 'reattach|was not produced|must not block Linux' "$WF"; then
  echo "release.yml must not describe partial / Linux-only releases" >&2
  exit 1
fi
grep -q 'release-assets/Homeward-windows-amd64.exe' "$WF"
grep -q 'release-assets/Homeward-macos-\*.dmg' "$WF"
grep -q 'release-assets/Homeward-linux-amd64.tar.gz' "$WF"

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
