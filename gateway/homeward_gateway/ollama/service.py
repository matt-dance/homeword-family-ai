"""Ollama status checks, model recommendations, and pull jobs."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import subprocess
import uuid
from typing import Any

import httpx

from homeward_gateway.config import settings
from homeward_gateway.ollama.catalog import MODEL_CATALOG, catalog_by_id, pick_recommended_model

logger = logging.getLogger(__name__)

_pull_jobs: dict[str, dict[str, Any]] = {}


def get_system_ram_gb() -> float:
    """Detect available system RAM in GB (best effort)."""
    try:
        if os.path.exists("/proc/meminfo"):
            with open("/proc/meminfo", encoding="utf-8") as f:
                for line in f:
                    if line.startswith("MemTotal:"):
                        kb = int(line.split()[1])
                        return round(kb / 1024 / 1024, 1)
    except OSError:
        pass
    try:
        out = subprocess.check_output(["sysctl", "-n", "hw.memsize"], text=True, timeout=2)
        return round(int(out.strip()) / 1024**3, 1)
    except (subprocess.SubprocessError, OSError, ValueError):
        pass
    return 8.0


async def is_ollama_reachable() -> bool:
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{settings.ollama_base_url}/api/tags")
            return resp.status_code == 200
    except Exception:
        return False


async def list_installed_models() -> list[str]:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{settings.ollama_base_url}/api/tags")
            if resp.status_code != 200:
                return []
            data = resp.json()
            return sorted(model.get("name", "") for model in data.get("models", []) if model.get("name"))
    except Exception as e:
        logger.warning("Failed to list Ollama models: %s", e)
        return []


def _model_installed(model_id: str, installed: list[str]) -> bool:
    if model_id in installed:
        return True
    base = model_id.split(":")[0] if ":" in model_id else model_id
    return any(i == model_id or i.startswith(f"{base}:") for i in installed)


async def get_status(chat_model: str, classifier_model: str) -> dict[str, Any]:
    reachable = await is_ollama_reachable()
    installed = await list_installed_models() if reachable else []
    ram_gb = get_system_ram_gb()
    chat_ready = reachable and _model_installed(chat_model, installed)
    classifier_ready = reachable and _model_installed(classifier_model, installed)
    return {
        "reachable": reachable,
        "managed": settings.docker_mode,
        "ollama_url": settings.ollama_base_url,
        "system_ram_gb": ram_gb,
        "installed_models": installed,
        "chat_model": chat_model,
        "classifier_model": classifier_model,
        "chat_model_ready": chat_ready,
        "classifier_model_ready": classifier_ready,
        "ready": chat_ready and classifier_ready,
        "bootstrap_hint": (
            "Homeward is downloading the AI model. This only happens on first launch."
            if settings.docker_mode and reachable and not chat_ready
            else None
        ),
    }


async def get_recommendations(chat_model: str, classifier_model: str) -> dict[str, Any]:
    ram_gb = get_system_ram_gb()
    reachable = await is_ollama_reachable()
    installed = await list_installed_models() if reachable else []
    installed_set = set(installed)
    recommended_id = pick_recommended_model(ram_gb, installed_set)
    models = []
    for option in MODEL_CATALOG:
        fits = option.min_ram_gb <= ram_gb
        models.append(
            {
                "id": option.id,
                "name": option.name,
                "description": option.description,
                "min_ram_gb": option.min_ram_gb,
                "size_gb": option.size_gb,
                "tier": option.tier,
                "fits_machine": fits,
                "installed": _model_installed(option.id, installed),
                "recommended": option.id == recommended_id,
                "selected_chat": option.id == chat_model,
                "selected_classifier": option.id == classifier_model,
            }
        )
    return {
        "system_ram_gb": ram_gb,
        "ollama_reachable": reachable,
        "recommended_model": recommended_id,
        "models": models,
    }


def validate_model_id(model_id: str) -> None:
    if model_id not in catalog_by_id():
        raise ValueError(f"Unknown model: {model_id}")


async def _run_pull(job_id: str, model: str) -> None:
    job = _pull_jobs[job_id]
    job["status"] = "downloading"
    try:
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                "POST",
                f"{settings.ollama_base_url}/api/pull",
                json={"name": model, "stream": True},
            ) as resp:
                if resp.status_code != 200:
                    raise RuntimeError(f"Ollama pull failed with status {resp.status_code}")
                async for line in resp.aiter_lines():
                    if not line:
                        continue
                    data = json.loads(line)
                    status = data.get("status", "")
                    total = data.get("total") or 0
                    completed = data.get("completed") or 0
                    progress = int(completed / total * 100) if total else job.get("progress", 0)
                    if "pulling" in status or "downloading" in status:
                        job["progress"] = max(progress, job.get("progress", 0))
                    job["message"] = status
                    if status == "success":
                        job["status"] = "complete"
                        job["progress"] = 100
                        return
        job["status"] = "complete"
        job["progress"] = 100
    except Exception as e:
        logger.error("Ollama pull failed for %s: %s", model, e)
        job["status"] = "error"
        job["error"] = str(e)


def start_pull(model: str) -> str:
    validate_model_id(model)
    job_id = str(uuid.uuid4())
    _pull_jobs[job_id] = {
        "job_id": job_id,
        "model": model,
        "status": "pending",
        "progress": 0,
        "message": "Starting download…",
        "error": None,
    }
    asyncio.create_task(_run_pull(job_id, model))
    return job_id


def get_pull_job(job_id: str) -> dict[str, Any] | None:
    return _pull_jobs.get(job_id)
