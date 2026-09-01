"""Resolve effective Ollama models for the installation."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from homeward_gateway.config import settings
from homeward_gateway.db.database import ParentAccount


async def get_effective_models(session: AsyncSession) -> tuple[str, str]:
    result = await session.execute(select(ParentAccount).limit(1))
    parent = result.scalar_one_or_none()
    chat = parent.ollama_model if parent and parent.ollama_model else settings.ollama_model
    classifier = (
        parent.classifier_model if parent and parent.classifier_model else settings.classifier_model
    )
    return chat, classifier
