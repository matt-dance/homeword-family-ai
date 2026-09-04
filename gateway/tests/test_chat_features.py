"""Tests for Tier 1/2 chat features."""

import pytest
from httpx import AsyncClient

from homeward_gateway.chat.quiet_hours import is_chat_available
from homeward_gateway.chat.starters import get_conversation_starters
from homeward_gateway.pipeline.pipeline import PipelineResult
from homeward_gateway.pipeline.policy import load_all_presets
from tests.conftest import create_child, setup_parent


class TestQuietHours:
    def test_available_when_disabled(self):
        ok, msg = is_chat_available(enabled=False, start="09:00", end="17:00", days="0,1,2,3,4")
        assert ok is True
        assert msg is None

    def test_unavailable_outside_window(self):
        from datetime import datetime

        ok, msg = is_chat_available(
            enabled=True,
            start="09:00",
            end="17:00",
            days="0,1,2,3,4",
            now=datetime(2026, 9, 1, 20, 0),  # Monday 8pm
        )
        assert ok is False
        assert msg


class TestConversationStarters:
    def test_starters_from_preset(self):
        presets = load_all_presets()
        starters = get_conversation_starters(presets["young_explorer"])
        assert len(starters) >= 3
        assert all("label" in s and "message" in s for s in starters)


class TestChatFeaturesAPI:
    @pytest.mark.asyncio
    async def test_starters_endpoint(self, authenticated_client: AsyncClient):
        child = authenticated_client.test_child  # type: ignore[attr-defined]
        resp = await authenticated_client.get(f"/api/v1/children/{child['id']}/starters")
        assert resp.status_code == 200
        assert len(resp.json()) >= 3

    @pytest.mark.asyncio
    async def test_update_child_homework_and_quiet_hours(self, authenticated_client: AsyncClient):
        child = authenticated_client.test_child  # type: ignore[attr-defined]
        resp = await authenticated_client.patch(
            f"/api/v1/children/{child['id']}",
            json={
                "homework_mode": True,
                "quiet_hours_enabled": True,
                "quiet_hours_start": "09:00",
                "quiet_hours_end": "17:00",
                "quiet_hours_days": "0,1,2,3,4,5,6",
                "pin": "1234",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["homework_mode"] is True
        assert data["quiet_hours_enabled"] is True
        assert data["has_pin"] is True

    @pytest.mark.asyncio
    async def test_live_lookups_default_off_and_can_enable(self, authenticated_client: AsyncClient):
        child = authenticated_client.test_child  # type: ignore[attr-defined]
        assert child["live_lookups"] is False

        resp = await authenticated_client.patch(
            f"/api/v1/children/{child['id']}",
            json={"live_lookups": True},
        )
        assert resp.status_code == 200
        assert resp.json()["live_lookups"] is True

        listed = await authenticated_client.get("/api/v1/children")
        assert listed.json()[0]["live_lookups"] is True

        public = await authenticated_client.get("/api/v1/children/public")
        assert public.json()[0]["live_lookups"] is True

    @pytest.mark.asyncio
    async def test_blocked_stats(self, authenticated_client: AsyncClient):
        resp = await authenticated_client.get("/api/v1/dashboard/blocked/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert "today_count" in data
        assert "total_count" in data

    @pytest.mark.asyncio
    async def test_resume_session(self, authenticated_client: AsyncClient, monkeypatch):
        child = authenticated_client.test_child  # type: ignore[attr-defined]

        async def fake_process_chat(*_args, **_kwargs):
            return PipelineResult(allowed=True, content="Stars are giant glowing balls of gas.")

        monkeypatch.setattr("homeward_gateway.api.routes.process_chat", fake_process_chat)

        session = await authenticated_client.post(
            "/api/v1/chat/sessions",
            json={"child_id": child["id"]},
        )
        session_id = session.json()["session_id"]

        await authenticated_client.post(
            "/api/v1/chat",
            json={"message": "Hello stars", "child_id": child["id"], "session_id": session_id},
        )

        resume = await authenticated_client.get(f"/api/v1/children/{child['id']}/sessions/resume")
        assert resume.status_code == 200
        data = resume.json()
        assert data["session_id"] == session_id
        assert [m["role"] for m in data["messages"]] == ["user", "assistant"]

    @pytest.mark.asyncio
    async def test_resume_skips_empty_newer_session(self, authenticated_client: AsyncClient, monkeypatch):
        child = authenticated_client.test_child  # type: ignore[attr-defined]

        async def fake_process_chat(*_args, **_kwargs):
            return PipelineResult(allowed=True, content="Stars are giant glowing balls of gas.")

        monkeypatch.setattr("homeward_gateway.api.routes.process_chat", fake_process_chat)

        first = await authenticated_client.post(
            "/api/v1/chat/sessions",
            json={"child_id": child["id"]},
        )
        session_id = first.json()["session_id"]
        await authenticated_client.post(
            "/api/v1/chat",
            json={"message": "Hello stars", "child_id": child["id"], "session_id": session_id},
        )
        empty = await authenticated_client.post(
            "/api/v1/chat/sessions",
            json={"child_id": child["id"]},
        )
        assert empty.json()["session_id"] != session_id

        resume = await authenticated_client.get(f"/api/v1/children/{child['id']}/sessions/resume")
        assert resume.status_code == 200
        data = resume.json()
        assert data["session_id"] == session_id
        assert [m["content"] for m in data["messages"]]
        assert data["messages"][0]["content"] == "Hello stars"

    @pytest.mark.asyncio
    async def test_resume_disabled_when_parent_turns_it_off(self, authenticated_client: AsyncClient):
        child = authenticated_client.test_child  # type: ignore[attr-defined]
        await authenticated_client.patch(f"/api/v1/children/{child['id']}", json={"allow_resume": False})
        resume = await authenticated_client.get(f"/api/v1/children/{child['id']}/sessions/resume")
        assert resume.status_code == 404

    @pytest.mark.asyncio
    async def test_resume_empty_session_is_not_resumable(self, authenticated_client: AsyncClient):
        child = authenticated_client.test_child  # type: ignore[attr-defined]
        created = await authenticated_client.post(
            "/api/v1/chat/sessions",
            json={"child_id": child["id"]},
        )
        assert created.status_code == 200
        resume = await authenticated_client.get(f"/api/v1/children/{child['id']}/sessions/resume")
        assert resume.status_code == 404

    @pytest.mark.asyncio
    async def test_resume_skips_empty_latest_session(self, authenticated_client: AsyncClient, monkeypatch):
        child = authenticated_client.test_child  # type: ignore[attr-defined]

        async def fake_process_chat(*_args, **_kwargs):
            return PipelineResult(allowed=True, content="Cats purr when they are happy.")

        monkeypatch.setattr("homeward_gateway.api.routes.process_chat", fake_process_chat)

        first = await authenticated_client.post(
            "/api/v1/chat/sessions",
            json={"child_id": child["id"]},
        )
        first_id = first.json()["session_id"]
        await authenticated_client.post(
            "/api/v1/chat",
            json={"message": "Tell me about cats", "child_id": child["id"], "session_id": first_id},
        )
        empty = await authenticated_client.post(
            "/api/v1/chat/sessions",
            json={"child_id": child["id"]},
        )
        assert empty.status_code == 200

        resume = await authenticated_client.get(f"/api/v1/children/{child['id']}/sessions/resume")
        assert resume.status_code == 200
        data = resume.json()
        assert data["session_id"] == first_id
        assert data["messages"]
        assert any(m.get("content") for m in data["messages"])

    @pytest.mark.asyncio
    async def test_chat_blocked_during_quiet_hours(self, authenticated_client: AsyncClient, monkeypatch):
        child = authenticated_client.test_child  # type: ignore[attr-defined]
        monkeypatch.setattr(
            "homeward_gateway.api.routes.is_chat_available",
            lambda **_kwargs: (False, "Chat is taking a break until morning."),
        )
        resp = await authenticated_client.post(
            "/api/v1/chat",
            json={"message": "Hi", "child_id": child["id"]},
        )
        assert resp.status_code == 403
        assert "break" in resp.json()["detail"]

    @pytest.mark.asyncio
    async def test_public_children_includes_chat_available(self, authenticated_client: AsyncClient):
        resp = await authenticated_client.get("/api/v1/children/public")
        assert resp.status_code == 200
        assert "chat_available" in resp.json()[0]
