"""Homework worksheet hints via a local Ollama vision model.

Expected model: ``llava:7b`` (Ollama). Also accepts common aliases such as
``llava``, ``moondream``, and ``llama3.2-vision`` if one of those is already
installed. Images stay in memory — never written to git or logged as bytes.
"""

from __future__ import annotations

import base64
import logging
from typing import Any

import httpx

from homeward_gateway.config import settings
from homeward_gateway.ollama import service as ollama_service

logger = logging.getLogger(__name__)

# Primary model parents should `ollama pull`. Lightweight aliases are accepted
# if already installed so families are not forced onto one download.
EXPECTED_VISION_MODEL = "llava:7b"
VISION_MODEL_ALIASES: tuple[str, ...] = (
    "llava:7b",
    "llava:latest",
    "llava",
    "llava:13b",
    "moondream:latest",
    "moondream",
    "llama3.2-vision:11b",
    "llama3.2-vision",
    "llama3.2-vision:latest",
    "minicpm-v",
    "minicpm-v:latest",
)

VISION_UNAVAILABLE_MESSAGE = (
    "Camera help needs a local vision model. "
    "Ask a parent to install llava:7b in Ollama (ollama pull llava:7b), "
    "or describe the problem in your own words and I'll give hints — "
    "I won't do the assignment for you."
)

MAX_IMAGE_BYTES = 4_000_000
IMAGE_SUFFIXES = frozenset({".png", ".jpg", ".jpeg", ".webp", ".gif"})
ALLOWED_CONTENT_TYPES = frozenset(
    {
        "image/png",
        "image/jpeg",
        "image/jpg",
        "image/webp",
        "image/gif",
    }
)

_MAGIC_PREFIXES: tuple[bytes, ...] = (
    b"\x89PNG\r\n\x1a\n",
    b"\xff\xd8\xff",
    b"RIFF",  # WebP is RIFF....WEBP
    b"GIF87a",
    b"GIF89a",
)

HOMEWORK_VISION_PROMPT = (
    "You are helping a child with a homework worksheet photo. "
    "Give a short hint and one guiding question. "
    "Do NOT give the final answer, write the completed work, or list solutions. "
    "Do NOT copy answers the child can paste. Help them think step by step."
)


def _normalize_model_name(name: str) -> str:
    return name.strip().lower()


def pick_vision_model(installed: list[str]) -> str | None:
    """Return an installed vision model, preferring ``llava:7b``."""
    installed_map = {_normalize_model_name(name): name for name in installed if name}
    preferred = settings.vision_model or EXPECTED_VISION_MODEL
    if _normalize_model_name(preferred) in installed_map:
        return installed_map[_normalize_model_name(preferred)]
    for alias in VISION_MODEL_ALIASES:
        key = _normalize_model_name(alias)
        if key in installed_map:
            return installed_map[key]
        # Allow "llava:7b" to match an installed "llava:7b-q4" style name.
        for installed_key, original in installed_map.items():
            if installed_key == key or installed_key.startswith(f"{key}-"):
                return original
            base = key.split(":")[0]
            if installed_key == base or installed_key.startswith(f"{base}:"):
                if "llava" in base or "moondream" in base or "vision" in base or "minicpm" in base:
                    return original
    return None


def validate_image(data: bytes, content_type: str | None, filename: str | None) -> None:
    if not data:
        raise ValueError("Image is empty")
    limit = settings.vision_max_bytes or MAX_IMAGE_BYTES
    if len(data) > limit:
        raise ValueError("Image is too large. Try a closer photo under 4 MB.")

    suffix = ""
    if filename and "." in filename:
        suffix = "." + filename.rsplit(".", 1)[-1].lower()

    ctype = (content_type or "").split(";")[0].strip().lower()
    type_ok = ctype in ALLOWED_CONTENT_TYPES or ctype.startswith("image/")
    suffix_ok = suffix in IMAGE_SUFFIXES if suffix else False
    if suffix and suffix not in IMAGE_SUFFIXES:
        raise ValueError("Please upload an image (PNG, JPEG, or WebP).")
    if ctype and ctype not in ALLOWED_CONTENT_TYPES and not ctype.startswith("image/"):
        raise ValueError("Please upload an image (PNG, JPEG, or WebP).")
    if not type_ok and not suffix_ok:
        raise ValueError("Please upload an image (PNG, JPEG, or WebP).")

    if not any(data.startswith(magic) for magic in _MAGIC_PREFIXES):
        # Soft check: some browsers send odd wrappers; size + type already gated.
        if ctype in ALLOWED_CONTENT_TYPES or suffix in IMAGE_SUFFIXES:
            return
        raise ValueError("That file does not look like a photo.")


async def list_installed_models() -> list[str]:
    if not await ollama_service.is_ollama_reachable():
        return []
    return await ollama_service.list_installed_models()


async def get_vision_status() -> dict[str, Any]:
    installed = await list_installed_models()
    model = pick_vision_model(installed)
    available = model is not None
    return {
        "available": available,
        "ready": available,
        "model": model,
        "expected_model": EXPECTED_VISION_MODEL,
        "message": None if available else VISION_UNAVAILABLE_MESSAGE,
    }


async def generate_homework_hint(
    *,
    image_bytes: bytes,
    model: str,
    question: str | None = None,
) -> str:
    """Ask the local vision model for a hint. Image bytes are not logged."""
    url = await ollama_service.resolved_ollama_url()
    if not url:
        raise RuntimeError("Ollama is not reachable")

    kid_note = (question or "").strip()
    prompt = HOMEWORK_VISION_PROMPT
    if kid_note:
        prompt = f"{prompt} The child says: {kid_note[:400]}"

    logger.info(
        "Homework vision hint: model=%s bytes=%s question_chars=%s",
        model,
        len(image_bytes),
        len(kid_note),
    )

    payload = {
        "model": model,
        "prompt": prompt,
        "images": [base64.b64encode(image_bytes).decode("ascii")],
        "stream": False,
    }
    timeout = settings.llm_timeout
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(f"{url}/api/generate", json=payload)
    if resp.status_code != 200:
        logger.warning("Homework vision generate failed: status=%s", resp.status_code)
        raise RuntimeError("The local vision model could not read that photo.")
    data = resp.json()
    text = (data.get("response") or "").strip()
    if not text:
        raise RuntimeError("The vision model did not return a hint.")
    return text
