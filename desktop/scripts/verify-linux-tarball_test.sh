#!/usr/bin/env bash
# Prove ELF verify stays pipefail-safe (Release CI #77).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$ROOT/desktop/scripts/verify-linux-tarball.sh"
WF="$ROOT/.github/workflows/release.yml"

test -x "$SCRIPT"
"$SCRIPT" --help | grep -q 'pipefail'

# Workflow must call the helper, not pipe tar -xOf into a 4-byte python read.
grep -q 'verify-linux-tarball.sh' "$WF"
if grep -E 'tar[[:space:]]+-xOf.*python3' "$WF"; then
  echo "release.yml ELF check must not pipe tar -xOf into python (SIGPIPE under pipefail)" >&2
  exit 1
fi

WORK="$(mktemp -d)"
cleanup() {
  rm -rf "$WORK"
}
trap cleanup EXIT

STAGE="$WORK/Homeward-linux-amd64"
mkdir -p "$STAGE"
cat > "$STAGE/install.sh" <<'EOF'
#!/bin/sh
# Desktop Entry
# ~/.config/autostart/homeward.desktop
echo install
EOF
cat > "$STAGE/uninstall.sh" <<'EOF'
#!/bin/sh
echo uninstall
EOF
# Large payload so `tar -xOf | read(4)` would SIGPIPE under pipefail.
python3 -c '
import sys
path = sys.argv[1]
with open(path, "wb") as f:
    f.write(b"\x7fELF")
    f.write(b"\x00" * (2 * 1024 * 1024))
' "$STAGE/homeward"
TARBALL="$WORK/Homeward-linux-amd64.tar.gz"
tar -C "$WORK" -czf "$TARBALL" Homeward-linux-amd64

# Helper must succeed with the same bash flags GitHub Actions uses.
bash --noprofile --norc -e -o pipefail "$SCRIPT" "$TARBALL"

# The class that failed v0.1.0: python exits after 4 bytes → tar SIGPIPE.
set +e
bash --noprofile --norc -e -o pipefail -c \
  'tar -xOf "$1" Homeward-linux-amd64/homeward | python3 -c "import sys; d=sys.stdin.buffer.read(4); assert d==b\"\\x7fELF\", d"' \
  _ "$TARBALL"
old_status=$?
set -e
if [[ "$old_status" -eq 0 ]]; then
  echo "expected the short python read pipeline to fail under pipefail" >&2
  exit 1
fi

# Non-ELF homeward must fail.
python3 -c '
import sys
path = sys.argv[1]
with open(path, "wb") as f:
    f.write(b"MZ")
    f.write(b"\x00" * 64)
' "$STAGE/homeward"
tar -C "$WORK" -czf "$TARBALL" Homeward-linux-amd64
if bash --noprofile --norc -e -o pipefail "$SCRIPT" "$TARBALL" >/dev/null 2>&1; then
  echo "verify-linux-tarball.sh should reject a non-ELF homeward" >&2
  exit 1
fi

echo "verify-linux-tarball pipefail regression ok"
