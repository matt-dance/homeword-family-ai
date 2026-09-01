#!/usr/bin/env bash
# Run the Homeward gateway test suite
set -euo pipefail
cd "$(dirname "$0")/.."

export HOMEWARD_DATA_DIR="${HOMEWARD_DATA_DIR:-./data}"
export HOMEWARD_POLICIES_DIR="${HOMEWARD_POLICIES_DIR:-../policies}"

python3 -m pytest "$@" -v --tb=short
