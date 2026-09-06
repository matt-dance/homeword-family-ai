#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
test -x "$ROOT/desktop/scripts/bundle-macos.sh"
