"""Tests for child profile URL slugs."""

import pytest
from httpx import AsyncClient

from homeward_gateway.util.slug import slugify_name, unique_slug
from tests.conftest import create_child, setup_parent


class TestSlugHelpers:
    def test_slugify_name(self):
        assert slugify_name("Lincoln") == "lincoln"
        assert slugify_name("  Emma Rose  ") == "emma-rose"
        assert slugify_name("!!!") == "child"

    def test_unique_slug(self):
        taken = {"lincoln", "lincoln-2"}
        assert unique_slug("lincoln", taken) == "lincoln-3"
        assert unique_slug("maya", taken) == "maya"


class TestChildSlugs:
    @pytest.mark.asyncio
    async def test_create_child_assigns_slug(self, client: AsyncClient):
        await setup_parent(client)
        child = await create_child(client, name="Lincoln")
        assert child["slug"] == "lincoln"

    @pytest.mark.asyncio
    async def test_duplicate_names_get_unique_slugs(self, client: AsyncClient):
        await setup_parent(client)
        first = await create_child(client, name="Alex")
        second = await create_child(client, name="Alex")
        assert first["slug"] == "alex"
        assert second["slug"] == "alex-2"

    @pytest.mark.asyncio
    async def test_rename_updates_slug(self, client: AsyncClient):
        await setup_parent(client)
        child = await create_child(client, name="Sam")
        resp = await client.patch(
            f"/api/v1/children/{child['id']}",
            json={"name": "Jordan"},
        )
        assert resp.status_code == 200
        assert resp.json()["slug"] == "jordan"

    @pytest.mark.asyncio
    async def test_public_children_include_slug(self, client: AsyncClient):
        await setup_parent(client)
        child = await create_child(client, name="Maya")
        resp = await client.get("/api/v1/children/public")
        assert resp.status_code == 200
        public = resp.json()
        assert len(public) == 1
        assert public[0]["slug"] == "maya"
        assert public[0]["name"] == child["name"]


@pytest.mark.asyncio
async def test_quick_slug_is_reserved_for_quick_chat(client: AsyncClient):
    await setup_parent(client)
    child = await create_child(client, name="Quick")
    assert child["slug"] != "quick"
