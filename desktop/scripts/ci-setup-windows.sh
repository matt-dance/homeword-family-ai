#!/usr/bin/env bash
# Install packager deps for a family Windows Inno Setup installer.
# CI uses GitHub-hosted windows-latest (Git Bash). The installer stays
# unsigned — no SignTool, PFX, or Azure Artifact Signing.
# Safe to re-run. Does not fetch Node/Ollama/CPython — bundle-windows.sh does that.
set -euo pipefail

is_windows_host() {
  case "$(uname -s 2>/dev/null || true)" in
    MINGW*|MSYS*|CYGWIN*|Windows_NT) return 0 ;;
  esac
  [[ "${OS:-}" == "Windows_NT" ]]
}

if ! is_windows_host; then
  echo "ci-setup-windows.sh must run on Windows (Git Bash)" >&2
  exit 1
fi

add_path() {
  local p="$1"
  [[ -d "$p" ]] || return 0
  case ":$PATH:" in
    *":$p:"*) ;;
    *) export PATH="$p:$PATH" ;;
  esac
  if [[ -n "${GITHUB_PATH:-}" ]]; then
    if command -v cygpath >/dev/null 2>&1; then
      echo "$(cygpath -w "$p")" >> "$GITHUB_PATH"
    else
      echo "$p" >> "$GITHUB_PATH"
    fi
  fi
}

if ! command -v python3 >/dev/null 2>&1 && command -v python >/dev/null 2>&1; then
  mkdir -p "$HOME/bin"
  cat > "$HOME/bin/python3" <<'EOF'
#!/bin/sh
exec python "$@"
EOF
  chmod +x "$HOME/bin/python3"
  add_path "$HOME/bin"
fi

have_7z() {
  command -v 7z >/dev/null 2>&1 || command -v 7z.exe >/dev/null 2>&1
}

have_iscc() {
  command -v ISCC >/dev/null 2>&1 && return 0
  command -v iscc >/dev/null 2>&1 && return 0
  local candidate
  for candidate in \
    "/c/Program Files (x86)/Inno Setup 6/ISCC.exe" \
    "/c/Program Files/Inno Setup 6/ISCC.exe"; do
    if [[ -x "$candidate" || -f "$candidate" ]]; then
      return 0
    fi
  done
  return 1
}

if ! have_7z; then
  if [[ -x "/c/Program Files/7-Zip/7z.exe" ]]; then
    add_path "/c/Program Files/7-Zip"
  elif command -v choco >/dev/null 2>&1; then
    choco install 7zip --no-progress -y
    add_path "/c/Program Files/7-Zip"
  else
    echo "7-Zip not found (needed to extract the espeak-ng MSI). Install 7-Zip or choco." >&2
    exit 1
  fi
fi

if ! have_iscc; then
  if command -v choco >/dev/null 2>&1; then
    choco install innosetup --no-progress -y
  else
    tmp="$(mktemp -d)"
    echo "downloading Inno Setup 6 (choco not on PATH)"
    curl -fsSL -o "$tmp/innosetup.exe" "https://files.jrsoftware.org/is/6/innosetup-6.4.3.exe"
    if command -v cygpath >/dev/null 2>&1; then
      win="$(cygpath -w "$tmp/innosetup.exe")"
      cmd.exe /c "$win /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP-"
    else
      "$tmp/innosetup.exe" /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP-
    fi
    rm -rf "$tmp"
  fi
fi

add_path "/c/Program Files (x86)/Inno Setup 6"
add_path "/c/Program Files/Inno Setup 6"
add_path "/c/Program Files/7-Zip"

if ! have_iscc; then
  echo "Inno Setup 6 compiler (ISCC) not found after install" >&2
  exit 1
fi
if ! have_7z && [[ ! -x "/c/Program Files/7-Zip/7z.exe" ]]; then
  echo "7-Zip not found after install" >&2
  exit 1
fi

echo "windows packager dependencies ready"
