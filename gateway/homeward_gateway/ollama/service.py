"""Ollama status checks, model recommendations, and pull jobs."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import platform
import subprocess
import uuid
from typing import Any

import httpx

from homeward_gateway.config import settings
from homeward_gateway.ollama.catalog import (
    MODEL_CATALOG,
    catalog_by_id,
    estimate_min_ram_gb,
    pick_classifier_model,
    pick_recommended_model,
)

logger = logging.getLogger(__name__)

_pull_jobs: dict[str, dict[str, Any]] = {}
_working_ollama_url: str | None = None


def _ollama_url_candidates() -> list[str]:
    """Prefer the configured URL, then IPv4/localhost aliases.

    ``localhost`` often resolves to ``::1`` while Ollama only listens on
    ``127.0.0.1``, which makes a running engine look down.
    """
    primary = settings.ollama_base_url.rstrip("/")
    urls = [primary]
    rest = primary.split("://", 1)[-1]
    if rest.startswith("localhost"):
        urls.append(primary.replace("://localhost", "://127.0.0.1", 1))
    elif rest.startswith("127.0.0.1"):
        urls.append(primary.replace("://127.0.0.1", "://localhost", 1))
    seen: list[str] = []
    for url in urls:
        if url not in seen:
            seen.append(url)
    return seen


async def _probe_ollama(url: str) -> bool:
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{url}/api/tags")
            return resp.status_code == 200
    except Exception:
        return False


async def resolved_ollama_url() -> str | None:
    """Return a working Ollama base URL, or None if nothing is listening."""
    global _working_ollama_url
    if _working_ollama_url and await _probe_ollama(_working_ollama_url):
        return _working_ollama_url
    for url in _ollama_url_candidates():
        if await _probe_ollama(url):
            if url != settings.ollama_base_url.rstrip("/"):
                logger.info("Ollama reachable at %s (configured %s)", url, settings.ollama_base_url)
            _working_ollama_url = url
            return url
    _working_ollama_url = None
    return None


def get_system_ram_gb() -> tuple[float, str]:
    """Detect physical system RAM in GB and how it was detected."""
    try:
        if os.path.exists("/proc/meminfo"):
            with open("/proc/meminfo", encoding="utf-8") as f:
                for line in f:
                    if line.startswith("MemTotal:"):
                        kb = int(line.split()[1])
                        return round(kb / 1024 / 1024, 1), "linux-meminfo"
    except OSError:
        pass

    if platform.system() == "Darwin":
        try:
            out = subprocess.check_output(["sysctl", "-n", "hw.memsize"], text=True, timeout=2)
            return round(int(out.strip()) / 1024**3, 1), "macos-sysctl"
        except (subprocess.SubprocessError, OSError, ValueError):
            pass

    if platform.system() == "Windows":
        try:
            import ctypes

            class MEMORYSTATUSEX(ctypes.Structure):
                _fields_ = [
                    ("dwLength", ctypes.c_ulong),
                    ("dwMemoryLoad", ctypes.c_ulong),
                    ("ullTotalPhys", ctypes.c_ulonglong),
                    ("ullAvailPhys", ctypes.c_ulonglong),
                    ("ullTotalPageFile", ctypes.c_ulonglong),
                    ("ullAvailPageFile", ctypes.c_ulonglong),
                    ("ullTotalVirtual", ctypes.c_ulonglong),
                    ("ullAvailVirtual", ctypes.c_ulonglong),
                    ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
                ]

            stat = MEMORYSTATUSEX()
            stat.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
            if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(stat)):
                return round(stat.ullTotalPhys / 1024**3, 1), "windows-globalmemory"
        except (OSError, AttributeError, ValueError):
            pass

    try:
        pages = os.sysconf("SC_PHYS_PAGES")
        page_size = os.sysconf("SC_PAGE_SIZE")
        if pages > 0 and page_size > 0:
            return round(pages * page_size / 1024**3, 1), "unix-sysconf"
    except (AttributeError, OSError, ValueError):
        pass

    return 8.0, "fallback-default"


def _catalog_installed(model_id: str, installed: list[str]) -> bool:
    if model_id in installed:
        return True
    base = model_id.split(":")[0] if ":" in model_id else model_id
    return any(name == model_id or name.startswith(f"{base}:") for name in installed)


def _other_installed_models(installed: list[str], ram_gb: float) -> list[dict[str, Any]]:
    catalog_ids = catalog_by_id()
    extras: list[dict[str, Any]] = []
    for name in installed:
        if any(_catalog_installed(catalog_id, [name]) for catalog_id in catalog_ids):
            continue
        min_ram = estimate_min_ram_gb(name)
        extras.append(
            {
                "id": name,
                "name": name,
                "description": "Already installed in Ollama on this computer.",
                "min_ram_gb": min_ram,
                "size_gb": 0,
                "tier": "installed",
                "fits_machine": min_ram <= ram_gb,
                "installed": True,
                "recommended": False,
                "selected_chat": False,
                "selected_classifier": False,
                "from_ollama": True,
            }
        )
    return sorted(extras, key=lambda item: item["id"])


async def is_ollama_reachable() -> bool:
    return await resolved_ollama_url() is not None


async def list_installed_models() -> list[str]:
    url = await resolved_ollama_url()
    if not url:
        return []
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{url}/api/tags")
            if resp.status_code != 200:
                return []
            data = resp.json()
            return sorted(model.get("name", "") for model in data.get("models", []) if model.get("name"))
    except Exception as e:
        logger.warning("Failed to list Ollama models: %s", e)
        return []


async def get_status(chat_model: str, classifier_model: str) -> dict[str, Any]:
    reachable = await is_ollama_reachable()
    installed = await list_installed_models() if reachable else []
    ram_gb, ram_source = get_system_ram_gb()
    chat_ready = reachable and _catalog_installed(chat_model, installed)
    classifier_ready = reachable and _catalog_installed(classifier_model, installed)
    return {
        "reachable": reachable,
        "managed": settings.docker_mode,
        "ollama_url": (await resolved_ollama_url()) or settings.ollama_base_url,
        "system_ram_gb": ram_gb,
        "ram_detection": ram_source,
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
    ram_gb, ram_source = get_system_ram_gb()
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
                "installed": _catalog_installed(option.id, installed),
                "recommended": option.id == recommended_id,
                "selected_chat": option.id == chat_model,
                "selected_classifier": option.id == classifier_model,
                "from_ollama": False,
            }
        )

    other_installed = _other_installed_models(installed, ram_gb)
    for item in other_installed:
        item["selected_chat"] = item["id"] == chat_model
        item["selected_classifier"] = item["id"] == classifier_model

    return {
        "system_ram_gb": ram_gb,
        "ram_detection": ram_source,
        "ollama_reachable": reachable,
        "recommended_model": recommended_id,
        "models": models,
        "other_installed": other_installed,
        "installed_models": installed,
    }


def validate_model_id(model_id: str, installed: list[str] | None = None) -> None:
    if model_id in catalog_by_id():
        return
    if installed and _catalog_installed(model_id, installed):
        return
    raise ValueError(f"Unknown model: {model_id}")


async def validate_model_choice(model_id: str) -> None:
    installed = await list_installed_models() if await is_ollama_reachable() else []
    validate_model_id(model_id, installed)


async def _run_pull(job_id: str, model: str) -> None:
    job = _pull_jobs[job_id]
    job["status"] = "downloading"
    try:
        url = await resolved_ollama_url() or settings.ollama_base_url.rstrip("/")
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                "POST",
                f"{url}/api/pull",
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
