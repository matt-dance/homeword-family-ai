"""Curated Ollama models with hardware requirements."""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class ModelOption:
    id: str
    name: str
    description: str
    min_ram_gb: float
    size_gb: float
    tier: str  # light | balanced | quality | premium


MODEL_CATALOG: list[ModelOption] = [
    ModelOption(
        id="llama3.2:1b",
        name="Llama 3.2 1B",
        description="Fastest option — good for older laptops and 4 GB RAM machines.",
        min_ram_gb=4,
        size_gb=1.3,
        tier="light",
    ),
    ModelOption(
        id="gemma2:2b",
        name="Gemma 2 2B",
        description="Lightweight Google model — quick replies on modest hardware.",
        min_ram_gb=4,
        size_gb=1.6,
        tier="light",
    ),
    ModelOption(
        id="phi3:mini",
        name="Phi-3 Mini",
        description="Small but capable — works well on 4–8 GB RAM systems.",
        min_ram_gb=4,
        size_gb=2.2,
        tier="light",
    ),
    ModelOption(
        id="llama3.2:3b",
        name="Llama 3.2 3B",
        description="Balanced default — good speed and quality on 8 GB RAM or more.",
        min_ram_gb=8,
        size_gb=2.0,
        tier="balanced",
    ),
    ModelOption(
        id="mistral:7b",
        name="Mistral 7B",
        description="Strong answers on 16 GB RAM — a step up from the 3B models.",
        min_ram_gb=16,
        size_gb=4.1,
        tier="quality",
    ),
    ModelOption(
        id="llama3.1:8b",
        name="Llama 3.1 8B",
        description="High quality for 16 GB RAM — great for family desktops.",
        min_ram_gb=16,
        size_gb=4.7,
        tier="quality",
    ),
    ModelOption(
        id="qwen2.5:14b",
        name="Qwen 2.5 14B",
        description="Excellent quality when you have 24 GB RAM or more.",
        min_ram_gb=24,
        size_gb=9.0,
        tier="premium",
    ),
    ModelOption(
        id="llama3.1:70b",
        name="Llama 3.1 70B (quantized)",
        description="Top-tier answers — only for powerful machines with 48 GB RAM or more.",
        min_ram_gb=48,
        size_gb=40.0,
        tier="premium",
    ),
]


def catalog_by_id() -> dict[str, ModelOption]:
    return {m.id: m for m in MODEL_CATALOG}


def estimate_min_ram_gb(model_id: str) -> float:
    """Best-effort RAM estimate for models outside the catalog."""
    lowered = model_id.lower()
    match = re.search(r"(\d+(?:\.\d+)?)\s*b", lowered)
    if match:
        params = float(match.group(1))
        if params <= 3:
            return 4
        if params <= 8:
            return 8
        if params <= 14:
            return 16
        if params <= 22:
            return 24
        if params <= 34:
            return 32
        if params <= 50:
            return 48
        return 64
    if "70b" in lowered or "72b" in lowered:
        return 48
    return 8


def pick_recommended_model(ram_gb: float, installed: set[str]) -> str:
    """Best catalog model for this RAM (for the Recommended badge)."""
    fitting = [m for m in MODEL_CATALOG if m.min_ram_gb <= ram_gb]
    if not fitting:
        return MODEL_CATALOG[0].id

    if ram_gb >= 24:
        premium = [m for m in fitting if m.tier == "premium"]
        if premium:
            return premium[-1].id
    if ram_gb >= 16:
        quality = [m for m in fitting if m.tier == "quality"]
        if quality:
            return quality[-1].id
    if ram_gb >= 8:
        balanced = [m for m in fitting if m.tier == "balanced"]
        if balanced:
            return balanced[-1].id
    return fitting[-1].id


def pick_default_model(ram_gb: float, installed: set[str], current: str | None = None) -> str:
    """Default selection — prefer current, then installed, then recommended."""
    if current and (current in installed or current in catalog_by_id()):
        return current
    fitting = [m for m in MODEL_CATALOG if m.min_ram_gb <= ram_gb]
    installed_fitting = [m for m in fitting if m.id in installed]
    if installed_fitting:
        return installed_fitting[-1].id
    return pick_recommended_model(ram_gb, installed)


CLASSIFIER_PREFERENCES = (
    "llama3.2:1b",
    "llama3.2:3b",
    "phi3:mini",
    "gemma2:2b",
)


def pick_classifier_model(chat_model: str, installed: list[str]) -> str:
    """Safety checks need a fast model — never default to a large chat model."""
    for candidate in CLASSIFIER_PREFERENCES:
        if candidate in installed:
            return candidate
    if estimate_min_ram_gb(chat_model) <= 8 and chat_model in installed:
        return chat_model
    if installed:
        return min(installed, key=estimate_min_ram_gb)
    return "llama3.2:3b"
