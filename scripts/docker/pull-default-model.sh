#!/bin/sh
set -e

MODEL="${HOMEWARD_DEFAULT_MODEL:-llama3.2:3b}"

echo "Waiting for Ollama to start..."
until ollama list >/dev/null 2>&1; do
  sleep 2
done

if ollama list | grep -q "$MODEL"; then
  echo "Model $MODEL is already installed."
  exit 0
fi

echo "Downloading $MODEL (first launch only — may take a few minutes)..."
ollama pull "$MODEL"
echo "Model $MODEL is ready."
