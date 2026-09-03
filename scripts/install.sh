#!/usr/bin/env bash
# Homeward one-command installer (Mac / Linux)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required. Install Docker Desktop from https://docker.com/products/docker-desktop/"
  exit 1
fi

echo "Starting Homeward (this includes Ollama and the AI model on first run)..."
docker compose up -d --build

echo ""
echo "Homeward is starting up."
echo "On this computer, open http://localhost to finish setup and use the dashboard."
echo "Kids on the same Wi-Fi can open http://homeward.local/chat"
echo ""
echo "On first launch, the setup wizard will help you:"
echo "  1. Create a parent password"
echo "  2. Add your children"
echo "  3. Pick and download an AI model (if not already installing)"
echo ""
echo "The first model download may take a few minutes depending on your internet speed."
