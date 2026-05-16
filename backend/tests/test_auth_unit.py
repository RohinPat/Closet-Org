"""JWT / password edge cases (mocked DB)."""

from __future__ import annotations

from datetime import timedelta
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

import auth


def test_decode_expired_token(monkeypatch: pytest.MonkeyPatch) -> None:
    tok = auth.create_access_token(
        user_id=1,
        username="u",
        token_version=0,
        expires_delta=timedelta(seconds=-120),
    )
    with pytest.raises(HTTPException) as ei:
        auth.decode_access_token(tok)
    assert ei.value.status_code == 401


def test_decode_invalid_token() -> None:
    with pytest.raises(HTTPException) as ei:
        auth.decode_access_token("not-a-jwt")
    assert ei.value.status_code == 401


def test_verify_password_bad_hash_returns_false() -> None:
    assert auth.verify_password("secret", "%%%not-valid-bcrypt%%%") is False


def test_get_current_user_revoked_when_tv_mismatch(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_db = MagicMock()
    fake_db.get_user_token_version.return_value = 9
    monkeypatch.setattr(auth, "get_db", lambda: fake_db)

    tok = auth.create_access_token(user_id=42, username="x", token_version=0)
    creds = MagicMock()
    creds.credentials = tok

    with pytest.raises(HTTPException) as ei:
        auth.get_current_user(credentials=creds)
    assert ei.value.status_code == 401


def test_get_optional_user_invalid_returns_none(monkeypatch: pytest.MonkeyPatch) -> None:
    creds = MagicMock()
    creds.credentials = "garbage"
    assert auth.get_optional_user(credentials=creds) is None
