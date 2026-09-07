#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
test -x "$ROOT/desktop/scripts/dmg-macos.sh"
"$ROOT/desktop/scripts/dmg-macos.sh" --help | grep -q "Homeward-macos"
