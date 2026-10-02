"""Runtime configuration resolution tests."""

import pytest

from homeward_gateway.config import settings
from homeward_gateway.db import database as db_module
from homeward_gateway.db.database import ParentAccount
from homeward_gateway.ollama.runtime import get_effective_models


class TestEffectiveModels:
    @pytest.mark.asyncio
    async def test_defaults_when_no_parent(self):
        async with db_module.async_session_factory() as session:
            chat, classifier = await get_effective_models(session)
            assert chat == settings.ollama_model
            assert classifier == settings.classifier_model

    @pytest.mark.asyncio
    async def test_uses_parent_preferences(self):
        async with db_module.async_session_factory() as session:
            parent = ParentAccount(
                password_hash="salt:hash",
                ollama_model="llama3.2:1b",
                classifier_model="llama3.2:1b",
            )
            session.add(parent)
            await session.commit()

            chat, classifier = await get_effective_models(session)
            assert chat == "llama3.2:1b"
            assert classifier == "llama3.2:1b"

    @pytest.mark.asyncio
    async def test_falls_back_when_parent_fields_null(self):
        async with db_module.async_session_factory() as session:
            parent = ParentAccount(password_hash="salt:hash")
            session.add(parent)
            await session.commit()

            chat, classifier = await get_effective_models(session)
            assert chat == settings.ollama_model
            assert classifier == settings.classifier_model
