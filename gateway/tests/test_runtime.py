"""Runtime configuration resolution tests."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from homeward_gateway.config import settings
from homeward_gateway.db.database import Base, ParentAccount
from homeward_gateway.ollama.runtime import get_effective_models


@pytest.fixture
async def db_session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with factory() as session:
        yield session
    await engine.dispose()


class TestEffectiveModels:
    @pytest.mark.asyncio
    async def test_defaults_when_no_parent(self, db_session: AsyncSession):
        chat, classifier = await get_effective_models(db_session)
        assert chat == settings.ollama_model
        assert classifier == settings.classifier_model

    @pytest.mark.asyncio
    async def test_uses_parent_preferences(self, db_session: AsyncSession):
        parent = ParentAccount(
            password_hash="salt:hash",
            ollama_model="llama3.2:1b",
            classifier_model="llama3.2:1b",
        )
        db_session.add(parent)
        await db_session.commit()

        chat, classifier = await get_effective_models(db_session)
        assert chat == "llama3.2:1b"
        assert classifier == "llama3.2:1b"

    @pytest.mark.asyncio
    async def test_falls_back_when_parent_fields_null(self, db_session: AsyncSession):
        parent = ParentAccount(password_hash="salt:hash")
        db_session.add(parent)
        await db_session.commit()

        chat, classifier = await get_effective_models(db_session)
        assert chat == settings.ollama_model
        assert classifier == settings.classifier_model
