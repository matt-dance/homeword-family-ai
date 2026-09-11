# Homeward desktop (contributor)

Scripts and the Go supervisor that assemble native family installers. This is not family-facing documentation.

Chat and speech model weights are not part of any installer. Packagers ship the official Ollama *engine* only (plus its LICENSE). Models are pulled later into the platform data directory.

| Platform | Family artifact | Data dir |
|---|---|---|
| macOS | `Homeward-macos-<arch>.dmg` (UDZO, drag to Applications) | `~/Library/Application Support/Homeward` |
| Windows | `Homeward-windows-amd64.exe` (Inno Setup, unsigned) | `%LOCALAPPDATA%\Homeward` |
| Linux | `Homeward-linux-amd64.tar.gz` | `~/.local/share/homeward` |

Public web port is **43123** on every native install (not port 80).

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

## macOS DMG (drag to Applications)

A family DMG cannot be produced except on a Mac. The packer writes a compressed **UDZO** disk image (not a zip of the `.app`). Volume name is **Homeward**. The Finder window contains `Homeward.app` and an **Applications** drop target.

```bash
./desktop/scripts/dmg-macos.sh arm64
```

Output: `dist/macos/Homeward-macos-arm64.dmg`.

`./desktop/scripts/dmg-macos.sh arm64 --sign` wraps the bundle, codesigns with hardened runtime + `desktop/pack/homeward.entitlements`, notarizes, and staples.

Set `HOMEWARD_CODESIGN_IDENTITY` and `HOMEWARD_NOTARY_PROFILE`. Entitlements allow JIT / unsigned executable memory / disable-library-validation plus network client+server so the bundled Python, Node, and Ollama runtimes can start. App Sandbox is not enabled.

`HOMEWARD_BUNDLE_SKIP_DOWNLOADS=1` is a layout helper for CI and Linux; it cannot produce a family DMG.

```bash
HOMEWARD_BUNDLE_SKIP_DOWNLOADS=1 ./desktop/scripts/bundle-macos.sh arm64
```

Creates the Contents tree and copies `policies/`. Skips Node / uv / Ollama / Homebrew runtime fetches. On non-Darwin hosts it also skips the supervisor `go build` (Cocoa cannot be linked here).

## Troubleshooting (macOS)

**Gatekeeper blocks an unsigned local build.** Expected for contributor `.app` / DMG builds without `--sign`. macOS may refuse to open or quarantine the bundle. For family machines, build with `./desktop/scripts/dmg-macos.sh <arch> --sign` after setting `HOMEWARD_CODESIGN_IDENTITY` and `HOMEWARD_NOTARY_PROFILE`.

## Windows installer (Inno Setup `.exe`, amd64)

Family Windows v1 is an **Inno Setup** per-user installer. Authenticode is not available, so the `.exe` is **unsigned** and SmartScreen will show “Windows protected your PC” (More info → Run anyway). Chat and speech model weights are not in the installer.

A family installer must be produced on Windows (Git Bash) so Node, CPython, Ollama, ffmpeg, and espeak are Windows binaries. The Go supervisor itself can be cross-compiled (`GOOS=windows`).

### Prerequisites (Windows)

- Go 1.22+ (Windows tray uses pure Go syscalls; CGO/MinGW is not required)
- Node 22+
- uv (CPython 3.12)
- [Inno Setup 6](https://jrsoftware.org/isinfo.php) (`ISCC.exe` on `PATH`)
- curl, plus 7-Zip (or `msiexec`) to extract the espeak-ng MSI

### Skip-downloads (layout / CI)

From the repo root:

```bash
HOMEWARD_BUNDLE_SKIP_DOWNLOADS=1 ./desktop/scripts/bundle-windows.sh amd64
```

Creates `dist/windows/amd64/Homeward-windows-amd64/` with `policies/`, empty `resources/runtime/{python,node,ollama,ffmpeg,espeak}` dirs, and a cross-compiled `Homeward.exe` when Go is available. Skips Node / uv / Ollama / ffmpeg / espeak downloads.

Compile-only skip (payload already assembled):

```bash
HOMEWARD_EXE_SKIP_BUNDLE=1 HOMEWARD_EXE_SKIP_COMPILE=1 ./desktop/scripts/exe-windows.sh amd64
```

### Family installer (Windows)

```bash
./desktop/scripts/exe-windows.sh amd64
```

That runs `bundle-windows.sh` then Inno Setup. Output: `dist/windows/amd64/Homeward-windows-amd64.exe`.

The wizard installs to `%LOCALAPPDATA%\Programs\Homeward`, writes `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` so Homeward starts at login, and launches the tray supervisor. Family data and pulled models live in `%LOCALAPPDATA%\Homeward` (not `%USERPROFILE%\.ollama`). Uninstall stops Homeward and can optionally wipe that data directory.

After install, open **http://localhost:43123**. Kids on the same Wi-Fi use **http://homeward.local:43123/chat**.

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
