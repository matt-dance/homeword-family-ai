"""Tests for Tier 1/2 chat features."""

import asyncio

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from homeward_gateway.api.routes import _latest_recovery_turn, _log_message
from homeward_gateway.chat.quiet_hours import is_chat_available
from homeward_gateway.chat.starters import get_conversation_starters
from homeward_gateway.db import database as db_module
from homeward_gateway.pipeline.pipeline import PipelineResult, StatusEvent
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
    async def test_open_web_search_defaults_off_and_requires_live_lookups(
        self, authenticated_client: AsyncClient
    ):
        child = authenticated_client.test_child  # type: ignore[attr-defined]
        assert child["open_web_search"] is False
        assert "SearxNG" not in str(child)

        rejected = await authenticated_client.patch(
            f"/api/v1/children/{child['id']}",
            json={"open_web_search": True},
        )
        assert rejected.status_code == 200
        assert rejected.json()["open_web_search"] is False
        assert "SearxNG" not in rejected.text

        enabled = await authenticated_client.patch(
            f"/api/v1/children/{child['id']}",
            json={"live_lookups": True, "open_web_search": True},
        )
        assert enabled.status_code == 200
        assert enabled.json()["live_lookups"] is True
        assert enabled.json()["open_web_search"] is True

        cleared = await authenticated_client.patch(
            f"/api/v1/children/{child['id']}",
            json={"live_lookups": False},
        )
        assert cleared.json()["open_web_search"] is False

        status = await authenticated_client.get("/api/v1/open-web-search")
        assert status.status_code == 200
        assert status.json()["available"] in {True, False}
        assert "SearxNG" not in status.text

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
    async def test_resume_after_start_fresh_returns_new_session(self, authenticated_client: AsyncClient, monkeypatch):
        """Start fresh + a distinctive turn becomes Continue last chat, not the prior session."""
        child = authenticated_client.test_child  # type: ignore[attr-defined]
        replies = iter(["A short joke.", "The purple dragon is noted."])

        async def fake_process_chat(*_args, **_kwargs):
            return PipelineResult(allowed=True, content=next(replies))

        monkeypatch.setattr("homeward_gateway.api.routes.process_chat", fake_process_chat)

        first = await authenticated_client.post(
            "/api/v1/chat/sessions",
            json={"child_id": child["id"]},
        )
        old_id = first.json()["session_id"]
        await authenticated_client.post(
            "/api/v1/chat",
            json={"message": "Tell me a very short joke.", "child_id": child["id"], "session_id": old_id},
        )

        fresh = await authenticated_client.post(
            "/api/v1/chat/sessions",
            json={"child_id": child["id"]},
        )
        fresh_id = fresh.json()["session_id"]
        assert fresh_id != old_id
        await authenticated_client.post(
            "/api/v1/chat",
            json={
                "message": "remember the purple dragon",
                "child_id": child["id"],
                "session_id": fresh_id,
            },
        )

        resume = await authenticated_client.get(f"/api/v1/children/{child['id']}/sessions/resume")
        assert resume.status_code == 200
        assert "no-store" in resume.headers.get("cache-control", "").lower()
        data = resume.json()
        assert data["session_id"] == fresh_id
        contents = " ".join(m["content"] for m in data["messages"])
        assert "purple dragon" in contents
        assert "Tell me a very short joke." not in contents

    @pytest.mark.asyncio
    async def test_resume_keeps_start_fresh_when_older_session_gets_a_later_log(
        self, authenticated_client: AsyncClient, monkeypatch
    ):
        """The named session that received the fresh turn stays canonical."""
        child = authenticated_client.test_child  # type: ignore[attr-defined]
        replies = iter(["A short joke.", "The purple dragon is noted."])

        async def fake_process_chat(*_args, **_kwargs):
            return PipelineResult(allowed=True, content=next(replies))

        monkeypatch.setattr("homeward_gateway.api.routes.process_chat", fake_process_chat)

        first = await authenticated_client.post(
            "/api/v1/chat/sessions",
            json={"child_id": child["id"]},
        )
        old_id = first.json()["session_id"]
        await authenticated_client.post(
            "/api/v1/chat",
            json={"message": "Tell me a very short joke.", "child_id": child["id"], "session_id": old_id},
        )
        fresh = await authenticated_client.post(
            "/api/v1/chat/sessions",
            json={"child_id": child["id"]},
        )
        fresh_id = fresh.json()["session_id"]
        await authenticated_client.post(
            "/api/v1/chat",
            json={
                "message": "remember the purple dragon",
                "child_id": child["id"],
                "session_id": fresh_id,
            },
        )
        async with db_module.async_session_factory() as db:
            await db.execute(
                text(
                    "INSERT INTO conversation_logs "
                    "(child_id, session_id, direction, content, blocked, created_at) "
                    "VALUES (:child_id, :session_id, 'input', 'later stray joke', 0, CURRENT_TIMESTAMP)"
                ),
                {"child_id": child["id"], "session_id": old_id},
            )
            await db.commit()

        resume = await authenticated_client.get(f"/api/v1/children/{child['id']}/sessions/resume")
        assert resume.status_code == 200
        data = resume.json()
        assert data["session_id"] == fresh_id
        contents = " ".join(m["content"] for m in data["messages"])
        assert "purple dragon" in contents
        assert "Tell me a very short joke." not in contents

    @pytest.mark.asyncio
    async def test_late_persist_from_older_session_does_not_rewind_pointer(
        self, authenticated_client: AsyncClient, monkeypatch
    ):
        """A visible log for an older session must not steal Continue last chat."""
        child = authenticated_client.test_child  # type: ignore[attr-defined]
        replies = iter(["A short joke.", "The purple dragon is noted."])

        async def fake_process_chat(*_args, **_kwargs):
            return PipelineResult(allowed=True, content=next(replies))

        monkeypatch.setattr("homeward_gateway.api.routes.process_chat", fake_process_chat)

        first = await authenticated_client.post(
            "/api/v1/chat/sessions",
            json={"child_id": child["id"]},
        )
        old_id = first.json()["session_id"]
        await authenticated_client.post(
            "/api/v1/chat",
            json={"message": "Tell me a very short joke.", "child_id": child["id"], "session_id": old_id},
        )
        fresh = await authenticated_client.post(
            "/api/v1/chat/sessions",
            json={"child_id": child["id"]},
        )
        fresh_id = fresh.json()["session_id"]
        await authenticated_client.post(
            "/api/v1/chat",
            json={
                "message": "remember the purple dragon",
                "child_id": child["id"],
                "session_id": fresh_id,
            },
        )

        async with db_module.async_session_factory() as db:
            await _log_message(
                db,
                child["id"],
                "output",
                "late reply from the older joke",
                chat_session_id=old_id,
            )

        resume = await authenticated_client.get(f"/api/v1/children/{child['id']}/sessions/resume")
        assert resume.status_code == 200
        assert resume.json()["session_id"] == fresh_id

    @pytest.mark.asyncio
    async def test_stream_close_flush_does_not_rewind_start_fresh(
        self, authenticated_client: AsyncClient, monkeypatch
    ):
        """A late flush of an older stream must not rewind Continue last chat."""
        child = authenticated_client.test_child  # type: ignore[attr-defined]
        old_stream_started = asyncio.Event()
        fresh_turn_saved = asyncio.Event()

        async def fake_process_chat(*_args, **_kwargs):
            return PipelineResult(allowed=True, content="The purple dragon is noted.")

        async def fake_stream(*_args, **_kwargs):
            yield StatusEvent(message="Writing a reply…", phase="generating")
            yield "still telling the joke"
            old_stream_started.set()
            await fresh_turn_saved.wait()
            return

        monkeypatch.setattr("homeward_gateway.api.routes.process_chat", fake_process_chat)
        monkeypatch.setattr("homeward_gateway.api.routes.process_chat_stream", fake_stream)

        first = await authenticated_client.post(
            "/api/v1/chat/sessions",
            json={"child_id": child["id"]},
        )
        old_id = first.json()["session_id"]

        async def read_old_stream() -> None:
            async with authenticated_client.stream(
                "POST",
                "/api/v1/chat/stream",
                json={
                    "message": "Tell me a very short joke.",
                    "child_id": child["id"],
                    "session_id": old_id,
                },
            ) as response:
                assert response.status_code == 200
                async for _line in response.aiter_lines():
                    pass

        reader = asyncio.create_task(read_old_stream())
        await asyncio.wait_for(old_stream_started.wait(), timeout=5)

        fresh = await authenticated_client.post(
            "/api/v1/chat/sessions",
            json={"child_id": child["id"]},
        )
        fresh_id = fresh.json()["session_id"]
        noted = await authenticated_client.post(
            "/api/v1/chat",
            json={
                "message": "remember the purple dragon",
                "child_id": child["id"],
                "session_id": fresh_id,
            },
        )
        assert noted.status_code == 200
        fresh_turn_saved.set()
        await asyncio.wait_for(reader, timeout=5)

        async with db_module.async_session_factory() as db:
            rows = await db.execute(
                text(
                    "SELECT content FROM conversation_logs "
                    "WHERE session_id = :session_id AND direction = 'output'"
                ),
                {"session_id": old_id},
            )
            assert "still telling the joke" in " ".join(row[0] for row in rows.all())

        resume = await authenticated_client.get(f"/api/v1/children/{child['id']}/sessions/resume")
        assert resume.status_code == 200
        assert resume.json()["session_id"] == fresh_id

    @pytest.mark.asyncio
    async def test_stream_start_fresh_is_the_resume_target(
        self, authenticated_client: AsyncClient, monkeypatch
    ):
        child = authenticated_client.test_child  # type: ignore[attr-defined]
        replies = iter(["A short joke.", "The purple dragon is noted."])

        async def fake_process_chat(*_args, **_kwargs):
            return PipelineResult(allowed=True, content=next(replies))

        async def fake_stream(*_args, **_kwargs):
            text_out = next(replies)
            yield StatusEvent(message="Writing a reply…", phase="generating")
            yield text_out
            yield PipelineResult(allowed=True, content=text_out)

        monkeypatch.setattr("homeward_gateway.api.routes.process_chat", fake_process_chat)
        monkeypatch.setattr("homeward_gateway.api.routes.process_chat_stream", fake_stream)

        first = await authenticated_client.post(
            "/api/v1/chat/sessions",
            json={"child_id": child["id"]},
        )
        old_id = first.json()["session_id"]
        await authenticated_client.post(
            "/api/v1/chat",
            json={"message": "Tell me a very short joke.", "child_id": child["id"], "session_id": old_id},
        )
        fresh = await authenticated_client.post(
            "/api/v1/chat/sessions",
            json={"child_id": child["id"]},
        )
        fresh_id = fresh.json()["session_id"]
        streamed = await authenticated_client.post(
            "/api/v1/chat/stream",
            json={
                "message": "remember the purple dragon",
                "child_id": child["id"],
                "session_id": fresh_id,
            },
        )
        assert streamed.status_code == 200
        assert "purple dragon" in streamed.text or "noted" in streamed.text

        resume = await authenticated_client.get(f"/api/v1/children/{child['id']}/sessions/resume")
        assert resume.status_code == 200
        assert resume.json()["session_id"] == fresh_id
        contents = " ".join(m["content"] for m in resume.json()["messages"])
        assert "purple dragon" in contents
        assert "Tell me a very short joke." not in contents

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
    async def test_session_messages_return_only_latest_turn(
        self, authenticated_client: AsyncClient, monkeypatch
    ):
        child = authenticated_client.test_child  # type: ignore[attr-defined]
        replies = iter(["First answer.", "Second answer."])

        async def fake_process_chat(*_args, **_kwargs):
            return PipelineResult(allowed=True, content=next(replies))

        monkeypatch.setattr("homeward_gateway.api.routes.process_chat", fake_process_chat)

        created = await authenticated_client.post(
            "/api/v1/chat/sessions",
            json={"child_id": child["id"]},
        )
        session_id = created.json()["session_id"]
        await authenticated_client.post(
            "/api/v1/chat",
            json={"message": "Hello stars", "child_id": child["id"], "session_id": session_id},
        )
        await authenticated_client.post(
            "/api/v1/chat",
            json={"message": "How hot are they?", "child_id": child["id"], "session_id": session_id},
        )

        recovered = await authenticated_client.get(f"/api/v1/chat/sessions/{session_id}/messages")
        assert recovered.status_code == 200
        messages = recovered.json()["messages"]
        assert [m["role"] for m in messages] == ["user", "assistant"]
        assert messages[0]["content"] == "How hot are they?"
        assert messages[1]["content"] == "Second answer."

    @pytest.mark.asyncio
    async def test_session_messages_hide_prior_history_when_resume_disabled(
        self, authenticated_client: AsyncClient, monkeypatch
    ):
        child = authenticated_client.test_child  # type: ignore[attr-defined]

        async def fake_process_chat(*_args, **_kwargs):
            return PipelineResult(allowed=True, content="Stars are giant glowing balls of gas.")

        monkeypatch.setattr("homeward_gateway.api.routes.process_chat", fake_process_chat)

        first = await authenticated_client.post(
            "/api/v1/chat/sessions",
            json={"child_id": child["id"]},
        )
        old_id = first.json()["session_id"]
        await authenticated_client.post(
            "/api/v1/chat",
            json={"message": "Hello stars", "child_id": child["id"], "session_id": old_id},
        )
        second = await authenticated_client.post(
            "/api/v1/chat/sessions",
            json={"child_id": child["id"]},
        )
        current_id = second.json()["session_id"]
        await authenticated_client.post(
            "/api/v1/chat",
            json={"message": "Hi again", "child_id": child["id"], "session_id": current_id},
        )

        await authenticated_client.patch(
            f"/api/v1/children/{child['id']}", json={"allow_resume": False}
        )

        prior = await authenticated_client.get(f"/api/v1/chat/sessions/{old_id}/messages")
        assert prior.status_code == 404

        current = await authenticated_client.get(f"/api/v1/chat/sessions/{current_id}/messages")
        assert current.status_code == 200
        messages = current.json()["messages"]
        assert [m["content"] for m in messages] == [
            "Hi again",
            "Stars are giant glowing balls of gas.",
        ]

    @pytest.mark.asyncio
    async def test_session_messages_do_not_enumerate_older_than_resume_target(
        self, authenticated_client: AsyncClient, monkeypatch
    ):
        child = authenticated_client.test_child  # type: ignore[attr-defined]

        async def fake_process_chat(*_args, **_kwargs):
            return PipelineResult(allowed=True, content="A later reply.")

        monkeypatch.setattr("homeward_gateway.api.routes.process_chat", fake_process_chat)

        first = await authenticated_client.post(
            "/api/v1/chat/sessions",
            json={"child_id": child["id"]},
        )
        oldest_id = first.json()["session_id"]
        await authenticated_client.post(
            "/api/v1/chat",
            json={"message": "Oldest", "child_id": child["id"], "session_id": oldest_id},
        )
        second = await authenticated_client.post(
            "/api/v1/chat/sessions",
            json={"child_id": child["id"]},
        )
        resume_id = second.json()["session_id"]
        await authenticated_client.post(
            "/api/v1/chat",
            json={"message": "Resume me", "child_id": child["id"], "session_id": resume_id},
        )
        empty = await authenticated_client.post(
            "/api/v1/chat/sessions",
            json={"child_id": child["id"]},
        )
        empty_id = empty.json()["session_id"]

        oldest = await authenticated_client.get(f"/api/v1/chat/sessions/{oldest_id}/messages")
        assert oldest.status_code == 404

        resumed = await authenticated_client.get(f"/api/v1/chat/sessions/{resume_id}/messages")
        assert resumed.status_code == 200
        assert [m["content"] for m in resumed.json()["messages"]] == ["Resume me", "A later reply."]

        current = await authenticated_client.get(f"/api/v1/chat/sessions/{empty_id}/messages")
        assert current.status_code == 200
        assert current.json()["messages"] == []

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


class TestLatestRecoveryTurn:
    def test_keeps_last_user_assistant_pair(self):
        messages = [
            {"role": "user", "content": "a", "blocked": False},
            {"role": "assistant", "content": "A", "blocked": False},
            {"role": "user", "content": "b", "blocked": False},
            {"role": "assistant", "content": "B", "blocked": False},
        ]
        assert _latest_recovery_turn(messages) == messages[-2:]

    def test_keeps_pending_user_turn(self):
        messages = [
            {"role": "user", "content": "a", "blocked": False},
            {"role": "assistant", "content": "A", "blocked": False},
            {"role": "user", "content": "b", "blocked": False},
        ]
        assert _latest_recovery_turn(messages) == messages[-1:]

    def test_empty(self):
        assert _latest_recovery_turn([]) == []
