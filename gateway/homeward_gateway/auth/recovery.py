"""Recovery code generation for local password reset."""

import secrets
import string

from homeward_gateway.auth.parent_auth import hash_password, verify_password

# Avoid ambiguous characters for families reading codes off paper
_ALPHABET = "".join(
    ch for ch in (string.ascii_uppercase + string.digits) if ch not in "0O1IL"
)


def generate_recovery_code() -> str:
    """Create a human-readable recovery code like HOME-ABCD-EFGH-JKMN."""
    parts = ["".join(secrets.choice(_ALPHABET) for _ in range(4)) for _ in range(3)]
    return f"HOME-{'-'.join(parts)}"


def normalize_recovery_code(code: str) -> str:
    return code.upper().replace(" ", "").replace("-", "")


def hash_recovery_code(code: str) -> str:
    return hash_password(normalize_recovery_code(code))


def verify_recovery_code(code: str, stored_hash: str) -> bool:
    return verify_password(normalize_recovery_code(code), stored_hash)
