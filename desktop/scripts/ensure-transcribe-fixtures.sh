#!/usr/bin/env bash
# Make sure JFK transcribe self-test clips are present for pack builds.
#
# Self-test resolves homeward_gateway/fixtures/jfk-sample.{flac,webm} after a
# pip/wheel install. Editable checkouts also look at tests/fixtures/. A Family
# pack that omits both paths 503s GET /api/v1/chat/transcribe/self-test.
#
# Usage:
#   ensure-transcribe-fixtures.sh source <gateway-dir>
#   ensure-transcribe-fixtures.sh install <python> <gateway-dir>
set -euo pipefail

usage() {
  cat <<'EOF' >&2
Usage:
  ensure-transcribe-fixtures.sh source <gateway-dir>
  ensure-transcribe-fixtures.sh install <python> <gateway-dir>
EOF
  exit 2
}

min_bytes_for() {
  case "$1" in
    jfk-sample.flac) printf '%s' 50000 ;;
    jfk-sample.webm) printf '%s' 5000 ;;
    *) printf '%s' 1 ;;
  esac
}

file_size() {
  wc -c < "$1" | tr -d ' '
}

find_source_fixture() {
  local gateway="$1"
  local name="$2"
  local candidate size min
  min="$(min_bytes_for "$name")"
  for candidate in \
    "$gateway/homeward_gateway/fixtures/$name" \
    "$gateway/tests/fixtures/$name"; do
    if [[ -f "$candidate" ]]; then
      size="$(file_size "$candidate")"
      if [[ "$size" -ge "$min" ]]; then
        printf '%s' "$candidate"
        return 0
      fi
    fi
  done
  return 1
}

require_source() {
  local gateway="$1"
  local name path
  if [[ ! -d "$gateway" ]]; then
    echo "gateway dir missing: $gateway" >&2
    exit 1
  fi
  for name in jfk-sample.flac jfk-sample.webm; do
    if ! path="$(find_source_fixture "$gateway" "$name")"; then
      echo "missing or tiny transcribe self-test fixture: $name" >&2
      echo "expected under $gateway/homeward_gateway/fixtures or $gateway/tests/fixtures" >&2
      exit 1
    fi
  done
}

resolve_python() {
  local python="$1"
  if [[ -e "$python" ]]; then
    printf '%s' "$python"
    return 0
  fi
  command -v "$python"
}

install_into() {
  local python_arg="$1"
  local gateway="$2"
  local python
  if ! python="$(resolve_python "$python_arg")"; then
    echo "python missing: $python_arg" >&2
    exit 1
  fi
  require_source "$gateway"
  "$python" - "$gateway" <<'PY'
import shutil
import sys
from pathlib import Path

MIN = {"jfk-sample.flac": 50_000, "jfk-sample.webm": 5_000}
gateway = Path(sys.argv[1])
sources = (
    gateway / "homeward_gateway" / "fixtures",
    gateway / "tests" / "fixtures",
)

try:
    import homeward_gateway
except ImportError:
    sys.exit("homeward_gateway is not installed in this Python")

dest_dir = Path(homeward_gateway.__file__).resolve().parent / "fixtures"
dest_dir.mkdir(parents=True, exist_ok=True)

for name, min_size in MIN.items():
    src = None
    for folder in sources:
        candidate = folder / name
        if candidate.is_file() and candidate.stat().st_size >= min_size:
            src = candidate
            break
    if src is None:
        sys.exit(f"missing source transcribe fixture {name} under {gateway}")
    dest = dest_dir / name
    shutil.copy2(src, dest)
    size = dest.stat().st_size
    if size < min_size:
        sys.exit(f"transcribe fixture too small ({size} bytes): {dest}")
    print(f"ok {dest} ({size} bytes)")
PY
}

if [[ $# -lt 1 ]]; then
  usage
fi

case "$1" in
  source)
    [[ $# -eq 2 ]] || usage
    require_source "$2"
    echo "transcribe self-test source fixtures ok"
    ;;
  install)
    [[ $# -eq 3 ]] || usage
    install_into "$2" "$3"
    ;;
  -h|--help)
    usage
    ;;
  *)
    usage
    ;;
esac
