"""Parent authentication with session cookies."""

import hashlib
import secrets
from typing import Optional

from fastapi import Request, Response
from itsdangerous import BadSignature, URLSafeTimedSerializer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from homeward_gateway.config import settings
from homeward_gateway.db.database import ParentAccount

serializer = URLSafeTimedSerializer(settings.secret_key)


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    hashed = hashlib.sha256((salt + password).encode()).hexdigest()
    return f"{salt}:{hashed}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, hashed = stored.split(":", 1)
    except ValueError:
        return False
    return hashlib.sha256((salt + password).encode()).hexdigest() == hashed


def create_session_token(parent_id: int) -> str:
    return serializer.dumps({"parent_id": parent_id})


def decode_session_token(token: str) -> Optional[int]:
    try:
        data = serializer.loads(token, max_age=settings.session_max_age)
        return data.get("parent_id")
    except BadSignature:
        return None


def set_session_cookie(response: Response, parent_id: int) -> None:
    token = create_session_token(parent_id)
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        max_age=settings.session_max_age,
        httponly=True,
        samesite="lax",
        secure=False,
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(key=settings.session_cookie_name)


async def get_parent_from_request(request: Request, session: AsyncSession) -> Optional[ParentAccount]:
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        return None
    parent_id = decode_session_token(token)
    if not parent_id:
        return None
    result = await session.execute(select(ParentAccount).where(ParentAccount.id == parent_id))
    return result.scalar_one_or_none()


def generate_pin() -> str:
    return f"{secrets.randbelow(9000) + 1000}"
