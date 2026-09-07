# Native installers — design spec

**Status:** Approved  
**Date:** 2026-09-06  
**Product:** Homeward Family AI  
**First implementation plan:** `docs/superpowers/plans/2026-09-06-macos-dmg.md`

This spec records the approved architecture for replacing Docker-as-the-family-install with native installers. It does not authorize application code by itself. Implement from the matching plan.

## Problem

Today a parent must install Docker Desktop (or Docker + Compose), clone the repo, and run `scripts/install.sh` / `scripts/install.ps1`. Compose starts Ollama, the Python gateway, the Next.js web app, and an mDNS sidecar (`docker-compose.yml`). That is too much third-party tooling for the stated product goal: super easy setup, no terminal, local AI included.

Native development already exists for contributors (`README.md`) but it requires Python, Node, and a separately installed Ollama. That path must not become the family path.

## Locked decisions

These are product decisions. Do not reopen them in v1 work.

1. **Ship order:** macOS first, then Windows, then Linux.
2. **Do not bundle the ~2 GB chat model.** First-run download uses the existing setup wizard and `POST /api/v1/ollama/bootstrap`.
3. **Public web port is 43123, not 80.** Do not build a privileged port-80 helper, LaunchDaemon, or `setcap` path in v1. Kid URL is `http://homeward.local:43123/chat` until pairing exists.
4. **Start at login and stay running** (menu-bar / tray supervisor). Target is one household computer that stays on.
5. **Keep Docker for contributors.** Stop recommending it to families once the native path exists. Do not delete Compose in the macOS v1 slice.
6. **Homework camera / `llava:7b` is not in the v1 “ready after install” bar.** Optional in-app download later.
7. **Signing:** Apple Developer ID is available (sign and notarize the Mac app). Windows Authenticode is not available (Windows `.exe` in that later phase is unsigned; document SmartScreen).
8. **Linux primary format:** `.deb` first (later phase). Not AppImage, not Flatpak.
9. **Household model:** one computer that stays on, not a fleet of devices.

## Goals

- A parent installs Homeward without installing Docker, Ollama, Python, Node, ffmpeg, or other third-party tools.
- After install, the **processes** are running: Ollama, gateway, web, in-process mDNS.
- After first-run wizard work (model download), kids can chat. The chat model is not inside the installer.
- Parent on the Homeward computer uses `http://localhost:43123` for setup and the dashboard.
- Kids on the same Wi‑Fi use `http://homeward.local:43123/chat`.
- Gateway stays on `127.0.0.1:8000`. Ollama stays on `127.0.0.1:11434`. LAN devices never talk to those ports.
- Uninstall can stop auto-start and remove the app. Family data and pulled models are deleted only if the parent opts in.

## Non-goals (v1 and this spec’s later phases)

Do not implement these in the macOS v1 plan.

- Privileged bind to port 80, pf redirects, or a port-80 helper.
- Pairing-style kid access (custom codes, device pairing, replacing mDNS/port URLs).
- Bundling `llama3.2:3b`, `llava:7b`, or any other Ollama chat/vision weights.
- Windows `.exe` or Linux `.deb` implementation (specified below as later phases only).
- Auto-update (Sparkle / WinSparkle / custom updater).
- Rewriting the Next.js UI inside Electron or Tauri.
- PyInstaller / Nuitka freeze of the gateway.
- Dropping Docker from the repo.

## Current architecture (repo facts)

Compose runs five services (`docker-compose.yml`):

| Service | Role | Host ports | Persistence |
|---|---|---|---|
| `ollama` | Official `ollama/ollama` | `127.0.0.1:11434` | volume `ollama_data` |
| `ollama-init` | One-shot `ollama pull llama3.2:3b` | none | same volume |
| `gateway` | FastAPI (`gateway/Dockerfile`, Python 3.12 + ffmpeg + espeak-ng) | `127.0.0.1:8000` | volume `homeward_data` → `/data` |
| `web` | Next.js standalone (`web/Dockerfile`, Node 22, listen 43123) | **80 → 43123** | none |
| `mdns` | `python -m homeward_gateway.network.mdns` | host network, port 80 | none |

Security that installers must preserve (`gateway/homeward_gateway/auth/local_host.py`, `README.md`):

- Only the web process is LAN-reachable.
- Parent dashboard / setup are host-only.
- The web proxy sets `X-Homeward-Client-Ip`. The gateway trusts that header only from Docker (`HOMEWARD_DOCKER=true`) or from a loopback peer.

`status.managed` in the wizard (`web/src/components/ollama-setup.tsx`) is today **exactly** `settings.docker_mode` (`gateway/homeward_gateway/ollama/service.py`). Native packaging must show the managed UX **without** enabling Docker proxy trust or disabling in-process mDNS.

There is no Redis, Postgres, nginx, or GPU reservation in Compose. Voice uses `faster-whisper` + system ffmpeg. Read-aloud uses kokoro-onnx (preferred) or piper-tts; Piper needs espeak-ng. Those weights download into `HOMEWARD_DATA_DIR` on first use.

## Target architecture

One supervisor process owns the family experience. It is a small native binary (Go), not a rewrite of the web UI.

```
Homeward.app (supervisor + tray)
        │  starts, restarts, login item, opens browser
        ├── ollama serve          127.0.0.1:11434
        ├── homeward-gateway      127.0.0.1:8000   (embedded CPython + venv)
        └── homeward-web          0.0.0.0:43123    (bundled Node + Next standalone)
                 └── gateway starts in-process mDNS on port 43123
                     (HOMEWARD_DOCKER=false)
```

The supervisor is menu-bar only (`LSUIElement`): no Dock icon in v1. “Open Homeward” opens the system browser to `http://127.0.0.1:43123`.

### Process environment (native)

The supervisor sets these on its children. Values are exact.

```
HOMEWARD_HOST=127.0.0.1
HOMEWARD_PORT=8000
HOMEWARD_WEB_PORT=43123
HOMEWARD_MANAGED=true
HOMEWARD_DOCKER=false
HOMEWARD_MDNS_ENABLED=true
HOMEWARD_OLLAMA_BASE_URL=http://127.0.0.1:11434
HOMEWARD_DATA_DIR=$HOME/Library/Application Support/Homeward
HOMEWARD_POLICIES_DIR=<app>/Contents/Resources/policies
GATEWAY_URL=http://127.0.0.1:8000
PORT=43123
HOSTNAME=0.0.0.0
OLLAMA_HOST=127.0.0.1:11434
OLLAMA_MODELS=$HOME/Library/Application Support/Homeward/ollama
PATH=<app>/Contents/Resources/runtime/ffmpeg/bin:<app>/Contents/Resources/runtime/espeak/bin:$PATH
```

Windows later uses `%LOCALAPPDATA%\Homeward`. Linux later uses `~/.local/share/homeward`. macOS v1 uses Application Support only.

Do **not** use `~/.ollama` for the bundled engine. That keeps uninstall clean and avoids clobbering a contributor’s existing Ollama data.

### Port collision with a pre-existing Ollama

If `127.0.0.1:11434` already answers Ollama’s `/api/tags`, the supervisor must **not** start a second `ollama serve`. It adopts the existing server and still sets `HOMEWARD_MANAGED=true` so the wizard does not tell the parent to install Ollama. If 11434 is occupied by a non-Ollama process, the supervisor must not bind it; show a tray error and keep retrying until the port is free or becomes Ollama.

## Flag split: `HOMEWARD_MANAGED` vs `HOMEWARD_DOCKER`

Add `managed: bool = False` to `Settings` (`gateway/homeward_gateway/config.py`), env `HOMEWARD_MANAGED`.

Keep `docker_mode` / `HOMEWARD_DOCKER` for Docker-only behavior:

- Trust every gateway peer as the web proxy (`local_host._peer_is_trusted_proxy`).
- Skip in-process mDNS (the Compose sidecar owns it).
- Allow gateway bind on `0.0.0.0` without the native LAN-exposure warning.

`status.managed` and bootstrap copy use:

```text
settings.managed or settings.docker_mode
```

So Compose does not need a new env var. Native sets `HOMEWARD_MANAGED=true` and `HOMEWARD_DOCKER=false`.

Setting `HOMEWARD_DOCKER=true` on a native install is forbidden. It would disable in-process mDNS and trust non-loopback peers as the proxy.

When Ollama is down:

| State | Parent-facing copy |
|---|---|
| managed or docker | “Homeward is starting the local AI engine…” — never “install from ollama.com” / `ollama serve` |
| neither | Existing contributor copy (install Ollama, run `ollama serve`) |

API 503 details on pull/bootstrap follow the same split.

## Ports and URLs

| Who | Native v1 URL | Docker (unchanged) |
|---|---|---|
| Parent on this computer | `http://localhost:43123` | `http://localhost` (host port 80) |
| Kids on Wi‑Fi | `http://homeward.local:43123/chat` | `http://homeward.local/chat` |
| Gateway | `http://127.0.0.1:8000` (loopback) | `127.0.0.1:8000` |
| Ollama | `http://127.0.0.1:11434` (loopback) | `127.0.0.1:11434` |

mDNS advertises `_http._tcp` for `homeward.local` on **43123** in native mode (`settings.web_port`).

The web UI must not hardcode port 80 for the kid URL. Setup and settings (`web/src/app/setup/page.tsx`, `web/src/app/dashboard/settings/page.tsx`) currently print `DEFAULT_HOMEWARD_URL` (`http://homeward.local`) and `http://localhost`. Those strings must follow the page’s own port:

- If the parent is on port 43123, show `http://homeward.local:43123/chat` and `http://localhost:43123`.
- If the parent is on port 80 (Docker), show `http://homeward.local/chat` and `http://localhost`.

Derive the advertised port from `window.location.port` in client components. Do not introduce a build-time `NEXT_PUBLIC_` fork for this.

Gateway `web_port` default stays `80` so Docker/dev:lan behavior does not change unless env overrides it. The native supervisor always sets `HOMEWARD_WEB_PORT=43123`.

## Pairing / custom kid access (later — not v1)

v1 kids type a URL with an explicit port. That is an accepted stopgap.

A later phase will replace “remember `homeward.local:43123`” with pairing-style access (exact mechanism is out of scope here: device codes, a parent-approved kid link, or a different hostname). That phase may also remove the need for port 80.

Until that phase is specified and planned separately:

- Do not implement pairing.
- Do not implement a privileged port-80 helper “just in case.”
- Do not change mDNS to pretend the service is on port 80 while listening on 43123.

## Bundle layout (macOS v1)

```
Homeward.app/
  Contents/
    Info.plist                  # bundle id ai.homeward.app, LSUIElement=true
    MacOS/Homeward              # supervisor
    Resources/
      policies/                 # copy of repo policies/
      web/                      # Next standalone (server.js, .next/static, public)
      runtime/
        python/                 # embedded CPython 3.12 + venv with gateway installed
        node/                   # Node 22 (darwin, matching arch)
        ollama/                 # official Ollama release binary + libs
        ffmpeg/bin/ffmpeg
        espeak/                 # espeak-ng for Piper
      icon.icns
      trayIcon.png
    Frameworks/                 # bundled dylibs for ffmpeg/espeak if needed
```

Vendor strategy:

| Piece | How it ships |
|---|---|
| Gateway | Embedded CPython (uv / python-build-standalone) + preinstalled venv of `gateway/` |
| Web | Existing Next `output: "standalone"` plus a Node 22 binary |
| Ollama | Official release binary (MIT — include Ollama’s LICENSE in Resources) |
| ffmpeg, espeak-ng | Copied into the app (Homebrew + dylib bundling on the build Mac) |
| Policies | Copied from `policies/` |
| Chat / vision weights | Not in the app. Pulled into Application Support via Ollama |
| Whisper / Kokoro / Piper weights | Not in the DMG. First-use download into Application Support, same as today |

Do not freeze the gateway with PyInstaller in v1. `faster-whisper`, ONNX, and Piper are hostile to that.

## Supervisor behavior

Binary name: `Homeward`. Module root: `desktop/`.

Commands:

| Invocation | Behavior |
|---|---|
| `Homeward` (default) | Ensure login item, start children, show tray, restart children on crash |
| `Homeward --open` | Start if needed, open `http://127.0.0.1:43123` |
| `Homeward --uninstall` | Stop children, remove login item, print where data lives; do not delete data unless `--wipe-data` |
| `Homeward --wipe-data` | Only valid with `--uninstall`. Deletes Application Support/Homeward including Ollama models |

Tray menu (exact items):

1. Open Homeward
2. Status (enabled=false label: “Running” / “Starting…” / error)
3. Quit Homeward

Quit exits 0 after a graceful child shutdown. The login item uses `KeepAlive: SuccessfulExit: false` so a clean quit stays down until the next login (or the parent opens the app again). A crash (non-zero) is restarted by launchd.

First successful health of `http://127.0.0.1:43123` after a fresh Application Support directory: open the browser once. Later login starts do not steal focus. Tray “Open Homeward” always opens the browser.

Health order: wait for Ollama `/api/tags` or adopted existing Ollama, then gateway `/api/v1/health`, then web `/`.

## First-run model pull

No change to the pull mechanism. After parent account creation, `OllamaSetup` already calls `api.ollamaBootstrap()` (`web/src/components/ollama-setup.tsx`), which hits `POST /api/v1/ollama/bootstrap` (`gateway/homeward_gateway/api/routes.py`) and pulls the RAM-based recommended catalog model.

v1 requirements:

- Ollama process is up before the wizard needs it (or the managed “starting…” copy shows until it is).
- `status.managed` is true so the wizard never shows ollama.com instructions.
- Chat model weights are not in the DMG.
- `llava:7b` is not pulled automatically.

## Keep-alive and uninstall

- Login item label: `ai.homeward.app`.
- Plist path: `~/Library/LaunchAgents/ai.homeward.app.plist`.
- `RunAtLoad=true`.
- `KeepAlive.SuccessfulExit=false`.
- Installer / first launch writes the plist and `launchctl bootstrap`s it.

Uninstall (`Homeward --uninstall`):

1. Stop children.
2. `launchctl bootout` the agent and delete the plist.
3. Leave `~/Library/Application Support/Homeward` unless `--wipe-data`.
4. The parent still deletes `/Applications/Homeward.app` (or the command can `rm -rf` that path when it is running from a copy — do not delete the running bundle in-place; print instructions if needed).

v1 does not ship a separate uninstaller .pkg.

## Signing (macOS v1)

- Sign `Homeward.app` with Developer ID Application, hardened runtime.
- Entitlements must allow the embedded Python/Ollama/Node stack (disable library validation; allow jit/unsigned executable memory as required by the bundled runtimes). Do **not** enable App Sandbox.
- Notarize the DMG, staple it.
- Identity comes from the environment (`HOMEWARD_CODESIGN_IDENTITY`) and a notarytool keychain profile (`HOMEWARD_NOTARY_PROFILE`). Scripts fail closed if those are unset when `--sign` is requested. Unsigned local `.app` trees are allowed for developer iteration.

## Per-OS approach and phasing

### Phase A — macOS `.dmg` (this spec’s first plan)

- Supervisor + tray + LaunchAgent.
- Bundle layout above.
- `create-dmg` (or `hdiutil`) producing `Homeward-macos-<arch>.dmg`.
- Separate arm64 and amd64 builds from the same script.
- Signed and notarized for family distribution.
- Contributor Docker remains documented in `README.md` until a later copy pass (not part of the first plan unless a contributor `desktop/README.md` is required to build the DMG).

### Phase B — Windows `.exe` (later plan, not written yet)

- Same supervisor (Go) and bundle layout.
- Inno Setup wizard.
- Tray + HKCU Run / Startup.
- Listen on 43123. No port 80.
- **Unsigned.** SmartScreen will warn (“Windows protected your PC”). The later Windows plan must document that on the download page and in the installer. Authenticode is out of scope until a cert exists.

### Phase C — Linux `.deb` (later plan, not written yet)

- `nfpm` → `homeward_<version>_amd64.deb` (arm64 as needed).
- systemd user unit + linger, or a desktop autostart entry plus the same supervisor.
- Listen on 43123. No `setcap` for port 80.
- AppImage and `.rpm` are after `.deb`.

### Phase D — Pairing (later spec)

Replaces the typed `homeward.local:43123` kid URL. May retire mDNS-as-the-family-instructions. Separate spec.

### Phase E — Family README / drop Docker recommendation

After Phase A is actually usable, change family-facing `README.md` so Docker is a contributor path. Not in the first implementation plan.

## Risks

- **Ollama license / trademark:** bundling the official binary is allowed under MIT if Ollama’s LICENSE travels with the app. Do not ship third-party model weights. Do not present Homeward as an Ollama product.
- **Port 11434 clash** with a system Ollama: adopt if it is Ollama; otherwise block and surface a tray error.
- **Unsigned Windows later:** families will see SmartScreen. Do not promise a clean Windows install until a cert exists.
- **Embedded Python + ML wheels:** arch-specific, large, and sensitive to macOS version. Build on the target arch. Do not cross-compile the venv.
- **ffmpeg / espeak dylibs:** if they are not bundled, voice and Piper fail at runtime. The bundle script must copy them and verify `ffmpeg -version` inside the assembled app.
- **Hardened runtime:** Python and Ollama often need extra entitlements. Test a signed build before calling the DMG done.
- **Disk / RAM:** wizard already gates models on RAM. Installer copy should say 8 GB RAM and about 5 GB free disk (app + first model).
- **Notarization time and size:** runtimes-only DMG should stay well under 1 GB. If it does not, inspect the venv for stray files before considering weight bundling — weights stay out.

## Testing

Gateway and web unit tests cover the flag split and advertised URLs (see the macOS plan). Supervisor Go tests cover env, child specs, launchd plist contents, and health-wait without starting real Ollama.

A signed-on-machine verification (not CI-gated in v1):

1. Install the DMG on a Mac without Docker, Python, Node, or Ollama on `PATH`.
2. Confirm tray appears and login item exists.
3. Confirm `localhost:43123` opens setup.
4. Confirm `lsof` shows gateway on `127.0.0.1:8000` and Ollama on `127.0.0.1:11434` (or an adopted existing Ollama).
5. Confirm web listens on `*:43123`.
6. Complete wizard; model download progresses; kid URL shown is `http://homeward.local:43123/chat`.
7. From another device on Wi‑Fi, open that kid URL (or confirm mDNS TXT/port via `dns-sd -B _http._tcp`).
8. Quit from tray; processes stop; they start again at next login or on reopening the app.

## Document history

- 2026-09-06: Approved from locked decisions (macOS first, no chat-model bundle, port 43123, tray + login start, Docker kept for contributors, no llava in v1 bar, Apple signing yes / Windows signing no, Linux `.deb` later, one household computer).
