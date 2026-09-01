#!/usr/bin/env bash
# Wipe Homeward local data so the setup wizard runs again.
# Does NOT remove downloaded Ollama models (those live in Docker's ollama_data volume).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "This removes Homeward profiles, chat history, and saved model preferences."
echo "Parent password, children, and conversation logs will be gone."
echo ""
read -r -p "Continue? [y/N] " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
  echo "Cancelled."
  exit 0
fi

if command -v docker >/dev/null 2>&1 && docker compose ps -q gateway 2>/dev/null | grep -q .; then
  echo "Stopping Docker services and removing the homeward_data volume..."
  docker compose down
  docker volume rm -f homeward_data 2>/dev/null || docker volume rm -f "$(basename "$ROOT")_homeward_data" 2>/dev/null || true
fi

if [[ -f gateway/data/homeward.db ]]; then
  rm -f gateway/data/homeward.db
  echo "Removed gateway/data/homeward.db"
fi

if [[ -f gateway/homeward.db ]]; then
  rm -f gateway/homeward.db
  echo "Removed gateway/homeward.db"
fi

echo ""
echo "Done. Start Homeward again for a fresh setup wizard:"
echo "  ./scripts/install.sh   (Docker)"
echo "  or restart the gateway + web dev servers"
