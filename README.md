# Homeward

**Homeward** is an open-source, local-first family AI safety gateway. It sits between your children and AI models, filtering every message in and out with a fail-closed safety pipeline. Parents get a simple setup wizard, age-based presets, and a dashboard to review conversations — no YAML required for basic use.

## Features (Phase 1)

- **Local AI first** — Ollama is the default; cloud/BYOK is hidden until a parent enables it
- **Fail-closed safety pipeline** — normalize → rules → classifier → policy → LLM → output filter
- **Age presets** — Young Explorer (5–8), Curious Explorer (9–12), Teen Guided (13–17)
- **Parent dashboard** — conversation logs, blocked attempts, optional cloud settings
- **Kid chat UI** — simple streaming chat with profile picker and friendly blocked messages
- **Cross-platform** — Docker Compose on Mac, Windows, and Linux

## Quick Start (Docker Compose)

**Prerequisites:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Mac/Windows) or Docker + Compose (Linux)

```bash
# Clone and start
git clone <your-repo-url> homeward
cd homeward

# Optional: set a secret key
export HOMEWARD_SECRET_KEY="your-secure-random-string"

docker compose up -d

# Pull the Ollama model (first run may take a few minutes)
docker compose exec ollama ollama pull llama3.2:3b
```

Open **http://localhost:43123** in your browser.

1. Complete the parent setup wizard (password + children)
2. Kids chat at **http://localhost:43123/chat**
3. Parents manage at **http://localhost:43123/dashboard**

### Stop

```bash
docker compose down
```

## Native Development Install

### Gateway (Python)

```bash
cd gateway
pip install -e ".[dev]"

# From repo root so policies/ is found
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

Set `GATEWAY_URL=http://localhost:8000` if the gateway runs elsewhere.

### Ollama (local AI)

Install [Ollama](https://ollama.com/) and pull a model:

```bash
ollama pull llama3.2:3b
```

## Running Tests

```bash
cd gateway
export HOMEWARD_DATA_DIR=./data
export HOMEWARD_POLICIES_DIR=../policies
pytest -v
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HOMEWARD_SECRET_KEY` | `change-me-in-production` | Session signing key — **change in production** |
| `HOMEWARD_OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama API URL |
| `HOMEWARD_OLLAMA_MODEL` | `llama3.2:3b` | Chat model |
| `HOMEWARD_CLASSIFIER_MODEL` | `llama3.2:3b` | Safety classifier model |
| `HOMEWARD_DATA_DIR` | `./data` | SQLite database directory |
| `HOMEWARD_POLICIES_DIR` | `../policies` | Age preset YAML directory |
| `HOMEWARD_CLOUD_ENABLED` | `false` | Enable cloud AI (parent can also toggle in UI) |
| `GATEWAY_URL` | `http://localhost:8000` | Web app proxy target |

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│  web (43123)│────▶│ gateway (8000)   │────▶│ Ollama      │
│  Next.js    │     │ FastAPI pipeline │     │ llama3.2:3b │
└─────────────┘     └──────────────────┘     └─────────────┘
                            │
                     ┌──────┴──────┐
                     │ SQLite logs │
                     │ policies/   │
                     └─────────────┘
```

### Safety Pipeline (every message in and out)

1. **Normalize** — sanitization, length limits
2. **Rules** — fast keyword/jailbreak matching
3. **Classifier** — local Ollama model (rules fallback if unavailable)
4. **Policy** — age preset + strictness slider
5. **LLM** — LiteLLM → Ollama (or cloud if enabled)
6. **Output filter** — same stages on responses

On any error or timeout → **block**, never pass-through.

## Project Structure

```
homeward/
├── gateway/           # Python FastAPI safety gateway
│   ├── homeward_gateway/
│   └── tests/
├── web/               # Next.js parent + kid UI
├── policies/          # Bundled age preset YAML + JSON schema
├── docker-compose.yml
├── LICENSE            # MIT
└── README.md
```

## Roadmap (not in Phase 1)

- MITM proxy / browser extension
- Native mobile apps
- Hosted SaaS
- Tailscale device pairing automation

## License

MIT — see [LICENSE](LICENSE).
