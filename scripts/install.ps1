# Homeward one-command installer (Windows PowerShell)
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Host "Docker is required. Install Docker Desktop from https://docker.com/products/docker-desktop/"
  exit 1
}

Write-Host "Starting Homeward (this includes Ollama and the AI model on first run)..."
docker compose up -d --build

Write-Host ""
Write-Host "Homeward is starting up."
Write-Host "Open http://localhost in your browser (Docker maps port 80)."
Write-Host ""
Write-Host "On first launch, the setup wizard will help you:"
Write-Host "  1. Create a parent password"
Write-Host "  2. Add your children"
Write-Host "  3. Pick and download an AI model (if not already installing)"
Write-Host ""
Write-Host "The first model download may take a few minutes depending on your internet speed."
