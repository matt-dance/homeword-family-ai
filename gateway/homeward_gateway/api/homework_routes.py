"""Kid-chat homework camera routes.

Hint/status are LAN-reachable and PIN-gated, not parent-session-only.
Unlock verifies the parent password on the host without minting a session cookie.
"""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from homeward_gateway.auth.local_host import client_ip_from_request, require_local_request
from homeward_gateway.auth.parent_auth import has_child_access, verify_password
from homeward_gateway.auth.rate_limit import check_rate_limit, record_attempt, reset_attempts
from homeward_gateway.chat.quiet_hours import is_chat_available
from homeward_gateway.db.database import ChildProfile, ParentAccount, get_session
from homeward_gateway.vision.homework import (
    EXPECTED_VISION_MODEL,
    VISION_UNAVAILABLE_MESSAGE,
    generate_homework_hint,
    get_vision_status,
    list_installed_models,
    pick_vision_model,
    validate_image,
)

logger = logging.getLogger(__name__)

router = APIRouter()

HOMEWORK_OFF_DETAIL = "Homework camera is off for this profile. Ask a parent to turn on homework mode."


class HomeworkUnlockRequest(BaseModel):
    password: str = Field(min_length=1)


def _rate_key(request: Request, scope: str) -> str:
    return f"{scope}:{client_ip_from_request(request) or 'unknown'}"


def _require_child_access(request: Request, child: ChildProfile) -> None:
    if not has_child_access(request, child):
        raise HTTPException(status_code=403, detail="PIN required")


def _ensure_chat_available(child: ChildProfile) -> None:
    available, message = is_chat_available(
        enabled=child.quiet_hours_enabled,
        start=child.quiet_hours_start,
        end=child.quiet_hours_end,
        days=child.quiet_hours_days,
    )
    if not available:
        raise HTTPException(status_code=403, detail=message or "Chat is not available right now")


def _require_homework_mode(child: ChildProfile) -> None:
    if not child.homework_mode:
        raise HTTPException(status_code=403, detail=HOMEWORK_OFF_DETAIL)


@router.post("/chat/homework/unlock")
async def homework_unlock(
    body: HomeworkUnlockRequest,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Confirm the parent password for the camera gate. Does not set a session cookie."""
    require_local_request(request)
    rate_key = _rate_key(request, "homework-unlock")
    check_rate_limit(rate_key)

    result = await session.execute(select(ParentAccount).limit(1))
    parent = result.scalar_one_or_none()
    if not parent or not verify_password(body.password, parent.password_hash):
        record_attempt(rate_key)
        raise HTTPException(status_code=401, detail="Invalid password")

    reset_attempts(rate_key)
    return {"ok": True}


async def _load_child(session: AsyncSession, child_id: int) -> ChildProfile:
    result = await session.execute(select(ChildProfile).where(ChildProfile.id == child_id))
    child = result.scalar_one_or_none()
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")
    return child


@router.get("/chat/homework/status")
async def homework_status(
    child_id: int,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
):
    child = await _load_child(session, child_id)
    _require_child_access(request, child)
    _require_homework_mode(child)
    vision = await get_vision_status()
    return {
        "homework_mode": True,
        "available": vision["available"],
        "ready": vision["ready"],
        "model": vision["model"],
        "expected_model": EXPECTED_VISION_MODEL,
        "message": vision["message"],
    }


@router.post("/chat/homework/hint")
async def homework_hint(
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
    child_id: int = Form(...),
    question: str | None = Form(None),
    image: UploadFile = File(...),
):
    child = await _load_child(session, child_id)
    _require_child_access(request, child)
    _require_homework_mode(child)
    _ensure_chat_available(child)

    rate_key = _rate_key(request, "homework")
    check_rate_limit(rate_key)

    content = await image.read()
    try:
        validate_image(content, image.content_type, image.filename)
    except ValueError as exc:
        record_attempt(rate_key)
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    installed = await list_installed_models()
    model = pick_vision_model(installed)
    if not model:
        reset_attempts(rate_key)
        return {
            "hint": VISION_UNAVAILABLE_MESSAGE,
            "vision_available": False,
            "model": None,
            "expected_model": EXPECTED_VISION_MODEL,
        }

    try:
        hint = await generate_homework_hint(
            image_bytes=content,
            model=model,
            question=question,
        )
    except RuntimeError as exc:
        record_attempt(rate_key)
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Homework vision hint failed")
        record_attempt(rate_key)
        raise HTTPException(
            status_code=503,
            detail="Could not read that worksheet photo. Try again or type the problem.",
        ) from exc

    reset_attempts(rate_key)
    return {
        "hint": hint,
        "vision_available": True,
        "model": model,
        "expected_model": EXPECTED_VISION_MODEL,
    }
