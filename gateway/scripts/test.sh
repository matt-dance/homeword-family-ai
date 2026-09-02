#!/usr/bin/env bash
# Run the Homeward gateway test suite (fast tests only by default).
# Model-download tests: ./scripts/test.sh -m slow
set -euo pipefail
cd "$(dirname "$0")/.."

export HOMEWARD_DATA_DIR="${HOMEWARD_DATA_DIR:-./data}"
export HOMEWARD_POLICIES_DIR="${HOMEWARD_POLICIES_DIR:-../policies}"

if [[ " $* " == *" -m "* ]]; then
  python3 -m pytest "$@" -v --tb=short
else
  python3 -m pytest -m "not slow" "$@" -v --tb=short
fi
