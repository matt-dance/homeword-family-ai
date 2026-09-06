# Homeward desktop (contributor)

Scripts and the Go supervisor that assemble `Homeward.app` on macOS. This is not family-facing documentation.

A family DMG cannot be produced except on a Mac. `HOMEWARD_BUNDLE_SKIP_DOWNLOADS=1` is a layout helper for CI and Linux; it cannot produce a family DMG.

Chat and speech model weights are not part of the app. The bundle installs the official Ollama *engine* only (plus its LICENSE). Models are pulled later into Application Support.

## Prerequisites (macOS)

- Go 1.23+
- Node 22+
- uv (CPython 3.12 + the gateway venv)
- Homebrew: `ffmpeg`, `espeak-ng`, `dylibbundler`
- Apple Developer ID (signed / notarized DMG only)

`CGO_ENABLED=1` is required for the Darwin supervisor (`energye/systray` links Cocoa).

CPython 3.12 is the official standalone build, copied into `Contents/Resources/runtime/python` via `UV_PYTHON_INSTALL_DIR` inside the `.app`. `bin/python` must resolve inside the bundle, not the builder’s `~/.local/share/uv/python`.

ffmpeg and espeak-ng live at `Resources/runtime/<name>/bin/`. Their dylibs are copied to `Contents/Frameworks` with install names `@executable_path/../../../../Frameworks/<lib>` (four levels up from the binary). Homebrew `dylibbundler` is preferred; without it the script recursively rewrites Homebrew/Cellar deps with `install_name_tool` + `otool`. A non-skip Darwin build exits non-zero if neither tool can produce a relocatable binary.

## Unsigned `.app`

From the repo root:

```bash
./desktop/scripts/bundle-macos.sh arm64
```

Intel Macs use `amd64`. Output: `dist/macos/<arch>/Homeward.app`.

## Signed DMG

`desktop/scripts/dmg-macos.sh --sign` (after Task 10 lands) wraps this bundle, codesigns with hardened runtime + `desktop/pack/homeward.entitlements`, notarizes, and staples.

Set `HOMEWARD_CODESIGN_IDENTITY` and `HOMEWARD_NOTARY_PROFILE`. Entitlements allow JIT / unsigned executable memory / disable-library-validation plus network client+server so the bundled Python, Node, and Ollama runtimes can start. App Sandbox is not enabled.

## Skip-downloads

```bash
HOMEWARD_BUNDLE_SKIP_DOWNLOADS=1 ./desktop/scripts/bundle-macos.sh arm64
```

Creates the Contents tree and copies `policies/`. Skips Node / uv / Ollama / Homebrew runtime fetches. On non-Darwin hosts it also skips the supervisor `go build` (Cocoa cannot be linked here). A family DMG cannot be produced in skip mode.
