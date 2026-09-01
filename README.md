# Homeward

**Homeward** is an open-source, local-first family AI safety gateway. It sits between your children and AI models, filtering every message in and out with a fail-closed safety pipeline. Parents get a simple setup wizard, age-based presets, and a dashboard to review conversations — no YAML required for basic use.

## Design goals

- **Super easy setup** — no terminal, no technical knowledge for day-to-day use
- **Local AI included** — Ollama runs automatically (Docker today; native `.dmg` / `.exe` installer later)
- **Simple model picking** — choose a model in the setup wizard and click Download
- **Privacy first** — everything stays on your computer unless a parent enables cloud AI

## Features (Phase 1)

- **Local AI first** — Ollama is the default; cloud/BYOK is hidden until a parent enables it
- **Fail-closed safety pipeline** — normalize → rules → classifier → policy → LLM → output filter
- **Age presets** — Young Explorer (5–8), Curious Explorer (9–12), Teen Guided (13–17)
- **Parent dashboard** — conversation sessions, blocked attempts, model management
- **Kid chat UI** — simple streaming chat with profile picker and friendly blocked messages
- **Cross-platform** — Docker Compose on Mac, Windows, and Linux today

## Quick Start (recommended)

**Prerequisites:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Mac/Windows) or Docker + Compose (Linux)

### Mac / Linux

```bash
git clone https://origin.cursor.com/git/matt-code/homeword-family-ai.git
cd homeword-family-ai
./scripts/install.sh
```

Or from GitHub, once mirrored:

```bash
git clone https://github.com/matt-code/homeword-family-ai.git
cd homeword-family-ai
./scripts/install.sh
```

### Windows (PowerShell)

```powershell
git clone https://origin.cursor.com/git/matt-code/homeword-family-ai.git
cd homeword-family-ai
.\scripts\install.ps1
```

Then open **http://localhost:43123** in your browser.

That's it — Homeward starts **Ollama automatically** and begins downloading a recommended AI model on first launch.

### Setup wizard (in the browser)

1. Create a parent password
2. Add your children (name, age, safety level)
3. Pick and download an AI model (or wait if one is already downloading)
4. Done — kids can chat, you can review from the dashboard

### Stop

```bash
docker compose down
```

## What parents never need to do

When using Docker (recommended):

- Install Ollama separately
- Run `ollama serve`
- Run `ollama pull …` in a terminal
- Edit config files for basic use

The setup wizard handles model selection and download with plain-language buttons.

## Roadmap: native installers

Docker is the supported easy path **today**. Next step for non-technical families:

| Platform | Goal |
|----------|------|
| **macOS** | Signed `.dmg` that installs Homeward + Ollama + dependencies |
| **Windows** | `.exe` installer with the same one-click experience |
| **Linux** | AppImage or distro packages |

The in-app model picker and Ollama management UI are built to work the same way in both Docker and future native installs.

## Native Development Install

For contributors and advanced users.

### Gateway (Python)

```bash
cd gateway
pip install -e ".[dev]"

export HOMEWARD_DATA_DIR=./gateway/data
export HOMEWARD_POLICIES_DIR=./policies
export HOMEWARD_OLLAMA_BASE_URL=http://localhost:11434

cd gateway
python -m uvicorn homeward_gateway.main:app --host 0.0.0.0 --port 8000 --reload
```

### Web (Next.js)

```bash
cd web
npm install
npm run dev   # runs on port 43123
```

### Ollama (manual, dev only)

Install [Ollama](https://ollama.com/) and run `ollama serve`. The setup wizard will detect it and offer model downloads.

## Running Tests

Homeward uses **pytest** with in-memory SQLite — no Docker or Ollama required for the test suite.

```bash
cd gateway
./scripts/test.sh
```

Or manually:

```bash
cd gateway
export HOMEWARD_DATA_DIR=./data
export HOMEWARD_POLICIES_DIR=../policies
pytest -v
```

### What is covered

| Area | Tests |
|------|-------|
| **Safety pipeline** | Rules, policy, classifier fallback, input/output filtering |
| **Auth** | Password hashing, session cookies, protected routes |
| **Setup flow** | Create/resume/complete setup, validation |
| **Chat** | Jailbreak blocking, dangerous content, session logging |
| **Dashboard** | Session grouping, message drill-down, blocked attempts |
| **Ollama** | Model catalog, recommendations, mocked HTTP service |
| **Policies** | YAML presets load correctly for all age groups |
| **Integration** | End-to-end setup, LLM-unavailable messaging (mocked) |

External services (Ollama, LiteLLM) are **mocked or bypassed** in tests so CI stays fast and deterministic.

### Voice (mic) — automated, no microphone needed

Kid chat records audio in the browser and sends it to the gateway for **local Whisper** transcription. You do not need to tap the mic to verify the pipeline after every change:

```bash
./scripts/test-voice.sh
```

This runs a bundled speech sample through Whisper (FLAC + WebM) and hits `GET /api/v1/chat/transcribe/self-test`. For the full Whisper integration (slower, downloads model on first run):

```bash
cd gateway
pytest tests/test_transcribe.py -v -m slow
```

Quick unit/API tests skip Whisper with `-m "not slow"` (the default in `test-voice.sh`).

### Read-aloud — automated, no browser or speakers needed

Homeward synthesizes speech on the **gateway** with local Piper TTS and plays it in the browser as WAV audio (browser `speechSynthesis` is not used — it is unreliable).

```bash
./scripts/test-read-aloud.sh
```

This runs `GET /api/v1/chat/speak/self-test`, verifies the speak endpoint returns a valid WAV, runs gateway pytest, and web vitest for the read-aloud player logic.

Full Piper integration (slower, downloads voice on first run):

```bash
cd gateway
pytest tests/test_speak.py -v -m slow
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HOMEWARD_SECRET_KEY` | `change-me-in-production` | Session signing key — **change in production** |
| `HOMEWARD_DOCKER` | `false` | Set automatically in Docker Compose |
| `HOMEWARD_OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama API URL |
| `HOMEWARD_OLLAMA_MODEL` | `llama3.2:3b` | Default chat model |
| `HOMEWARD_CLASSIFIER_MODEL` | `llama3.2:3b` | Safety classifier model |
| `HOMEWARD_DATA_DIR` | `./data` | SQLite database directory |
| `HOMEWARD_POLICIES_DIR` | `../policies` | Age preset YAML directory |
| `GATEWAY_URL` | `http://localhost:8000` | Web app proxy target |

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│  web (43123)│────▶│ gateway (8000)   │────▶│ Ollama      │
│  Next.js    │     │ FastAPI pipeline │     │ (included)  │
└─────────────┘     └──────────────────┘     └─────────────┘
                            │
                     ┌──────┴──────┐
                     │ SQLite logs │
                     │ policies/   │
                     └─────────────┘
```

## License

MIT — see [LICENSE](LICENSE).
