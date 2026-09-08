# Linux tarball — design spec

**Status:** Approved  
**Date:** 2026-09-07  
**Product:** Homeward Family AI

Family Linux v1 is a **tarball + `install.sh`**, not a `.deb`. It is a logged-in desktop install (tray + start on login). **amd64 only.**

This spec does not cover Windows, `.deb`, AppImage, Flatpak, or systemd user linger.

## Tarball layout

```
Homeward-linux-amd64/
  install.sh
  uninstall.sh
  homeward                      # Go supervisor
  resources/
    policies/
    web/
    runtime/{python,node,ollama,ffmpeg,espeak}
```

Do not invent other install paths.

## After install

| Role | Path |
|---|---|
| App tree | `~/.local/share/homeward/app/` |
| Supervisor | `~/.local/share/homeward/app/homeward` |
| Resources | `~/.local/share/homeward/app/resources` |
| Family data + models | `~/.local/share/homeward/` (db, whisper, kokoro, ollama models) |
| PATH shim | `~/.local/bin/homeward` (written by the pack/install scripts) |
| Autostart | `~/.config/autostart/homeward.desktop` |

Linux data dir is `~/.local/share/homeward`. It is **not** Application Support.

`HOMEWARD_DATA_DIR` (and `OLLAMA_MODELS` under it) come from that directory. Locked child env is unchanged: `HOMEWARD_MANAGED=true`, `HOMEWARD_DOCKER=false`, `HOMEWARD_WEB_PORT=43123`, `ESPEAK_DATA_PATH`, and the rest already set in `desktop/internal/env/env.go`.

## Resource root

Keep macOS `.app` detection (`Contents/MacOS/Homeward` → `Contents/Resources`).

On Linux the supervisor lives next to `resources/`. Resolve the real binary with `os.Executable()` (and symlink evaluation) so a `~/.local/bin/homeward` shim still works. If the binary is `.../app/homeward`, ResourceRoot is `.../app/resources`. Fallback: `filepath.Join(filepath.Dir(exePath), "resources")`.

The PATH shim should be a symlink to the real binary, or a wrapper that execs it.

## Autostart

On Linux the supervisor writes (and uninstall removes) an XDG desktop file at `~/.config/autostart/homeward.desktop`. Darwin keeps LaunchAgent / launchd.

Desktop file fields:

- `Type=Application`
- `Name=Homeward`
- `Exec=<absolute path to supervisor>`
- `Icon=` if `resources/icon.png` or `resources/icon.svg` is present next to the supervisor
- `Terminal=false`
- `X-GNOME-Autostart-enabled=true`

## Commands

Meanings match macOS. Binary name on Linux is `homeward`.

| Invocation | Behavior |
|---|---|
| `homeward` | Ensure autostart, start children, show tray |
| `homeward --open` | Start if needed, open `http://127.0.0.1:43123` (`xdg-open`) |
| `homeward --uninstall` | Stop children, remove autostart; leave family data |
| `homeward --uninstall --wipe-data` | Also delete `~/.local/share/homeward`, including models |

Uninstall without wipe leaves data and only removes the autostart file (plus stopping the running supervisor). The parent still deletes the app tree via `uninstall.sh`.

Tray menu stays **Open Homeward** / **Status** / **Quit Homeward**.

## Uninstall script (pack agent)

`uninstall.sh` should invoke the supervisor `--uninstall` (optionally `--wipe-data`), then remove the app tree and PATH shim. Supervisor-owned work is autostart + optional data wipe only.
