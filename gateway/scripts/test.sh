#!/usr/bin/env bash
# Run the Homeward gateway test suite (fast tests only by default).
# Model-download tests: ./scripts/test.sh -m slow
set -euo pipefail
cd "$(dirname "$0")/.."

export HOMEWARD_DATA_DIR="${HOMEWARD_DATA_DIR:-./data}"
export HOMEWARD_POLICIES_DIR="${HOMEWARD_POLICIES_DIR:-../policies}"

python_meets_min() {
  local bin="$1"
  command -v "$bin" >/dev/null 2>&1 || return 1
  "$bin" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)' 2>/dev/null
}

# Prefer $PYTHON, then PATH python3, then versioned binaries.
# requires-python = ">=3.11" — do not use an older system python3.
pick_python() {
  if [[ -n "${PYTHON:-}" ]]; then
    if python_meets_min "$PYTHON"; then
      echo "$PYTHON"
      return 0
    fi
    echo "PYTHON=$PYTHON is not Python 3.11+ (see requires-python in pyproject.toml)." >&2
    exit 1
  fi
  local candidate
  for candidate in python3 python3.13 python3.12 python3.11; do
    if python_meets_min "$candidate"; then
      echo "$candidate"
      return 0
    fi
  done
  echo "Homeward gateway tests need Python 3.11 or newer (see requires-python in pyproject.toml)." >&2
  exit 1
}

PYTHON_BIN="$(pick_python)"

if [[ " $* " == *" -m "* ]]; then
  "$PYTHON_BIN" -m pytest "$@" -v --tb=short
else
  "$PYTHON_BIN" -m pytest -m "not slow" "$@" -v --tb=short
fi
