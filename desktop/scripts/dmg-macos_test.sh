#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$ROOT/desktop/scripts/dmg-macos.sh"

test -x "$SCRIPT"
"$SCRIPT" --help | grep -q "Homeward-macos"
"$SCRIPT" --help | grep -q "Applications"
"$SCRIPT" --help | grep -q 'Volume name'
"$SCRIPT" --help | grep -q "UDZO"
"$SCRIPT" --help | grep -q "not a zip"

grep -q -- '-volname' "$SCRIPT"
grep -q 'Homeward' "$SCRIPT"
grep -q 'app-drop-link' "$SCRIPT"
grep -q 'UDZO' "$SCRIPT"
grep -q '/Applications' "$SCRIPT"

# Family artifact must be a disk image, not a zip of the .app.
if grep -Eq 'zip[[:space:]].*Homeward\.app|ditto -c -k' "$SCRIPT"; then
  echo "dmg-macos.sh must not zip the .app" >&2
  exit 1
fi
