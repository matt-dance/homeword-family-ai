"""Parent authentication with session cookies, plus per-device child unlock."""

import hashlib
import hmac
import secrets
from functools import lru_cache
from typing import Optional

from fastapi import Request, Response
from itsdangerous import BadSignature, URLSafeTimedSerializer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from homeward_gateway.config import settings
from homeward_gateway.db.database import ChildProfile, ParentAccount

_PBKDF2_ITERATIONS = 200_000
_PBKDF2_PREFIX = "pbkdf2_sha256"


@lru_cache(maxsize=1)
def _serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(settings.resolved_secret_key())


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode(), salt.encode(), _PBKDF2_ITERATIONS
    ).hex()
    return f"{_PBKDF2_PREFIX}${_PBKDF2_ITERATIONS}${salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    if stored.startswith(f"{_PBKDF2_PREFIX}$"):
        try:
            _, iterations, salt, digest = stored.split("$", 3)
            candidate = hashlib.pbkdf2_hmac(
                "sha256", password.encode(), salt.encode(), int(iterations)
            ).hex()
        except ValueError:
            return False
        return hmac.compare_digest(candidate, digest)

    # Legacy single-round salted SHA-256 (pre-KDF installs).
    try:
        salt, hashed = stored.split(":", 1)
    except ValueError:
        return False
    candidate = hashlib.sha256((salt + password).encode()).hexdigest()
    return hmac.compare_digest(candidate, hashed)


def password_needs_rehash(stored: str) -> bool:
    return not stored.startswith(f"{_PBKDF2_PREFIX}${_PBKDF2_ITERATIONS}$")


def hash_pin(pin: str) -> str:
    return hash_password(pin)


def verify_child_pin(pin: str, stored: str) -> bool:
    """Accept hashed PINs and legacy plaintext PINs (upgraded on next save)."""
    if "$" in stored or ":" in stored:
        return verify_password(pin, stored)
    return hmac.compare_digest(pin.encode(), stored.encode())


def pin_needs_rehash(stored: str) -> bool:
    return password_needs_rehash(stored)


def create_session_token(parent_id: int) -> str:
    return _serializer().dumps({"parent_id": parent_id})


def decode_session_token(token: str) -> Optional[int]:
    try:
        data = _serializer().loads(token, max_age=settings.session_max_age)
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
        secure=False,  # plain-HTTP home LAN; there is no TLS on homeward.local
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


# --- Child unlock (PIN) ---
#
# A correct PIN grants this browser a signed, httponly cookie for that child.
# Chat, session, and resume endpoints require it for PIN-protected profiles so
# the PIN cannot be skipped by calling the API directly from another device.


def _child_cookie_name(child_id: int) -> str:
    return f"homeward_kid_{child_id}"


def set_child_access_cookie(response: Response, child_id: int) -> None:
    token = _serializer().dumps({"child_id": child_id})
    response.set_cookie(
        key=_child_cookie_name(child_id),
        value=token,
        max_age=settings.child_access_max_age,
        httponly=True,
        samesite="lax",
        secure=False,
    )


def has_child_access(request: Request, child: ChildProfile) -> bool:
    if not child.pin:
        return True
    token = request.cookies.get(_child_cookie_name(child.id))
    if not token:
        return False
    try:
        data = _serializer().loads(token, max_age=settings.child_access_max_age)
    except BadSignature:
        return False
    return data.get("child_id") == child.id


# --- Homework camera unlock ---
#
# A correct parent password grants this browser a short-lived, httponly cookie
# for worksheet camera APIs. It is not a parent dashboard session.


def set_homework_unlock_cookie(response: Response) -> None:
    token = _serializer().dumps({"homework": True})
    response.set_cookie(
        key=settings.homework_unlock_cookie_name,
        value=token,
        max_age=settings.homework_unlock_max_age,
        httponly=True,
        samesite="lax",
        secure=False,
    )


def has_homework_unlock(request: Request) -> bool:
    token = request.cookies.get(settings.homework_unlock_cookie_name)
    if not token:
        return False
    try:
        data = _serializer().loads(token, max_age=settings.homework_unlock_max_age)
    except BadSignature:
        return False
    return data.get("homework") is True
