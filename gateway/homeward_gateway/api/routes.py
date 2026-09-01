"""API routes."""

import json
import logging
from datetime import datetime, timezone
from typing import Annotated, AsyncIterator

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from homeward_gateway.auth.parent_auth import (
    clear_session_cookie,
    get_parent_from_request,
    hash_password,
    set_session_cookie,
    verify_password,
)
from homeward_gateway.config import settings
from homeward_gateway.db.database import (
    BlockedAttempt,
    ChildProfile,
    ConversationLog,
    ParentAccount,
    get_session,
)
from homeward_gateway.pipeline.pipeline import PipelineResult, process_chat, process_chat_stream
from homeward_gateway.pipeline.policy import load_all_presets, preset_for_age

logger = logging.getLogger(__name__)

router = APIRouter()

PRESETS = load_all_presets()


# --- Request/Response models ---


class SetupRequest(BaseModel):
    password: str = Field(min_length=8)


class LoginRequest(BaseModel):
    password: str


class ChildCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    age: int = Field(ge=3, le=18)
    preset_id: str | None = None
    strictness: int = Field(default=3, ge=1, le=5)
    pin: str | None = None


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    child_id: int
    history: list[dict] = Field(default_factory=list)


class CloudSettingsRequest(BaseModel):
    cloud_enabled: bool = False
    openai_api_key: str | None = None


# --- Dependencies ---


async def require_parent(
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ParentAccount:
    parent = await get_parent_from_request(request, session)
    if not parent:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return parent


# --- Health ---


@router.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "homeward-gateway",
        "version": "0.1.0",
        "ollama_url": settings.ollama_base_url,
        "cloud_enabled": settings.cloud_enabled,
    }


# --- Presets ---


@router.get("/presets")
async def list_presets():
    return [
        {
            "id": p.id,
            "name": p.name,
            "description": p.description,
            "age_min": p.age_min,
            "age_max": p.age_max,
            "strictness_default": p.strictness_default,
        }
        for p in PRESETS.values()
    ]


# --- Setup & Auth ---


@router.get("/setup/status")
async def setup_status(session: Annotated[AsyncSession, Depends(get_session)]):
    result = await session.execute(select(ParentAccount).limit(1))
    parent = result.scalar_one_or_none()
    if not parent:
        return {"setup_complete": False, "has_parent": False}
    return {"setup_complete": parent.setup_complete, "has_parent": True}


@router.post("/setup")
async def setup(
    body: SetupRequest,
    response: Response,
    session: Annotated[AsyncSession, Depends(get_session)],
):
    result = await session.execute(select(ParentAccount).limit(1))
    existing = result.scalar_one_or_none()
    if existing:
        if existing.setup_complete:
            raise HTTPException(status_code=400, detail="Setup already completed")
        if not verify_password(body.password, existing.password_hash):
            raise HTTPException(status_code=401, detail="Invalid password")
        set_session_cookie(response, existing.id)
        return {"ok": True, "parent_id": existing.id, "resumed": True}

    parent = ParentAccount(
        password_hash=hash_password(body.password),
        setup_complete=False,
    )
    session.add(parent)
    await session.commit()
    await session.refresh(parent)
    set_session_cookie(response, parent.id)
    return {"ok": True, "parent_id": parent.id, "resumed": False}


@router.post("/setup/complete")
async def complete_setup(
    parent: Annotated[ParentAccount, Depends(require_parent)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    parent.setup_complete = True
    await session.commit()
    return {"ok": True}


@router.post("/auth/login")
async def login(
    body: LoginRequest,
    response: Response,
    session: Annotated[AsyncSession, Depends(get_session)],
):
    result = await session.execute(select(ParentAccount).limit(1))
    parent = result.scalar_one_or_none()
    if not parent or not verify_password(body.password, parent.password_hash):
        raise HTTPException(status_code=401, detail="Invalid password")
    set_session_cookie(response, parent.id)
    return {"ok": True, "setup_complete": parent.setup_complete}


@router.post("/auth/logout")
async def logout(response: Response):
    clear_session_cookie(response)
    return {"ok": True}


@router.get("/auth/me")
async def auth_me(parent: Annotated[ParentAccount, Depends(require_parent)]):
    return {
        "parent_id": parent.id,
        "setup_complete": parent.setup_complete,
        "cloud_enabled": parent.cloud_enabled,
    }


# --- Children ---


@router.get("/children")
async def list_children(
    parent: Annotated[ParentAccount, Depends(require_parent)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    result = await session.execute(
        select(ChildProfile).where(ChildProfile.parent_id == parent.id)
    )
    children = result.scalars().all()
    return [
        {
            "id": c.id,
            "name": c.name,
            "age": c.age,
            "preset_id": c.preset_id,
            "strictness": c.strictness,
            "has_pin": c.pin is not None,
        }
        for c in children
    ]


@router.post("/children")
async def create_child(
    body: ChildCreate,
    parent: Annotated[ParentAccount, Depends(require_parent)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    preset_id = body.preset_id
    if not preset_id:
        preset = preset_for_age(body.age, PRESETS)
        if not preset:
            raise HTTPException(status_code=400, detail="No preset for age")
        preset_id = preset.id
    elif preset_id not in PRESETS:
        raise HTTPException(status_code=400, detail="Invalid preset")

    child = ChildProfile(
        parent_id=parent.id,
        name=body.name,
        age=body.age,
        preset_id=preset_id,
        strictness=body.strictness,
        pin=body.pin,
    )
    session.add(child)
    await session.commit()
    await session.refresh(child)
    return {
        "id": child.id,
        "name": child.name,
        "age": child.age,
        "preset_id": child.preset_id,
        "strictness": child.strictness,
    }


@router.get("/children/public")
async def list_children_public(session: Annotated[AsyncSession, Depends(get_session)]):
    """Public endpoint for kid profile picker — no auth required."""
    result = await session.execute(select(ChildProfile))
    children = result.scalars().all()
    return [
        {"id": c.id, "name": c.name, "has_pin": c.pin is not None}
        for c in children
    ]


@router.post("/children/{child_id}/verify-pin")
async def verify_pin(
    child_id: int,
    body: dict,
    session: Annotated[AsyncSession, Depends(get_session)],
):
    pin = body.get("pin", "")
    result = await session.execute(select(ChildProfile).where(ChildProfile.id == child_id))
    child = result.scalar_one_or_none()
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")
    if child.pin and child.pin != pin:
        raise HTTPException(status_code=403, detail="Invalid PIN")
    return {"ok": True, "child_id": child.id, "name": child.name}


# --- Chat ---


async def _get_child_context(child_id: int, session: AsyncSession) -> tuple[ChildProfile, object]:
    result = await session.execute(select(ChildProfile).where(ChildProfile.id == child_id))
    child = result.scalar_one_or_none()
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")
    preset = PRESETS.get(child.preset_id)
    if not preset:
        raise HTTPException(status_code=500, detail="Preset not found")
    return child, preset


async def _log_message(
    session: AsyncSession,
    child_id: int,
    direction: str,
    content: str,
    blocked: bool = False,
    block_reason: str | None = None,
    stage: str | None = None,
) -> None:
    log = ConversationLog(
        child_id=child_id,
        direction=direction,
        content=content[:2000],
        blocked=blocked,
        block_reason=block_reason,
        stage=stage,
    )
    session.add(log)
    if blocked:
        attempt = BlockedAttempt(
            child_id=child_id,
            content=content[:2000],
            reason=block_reason or "unknown",
            stage=stage or "unknown",
        )
        session.add(attempt)
    await session.commit()


BLOCKED_MESSAGE = (
    "I can't help with that question right now. "
    "Let's talk about something fun instead — like animals, space, or a hobby you enjoy!"
)


@router.post("/chat")
async def chat(
    body: ChatRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
):
    child, preset = await _get_child_context(body.child_id, session)
    result = await process_chat(
        body.message,
        body.history,
        preset,
        child.strictness,
        child.name,
        child.age,
    )

    if not result.allowed:
        await _log_message(
            session, child.id, "input", body.message,
            blocked=True, block_reason=result.block_reason, stage=result.stage,
        )
        return {
            "blocked": True,
            "message": BLOCKED_MESSAGE,
            "reason": result.block_reason,
            "stage": result.stage,
        }

    await _log_message(session, child.id, "input", body.message)
    await _log_message(session, child.id, "output", result.content or "")

    return {
        "blocked": False,
        "message": result.content,
    }


@router.post("/chat/stream")
async def chat_stream(
    body: ChatRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
):
    child, preset = await _get_child_context(body.child_id, session)

    async def event_stream() -> AsyncIterator[str]:
        from homeward_gateway.db.database import async_session_factory

        async with async_session_factory() as log_session:
            collected = []
            blocked_early = False

            async for item in process_chat_stream(
                body.message,
                body.history,
                preset,
                child.strictness,
                child.name,
                child.age,
            ):
                if isinstance(item, PipelineResult):
                    if not item.allowed:
                        blocked_early = True
                        await _log_message(
                            log_session, child.id, "input", body.message,
                            blocked=True, block_reason=item.block_reason, stage=item.stage,
                        )
                        payload = json.dumps({
                            "type": "blocked",
                            "message": BLOCKED_MESSAGE,
                            "reason": item.block_reason,
                        })
                        yield f"data: {payload}\n\n"
                        return
                else:
                    collected.append(item)
                    payload = json.dumps({"type": "token", "content": item})
                    yield f"data: {payload}\n\n"

            if not blocked_early:
                full = "".join(collected)
                await _log_message(log_session, child.id, "input", body.message)
                if full:
                    await _log_message(log_session, child.id, "output", full)

            yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# --- Dashboard ---


@router.get("/dashboard/logs")
async def dashboard_logs(
    parent: Annotated[ParentAccount, Depends(require_parent)],
    session: Annotated[AsyncSession, Depends(get_session)],
    limit: int = 50,
):
    children_result = await session.execute(
        select(ChildProfile).where(ChildProfile.parent_id == parent.id)
    )
    child_ids = [c.id for c in children_result.scalars().all()]
    if not child_ids:
        return []

    logs_result = await session.execute(
        select(ConversationLog)
        .where(ConversationLog.child_id.in_(child_ids))
        .order_by(ConversationLog.created_at.desc())
        .limit(limit)
    )
    logs = logs_result.scalars().all()
    return [
        {
            "id": log.id,
            "child_id": log.child_id,
            "direction": log.direction,
            "content": log.content,
            "blocked": log.blocked,
            "block_reason": log.block_reason,
            "created_at": log.created_at.isoformat(),
        }
        for log in logs
    ]


@router.get("/dashboard/blocked")
async def dashboard_blocked(
    parent: Annotated[ParentAccount, Depends(require_parent)],
    session: Annotated[AsyncSession, Depends(get_session)],
    limit: int = 50,
):
    children_result = await session.execute(
        select(ChildProfile).where(ChildProfile.parent_id == parent.id)
    )
    child_ids = [c.id for c in children_result.scalars().all()]
    if not child_ids:
        return []

    result = await session.execute(
        select(BlockedAttempt)
        .where(BlockedAttempt.child_id.in_(child_ids))
        .order_by(BlockedAttempt.created_at.desc())
        .limit(limit)
    )
    attempts = result.scalars().all()
    return [
        {
            "id": a.id,
            "child_id": a.child_id,
            "content": a.content,
            "reason": a.reason,
            "stage": a.stage,
            "created_at": a.created_at.isoformat(),
        }
        for a in attempts
    ]


@router.get("/dashboard/devices")
async def dashboard_devices():
    """Placeholder for paired devices (Phase 2)."""
    return {
        "devices": [],
        "message": "Device pairing will be available in a future update. "
        "For now, kids can use the chat in this browser.",
    }


# --- Cloud settings ---


@router.post("/settings/cloud")
async def update_cloud_settings(
    body: CloudSettingsRequest,
    parent: Annotated[ParentAccount, Depends(require_parent)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    parent.cloud_enabled = body.cloud_enabled
    await session.commit()
    if body.cloud_enabled and body.openai_api_key:
        settings.cloud_enabled = True
        settings.openai_api_key = body.openai_api_key
    else:
        settings.cloud_enabled = body.cloud_enabled
    return {"ok": True, "cloud_enabled": parent.cloud_enabled}
