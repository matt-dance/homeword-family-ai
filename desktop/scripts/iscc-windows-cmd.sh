#!/usr/bin/env bash
# Build a single cmd.exe /c string for Inno Setup's ISCC.
#
# Git Bash (MSYS) rewrites args that look like Unix paths. `/DMyAppVersion=…`
# becomes `D:\MyAppVersion=…`, and `/c/Program Files (x86)/Inno Setup 6/ISCC`
# splits on spaces — ISCC then errors:
#   You may not specify more than one script filename.
#
# Keep the compiler path, /D defines, and the .iss path inside one quoted
# command line so cmd.exe parses them as distinct arguments.
#
# cmd.exe /c then strips the first and last quote when there are more than
# two quotes, or when the text contains special characters such as ().
# Wrap the whole line in an extra quote pair so the inner argv stays quoted
# after that strip:  ""C:\Program Files (x86)\...\ISCC.exe" /D... "script.iss""
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: iscc-windows-cmd.sh --iscc <ISCC> --iss <script.iss> [--define NAME=VALUE]...

Print a cmd.exe /c command line that invokes ISCC with exactly one script
filename, even when ISCC lives under "Program Files (x86)".
EOF
}

ISCC=""
ISS=""
DEFS=()

win_path() {
  local p="$1"
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -w "$p"
    return 0
  fi
  python3 -c '
import os, sys
p = sys.argv[1]
if len(p) >= 3 and p[0] == "/" and p[2] == "/":
    print(p[1].upper() + ":" + p[2:].replace("/", "\\"))
elif len(p) >= 2 and p[1] == ":":
    print(p.replace("/", "\\"))
else:
    print(os.path.abspath(p).replace("/", "\\"))
' "$p"
}

cmd_quote() {
  local s="$1"
  s="${s//\"/\"\"}"
  printf '"%s"' "$s"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --iscc)
      ISCC="$2"
      shift 2
      ;;
    --iss)
      ISS="$2"
      shift 2
      ;;
    --define|-D)
      DEFS+=("$2")
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "$ISCC" || -z "$ISS" ]]; then
  usage >&2
  exit 1
fi

iscc_win="$(win_path "$ISCC")"
iss_win="$(win_path "$ISS")"

parts=()
parts+=( "$(cmd_quote "$iscc_win")" )
for d in "${DEFS[@]+"${DEFS[@]}"}"; do
  parts+=( "$(cmd_quote "/D${d}")" )
done
parts+=( "$(cmd_quote "$iss_win")" )

inner="${parts[0]}"
idx=1
while [[ "$idx" -lt "${#parts[@]}" ]]; do
  inner+=" ${parts[$idx]}"
  idx=$((idx + 1))
done
# Extra outer quotes survive cmd.exe /c stripping (see header comment).
printf '"%s"\n' "$inner"
