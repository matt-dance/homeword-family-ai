"""House join codes and paired-device cookies.

The house code is a 4-digit household join secret, never a kid profile PIN.
v1 remembers a device after a valid join; /chat stays reachable without pairing.
"""

from __future__ import annotations

import re
import secrets
import uuid
from datetime import datetime, timezone

from fastapi import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request

from homeward_gateway.auth.parent_auth import dump_signed, hash_pin, load_signed, verify_child_pin
from homeward_gateway.config import settings
from homeward_gateway.db.database import HouseCode, PairedDevice
from homeward_gateway.network.mdns import join_url, lan_ip

HOUSE_CODE_PATTERN = re.compile(r"^\d{4}$")
INVALID_HOUSE_CODE = "That house code isn't valid"


def generate_house_code() -> str:
    return f"{secrets.randbelow(10000):04d}"


def encode_house_code(code: str) -> str:
    return dump_signed({"house_code": code})


def decode_house_code(token: str) -> str | None:
    data = load_signed(token)
    code = data.get("house_code") if data else None
    if isinstance(code, str) and HOUSE_CODE_PATTERN.fullmatch(code):
        return code
    return None


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def is_house_code_current(row: HouseCode, now: datetime | None = None) -> bool:
    moment = now or utcnow()
    if row.retired_at is not None:
        return False
    if row.expires_at is not None:
        expires = row.expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if expires <= moment:
            return False
    return True


def device_label(user_agent: str | None) -> str:
    ua = (user_agent or "").lower()
    if "ipad" in ua:
        return "iPad"
    if "iphone" in ua:
        return "iPhone"
    if "android" in ua:
        if "mobile" in ua:
            return "Android phone"
        return "Android tablet"
    if "macintosh" in ua or "mac os" in ua:
        return "Mac"
    if "windows" in ua:
        return "Windows PC"
    if "cros" in ua:
        return "Chromebook"
    if "linux" in ua:
        return "Linux computer"
    return "Device"


def set_device_cookie(response: Response, device_token: str) -> None:
    token = dump_signed({"device": device_token})
    response.set_cookie(
        key=settings.device_cookie_name,
        value=token,
        max_age=settings.device_cookie_max_age,
        path="/",
        httponly=True,
        samesite="lax",
        secure=False,
    )


def device_token_from_request(request: Request) -> str | None:
    raw = request.cookies.get(settings.device_cookie_name)
    if not raw:
        return None
    data = load_signed(raw, max_age=settings.device_cookie_max_age)
    token = data.get("device") if data else None
    return token if isinstance(token, str) and token else None


async def get_current_house_code(session: AsyncSession) -> HouseCode | None:
    result = await session.execute(
        select(HouseCode).order_by(HouseCode.id.desc())
    )
    for row in result.scalars():
        if is_house_code_current(row):
            return row
    return None


async def _retire_current_codes(session: AsyncSession, now: datetime) -> None:
    result = await session.execute(select(HouseCode).where(HouseCode.retired_at.is_(None)))
    for row in result.scalars():
        row.retired_at = now
        row.expires_at = now


async def issue_house_code(session: AsyncSession, *, rotate: bool = False) -> tuple[HouseCode, str]:
    now = utcnow()
    if not rotate:
        current = await get_current_house_code(session)
        if current:
            code = decode_house_code(current.code_token)
            if code:
                return current, code
            await _retire_current_codes(session, now)

    await _retire_current_codes(session, now)
    previous = None
    if rotate:
        # Avoid immediately reusing the digits the parent just retired.
        result = await session.execute(select(HouseCode).order_by(HouseCode.id.desc()).limit(1))
        last = result.scalar_one_or_none()
        if last:
            previous = decode_house_code(last.code_token)

    code = generate_house_code()
    while previous is not None and code == previous:
        code = generate_house_code()

    row = HouseCode(
        code_hash=hash_pin(code),
        code_token=encode_house_code(code),
        created_at=now,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row, code


def pairing_payload(code: str, devices: list[PairedDevice]) -> dict:
    ip = lan_ip()
    url = join_url(code, ip=ip, port=settings.web_port)
    return {
        "house_code": code,
        "join_url": url,
        "lan_ip": ip if ip and url else None,
        "port": settings.web_port,
        "devices": [_serialize_device(device) for device in devices],
    }


def _serialize_device(device: PairedDevice) -> dict:
    return {
        "id": device.id,
        "label": device.label,
        "created_at": device.created_at.isoformat() if device.created_at else None,
        "last_seen_at": device.last_seen_at.isoformat() if device.last_seen_at else None,
    }


async def list_devices(session: AsyncSession) -> list[PairedDevice]:
    result = await session.execute(select(PairedDevice).order_by(PairedDevice.last_seen_at.desc()))
    return list(result.scalars().all())


async def match_house_code(session: AsyncSession, code: str) -> HouseCode | None:
    """Return the current house-code row when `code` matches.

    Retired or expired rows are ignored even if the digits still hash-match.
    """
    if not HOUSE_CODE_PATTERN.fullmatch(code):
        return None
    current = await get_current_house_code(session)
    if current and verify_child_pin(code, current.code_hash):
        return current
    return None


async def remember_device(request: Request, session: AsyncSession) -> PairedDevice:
    now = utcnow()
    label = device_label(request.headers.get("user-agent"))
    token = device_token_from_request(request)
    device = None
    if token:
        result = await session.execute(
            select(PairedDevice).where(PairedDevice.device_token == token)
        )
        device = result.scalar_one_or_none()
    if device is None:
        device = PairedDevice(
            device_token=uuid.uuid4().hex,
            label=label,
            created_at=now,
            last_seen_at=now,
        )
        session.add(device)
    else:
        device.label = label
        device.last_seen_at = now
    await session.commit()
    await session.refresh(device)
    return device
