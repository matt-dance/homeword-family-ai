"""API routes."""

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Annotated, AsyncIterator

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from homeward_gateway.auth.local_host import is_local_request, require_local_request
from homeward_gateway.auth.parent_auth import (
    clear_session_cookie,
    get_parent_from_request,
    hash_password,
    set_session_cookie,
    verify_password,
)
from homeward_gateway.auth.rate_limit import check_rate_limit, record_attempt, reset_attempts
from homeward_gateway.auth.recovery import (
    generate_recovery_code,
    hash_recovery_code,
    verify_recovery_code,
)
from homeward_gateway.chat.quiet_hours import is_chat_available
from homeward_gateway.chat.starters import get_conversation_starters
from homeward_gateway.chat.summary import summarize_session
from homeward_gateway.voice.speak import (
    get_speak_status,
    piper_available,
    run_speak_self_test,
    sanitize_for_speech,
    synthesize_speech_payload,
)
from homeward_gateway.voice.transcribe import (
    get_whisper_status,
    run_voice_self_test,
    transcribe_bytes,
    whisper_available,
)
from homeward_gateway.config import settings
from homeward_gateway.db.database import (
    BlockedAttempt,
    ChatSession,
    ChildProfile,
    ConversationLog,
    ParentAccount,
    get_session,
)
from homeward_gateway.dashboard.sessions import find_legacy_session, group_legacy_logs
from homeward_gateway.ollama import service as ollama_service
from homeward_gateway.ollama.catalog import pick_classifier_model
from homeward_gateway.ollama.runtime import get_effective_models
from homeward_gateway.models.router import strip_thinking
from homeward_gateway.pipeline.pipeline import PipelineResult, ToolEvent, process_chat, process_chat_stream
from homeward_gateway.pipeline.policy import load_all_presets, preset_for_age

logger = logging.getLogger(__name__)

router = APIRouter()

PRESETS = load_all_presets()


# --- Request/Response models ---


class SetupRequest(BaseModel):
    password: str = Field(min_length=8)


class LoginRequest(BaseModel):
    password: str


class ResetPasswordRequest(BaseModel):
    recovery_code: str = Field(min_length=8)
    new_password: str = Field(min_length=8)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


class ChildCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    age: int = Field(ge=3, le=18)
    preset_id: str | None = None
    strictness: int = Field(default=3, ge=1, le=5)
    pin: str | None = None
    homework_mode: bool = False
    live_lookups: bool = False


class ChildUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    age: int | None = Field(default=None, ge=3, le=18)
    preset_id: str | None = None
    strictness: int | None = Field(default=None, ge=1, le=5)
    pin: str | None = None
    clear_pin: bool = False
    homework_mode: bool | None = None
    live_lookups: bool | None = None
    allow_resume: bool | None = None
    quiet_hours_enabled: bool | None = None
    quiet_hours_start: str | None = None
    quiet_hours_end: str | None = None
    quiet_hours_days: str | None = None


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    child_id: int
    session_id: int | None = None
    history: list[dict] = Field(default_factory=list)


class SessionCreateRequest(BaseModel):
    child_id: int
    end_session_id: int | None = None


class SpeakRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


class CloudSettingsRequest(BaseModel):
    cloud_enabled: bool = False
    openai_api_key: str | None = None


class OllamaPullRequest(BaseModel):
    model: str = Field(min_length=1, max_length=100)


class OllamaSettingsRequest(BaseModel):
    chat_model: str = Field(min_length=1, max_length=100)
    classifier_model: str | None = None


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
async def health(session: Annotated[AsyncSession, Depends(get_session)]):
    chat_model, classifier_model = await get_effective_models(session)
    ollama = await ollama_service.get_status(chat_model, classifier_model)
    return {
        "status": "ok" if ollama["ready"] or settings.cloud_enabled else "degraded",
        "service": "homeward-gateway",
        "version": "0.1.0",
        "ollama_url": settings.ollama_base_url,
        "cloud_enabled": settings.cloud_enabled,
        "ollama": ollama,
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

    recovery_code = generate_recovery_code()
    parent = ParentAccount(
        password_hash=hash_password(body.password),
        recovery_code_hash=hash_recovery_code(recovery_code),
        setup_complete=False,
    )
    session.add(parent)
    await session.commit()
    await session.refresh(parent)
    set_session_cookie(response, parent.id)
    return {
        "ok": True,
        "parent_id": parent.id,
        "resumed": False,
        "recovery_code": recovery_code,
    }


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


@router.post("/auth/reset-password")
async def reset_password(
    body: ResetPasswordRequest,
    request: Request,
    response: Response,
    session: Annotated[AsyncSession, Depends(get_session)],
):
    client_key = request.client.host if request.client else "unknown"
    check_rate_limit(f"reset:{client_key}")

    result = await session.execute(select(ParentAccount).limit(1))
    parent = result.scalar_one_or_none()
    if not parent or not parent.recovery_code_hash:
        record_attempt(f"reset:{client_key}")
        raise HTTPException(status_code=400, detail="Invalid recovery code")

    if not verify_recovery_code(body.recovery_code, parent.recovery_code_hash):
        record_attempt(f"reset:{client_key}")
        raise HTTPException(status_code=400, detail="Invalid recovery code")

    new_recovery_code = generate_recovery_code()
    parent.password_hash = hash_password(body.new_password)
    parent.recovery_code_hash = hash_recovery_code(new_recovery_code)
    await session.commit()
    reset_attempts(f"reset:{client_key}")
    set_session_cookie(response, parent.id)
    return {"ok": True, "recovery_code": new_recovery_code}


@router.post("/auth/change-password")
async def change_password(
    body: ChangePasswordRequest,
    parent: Annotated[ParentAccount, Depends(require_parent)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    if not verify_password(body.current_password, parent.password_hash):
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    if verify_password(body.new_password, parent.password_hash):
        raise HTTPException(status_code=400, detail="New password must be different")

    parent.password_hash = hash_password(body.new_password)
    await session.commit()
    return {"ok": True}


@router.get("/auth/me")
async def auth_me(
    request: Request,
    parent: Annotated[ParentAccount, Depends(require_parent)],
):
    return {
        "parent_id": parent.id,
        "setup_complete": parent.setup_complete,
        "cloud_enabled": parent.cloud_enabled,
        "ollama_model": parent.ollama_model,
        "classifier_model": parent.classifier_model,
        "has_recovery_code": parent.recovery_code_hash is not None,
        "is_local_host": is_local_request(request),
    }


# --- Children helpers ---


def _filter_child_ids(child_ids: list[int], child_id: int | None) -> list[int]:
    if child_id is None:
        return child_ids
    if child_id not in child_ids:
        raise HTTPException(status_code=404, detail="Child not found")
    return [child_id]


async def _child_slugs_for_parent(
    session: AsyncSession,
    parent_id: int,
    *,
    exclude_child_id: int | None = None,
) -> set[str]:
    query = select(ChildProfile.slug).where(ChildProfile.parent_id == parent_id)
    if exclude_child_id is not None:
        query = query.where(ChildProfile.id != exclude_child_id)
    result = await session.execute(query)
    return {slug for (slug,) in result.all() if slug}


async def _assign_child_slug(session: AsyncSession, child: ChildProfile) -> None:
    from homeward_gateway.util.slug import slugify_name, unique_slug

    taken = await _child_slugs_for_parent(
        session, child.parent_id, exclude_child_id=child.id
    )
    child.slug = unique_slug(slugify_name(child.name), taken)


def _serialize_child(c: ChildProfile) -> dict:
    available, unavailable_message = is_chat_available(
        enabled=c.quiet_hours_enabled,
        start=c.quiet_hours_start,
        end=c.quiet_hours_end,
        days=c.quiet_hours_days,
    )
    return {
        "id": c.id,
        "name": c.name,
        "slug": c.slug,
        "age": c.age,
        "preset_id": c.preset_id,
        "strictness": c.strictness,
        "has_pin": c.pin is not None,
        "homework_mode": c.homework_mode,
        "live_lookups": c.live_lookups,
        "allow_resume": c.allow_resume,
        "quiet_hours_enabled": c.quiet_hours_enabled,
        "quiet_hours_start": c.quiet_hours_start,
        "quiet_hours_end": c.quiet_hours_end,
        "quiet_hours_days": c.quiet_hours_days,
        "chat_available": available,
        "chat_unavailable_message": unavailable_message,
    }


def _serialize_child_public(c: ChildProfile) -> dict:
    available, unavailable_message = is_chat_available(
        enabled=c.quiet_hours_enabled,
        start=c.quiet_hours_start,
        end=c.quiet_hours_end,
        days=c.quiet_hours_days,
    )
    return {
        "id": c.id,
        "name": c.name,
        "slug": c.slug,
        "has_pin": c.pin is not None,
        "allow_resume": c.allow_resume,
        "chat_available": available,
        "chat_unavailable_message": unavailable_message,
        "homework_mode": c.homework_mode,
        "live_lookups": c.live_lookups,
    }


async def _summarize_chat_session(
    session: AsyncSession,
    chat_session_id: int,
    child: ChildProfile,
    chat_model: str | None,
) -> None:
    chat_session = await session.get(ChatSession, chat_session_id)
    if not chat_session or chat_session.summary:
        return

    logs_result = await session.execute(
        select(ConversationLog)
        .where(ConversationLog.session_id == chat_session_id)
        .order_by(ConversationLog.created_at.asc())
    )
    logs = list(logs_result.scalars().all())
    if not logs:
        return

    exchanges: list[tuple[str, str]] = []
    pending_user: str | None = None
    blocked_count = 0
    for log in logs:
        if log.blocked:
            blocked_count += 1
        if log.direction == "input" and not log.blocked:
            pending_user = log.content
        elif log.direction == "output" and pending_user:
            exchanges.append((pending_user, log.content))
            pending_user = None

    chat_session.summary = await summarize_session(
        child.name,
        exchanges,
        blocked_count,
        chat_model=chat_model,
    )
    await session.commit()


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
    return [_serialize_child(c) for c in children]


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
        homework_mode=body.homework_mode,
        live_lookups=body.live_lookups,
    )
    session.add(child)
    await session.flush()
    await _assign_child_slug(session, child)
    await session.commit()
    await session.refresh(child)
    return _serialize_child(child)


@router.patch("/children/{child_id}")
async def update_child(
    child_id: int,
    body: ChildUpdate,
    parent: Annotated[ParentAccount, Depends(require_parent)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    result = await session.execute(
        select(ChildProfile).where(
            ChildProfile.id == child_id,
            ChildProfile.parent_id == parent.id,
        )
    )
    child = result.scalar_one_or_none()
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")

    name_changed = False
    if body.name is not None:
        child.name = body.name
        name_changed = True
    if body.age is not None:
        child.age = body.age
        if body.preset_id is None:
            preset = preset_for_age(body.age, PRESETS)
            if preset:
                child.preset_id = preset.id
    if body.preset_id is not None:
        if body.preset_id not in PRESETS:
            raise HTTPException(status_code=400, detail="Invalid preset")
        child.preset_id = body.preset_id
    if body.strictness is not None:
        child.strictness = body.strictness
    if body.clear_pin:
        child.pin = None
    elif body.pin is not None:
        child.pin = body.pin or None
    if body.homework_mode is not None:
        child.homework_mode = body.homework_mode
    if body.live_lookups is not None:
        child.live_lookups = body.live_lookups
    if body.allow_resume is not None:
        child.allow_resume = body.allow_resume
    if body.quiet_hours_enabled is not None:
        child.quiet_hours_enabled = body.quiet_hours_enabled
    if body.quiet_hours_start is not None:
        child.quiet_hours_start = body.quiet_hours_start or None
    if body.quiet_hours_end is not None:
        child.quiet_hours_end = body.quiet_hours_end or None
    if body.quiet_hours_days is not None:
        child.quiet_hours_days = body.quiet_hours_days or None

    if name_changed:
        await _assign_child_slug(session, child)

    await session.commit()
    await session.refresh(child)
    return _serialize_child(child)


@router.get("/children/public")
async def list_children_public(session: Annotated[AsyncSession, Depends(get_session)]):
    """Public endpoint for kid profile picker — no auth required."""
    result = await session.execute(select(ChildProfile))
    children = result.scalars().all()
    return [_serialize_child_public(c) for c in children]


@router.get("/children/{child_id}/starters")
async def child_conversation_starters(
    child_id: int,
    session: Annotated[AsyncSession, Depends(get_session)],
):
    child, preset = await _get_child_context(child_id, session)
    return get_conversation_starters(preset)


@router.get("/children/{child_id}/sessions/resume")
async def resume_child_session(
    child_id: int,
    session: Annotated[AsyncSession, Depends(get_session)],
):
    result = await session.execute(select(ChildProfile).where(ChildProfile.id == child_id))
    child = result.scalar_one_or_none()
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")
    if not child.allow_resume:
        raise HTTPException(status_code=404, detail="No resumable session")

    session_result = await session.execute(
        select(ChatSession)
        .where(ChatSession.child_id == child_id)
        .order_by(ChatSession.started_at.desc())
        .limit(1)
    )
    chat_session = session_result.scalar_one_or_none()
    if not chat_session:
        raise HTTPException(status_code=404, detail="No resumable session")

    logs_result = await session.execute(
        select(ConversationLog)
        .where(ConversationLog.session_id == chat_session.id)
        .order_by(ConversationLog.created_at.asc())
    )
    logs = list(logs_result.scalars().all())
    if not logs:
        raise HTTPException(status_code=404, detail="No resumable session")

    messages: list[dict] = []
    for log in logs:
        if log.blocked and log.direction == "input":
            continue
        role = "user" if log.direction == "input" else "assistant"
        messages.append({"role": role, "content": log.content, "blocked": log.blocked})

    return {
        "session_id": chat_session.id,
        "messages": messages,
        "preview": chat_session.preview,
    }


@router.post("/children/{child_id}/verify-pin")
async def verify_pin(
    child_id: int,
    body: dict,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
):
    client_key = request.client.host if request.client else "unknown"
    check_rate_limit(f"pin:{client_key}:{child_id}")

    pin = body.get("pin", "")
    result = await session.execute(select(ChildProfile).where(ChildProfile.id == child_id))
    child = result.scalar_one_or_none()
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")
    if child.pin and child.pin != pin:
        record_attempt(f"pin:{client_key}:{child_id}")
        raise HTTPException(status_code=403, detail="Invalid PIN")
    reset_attempts(f"pin:{client_key}:{child_id}")
    return {"ok": True, "child_id": child.id, "name": child.name}


@router.get("/chat/transcribe/status")
async def transcribe_status():
    return get_whisper_status()


@router.get("/chat/transcribe/self-test")
async def transcribe_self_test():
    """Automated end-to-end voice pipeline check (no mic required)."""
    result = await asyncio.to_thread(run_voice_self_test)
    if not result.get("ok"):
        raise HTTPException(status_code=503, detail=result)
    return result


@router.post("/chat/transcribe")
async def transcribe_audio(
    request: Request,
    audio: UploadFile = File(...),
):
    if not whisper_available():
        raise HTTPException(
            status_code=503,
            detail="Local voice typing is not available on this Homeward server.",
        )

    client_key = request.client.host if request.client else "unknown"
    check_rate_limit(f"transcribe:{client_key}")

    content = await audio.read()
    suffix = ".webm"
    if audio.filename and "." in audio.filename:
        suffix = "." + audio.filename.rsplit(".", 1)[-1].lower()

    try:
        text = await asyncio.to_thread(transcribe_bytes, content, suffix)
    except ValueError as exc:
        record_attempt(f"transcribe:{client_key}")
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        detail = str(exc)
        if "load" in detail.lower() or "download" in detail.lower():
            raise HTTPException(
                status_code=503,
                detail="Voice model is still loading. Wait a few seconds and try again.",
            ) from exc
        raise HTTPException(status_code=503, detail=detail) from exc
    except Exception as exc:
        logger.exception("Transcription failed")
        record_attempt(f"transcribe:{client_key}")
        raise HTTPException(status_code=500, detail="Could not transcribe audio") from exc

    if not text:
        record_attempt(f"transcribe:{client_key}")
        raise HTTPException(status_code=400, detail="Could not make out any words. Try speaking again.")

    reset_attempts(f"transcribe:{client_key}")
    return {"text": text}


@router.get("/chat/speak/status")
async def speak_status():
    return get_speak_status()


@router.get("/chat/speak/self-test")
async def speak_self_test():
    """Automated read-aloud pipeline check (no speakers required)."""
    result = await asyncio.to_thread(run_speak_self_test)
    if not result.get("ok"):
        raise HTTPException(status_code=503, detail=result)
    return result


@router.post("/chat/speak")
async def speak_text(body: SpeakRequest, request: Request):
    if not piper_available():
        raise HTTPException(
            status_code=503,
            detail="Local read-aloud is not available on this Homeward server.",
        )

    client_key = request.client.host if request.client else "unknown"
    check_rate_limit(f"speak:{client_key}")

    cleaned = sanitize_for_speech(body.text)
    if not cleaned:
        raise HTTPException(status_code=400, detail="Nothing to read aloud")
    if len(cleaned) > settings.speak_max_chars:
        raise HTTPException(status_code=400, detail="Text is too long to read aloud")

    try:
        payload = await asyncio.to_thread(synthesize_speech_payload, cleaned)
    except ValueError as exc:
        record_attempt(f"speak:{client_key}")
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Read-aloud synthesis failed")
        record_attempt(f"speak:{client_key}")
        raise HTTPException(status_code=500, detail="Could not read text aloud") from exc

    reset_attempts(f"speak:{client_key}")
    return payload


@router.post("/chat/sessions")
async def create_chat_session(
    body: SessionCreateRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
):
    result = await session.execute(select(ChildProfile).where(ChildProfile.id == body.child_id))
    child = result.scalar_one_or_none()
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")

    chat_model, _ = await get_effective_models(session)
    if body.end_session_id:
        end_result = await session.execute(
            select(ChatSession).where(
                ChatSession.id == body.end_session_id,
                ChatSession.child_id == child.id,
            )
        )
        if end_result.scalar_one_or_none():
            await _summarize_chat_session(session, body.end_session_id, child, chat_model)

    chat_session = ChatSession(child_id=child.id)
    session.add(chat_session)
    await session.commit()
    await session.refresh(chat_session)
    return {
        "session_id": chat_session.id,
        "started_at": chat_session.started_at.isoformat(),
    }


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
    chat_session_id: int | None = None,
) -> None:
    log = ConversationLog(
        child_id=child_id,
        session_id=chat_session_id,
        direction=direction,
        content=content[:4000],
        blocked=blocked,
        block_reason=block_reason,
        stage=stage,
    )
    session.add(log)

    if chat_session_id and direction == "input":
        chat_session = await session.get(ChatSession, chat_session_id)
        if chat_session and not chat_session.preview:
            chat_session.preview = content[:200]

    if blocked:
        attempt = BlockedAttempt(
            child_id=child_id,
            content=content[:2000],
            reason=block_reason or "unknown",
            stage=stage or "unknown",
        )
        session.add(attempt)
    await session.commit()


async def _resolve_chat_session(
    session: AsyncSession,
    child_id: int,
    session_id: int | None,
) -> int | None:
    if session_id:
        result = await session.execute(
            select(ChatSession).where(
                ChatSession.id == session_id,
                ChatSession.child_id == child_id,
            )
        )
        chat_session = result.scalar_one_or_none()
        if not chat_session:
            raise HTTPException(status_code=404, detail="Chat session not found")
        return chat_session.id

    chat_session = ChatSession(child_id=child_id)
    session.add(chat_session)
    await session.commit()
    await session.refresh(chat_session)
    return chat_session.id


BLOCKED_MESSAGE = (
    "I can't help with that question right now. "
    "Let's talk about something fun instead — like animals, space, or a hobby you enjoy!"
)
LLM_UNAVAILABLE_MESSAGE = (
    "Homeward's AI isn't ready yet. Ask a parent to start Ollama "
    "(run: ollama serve, then ollama pull llama3.2:3b)."
)


def user_facing_message(stage: str | None) -> str:
    if stage and stage.startswith("llm"):
        return LLM_UNAVAILABLE_MESSAGE
    return BLOCKED_MESSAGE


def _ensure_chat_available(child: ChildProfile) -> None:
    available, message = is_chat_available(
        enabled=child.quiet_hours_enabled,
        start=child.quiet_hours_start,
        end=child.quiet_hours_end,
        days=child.quiet_hours_days,
    )
    if not available:
        raise HTTPException(status_code=403, detail=message or "Chat is not available right now")


@router.post("/chat")
async def chat(
    body: ChatRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
):
    child, preset = await _get_child_context(body.child_id, session)
    _ensure_chat_available(child)
    chat_session_id = await _resolve_chat_session(session, child.id, body.session_id)
    chat_model, classifier_model = await get_effective_models(session)
    result = await process_chat(
        body.message,
        body.history,
        preset,
        child.strictness,
        child.name,
        child.age,
        chat_model=chat_model,
        classifier_model=classifier_model,
        homework_mode=child.homework_mode,
        live_lookups=child.live_lookups,
    )

    if not result.allowed:
        await _log_message(
            session, child.id, "input", body.message,
            blocked=True, block_reason=result.block_reason, stage=result.stage,
            chat_session_id=chat_session_id,
        )
        return {
            "blocked": True,
            "message": user_facing_message(result.stage),
            "reason": result.block_reason,
            "stage": result.stage,
            "session_id": chat_session_id,
        }

    await _log_message(session, child.id, "input", body.message, chat_session_id=chat_session_id)
    await _log_message(session, child.id, "output", result.content or "", chat_session_id=chat_session_id)

    return {
        "blocked": False,
        "message": result.content,
        "session_id": chat_session_id,
    }


@router.post("/chat/stream")
async def chat_stream(
    body: ChatRequest,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
):
    child, preset = await _get_child_context(body.child_id, session)
    _ensure_chat_available(child)
    chat_session_id = await _resolve_chat_session(session, child.id, body.session_id)
    chat_model, classifier_model = await get_effective_models(session)

    async def event_stream() -> AsyncIterator[str]:
        from homeward_gateway.db.database import async_session_factory

        async with async_session_factory() as log_session:
            collected = []
            blocked_early = False
            persisted = False

            async def persist_turn() -> None:
                nonlocal persisted
                if persisted or blocked_early:
                    return
                persisted = True
                full = strip_thinking("".join(collected))
                await _log_message(
                    log_session, child.id, "input", body.message, chat_session_id=chat_session_id
                )
                if full:
                    await _log_message(
                        log_session, child.id, "output", full, chat_session_id=chat_session_id
                    )

            async for item in process_chat_stream(
                body.message,
                body.history,
                preset,
                child.strictness,
                child.name,
                child.age,
                chat_model=chat_model,
                classifier_model=classifier_model,
                homework_mode=child.homework_mode,
                live_lookups=child.live_lookups,
            ):
                if await request.is_disconnected():
                    await persist_turn()
                    return
                if isinstance(item, ToolEvent):
                    payload = json.dumps({"type": "tools", "tools": item.tools})
                    yield f"data: {payload}\n\n"
                    continue
                if isinstance(item, PipelineResult):
                    if not item.allowed:
                        blocked_early = True
                        await _log_message(
                            log_session, child.id, "input", body.message,
                            blocked=True, block_reason=item.block_reason, stage=item.stage,
                            chat_session_id=chat_session_id,
                        )
                        payload = json.dumps({
                            "type": "blocked",
                            "message": user_facing_message(item.stage),
                            "reason": item.block_reason,
                        })
                        yield f"data: {payload}\n\n"
                        return
                else:
                    collected.append(item)
                    payload = json.dumps({"type": "token", "content": item})
                    yield f"data: {payload}\n\n"

            await persist_turn()
            yield f"data: {json.dumps({'type': 'done', 'session_id': chat_session_id})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# --- Dashboard ---


def _serialize_log(log: ConversationLog) -> dict:
    return {
        "id": log.id,
        "child_id": log.child_id,
        "session_id": log.session_id,
        "direction": log.direction,
        "content": log.content,
        "blocked": log.blocked,
        "block_reason": log.block_reason,
        "created_at": log.created_at.isoformat(),
    }


@router.get("/dashboard/sessions")
async def dashboard_sessions(
    request: Request,
    parent: Annotated[ParentAccount, Depends(require_parent)],
    session: Annotated[AsyncSession, Depends(get_session)],
    limit: int = 30,
    child_id: int | None = None,
):
    require_local_request(request)
    children_result = await session.execute(
        select(ChildProfile).where(ChildProfile.parent_id == parent.id)
    )
    children = children_result.scalars().all()
    child_ids = _filter_child_ids([c.id for c in children], child_id)
    if not child_ids:
        return []

    counts_result = await session.execute(
        select(
            ConversationLog.session_id,
            func.count(ConversationLog.id),
            func.max(ConversationLog.created_at),
        )
        .where(ConversationLog.session_id.is_not(None))
        .where(ConversationLog.child_id.in_(child_ids))
        .group_by(ConversationLog.session_id)
    )
    counts_by_session = {
        row[0]: {"message_count": row[1], "last_at": row[2]} for row in counts_result.all()
    }

    sessions_result = await session.execute(
        select(ChatSession)
        .where(ChatSession.child_id.in_(child_ids))
        .order_by(ChatSession.started_at.desc())
        .limit(limit)
    )
    chat_sessions = sessions_result.scalars().all()
    items = []
    for chat_session in chat_sessions:
        stats = counts_by_session.get(chat_session.id, {"message_count": 0, "last_at": chat_session.started_at})
        items.append(
            {
                "id": str(chat_session.id),
                "legacy": False,
                "child_id": chat_session.child_id,
                "preview": chat_session.preview or "Conversation",
                "message_count": stats["message_count"],
                "started_at": chat_session.started_at.isoformat(),
                "last_at": stats["last_at"].isoformat() if stats["last_at"] else chat_session.started_at.isoformat(),
                "summary": chat_session.summary,
            }
        )

    orphan_result = await session.execute(
        select(ConversationLog)
        .where(ConversationLog.child_id.in_(child_ids))
        .where(ConversationLog.session_id.is_(None))
        .order_by(ConversationLog.created_at.desc())
    )
    legacy_items = group_legacy_logs(list(orphan_result.scalars().all()))
    items.extend(legacy_items)
    items.sort(key=lambda item: item["last_at"], reverse=True)
    return items[:limit]


@router.get("/dashboard/sessions/{session_id}/messages")
async def dashboard_session_messages(
    session_id: str,
    request: Request,
    parent: Annotated[ParentAccount, Depends(require_parent)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    require_local_request(request)
    children_result = await session.execute(
        select(ChildProfile).where(ChildProfile.parent_id == parent.id)
    )
    child_ids = [c.id for c in children_result.scalars().all()]
    if not child_ids:
        raise HTTPException(status_code=404, detail="Session not found")

    if session_id.startswith("legacy-"):
        orphan_result = await session.execute(
            select(ConversationLog)
            .where(ConversationLog.child_id.in_(child_ids))
            .where(ConversationLog.session_id.is_(None))
        )
        logs = find_legacy_session(list(orphan_result.scalars().all()), session_id)
        if not logs:
            raise HTTPException(status_code=404, detail="Session not found")
        logs.sort(key=lambda log: log.created_at)
        return [_serialize_log(log) for log in logs]

    try:
        numeric_id = int(session_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Session not found") from exc

    session_result = await session.execute(
        select(ChatSession).where(
            ChatSession.id == numeric_id,
            ChatSession.child_id.in_(child_ids),
        )
    )
    if not session_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Session not found")

    logs_result = await session.execute(
        select(ConversationLog)
        .where(ConversationLog.session_id == numeric_id)
        .order_by(ConversationLog.created_at.asc())
    )
    return [_serialize_log(log) for log in logs_result.scalars().all()]


async def _parent_child_ids(
    parent: ParentAccount, session: AsyncSession
) -> list[int]:
    children_result = await session.execute(
        select(ChildProfile).where(ChildProfile.parent_id == parent.id)
    )
    return [c.id for c in children_result.scalars().all()]


@router.delete("/dashboard/sessions/{session_id}")
async def delete_dashboard_session(
    session_id: str,
    request: Request,
    parent: Annotated[ParentAccount, Depends(require_parent)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    require_local_request(request)
    child_ids = await _parent_child_ids(parent, session)
    if not child_ids:
        raise HTTPException(status_code=404, detail="Session not found")

    if session_id.startswith("legacy-"):
        orphan_result = await session.execute(
            select(ConversationLog)
            .where(ConversationLog.child_id.in_(child_ids))
            .where(ConversationLog.session_id.is_(None))
        )
        logs = find_legacy_session(list(orphan_result.scalars().all()), session_id)
        if not logs:
            raise HTTPException(status_code=404, detail="Session not found")
        log_ids = [log.id for log in logs]
        await session.execute(delete(ConversationLog).where(ConversationLog.id.in_(log_ids)))
        await session.commit()
        return {"ok": True, "deleted": len(log_ids)}

    try:
        numeric_id = int(session_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Session not found") from exc

    session_result = await session.execute(
        select(ChatSession).where(
            ChatSession.id == numeric_id,
            ChatSession.child_id.in_(child_ids),
        )
    )
    if not session_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Session not found")

    await session.execute(
        delete(ConversationLog).where(ConversationLog.session_id == numeric_id)
    )
    await session.execute(delete(ChatSession).where(ChatSession.id == numeric_id))
    await session.commit()
    return {"ok": True, "deleted": 1}


@router.delete("/dashboard/sessions")
async def delete_dashboard_child_sessions(
    request: Request,
    parent: Annotated[ParentAccount, Depends(require_parent)],
    session: Annotated[AsyncSession, Depends(get_session)],
    child_id: int,
):
    require_local_request(request)
    child_ids = await _parent_child_ids(parent, session)
    if child_id not in child_ids:
        raise HTTPException(status_code=404, detail="Child not found")

    await session.execute(delete(ConversationLog).where(ConversationLog.child_id == child_id))
    await session.execute(delete(ChatSession).where(ChatSession.child_id == child_id))
    await session.commit()
    return {"ok": True}


@router.get("/dashboard/logs")
async def dashboard_logs(
    request: Request,
    parent: Annotated[ParentAccount, Depends(require_parent)],
    session: Annotated[AsyncSession, Depends(get_session)],
    limit: int = 50,
    child_id: int | None = None,
):
    require_local_request(request)
    children_result = await session.execute(
        select(ChildProfile).where(ChildProfile.parent_id == parent.id)
    )
    child_ids = _filter_child_ids([c.id for c in children_result.scalars().all()], child_id)
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


@router.get("/dashboard/blocked/stats")
async def dashboard_blocked_stats(
    request: Request,
    parent: Annotated[ParentAccount, Depends(require_parent)],
    session: Annotated[AsyncSession, Depends(get_session)],
    child_id: int | None = None,
):
    require_local_request(request)
    children_result = await session.execute(
        select(ChildProfile).where(ChildProfile.parent_id == parent.id)
    )
    child_ids = _filter_child_ids([c.id for c in children_result.scalars().all()], child_id)
    if not child_ids:
        return {"today_count": 0, "total_count": 0}

    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    total_result = await session.execute(
        select(func.count(BlockedAttempt.id)).where(BlockedAttempt.child_id.in_(child_ids))
    )
    today_result = await session.execute(
        select(func.count(BlockedAttempt.id))
        .where(BlockedAttempt.child_id.in_(child_ids))
        .where(BlockedAttempt.created_at >= today_start)
    )
    return {
        "today_count": today_result.scalar() or 0,
        "total_count": total_result.scalar() or 0,
    }


@router.get("/dashboard/blocked")
async def dashboard_blocked(
    request: Request,
    parent: Annotated[ParentAccount, Depends(require_parent)],
    session: Annotated[AsyncSession, Depends(get_session)],
    limit: int = 50,
    child_id: int | None = None,
):
    require_local_request(request)
    children_result = await session.execute(
        select(ChildProfile).where(ChildProfile.parent_id == parent.id)
    )
    child_ids = _filter_child_ids([c.id for c in children_result.scalars().all()], child_id)
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


# --- Ollama ---


@router.get("/ollama/status")
async def ollama_status(session: Annotated[AsyncSession, Depends(get_session)]):
    chat_model, classifier_model = await get_effective_models(session)
    return await ollama_service.get_status(chat_model, classifier_model)


@router.get("/ollama/recommendations")
async def ollama_recommendations(session: Annotated[AsyncSession, Depends(get_session)]):
    chat_model, classifier_model = await get_effective_models(session)
    return await ollama_service.get_recommendations(chat_model, classifier_model)


@router.post("/ollama/pull")
async def ollama_pull(
    body: OllamaPullRequest,
    parent: Annotated[ParentAccount, Depends(require_parent)],
):
    if not await ollama_service.is_ollama_reachable():
        raise HTTPException(
            status_code=503,
            detail="Ollama is not running. Start it with: ollama serve",
        )
    try:
        ollama_service.validate_model_id(body.model)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    job_id = ollama_service.start_pull(body.model)
    return {"ok": True, "job_id": job_id, "model": body.model}


@router.get("/ollama/pull/{job_id}")
async def ollama_pull_status(
    job_id: str,
    parent: Annotated[ParentAccount, Depends(require_parent)],
):
    job = ollama_service.get_pull_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Pull job not found")
    return job


@router.post("/ollama/bootstrap")
async def ollama_bootstrap(
    parent: Annotated[ParentAccount, Depends(require_parent)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Start downloading the recommended model if none is ready yet."""
    if not await ollama_service.is_ollama_reachable():
        raise HTTPException(
            status_code=503,
            detail="AI engine is still starting. Please wait a moment and try again.",
        )
    chat_model, classifier_model = await get_effective_models(session)
    status = await ollama_service.get_status(chat_model, classifier_model)
    if status["ready"]:
        return {"ok": True, "ready": True, "model": chat_model}

    recommendations = await ollama_service.get_recommendations(chat_model, classifier_model)
    model = recommendations["recommended_model"]
    job_id = ollama_service.start_pull(model)
    return {"ok": True, "ready": False, "model": model, "job_id": job_id}


@router.post("/settings/ollama")
async def update_ollama_settings(
    body: OllamaSettingsRequest,
    parent: Annotated[ParentAccount, Depends(require_parent)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    try:
        await ollama_service.validate_model_choice(body.chat_model)
        if body.classifier_model:
            await ollama_service.validate_model_choice(body.classifier_model)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    parent.ollama_model = body.chat_model
    if body.classifier_model:
        parent.classifier_model = body.classifier_model
    else:
        installed = await ollama_service.list_installed_models()
        parent.classifier_model = pick_classifier_model(body.chat_model, installed)
    await session.commit()
    status = await ollama_service.get_status(parent.ollama_model, parent.classifier_model)
    return {"ok": True, "ollama": status}


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
