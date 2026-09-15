#!/usr/bin/env bash
# Pipefail-safe checks for the family Linux tarball (Release CI).
#
# Do not `tar -xOf … | python3 -c 'read(4)'` under `set -o pipefail`:
# python exits after the ELF magic, tar gets SIGPIPE, and the step fails
# even when the assert passed (v0.1.0 Release, #77).
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: verify-linux-tarball.sh <Homeward-linux-amd64.tar.gz>

Confirm the family Linux tarball lists install/uninstall/homeward,
homeward is an ELF, and install.sh has the desktop/autostart bits.

Safe under `bash -e -o pipefail` (GitHub Actions default bash).
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

TARBALL="${1:-}"
if [[ -z "$TARBALL" || ! -f "$TARBALL" ]]; then
  echo "usage: verify-linux-tarball.sh <Homeward-linux-amd64.tar.gz>" >&2
  exit 1
fi

WORK="$(mktemp -d)"
cleanup() {
  rm -rf "$WORK"
}
trap cleanup EXIT

# Listing greps also close the pipe early; materialize the member list.
tar -tzf "$TARBALL" > "$WORK/members"
grep -qx 'Homeward-linux-amd64/install.sh' "$WORK/members"
grep -qx 'Homeward-linux-amd64/uninstall.sh' "$WORK/members"
grep -qx 'Homeward-linux-amd64/homeward' "$WORK/members"

# Read the first 4 bytes via tarfile so tar is not writing to a short-lived pipe.
python3 -c '
import tarfile, sys

path, member = sys.argv[1], sys.argv[2]
with tarfile.open(path, "r:gz") as tf:
    f = tf.extractfile(member)
    if f is None:
        raise SystemExit(f"missing {member}")
    magic = f.read(4)
if magic != b"\x7fELF":
    raise SystemExit(f"{member} is not ELF: {magic!r}")
' "$TARBALL" Homeward-linux-amd64/homeward

tar -xOf "$TARBALL" Homeward-linux-amd64/install.sh > "$WORK/install.sh"
grep -q 'Desktop Entry' "$WORK/install.sh"
grep -q 'autostart/homeward.desktop' "$WORK/install.sh"

ls -lh "$TARBALL"
echo "linux tarball verify ok: $TARBALL"
