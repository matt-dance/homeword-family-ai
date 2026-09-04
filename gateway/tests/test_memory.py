"""Parent-approved kid memory: CRUD, caps, and chat-prompt inclusion."""

import pytest
from httpx import AsyncClient

from homeward_gateway.db.database import MEMORY_MAX_ITEMS, parse_child_memory
from homeward_gateway.pipeline.pipeline import PipelineResult
from tests.conftest import create_child, setup_parent
from tests.test_local_host import LAN_HEADERS


class TestParseChildMemory:
    def test_empty_and_invalid_become_empty_list(self):
        assert parse_child_memory(None) == []
        assert parse_child_memory("") == []
        assert parse_child_memory("not-json") == []
        assert parse_child_memory("{}") == []

    def test_keeps_structured_items_only(self):
        raw = (
            '[{"id": "abc", "label": "Pets", "value": "Luna"},'
            ' {"id": "", "label": "Skip", "value": "me"},'
            ' "nope"]'
        )
        assert parse_child_memory(raw) == [{"id": "abc", "label": "Pets", "value": "Luna"}]


class TestMemoryCRUD:
    @pytest.mark.asyncio
    async def test_memory_requires_parent_auth(self, client: AsyncClient):
        resp = await client.get("/api/v1/children/1/memory")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_unknown_child_is_not_found(self, authenticated_client: AsyncClient):
        resp = await authenticated_client.get("/api/v1/children/9999/memory")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_starts_empty_then_add_list_edit_delete(self, authenticated_client: AsyncClient):
        child = authenticated_client.test_child  # type: ignore[attr-defined]
        listed = await authenticated_client.get(f"/api/v1/children/{child['id']}/memory")
        assert listed.status_code == 200
        assert listed.json()["items"] == []

        created = await authenticated_client.post(
            f"/api/v1/children/{child['id']}/memory",
            json={"label": "Pets", "value": "Luna the cat"},
        )
        assert created.status_code == 200
        item = created.json()
        assert item["label"] == "Pets"
        assert item["value"] == "Luna the cat"
        assert item["id"]

        listed = await authenticated_client.get(f"/api/v1/children/{child['id']}/memory")
        assert listed.json()["items"] == [item]

        updated = await authenticated_client.patch(
            f"/api/v1/children/{child['id']}/memory/{item['id']}",
            json={"value": "Luna the orange cat"},
        )
        assert updated.status_code == 200
        assert updated.json()["value"] == "Luna the orange cat"
        assert updated.json()["label"] == "Pets"

        deleted = await authenticated_client.delete(
            f"/api/v1/children/{child['id']}/memory/{item['id']}"
        )
        assert deleted.status_code == 200
        listed = await authenticated_client.get(f"/api/v1/children/{child['id']}/memory")
        assert listed.json()["items"] == []

    @pytest.mark.asyncio
    async def test_wipe_all_notes(self, authenticated_client: AsyncClient):
        child = authenticated_client.test_child  # type: ignore[attr-defined]
        await authenticated_client.post(
            f"/api/v1/children/{child['id']}/memory",
            json={"label": "Hobbies", "value": "soccer"},
        )
        await authenticated_client.post(
            f"/api/v1/children/{child['id']}/memory",
            json={"label": "School project", "value": "volcano"},
        )
        wiped = await authenticated_client.delete(f"/api/v1/children/{child['id']}/memory")
        assert wiped.status_code == 200
        listed = await authenticated_client.get(f"/api/v1/children/{child['id']}/memory")
        assert listed.json()["items"] == []

    @pytest.mark.asyncio
    async def test_caps_at_twenty_items(self, authenticated_client: AsyncClient):
        child = authenticated_client.test_child  # type: ignore[attr-defined]
        for i in range(MEMORY_MAX_ITEMS):
            resp = await authenticated_client.post(
                f"/api/v1/children/{child['id']}/memory",
                json={"label": f"Note {i}", "value": f"fact {i}"},
            )
            assert resp.status_code == 200
        extra = await authenticated_client.post(
            f"/api/v1/children/{child['id']}/memory",
            json={"label": "Overflow", "value": "nope"},
        )
        assert extra.status_code == 400

    @pytest.mark.asyncio
    async def test_rejects_empty_and_oversized_fields(self, authenticated_client: AsyncClient):
        child = authenticated_client.test_child  # type: ignore[attr-defined]
        empty = await authenticated_client.post(
            f"/api/v1/children/{child['id']}/memory",
            json={"label": "   ", "value": "Luna"},
        )
        assert empty.status_code == 400
        long_value = await authenticated_client.post(
            f"/api/v1/children/{child['id']}/memory",
            json={"label": "Pets", "value": "x" * 300},
        )
        assert long_value.status_code == 400

    @pytest.mark.asyncio
    async def test_rejects_secrets_style_notes(self, authenticated_client: AsyncClient):
        child = authenticated_client.test_child  # type: ignore[attr-defined]
        secret = await authenticated_client.post(
            f"/api/v1/children/{child['id']}/memory",
            json={"label": "Password", "value": "hunter2"},
        )
        assert secret.status_code == 400
        ssn = await authenticated_client.post(
            f"/api/v1/children/{child['id']}/memory",
            json={"label": "School project", "value": "SSN 123-45-6789"},
        )
        assert ssn.status_code == 400

    @pytest.mark.asyncio
    async def test_edit_unknown_item_is_not_found(self, authenticated_client: AsyncClient):
        child = authenticated_client.test_child  # type: ignore[attr-defined]
        resp = await authenticated_client.patch(
            f"/api/v1/children/{child['id']}/memory/missing",
            json={"value": "nope"},
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_memory_stays_on_this_child(self, authenticated_client: AsyncClient):
        first = authenticated_client.test_child  # type: ignore[attr-defined]
        second = await create_child(authenticated_client, name="Sam", age=10)
        await authenticated_client.post(
            f"/api/v1/children/{first['id']}/memory",
            json={"label": "Pets", "value": "Luna"},
        )
        other = await authenticated_client.get(f"/api/v1/children/{second['id']}/memory")
        assert other.json()["items"] == []


class TestMemoryHostOnly:
    @pytest.mark.asyncio
    async def test_memory_routes_reject_lan(self, client: AsyncClient):
        await setup_parent(client)
        child = await create_child(client)
        created = await client.post(
            f"/api/v1/children/{child['id']}/memory",
            json={"label": "Pets", "value": "Luna"},
        )
        assert created.status_code == 200
        item_id = created.json()["id"]

        cases = [
            ("GET", f"/api/v1/children/{child['id']}/memory", None),
            ("POST", f"/api/v1/children/{child['id']}/memory", {"label": "Hobbies", "value": "soccer"}),
            ("PATCH", f"/api/v1/children/{child['id']}/memory/{item_id}", {"value": "Milo"}),
            ("DELETE", f"/api/v1/children/{child['id']}/memory/{item_id}", None),
            ("DELETE", f"/api/v1/children/{child['id']}/memory", None),
        ]
        for method, path, body in cases:
            resp = await client.request(method, path, json=body, headers=LAN_HEADERS)
            assert resp.status_code == 403, path


class TestMemoryPromptInjection:
    @pytest.mark.asyncio
    async def test_named_chat_passes_saved_memory_only(self, authenticated_client: AsyncClient, monkeypatch):
        child = authenticated_client.test_child  # type: ignore[attr-defined]
        await authenticated_client.post(
            f"/api/v1/children/{child['id']}/memory",
            json={"label": "Pets", "value": "Luna the cat"},
        )
        captured: dict = {}

        async def fake_process_chat(*_args, **kwargs):
            captured.update(kwargs)
            return PipelineResult(allowed=True, content="Hi!")

        monkeypatch.setattr("homeward_gateway.api.routes.process_chat", fake_process_chat)
        resp = await authenticated_client.post(
            "/api/v1/chat",
            json={"message": "hello", "child_id": child["id"]},
        )
        assert resp.status_code == 200
        items = captured.get("memory_items") or []
        assert len(items) == 1
        assert items[0]["label"] == "Pets"
        assert items[0]["value"] == "Luna the cat"

    @pytest.mark.asyncio
    async def test_quick_chat_omits_memory(self, authenticated_client: AsyncClient, monkeypatch):
        child = authenticated_client.test_child  # type: ignore[attr-defined]
        await authenticated_client.post(
            f"/api/v1/children/{child['id']}/memory",
            json={"label": "Pets", "value": "Luna the cat"},
        )
        captured: dict = {}

        async def fake_process_chat(*_args, **kwargs):
            captured.update(kwargs)
            return PipelineResult(allowed=True, content="Hi there!")

        monkeypatch.setattr("homeward_gateway.api.routes.process_chat", fake_process_chat)
        resp = await authenticated_client.post(
            "/api/v1/chat",
            json={"message": "hello", "child_id": child["id"], "quick_chat": True},
        )
        assert resp.status_code == 200
        assert captured.get("memory_items") in (None, [])

    @pytest.mark.asyncio
    async def test_stream_passes_memory_the_same_way(self, authenticated_client: AsyncClient, monkeypatch):
        child = authenticated_client.test_child  # type: ignore[attr-defined]
        await authenticated_client.post(
            f"/api/v1/children/{child['id']}/memory",
            json={"label": "Hobbies", "value": "soccer"},
        )
        captured: dict = {}

        async def fake_process_chat_stream(*_args, **kwargs):
            captured.update(kwargs)
            if False:
                yield ""

        monkeypatch.setattr(
            "homeward_gateway.api.routes.process_chat_stream", fake_process_chat_stream
        )
        resp = await authenticated_client.post(
            "/api/v1/chat/stream",
            json={"message": "hello", "child_id": child["id"]},
        )
        assert resp.status_code == 200
        items = captured.get("memory_items") or []
        assert items[0]["value"] == "soccer"
