"""Shared pytest fixtures and helpers."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from homeward_gateway.db import database as db_module
from homeward_gateway.db.database import Base
from homeward_gateway.main import app

DEFAULT_PASSWORD = "testpass123"


@pytest.fixture(autouse=True)
async def fresh_db():
    """Fresh in-memory database for each test."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    db_module.engine = engine
    db_module.async_session_factory = factory

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(db_module._migrate_parent_columns)
        await conn.run_sync(db_module._migrate_session_columns)

    yield
    await engine.dispose()


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


async def setup_parent(client: AsyncClient, password: str = DEFAULT_PASSWORD) -> None:
    resp = await client.post("/api/v1/setup", json={"password": password})
    assert resp.status_code == 200


async def create_child(
    client: AsyncClient,
    *,
    name: str = "Emma",
    age: int = 7,
    strictness: int = 4,
) -> dict:
    resp = await client.post(
        "/api/v1/children",
        json={"name": name, "age": age, "strictness": strictness},
    )
    assert resp.status_code == 200
    return resp.json()


async def complete_setup(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/setup/complete")
    assert resp.status_code == 200


@pytest.fixture
async def authenticated_client(client: AsyncClient):
    """Client with parent account and one child profile."""
    await setup_parent(client)
    child = await create_child(client)
    client.test_child = child  # type: ignore[attr-defined]
    return client


@pytest.fixture
async def ready_client(authenticated_client: AsyncClient):
    """Fully set up installation."""
    await complete_setup(authenticated_client)
    return authenticated_client
