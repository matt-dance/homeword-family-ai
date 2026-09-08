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

## Troubleshooting

**Gatekeeper blocks an unsigned local build.** Expected for contributor `.app` / DMG builds without `--sign`. macOS may refuse to open or quarantine the bundle. For family machines, build with `./desktop/scripts/dmg-macos.sh <arch> --sign` after setting `HOMEWARD_CODESIGN_IDENTITY` and `HOMEWARD_NOTARY_PROFILE`.

## Linux tarball (amd64)

Family Linux v1 is a tarball plus `install.sh` for a logged-in desktop (amd64 only). Chat and speech model weights are not part of the tarball; the packer ships the official Ollama *engine* and LICENSE only.

A family tarball should be produced with Docker (Ubuntu). The supervisor uses CGO/GTK (`energye/systray` + AppIndicator), and the embedded CPython 3.12 + gateway must be Linux binaries. Building those on a Mac without a container cannot produce a family tree.

`HOMEWARD_BUNDLE_SKIP_DOWNLOADS=1` is a layout helper for CI. It cannot produce a family tarball.

### Skip-downloads (layout / CI)

From the repo root:

```bash
HOMEWARD_BUNDLE_SKIP_DOWNLOADS=1 ./desktop/scripts/bundle-linux.sh amd64
```

Creates `dist/linux/amd64/Homeward-linux-amd64/` and `dist/linux/amd64/Homeward-linux-amd64.tar.gz` with `install.sh`, `uninstall.sh`, `policies/`, and empty `resources/runtime/{python,node,ollama,ffmpeg,espeak}` dirs. Skips Node / uv / Ollama / ffmpeg / espeak downloads. Does not fail if the linux `homeward` supervisor is not at `desktop/homeward` yet (copy it when a linux amd64 ELF is present).

### Family tarball (Docker)

On a Mac with Docker Desktop, the packer re-executes itself in Ubuntu:

```bash
./desktop/scripts/bundle-linux.sh amd64
```

Equivalent explicit container:

```bash
docker run --rm --platform linux/amd64 \
  -v "$PWD:/src" -w /src \
  -e HOMEWARD_BUNDLE_IN_CONTAINER=1 \
  ubuntu:24.04 \
  bash /src/desktop/scripts/bundle-linux.sh amd64
```

On Linux amd64, the same script runs natively (needs Go 1.22+, GTK/AppIndicator headers, uv, curl). Output: `dist/linux/amd64/Homeward-linux-amd64.tar.gz`.

The family machine should be a logged-in Ubuntu/GNOME-style desktop. The tray needs GTK 3 and Ayatana AppIndicator at runtime; ffmpeg and espeak-ng are bundled.

### Install and uninstall (no root)

```bash
tar -xzf Homeward-linux-amd64.tar.gz
cd Homeward-linux-amd64
./install.sh
```

`install.sh` copies the supervisor and `resources/` to `~/.local/share/homeward/app`, writes a `~/.local/bin/homeward` shim, writes `~/.config/autostart/homeward.desktop` (`Exec=` the real supervisor), and starts `homeward --open`. It does not copy family data. Data lives at `~/.local/share/homeward`.

```bash
./uninstall.sh              # keeps ~/.local/share/homeward data
./uninstall.sh --wipe-data
```

Uninstall stops Homeward (`homeward --uninstall` when the binary exists), then removes the autostart file, shim, and `~/.local/share/homeward/app`.
