#!/usr/bin/env bash
# Confirm a downloaded file is a real archive, not an HTML/error page.
#
# Release CI v0.1.1 piped a non-xz johnvansickle.com body into tar -xJf:
#   xz: (stdin): File format not recognized
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: check-download-archive.sh [--min-bytes N] [--content-type TYPE] FILE

Exit 0 and print the archive kind (xz, gz, tar, zip) if FILE looks like a
compressed tarball/zip. Reject HTML, tiny bodies, and unknown magic.

  --min-bytes N
      Minimum size in bytes (default 1048576). Static ffmpeg builds are
      tens of megabytes; Cloudflare/HTML error pages are a few KB.

  --content-type TYPE
      HTTP Content-Type from the download. text/html is always rejected.
EOF
}

MIN_BYTES=1048576
CONTENT_TYPE=""
FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --min-bytes)
      MIN_BYTES="$2"
      shift 2
      ;;
    --content-type)
      CONTENT_TYPE="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    --)
      shift
      break
      ;;
    -*)
      echo "unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
    *)
      if [[ -n "$FILE" ]]; then
        echo "usage: check-download-archive.sh FILE" >&2
        exit 1
      fi
      FILE="$1"
      shift
      ;;
  esac
done

if [[ -z "$FILE" ]]; then
  usage >&2
  exit 1
fi

if [[ ! -f "$FILE" ]]; then
  echo "not a file: $FILE" >&2
  exit 1
fi

python3 -c '
import os, sys

path, min_bytes_s, content_type = sys.argv[1], sys.argv[2], sys.argv[3]
min_bytes = int(min_bytes_s)
size = os.path.getsize(path)
ctype = (content_type or "").split(";")[0].strip().lower()

def fail(msg: str) -> None:
    head = open(path, "rb").read(240)
    sys.stderr.write(msg + "\n")
    sys.stderr.write(f"  size={size} content-type={content_type!r} magic={head[:16]!r}\n")
    preview = head[:200]
    if preview[:1] in (b"<", b"{") or b"html" in preview.lower() or b"cloudflare" in preview.lower():
        sys.stderr.write("  body starts with: " + preview.decode("utf-8", "replace") + "\n")
    raise SystemExit(1)

if ctype in ("text/html", "text/plain", "application/xhtml+xml"):
    fail(f"{path} Content-Type is {content_type!r}; expected xz/tar/zip, not HTML")

if size < min_bytes:
    fail(f"{path} is {size} bytes; expected at least {min_bytes} (HTML or truncated download?)")

head = open(path, "rb").read(512)
stripped = head.lstrip().lower()
if stripped.startswith(b"<!doctype html") or stripped.startswith(b"<html") or stripped.startswith(b"<head"):
    fail(f"{path} looks like HTML, not an archive")

kind = ""
if head.startswith(b"\xfd7zXZ\x00"):
    kind = "xz"
elif head.startswith(b"\x1f\x8b"):
    kind = "gz"
elif head.startswith(b"PK\x03\x04") or head.startswith(b"PK\x05\x06"):
    kind = "zip"
elif len(head) >= 262 and head[257:262] == b"ustar":
    kind = "tar"
else:
    fail(f"{path} is not xz/gz/tar/zip")

print(kind)
' "$FILE" "$MIN_BYTES" "$CONTENT_TYPE"
