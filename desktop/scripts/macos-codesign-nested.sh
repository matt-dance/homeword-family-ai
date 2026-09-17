#!/usr/bin/env bash
# Leaf-first Developer ID signing for Homeward.app.
#
# codesign --deep on the .app is not enough for notarization: nested Mach-O
# under Contents/Resources/runtime and Contents/Frameworks must be signed
# inside-out with a secure timestamp and hardened runtime.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: macos-codesign-nested.sh --list|--sign <Homeward.app>

Discover Mach-O binaries (and nested .framework/.appex/.xpc/.bundle)
under the staged app and codesign deepest-first, then the .app last.

  --list   print "<kind><TAB><path>" in the order they would be signed
  --sign   codesign each target (requires HOMEWARD_CODESIGN_IDENTITY)

Each sign uses --force --options runtime --timestamp. The main .app,
Contents/MacOS executables, and bundled Python/Node get
desktop/pack/homeward.entitlements (JIT / library validation). Helper
tools (ffmpeg, espeak-ng, ollama, …), dylibs, and nested bundles are
signed with hardened runtime + timestamp only — no entitlements.

  HOMEWARD_CODESIGN_IDENTITY   Developer ID Application identity
  HOMEWARD_ENTITLEMENTS        entitlements plist (optional)
  HOMEWARD_CODESIGN_CMD        codesign binary (tests)
  HOMEWARD_CODESIGN_LOG        append each argv as a shell line (tests)
  HOMEWARD_CODESIGN_DRY_RUN=1  print argv, do not invoke codesign
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

MODE=""
APP=""
case "${1:-}" in
  --list|--sign)
    MODE="${1#--}"
    APP="${2:-}"
    ;;
  *)
    echo "unknown argument: ${1:-}" >&2
    usage >&2
    exit 1
    ;;
esac

if [[ -z "$APP" || ! -d "$APP" ]]; then
  echo "app bundle not found: ${APP:-<missing>}" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENTITLEMENTS="${HOMEWARD_ENTITLEMENTS:-$REPO/desktop/pack/homeward.entitlements}"
CODESIGN_BIN="${HOMEWARD_CODESIGN_CMD:-codesign}"

# Print "<kind>\t<path>" deepest-first, then the .app.
# Kinds: execute (entitled), tool, dylib, other, bundle, app.
list_sign_targets() {
  local app="$1"
  python3 - "$app" <<'PY'
import os
import sys

app = os.path.abspath(sys.argv[1])
magics = {
    b"\xfe\xed\xfa\xce": "be32",
    b"\xce\xfa\xed\xfe": "le32",
    b"\xfe\xed\xfa\xcf": "be64",
    b"\xcf\xfa\xed\xfe": "le64",
    b"\xca\xfe\xba\xbe": "fat",
    b"\xbe\xba\xfe\xca": "fat",
    b"\xca\xfe\xba\xbf": "fat",
    b"\xbf\xba\xfe\xca": "fat",
}
MH_EXECUTE = 2
MH_DYLIB = 6
MH_DYLIB_STUB = 9
skip_dirs = {"_CodeSignature", "__MACOSX"}
bundle_suffixes = (".framework", ".appex", ".xpc", ".bundle")


def execute_kind(path: str) -> str:
    unix = path.replace("\\", "/")
    base = os.path.basename(unix)
    if "/Contents/MacOS/" in unix:
        return "execute"
    if "/runtime/python/" in unix or "/runtime/node/" in unix:
        return "execute"
    if base == "node" or base.startswith("python"):
        return "execute"
    return "tool"


def macho_kind(path: str):
    try:
        with open(path, "rb") as fh:
            magic = fh.read(4)
            tag = magics.get(magic)
            if tag is None:
                return None
            if tag == "fat":
                if path.endswith((".dylib", ".so", ".o")):
                    return "dylib"
                return execute_kind(path)
            endian = "little" if tag.startswith("le") else "big"
            fh.seek(12)
            ft = int.from_bytes(fh.read(4), endian)
            if ft == MH_EXECUTE:
                return execute_kind(path)
            if ft in (MH_DYLIB, MH_DYLIB_STUB):
                return "dylib"
            return "other"
    except OSError:
        return None


targets = []
for root, dirs, names in os.walk(app, followlinks=False):
    dirs[:] = [d for d in dirs if d not in skip_dirs]
    for d in dirs:
        if d.endswith(bundle_suffixes):
            path = os.path.join(root, d)
            if os.path.abspath(path) != app:
                targets.append(("bundle", path))
    for name in names:
        path = os.path.join(root, name)
        if os.path.islink(path) or not os.path.isfile(path):
            continue
        kind = macho_kind(path)
        if kind:
            targets.append((kind, path))

targets.sort(key=lambda item: (-item[1].count(os.sep), item[1]))
targets.append(("app", app))

seen = set()
for kind, path in targets:
    if path in seen:
        continue
    seen.add(path)
    sys.stdout.write(f"{kind}\t{path}\n")
PY
}

run_codesign() {
  if [[ -n "${HOMEWARD_CODESIGN_LOG:-}" ]]; then
    {
      printf '%q ' "$CODESIGN_BIN" "$@"
      printf '\n'
    } >> "$HOMEWARD_CODESIGN_LOG"
  fi
  if [[ "${HOMEWARD_CODESIGN_DRY_RUN:-0}" == "1" ]]; then
    printf '%q ' "$CODESIGN_BIN" "$@"
    printf '\n'
    return 0
  fi
  "$CODESIGN_BIN" "$@"
}

sign_one() {
  local kind="$1"
  local target="$2"
  local args=(--force --options runtime --timestamp --sign "$HOMEWARD_CODESIGN_IDENTITY")
  case "$kind" in
    app|execute)
      if [[ ! -f "$ENTITLEMENTS" ]]; then
        echo "missing entitlements: $ENTITLEMENTS" >&2
        exit 1
      fi
      args+=(--entitlements "$ENTITLEMENTS")
      ;;
  esac
  # Never --deep: nested Mach-O is signed explicitly, leaf-first.
  run_codesign "${args[@]}" "$target"
}

if [[ "$MODE" == "list" ]]; then
  list_sign_targets "$APP"
  exit 0
fi

if [[ -z "${HOMEWARD_CODESIGN_IDENTITY:-}" ]]; then
  echo "HOMEWARD_CODESIGN_IDENTITY is required with --sign" >&2
  exit 2
fi

while IFS=$'\t' read -r kind target; do
  [[ -n "$kind" && -n "$target" ]] || continue
  echo "codesign ($kind): $target"
  sign_one "$kind" "$target"
done < <(list_sign_targets "$APP")

if [[ "${HOMEWARD_CODESIGN_DRY_RUN:-0}" != "1" && "$CODESIGN_BIN" == "codesign" ]]; then
  # --deep is verification-only here: every nested Mach-O must already be signed.
  codesign --verify --verbose=2 --strict --deep "$APP"
fi
