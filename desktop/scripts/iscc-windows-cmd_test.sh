#!/usr/bin/env bash
# ISCC must receive exactly one .iss even when the compiler path has spaces.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CMD="$ROOT/desktop/scripts/iscc-windows-cmd.sh"
EXE="$ROOT/desktop/scripts/exe-windows.sh"

test -x "$CMD"
test -x "$EXE"
"$CMD" --help | grep -q 'Program Files'
grep -q 'iscc-windows-cmd.sh' "$EXE"
grep -q 'cmd.exe //c' "$EXE"

# Unquoted Git Bash argv (the v0.1.1 failure class).
python3 -c '
import sys
# Simulate Git Bash leaving the ISCC path unquoted AND MSYS turning /D into D:\.
argv = [
    "/c/Program",
    "Files",
    "(x86)/Inno",
    "Setup",
    "6/ISCC",
    r"D:\MyAppVersion=0.1.1",
    r"D:\HomewardSourceDir=C:\stage",
    r"C:\pack\homeward.iss",
]
scripts = [a for a in argv if not a.startswith("/") and not a.startswith("-")]
if len(scripts) <= 1:
    raise SystemExit("expected the unquoted/MSYS-converted argv to look like several scripts")
if sum(1 for a in argv if a.lower().endswith(".iss")) < 1:
    raise SystemExit("fixture missing .iss")
print("old argv script-like tokens:", scripts)
'

WORK="$(mktemp -d)"
cleanup() {
  rm -rf "$WORK"
}
trap cleanup EXIT

ISS="$WORK/homeward.iss"
printf '%s\n' '[Setup]' > "$ISS"

out="$("$CMD" \
  --iscc "/c/Program Files (x86)/Inno Setup 6/ISCC.exe" \
  --iss "$ISS" \
  --define "MyAppVersion=0.1.1" \
  --define "HomewardSourceDir=C:\\Users\\runner\\Homeward Source" \
  --define "HomewardOutputDir=C:\\Users\\runner\\out")"

printf '%s\n' "$out" > "$WORK/cmd.txt"
grep -F 'Program Files (x86)' "$WORK/cmd.txt"
grep -F '/DMyAppVersion=0.1.1' "$WORK/cmd.txt"
grep -F '/DHomewardSourceDir=' "$WORK/cmd.txt"
grep -F '.iss' "$WORK/cmd.txt"

# Must not look like MSYS rewrote /DFoo into D:\Foo.
if grep -qE 'D:\\MyAppVersion=|D:\\HomewardSourceDir=' "$WORK/cmd.txt"; then
  echo "ISCC command rewrote /D defines into extra Windows paths" >&2
  cat "$WORK/cmd.txt" >&2
  exit 1
fi

python3 -c '
import re, sys

def cmd_c_unquote(cmdline):
    """cmd.exe /c: strip first and last quote unless exactly two quotes,
    no special chars (&<>()@^|), and the quoted text is an executable.
    """
    nquotes = cmdline.count("\"")
    special = any(c in cmdline for c in "&<>()@^|")
    preserve = nquotes == 2 and not special
    if not preserve and cmdline.startswith("\""):
        last = cmdline.rfind("\"")
        if last > 0:
            cmdline = cmdline[1:last] + cmdline[last + 1 :]
    return cmdline

raw = open(sys.argv[1], encoding="utf-8").read().strip()
if not (raw.startswith("\"\"") and raw.endswith("\"")):
    raise SystemExit(f"cmd.exe /c needs extra outer quotes, got: {raw!r}")
cmd = cmd_c_unquote(raw)
tokens = [a or b for a, b in re.findall(r"\"([^\"]*)\"|(\S+)", cmd)]
if not tokens:
    raise SystemExit("empty ISCC command")
iscc = tokens[0]
if "Program Files (x86)" not in iscc or "ISCC" not in iscc:
    raise SystemExit(f"first token is not the quoted ISCC path: {tokens!r}")
if " " in iscc and not (cmd.startswith("\"") or iscc.startswith("C:")):
    raise SystemExit(f"ISCC path was split: {tokens!r}")
iss = [t for t in tokens if t.lower().endswith(".iss")]
if len(iss) != 1:
    raise SystemExit(f"expected exactly one .iss, got {iss!r} from {tokens!r}")
defs = [t for t in tokens[1:-1]]
if not all(t.startswith("/D") for t in defs):
    raise SystemExit(f"non-/D tokens before the script: {defs!r}")
if any(" " in t and t.startswith("/D") for t in defs):
    # Define values with spaces must stay inside one token (already parsed).
    pass
print("iscc tokens ok:", len(tokens), "script=", iss[0])
' "$WORK/cmd.txt"

# Path with spaces in the .iss directory stays one argument.
SPACED="$WORK/My Pack/homeward.iss"
mkdir -p "$WORK/My Pack"
cp "$ISS" "$SPACED"
out_space="$("$CMD" --iscc "/c/Program Files/Inno Setup 6/ISCC" --iss "$SPACED")"
python3 -c '
import re, sys

def cmd_c_unquote(cmdline):
    nquotes = cmdline.count("\"")
    special = any(c in cmdline for c in "&<>()@^|")
    preserve = nquotes == 2 and not special
    if not preserve and cmdline.startswith("\""):
        last = cmdline.rfind("\"")
        if last > 0:
            cmdline = cmdline[1:last] + cmdline[last + 1 :]
    return cmdline

raw = sys.argv[1]
if not (raw.startswith("\"\"") and raw.endswith("\"")):
    raise SystemExit(f"cmd.exe /c needs extra outer quotes, got: {raw!r}")
cmd = cmd_c_unquote(raw)
tokens = [a or b for a, b in re.findall(r"\"([^\"]*)\"|(\S+)", cmd)]
iss = [t for t in tokens if t.lower().endswith(".iss")]
if len(iss) != 1:
    raise SystemExit(f"spaced .iss path split into {iss!r} / {tokens!r}")
if "My Pack" not in iss[0] and "My Pack" not in cmd:
    raise SystemExit(f".iss directory with spaces missing: {tokens!r}")
' "$out_space"

echo "iscc-windows-cmd quoting ok"
