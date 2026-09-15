#!/usr/bin/env bash
# Reject HTML/error bodies that Release CI v0.1.1 piped into xz.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CHECK="$ROOT/desktop/scripts/check-download-archive.sh"
BUNDLE="$ROOT/desktop/scripts/bundle-linux.sh"

test -x "$CHECK"
test -x "$BUNDLE"
"$CHECK" --help | grep -q 'xz'
grep -q 'check-download-archive.sh' "$BUNDLE"
grep -q 'BtbN/FFmpeg-Builds' "$BUNDLE"
grep -q 'ffmpeg-n8.1-latest-linux64-gpl-8.1.tar.xz' "$BUNDLE"

# Do not go back to a single unvalidated johnvansickle URL.
if ! grep -q 'johnvansickle.com/ffmpeg' "$BUNDLE"; then
  echo "johnvansickle remains a fallback URL" >&2
  exit 1
fi

WORK="$(mktemp -d)"
cleanup() {
  rm -rf "$WORK"
}
trap cleanup EXIT

# HTML error page with a .tar.xz name (the v0.1.1 CI body).
printf '%s\n' '<!DOCTYPE html><html><body>cloudflare</body></html>' > "$WORK/ffmpeg.tar.xz"
if "$CHECK" --min-bytes 1 "$WORK/ffmpeg.tar.xz" >/dev/null 2>"$WORK/html.err"; then
  echo "HTML body must not be treated as an ffmpeg archive" >&2
  exit 1
fi
grep -q 'HTML' "$WORK/html.err"

# Content-Type text/html even if the bytes were somehow xz-like.
printf '%s' $'\xfd7zXZ\x00' > "$WORK/fake.xz"
dd if=/dev/zero bs=1024 count=2 >> "$WORK/fake.xz" 2>/dev/null
if "$CHECK" --min-bytes 1 --content-type 'text/html; charset=utf-8' "$WORK/fake.xz" >/dev/null 2>"$WORK/ctype.err"; then
  echo "text/html Content-Type must be rejected" >&2
  exit 1
fi
grep -qi 'html' "$WORK/ctype.err"

# Tiny file (HTML-sized) even with xz magic.
: > "$WORK/tiny.xz"
printf '%s' $'\xfd7zXZ\x00' > "$WORK/tiny.xz"
if "$CHECK" "$WORK/tiny.xz" >/dev/null 2>"$WORK/tiny.err"; then
  echo "sub-1MiB download must be rejected by default" >&2
  exit 1
fi
grep -q 'bytes' "$WORK/tiny.err"

# Real xz tarball above --min-bytes 1.
mkdir -p "$WORK/payload"
printf 'ffmpeg-stub\n' > "$WORK/payload/ffmpeg"
tar -C "$WORK/payload" -cJf "$WORK/ok.tar.xz" ffmpeg
kind="$("$CHECK" --min-bytes 1 "$WORK/ok.tar.xz")"
test "$kind" = "xz"

# gzip tarball.
tar -C "$WORK/payload" -czf "$WORK/ok.tar.gz" ffmpeg
kind="$("$CHECK" --min-bytes 1 "$WORK/ok.tar.gz")"
test "$kind" = "gz"

# Local HTTP 200 HTML served as ffmpeg-release-amd64-static.tar.xz.
python3 -c '
import http.server, threading, os, sys
os.chdir(sys.argv[1])
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        body = b"<!DOCTYPE html><html><p>not xz</p></html>"
        self.send_response(200)
        self.send_header("Content-Type", "application/x-xz")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, *args):
        pass
httpd = http.server.HTTPServer(("127.0.0.1", 0), H)
port = httpd.server_address[1]
threading.Thread(target=httpd.serve_forever, daemon=True).start()
open(sys.argv[2], "w").write(str(port))
open(sys.argv[3], "w").write("ready")
import time
time.sleep(30)
' "$WORK" "$WORK/port" "$WORK/ready" &
py_pid=$!
for _ in 1 2 3 4 5 6 7 8 9 10; do
  [[ -f "$WORK/ready" ]] && break
  sleep 0.1
done
test -f "$WORK/port"
port="$(cat "$WORK/port")"
curl -fsSL -o "$WORK/from-http.tar.xz" "http://127.0.0.1:${port}/ffmpeg-release-amd64-static.tar.xz"
if "$CHECK" --min-bytes 1 --content-type "application/x-xz" "$WORK/from-http.tar.xz" >/dev/null 2>"$WORK/http.err"; then
  echo "HTTP 200 HTML labeled as application/x-xz must still fail magic check" >&2
  kill "$py_pid" 2>/dev/null || true
  exit 1
fi
grep -q 'HTML' "$WORK/http.err"
kill "$py_pid" 2>/dev/null || true
wait "$py_pid" 2>/dev/null || true

# BtbN GitHub asset must actually be xz (range request — do not pull 150MiB).
BTBN="https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-n8.1-latest-linux64-gpl-8.1.tar.xz"
curl -fsSL -L --retry 3 -r 0-7 \
  -A "Mozilla/5.0 (compatible; HomewardPackager/1.0; +https://github.com/matt-dance/homeword-family-ai)" \
  -o "$WORK/btbn.magic" \
  "$BTBN"
python3 -c '
import sys
d = open(sys.argv[1], "rb").read(6)
if d != b"\xfd7zXZ\x00":
    raise SystemExit(f"BtbN ffmpeg asset is not xz: {d!r}")
' "$WORK/btbn.magic"

echo "check-download-archive ffmpeg validation ok"
