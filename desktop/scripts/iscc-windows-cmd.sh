#!/usr/bin/env bash
# Build ISCC argv for Git Bash on Windows (GitHub Actions windows-latest).
#
# Git Bash (MSYS) rewrites args that look like Unix paths. `/DMyAppVersion=…`
# becomes `D:\MyAppVersion=…`, and an unquoted ISCC path under
# "Program Files (x86)" splits — ISCC then errors:
#   You may not specify more than one script filename.
#
# Do not invoke via `cmd.exe //c "$cmd_str"` with a pre-quoted string.
# MSYS escapes inner quotes when that one argv is handed to cmd, so cmd
# sees literal \"C:\Program Files (x86)\ISCC.exe\" as the program name
# (Release v0.1.2):
#   '"C:\Program Files (x86)\Inno Setup 6\ISCC.exe"' is not recognized…
#
# Call ISCC with separate argv entries and MSYS2_ARG_CONV_EXCL so /D
# defines stay /D and the compiler path stays one argument. Keep exactly
# one .iss script filename.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: iscc-windows-cmd.sh --iscc <ISCC> --iss <script.iss> [--define NAME=VALUE]... [--exec]

Print ISCC argv as JSON: compiler path, /DName=Value defines, one .iss.
Program Files (x86) stays one argument; /D is not rewritten to D:\.

  --exec   invoke ISCC with MSYS2_ARG_CONV_EXCL=* (no cmd.exe /c string)

  HOMEWARD_ISCC_ARGV_FILE  write the same JSON argv to this path
  HOMEWARD_ISCC_DRY_RUN=1  with --exec, skip launching ISCC
EOF
}

ISCC=""
ISS=""
DEFS=()
DO_EXEC=0

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

write_argv_json() {
  local dest="$1"
  shift
  python3 -c '
import json, sys
path = sys.argv[1]
json.dump(sys.argv[2:], open(path, "w", encoding="utf-8"), ensure_ascii=False)
' "$dest" "$@"
}

print_argv_json() {
  python3 -c '
import json, sys
json.dump(sys.argv[1:], sys.stdout, ensure_ascii=False)
print()
' "$@"
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
    --exec)
      DO_EXEC=1
      shift
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

# argv[0] is the Windows compiler path (spaces in Program Files (x86) stay
# inside this one entry). Remaining entries are /D defines and one .iss.
argv=("$iscc_win")
for d in "${DEFS[@]+"${DEFS[@]}"}"; do
  argv+=( "/D${d}" )
done
argv+=( "$iss_win" )

if [[ -n "${HOMEWARD_ISCC_ARGV_FILE:-}" ]]; then
  write_argv_json "$HOMEWARD_ISCC_ARGV_FILE" "${argv[@]}"
fi

if [[ "$DO_EXEC" -eq 0 ]]; then
  print_argv_json "${argv[@]}"
  exit 0
fi

echo "ISCC argv (${#argv[@]}): ${argv[*]}"
if [[ "${HOMEWARD_ISCC_DRY_RUN:-0}" == "1" ]]; then
  echo "skip ISCC exec (HOMEWARD_ISCC_DRY_RUN=1)"
  exit 0
fi

# Disable MSYS path rewriting for this process only. Git Bash otherwise
# turns /DMyAppVersion=… into D:\MyAppVersion=…. * covers /D* and the
# ISCC path; MSYS_NO_PATHCONV is the Git-for-Windows equivalent.
# Launch ISCC.exe directly — never cmd.exe //c with a pre-quoted string.
MSYS2_ARG_CONV_EXCL='*' MSYS_NO_PATHCONV=1 "$ISCC" "${argv[@]:1}"
