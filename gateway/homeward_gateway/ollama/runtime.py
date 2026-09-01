"""Resolve effective Ollama models for the installation."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from homeward_gateway.config import settings
from homeward_gateway.db.database import ParentAccount
from homeward_gateway.ollama.catalog import estimate_min_ram_gb, pick_classifier_model
from homeward_gateway.ollama.service import list_installed_models


async def get_effective_models(session: AsyncSession) -> tuple[str, str]:
    result = await session.execute(select(ParentAccount).limit(1))
    parent = result.scalar_one_or_none()
    chat = parent.ollama_model if parent and parent.ollama_model else settings.ollama_model
    classifier = (
        parent.classifier_model if parent and parent.classifier_model else settings.classifier_model
    )

    # Large chat models (e.g. 27B) must not run safety checks — too slow / thinking-only output.
    if estimate_min_ram_gb(chat) > 8 and classifier == chat:
        installed = await list_installed_models()
        classifier = pick_classifier_model(chat, installed)
        if parent and parent.classifier_model != classifier:
            parent.classifier_model = classifier
            await session.commit()

    return chat, classifier
