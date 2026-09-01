"""Curated Ollama models with hardware requirements."""

from dataclasses import dataclass


@dataclass(frozen=True)
class ModelOption:
    id: str
    name: str
    description: str
    min_ram_gb: float
    size_gb: float
    tier: str  # light | balanced | quality


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
        description="Recommended default — balanced speed and quality for most family PCs.",
        min_ram_gb=8,
        size_gb=2.0,
        tier="balanced",
    ),
    ModelOption(
        id="mistral:7b",
        name="Mistral 7B",
        description="Higher quality answers — needs 16 GB RAM or more.",
        min_ram_gb=16,
        size_gb=4.1,
        tier="quality",
    ),
    ModelOption(
        id="llama3.1:8b",
        name="Llama 3.1 8B",
        description="Best quality in this list — for desktops with plenty of memory.",
        min_ram_gb=16,
        size_gb=4.7,
        tier="quality",
    ),
]


def catalog_by_id() -> dict[str, ModelOption]:
    return {m.id: m for m in MODEL_CATALOG}


def pick_recommended_model(ram_gb: float, installed: set[str]) -> str:
    """Best catalog model that fits RAM; prefer already-installed."""
    fitting = [m for m in MODEL_CATALOG if m.min_ram_gb <= ram_gb]
    if not fitting:
        return MODEL_CATALOG[0].id
    for model in reversed(fitting):
        if model.id in installed:
            return model.id
    for model in reversed(fitting):
        if model.tier == "balanced":
            return model.id
    return fitting[-1].id
