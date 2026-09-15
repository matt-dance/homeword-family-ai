#!/usr/bin/env bash
# ISCC must receive exactly one .iss even when the compiler path has spaces.
# Git Bash must not hand a pre-quoted cmd.exe string that MSYS turns into \".
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CMD="$ROOT/desktop/scripts/iscc-windows-cmd.sh"
EXE="$ROOT/desktop/scripts/exe-windows.sh"

test -x "$CMD"
test -x "$EXE"
"$CMD" --help | grep -q 'Program Files'
"$CMD" --help | grep -q 'MSYS2_ARG_CONV_EXCL'
grep -q 'iscc-windows-cmd.sh' "$EXE"
grep -q -- '--exec' "$EXE"
grep -q 'MSYS2_ARG_CONV_EXCL' "$CMD"
grep -q 'MSYS_NO_PATHCONV' "$CMD"

# The v0.1.2 handoff (pre-quoted string to cmd.exe) must be gone.
if grep -vE '^[[:space:]]*#' "$EXE" | grep -nE 'cmd\.exe[[:space:]]+//c[[:space:]]+"\$cmd_str"'; then
  echo "exe-windows.sh must not pass a pre-quoted ISCC string through cmd.exe" >&2
  exit 1
fi
if grep -vE '^[[:space:]]*#' "$EXE" | grep -nE 'cmd\.exe'; then
  echo "exe-windows.sh must not invoke ISCC via cmd.exe" >&2
  exit 1
fi

# Unquoted Git Bash argv (the v0.1.1 failure class).
python3 <<'PY'
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
PY

# v0.1.2 failure class: a correctly quoted command line, handed as ONE argv
# to cmd.exe /c, is escaped by MSYS so cmd sees literal \" before ISCC.
python3 <<'PY'
cmd_str = (
    '"C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe" '
    '"/DMyAppVersion=0.1.2" '
    '"C:\\pack\\homeward.iss"'
)
# Git Bash/MSYS escapes inner quotes when this is a single CreateProcess argv.
msys_inner = cmd_str.replace('"', '\\"')
want = '\\"C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe\\"'
if not msys_inner.startswith(want):
    raise SystemExit(f"expected backslash-quote before ISCC path, got {msys_inner!r}")
print("v0.1.2 msys one-arg handoff (must not use):", msys_inner[:72] + "...")
PY

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
  --define "MyAppVersion=0.1.2" \
  --define "HomewardSourceDir=C:\\Users\\runner\\Homeward Source" \
  --define "HomewardOutputDir=C:\\Users\\runner\\out")"

printf '%s\n' "$out" > "$WORK/argv.json"

ARG_JSON="$WORK/argv.json" python3 <<'PY'
import json, os

argv = json.loads(open(os.environ["ARG_JSON"], encoding="utf-8").read())
if not isinstance(argv, list) or not argv:
    raise SystemExit(f"expected JSON argv array, got {argv!r}")

iscc = argv[0]
if "Program Files (x86)" not in iscc or "ISCC" not in iscc:
    raise SystemExit(f"first argv is not the ISCC path: {argv!r}")
if '"' in iscc:
    raise SystemExit(f"ISCC path contains a quote (handoff would emit backslash-quote): {iscc!r}")

if len(argv) < 3:
    raise SystemExit(f"expected ISCC + /D... + .iss, got {argv!r}")

iss = [t for t in argv if t.lower().endswith(".iss")]
if len(iss) != 1:
    raise SystemExit(f"expected exactly one .iss, got {iss!r} from {argv!r}")

defs = argv[1:-1]
if not all(t.startswith("/D") for t in defs):
    raise SystemExit(f"non-/D tokens before the script: {defs!r}")
if any(t.startswith(r"D:\MyApp") or t.startswith(r"D:\Homeward") for t in argv):
    raise SystemExit(f"/D defines rewritten into D:\\ paths: {argv!r}")
if not any(t.startswith("/DMyAppVersion=0.1.2") for t in defs):
    raise SystemExit(f"missing /DMyAppVersion=0.1.2 in {defs!r}")
if not any(t.startswith("/DHomewardSourceDir=") for t in defs):
    raise SystemExit(f"missing /DHomewardSourceDir= in {defs!r}")
if not any(t.startswith("/D") and "Homeward Source" in t for t in defs):
    raise SystemExit(f"spaced define split: {defs!r}")

def win_quote(arg):
    if not arg or any(c in arg for c in ' \t\n"'):
        return '"' + arg.replace('"', '\\"') + '"'
    return arg

cmdline = " ".join(win_quote(a) for a in argv)
if cmdline.startswith('\\"'):
    raise SystemExit(f"joined cmdline starts with backslash-quote: {cmdline!r}")
if '\\"C:' in cmdline:
    raise SystemExit(f"joined cmdline has literal backslash-quote before ISCC: {cmdline!r}")
if not (cmdline.startswith('"') and "Program Files (x86)" in cmdline):
    raise SystemExit(f"Program Files (x86) missing from joined cmdline: {cmdline!r}")
print("iscc argv ok:", len(argv), "script=", iss[0])
print("joined cmdline:", cmdline)
PY

# Must not look like MSYS rewrote /DFoo into D:\Foo in the JSON dump.
if grep -qE '"D:\\\\MyAppVersion=|"D:\\\\HomewardSourceDir=' "$WORK/argv.json"; then
  echo "ISCC argv rewrote /D defines into extra Windows paths" >&2
  cat "$WORK/argv.json" >&2
  exit 1
fi
grep -F '/DMyAppVersion=0.1.2' "$WORK/argv.json"
grep -F '/DHomewardSourceDir=' "$WORK/argv.json"
grep -F 'Program Files (x86)' "$WORK/argv.json"
grep -F '.iss' "$WORK/argv.json"

# --exec dry-run is the real handoff path (no cmd.exe). Same argv, no \".
HOMEWARD_ISCC_DRY_RUN=1 HOMEWARD_ISCC_ARGV_FILE="$WORK/exec-argv.json" \
  "$CMD" --exec \
  --iscc "/c/Program Files (x86)/Inno Setup 6/ISCC.exe" \
  --iss "$ISS" \
  --define "MyAppVersion=0.1.2" \
  --define "HomewardSourceDir=C:\\Users\\runner\\Homeward Source" \
  --define "HomewardOutputDir=C:\\Users\\runner\\out" \
  > "$WORK/exec-out.txt"

test -s "$WORK/exec-argv.json"
PRINT_JSON="$WORK/argv.json" EXEC_JSON="$WORK/exec-argv.json" python3 <<'PY'
import json, os

printed = json.loads(open(os.environ["PRINT_JSON"], encoding="utf-8").read())
executed = json.loads(open(os.environ["EXEC_JSON"], encoding="utf-8").read())
if printed != executed:
    raise SystemExit(f"--exec argv mismatch:\n print={printed!r}\n exec={executed!r}")
iscc = executed[0]
if iscc.startswith('\\"') or iscc.startswith('"') or '"' in iscc:
    raise SystemExit(f"--exec ISCC path has a quote / backslash-quote: {iscc!r}")
if "Program Files (x86)" not in iscc:
    raise SystemExit(f"--exec lost Program Files (x86): {executed!r}")
iss = [t for t in executed if t.lower().endswith(".iss")]
if len(iss) != 1:
    raise SystemExit(f"--exec expected one .iss, got {iss!r}")
defs = executed[1:-1]
if not all(t.startswith("/D") for t in defs):
    raise SystemExit(f"--exec /D broken: {defs!r}")
print("--exec handoff argv matches print; no backslash-quote before ISCC")
PY

# JSON of Windows paths uses \\ ; fail only on literal backslash-quote before ISCC.
EXEC_JSON="$WORK/exec-argv.json" python3 <<'PY'
import os
raw = open(os.environ["EXEC_JSON"], encoding="utf-8").read()
prefix, _sep, _rest = raw.partition("Program Files")
if '\\"' in prefix:
    raise SystemExit(f"backslash-quote appears before Program Files in {raw!r}")
PY
grep -q 'MSYS2_ARG_CONV_EXCL' "$CMD"
grep -q 'HOMEWARD_ISCC_DRY_RUN' "$WORK/exec-out.txt"

# Actually exec a stub so the handoff is bash argv, not cmd.exe /c of a string.
STUB="$WORK/fake-iscc"
cat > "$STUB" <<'EOF'
#!/usr/bin/env bash
python3 -c '
import json, os, sys
out = os.environ["HOMEWARD_ISCC_STUB_OUT"]
json.dump(sys.argv[1:], open(out, "w", encoding="utf-8"), ensure_ascii=False)
' "$@"
EOF
chmod +x "$STUB"
HOMEWARD_ISCC_STUB_OUT="$WORK/stub-argv.json" \
  "$CMD" --exec \
  --iscc "$STUB" \
  --iss "$ISS" \
  --define "MyAppVersion=0.1.2" \
  --define "HomewardSourceDir=C:\\Users\\runner\\Homeward Source"
test -s "$WORK/stub-argv.json"
STUB_JSON="$WORK/stub-argv.json" python3 <<'PY'
import json, os
argv = json.loads(open(os.environ["STUB_JSON"], encoding="utf-8").read())
if not argv:
    raise SystemExit("stub received no argv")
for a in argv:
    if a.startswith('\\"') or a.startswith('"') or a.startswith('\"'):
        raise SystemExit(f"stub argv has literal quote/backslash-quote: {argv!r}")
if not argv[0].startswith("/DMyAppVersion=0.1.2"):
    raise SystemExit(f"stub did not receive /DMyAppVersion as its own argv: {argv!r}")
if any(t.startswith(r"D:\MyApp") for t in argv):
    raise SystemExit(f"stub saw MSYS-rewritten D:\\ define: {argv!r}")
iss = [t for t in argv if t.lower().endswith(".iss")]
if len(iss) != 1:
    raise SystemExit(f"stub expected one .iss, got {iss!r} / {argv!r}")
print("stub exec argv ok:", argv)
PY

# Path with spaces in the .iss directory stays one argument.
SPACED="$WORK/My Pack/homeward.iss"
mkdir -p "$WORK/My Pack"
cp "$ISS" "$SPACED"
out_space="$("$CMD" --iscc "/c/Program Files/Inno Setup 6/ISCC" --iss "$SPACED")"
printf '%s\n' "$out_space" > "$WORK/space-argv.json"
SPACE_JSON="$WORK/space-argv.json" python3 <<'PY'
import json, os
argv = json.loads(open(os.environ["SPACE_JSON"], encoding="utf-8").read())
iss = [t for t in argv if t.lower().endswith(".iss")]
if len(iss) != 1:
    raise SystemExit(f"spaced .iss path split into {iss!r} / {argv!r}")
if "My Pack" not in iss[0]:
    raise SystemExit(f".iss directory with spaces missing: {argv!r}")
PY

echo "iscc-windows-cmd quoting ok"
