"""Authentication primitives: password hashing, JWT issuance/verification,
and the FastAPI dependency that turns a Bearer token into a user record.

Security posture:
- Signing secret comes from CLOSET_SECRET_KEY. In production we *refuse*
  to start without one. In development we auto-generate one to disk and
  warn loudly, so dev tokens survive reloads without ever shipping a
  hardcoded constant.
- Tokens carry a `tv` (token version) claim that's checked against the
  user's row on every request. Bumping the row's token_version invalidates
  every outstanding token for that user (used by password change, "log out
  of all devices", and incident response).
- Tokens are timezone-aware UTC, with iat/nbf/exp/iss claims and required-
  claim enforcement at decode time.
"""
from __future__ import annotations

import os
import secrets
import warnings
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import bcrypt
import jwt
from fastapi import HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from database.db_manager import get_db


# ---- Configuration -----------------------------------------------------------

ALGORITHM = "HS256"
ACCESS_TOKEN_TTL_MINUTES = int(
    os.getenv("ACCESS_TOKEN_TTL_MINUTES", str(60 * 24 * 7))  # 7 days
)
_ISSUER = "closet-org"

_PRODUCTION = os.getenv("CLOSET_ENV", "development").lower() == "production"
_BACKEND_DIR = Path(__file__).resolve().parent
_DEV_SECRET_FILE = _BACKEND_DIR / ".secret_key"  # gitignored, generated on first run


def _load_secret() -> str:
    """Resolve the JWT signing secret.

    Order:
      1. CLOSET_SECRET_KEY env var (canonical; required in production).
      2. backend/.secret_key file, auto-generated in development so tokens
         survive uvicorn auto-reloads.

    The previous code shipped with a hardcoded fallback like
    ``"your-secret-key-change-this-in-production-please-make-it-secure"``.
    That string was knowable to anyone who'd seen the repo, so anyone could
    forge a valid JWT for any user. We refuse that path entirely.
    """
    env = os.getenv("CLOSET_SECRET_KEY")
    if env:
        if len(env) < 32:
            raise RuntimeError(
                "CLOSET_SECRET_KEY must be at least 32 characters. "
                "Generate one with: python -c \"import secrets; "
                "print(secrets.token_urlsafe(48))\""
            )
        return env

    if _PRODUCTION:
        raise RuntimeError(
            "CLOSET_SECRET_KEY is not set. Refusing to start in production "
            "without a configured signing secret."
        )

    if _DEV_SECRET_FILE.exists():
        existing = _DEV_SECRET_FILE.read_text().strip()
        if len(existing) >= 32:
            return existing
        # Treat a short file as corruption — regenerate.

    generated = secrets.token_urlsafe(48)
    _DEV_SECRET_FILE.write_text(generated)
    try:
        os.chmod(_DEV_SECRET_FILE, 0o600)
    except OSError:
        pass  # best-effort on platforms without POSIX perms
    warnings.warn(
        f"Generated a development JWT secret at {_DEV_SECRET_FILE}. "
        "Set CLOSET_SECRET_KEY in the environment before deploying.",
        RuntimeWarning,
        stacklevel=2,
    )
    return generated


SECRET_KEY = _load_secret()
security = HTTPBearer(auto_error=False)


# ---- Passwords ---------------------------------------------------------------

def hash_password(password: str) -> str:
    """Bcrypt-hash a password. Caller is expected to enforce length policy."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


# ---- Tokens ------------------------------------------------------------------

def create_access_token(
    *,
    user_id: int,
    username: str,
    token_version: int,
    expires_delta: Optional[timedelta] = None,
) -> str:
    now = datetime.now(timezone.utc)
    exp = now + (expires_delta or timedelta(minutes=ACCESS_TOKEN_TTL_MINUTES))
    payload = {
        "sub": str(user_id),
        "user_id": user_id,
        "username": username,
        "tv": int(token_version),
        "iat": int(now.timestamp()),
        "nbf": int(now.timestamp()),
        "exp": int(exp.timestamp()),
        "iss": _ISSUER,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    try:
        return jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM],
            issuer=_ISSUER,
            options={"require": ["exp", "iat", "user_id", "tv"]},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError:
        # PyJWT 2.x raises subclasses of InvalidTokenError for every failure
        # mode (bad signature, wrong issuer, missing claim, etc.). The old
        # code caught `jwt.JWTError`, which doesn't exist in PyJWT — every
        # bad token leaked a 500.
        raise HTTPException(status_code=401, detail="Invalid token")


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security),
) -> dict:
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=401,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_access_token(credentials.credentials)
    user_id = payload.get("user_id")
    if not isinstance(user_id, int):
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")

    expected = get_db().get_user_token_version(user_id)
    if expected is None or expected != payload.get("tv"):
        # User was deleted, or their tokens were invalidated.
        raise HTTPException(status_code=401, detail="Token revoked")

    return {"user_id": user_id, "username": payload.get("username", "")}


def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security),
) -> Optional[dict]:
    if credentials is None:
        return None
    try:
        return get_current_user(credentials)
    except HTTPException:
        return None
