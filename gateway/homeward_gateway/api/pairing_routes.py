"""LAN house-code pairing: parent QR card APIs and kid /join."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from homeward_gateway.api.routes import _rate_key, require_parent
from homeward_gateway.auth.pairing import (
    INVALID_HOUSE_CODE,
    issue_house_code,
    list_devices,
    match_house_code,
    pairing_payload,
    remember_device,
    set_device_cookie,
)
from homeward_gateway.auth.rate_limit import check_rate_limit, record_attempt, reset_attempts
from homeward_gateway.db.database import PairedDevice, ParentAccount, get_session

router = APIRouter()


class JoinRequest(BaseModel):
    code: str = Field(pattern=r"^\d{4}$")


@router.get("/pairing")
async def get_pairing(
    _parent: Annotated[ParentAccount, Depends(require_parent)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    _row, code = await issue_house_code(session, rotate=False)
    devices = await list_devices(session)
    return pairing_payload(code, devices)


@router.post("/pairing/rotate")
async def rotate_pairing(
    _parent: Annotated[ParentAccount, Depends(require_parent)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    _row, code = await issue_house_code(session, rotate=True)
    devices = await list_devices(session)
    return pairing_payload(code, devices)


@router.delete("/pairing/devices/{device_id}")
async def forget_device(
    device_id: int,
    _parent: Annotated[ParentAccount, Depends(require_parent)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    result = await session.execute(select(PairedDevice).where(PairedDevice.id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    await session.delete(device)
    await session.commit()
    return {"ok": True}


@router.post("/pairing/join")
async def join_house(
    body: JoinRequest,
    request: Request,
    response: Response,
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Accept a house code from a LAN device. Does not lock /chat."""
    rate_key = _rate_key(request, "house-code")
    check_rate_limit(rate_key)

    matched = await match_house_code(session, body.code)
    if not matched:
        record_attempt(rate_key)
        raise HTTPException(status_code=403, detail=INVALID_HOUSE_CODE)

    reset_attempts(rate_key)
    device = await remember_device(request, session)
    set_device_cookie(response, device.device_token)
    return {"ok": True, "device_id": device.id}
