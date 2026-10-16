"""Short-lived access tokens + rotating refresh tokens with reuse detection."""

from __future__ import annotations

import time

import jwt
import pytest

from closet_org_pytest_helpers import auth_header

REFRESH = {"X-Closet-Refresh": "1"}


def _register(client, password: str, *, headers=None, username="sess_user"):
    r = client.post(
        "/api/auth/register",
        headers=headers or {},
        json={"username": username, "email": f"{username}@example.com", "password": password},
    )
    assert r.status_code == 200, r.text
    return r.json()


def _ttl_minutes(token: str) -> float:
    claims = jwt.decode(token, options={"verify_signature": False})
    return (claims["exp"] - claims["iat"]) / 60


def test_legacy_clients_keep_long_lived_token_and_no_refresh(client, strong_password) -> None:
    data = _register(client, strong_password)
    assert "refresh_token" not in data
    assert _ttl_minutes(data["access_token"]) == pytest.approx(7 * 24 * 60)


def test_refresh_clients_get_short_access_token_and_refresh_token(client, strong_password) -> None:
    data = _register(client, strong_password, headers=REFRESH)
    assert data["refresh_token"]
    assert data["expires_in"] == 3600
    assert _ttl_minutes(data["access_token"]) == pytest.approx(60)

    login = client.post(
        "/api/auth/login",
        headers=REFRESH,
        json={"username": "sess_user", "password": strong_password},
    ).json()
    assert login["refresh_token"] and login["refresh_token"] != data["refresh_token"]


def test_refresh_rotates_and_new_access_token_works(client, strong_password) -> None:
    first = _register(client, strong_password, headers=REFRESH)
    r = client.post("/api/auth/refresh", json={"refresh_token": first["refresh_token"]})
    assert r.status_code == 200, r.text
    second = r.json()
    assert second["refresh_token"] != first["refresh_token"]
    assert client.get("/api/auth/me", headers=auth_header(second["access_token"])).status_code == 200

    # The successor keeps working.
    r2 = client.post("/api/auth/refresh", json={"refresh_token": second["refresh_token"]})
    assert r2.status_code == 200


def test_quick_double_refresh_is_a_conflict_not_theft(client, strong_password) -> None:
    first = _register(client, strong_password, headers=REFRESH)
    ok = client.post("/api/auth/refresh", json={"refresh_token": first["refresh_token"]})
    assert ok.status_code == 200
    again = client.post("/api/auth/refresh", json={"refresh_token": first["refresh_token"]})
    assert again.status_code == 409
    # The legitimate successor was not revoked.
    succ = client.post("/api/auth/refresh", json={"refresh_token": ok.json()["refresh_token"]})
    assert succ.status_code == 200


def test_reuse_after_grace_revokes_the_whole_family(client, strong_password, monkeypatch) -> None:
    import database.sessions as sessions

    first = _register(client, strong_password, headers=REFRESH)
    ok = client.post("/api/auth/refresh", json={"refresh_token": first["refresh_token"]}).json()

    real_time = time.time
    monkeypatch.setattr(sessions.time, "time", lambda: real_time() + sessions.ROTATION_GRACE_SECONDS + 5)
    stolen = client.post("/api/auth/refresh", json={"refresh_token": first["refresh_token"]})
    assert stolen.status_code == 401
    # The attacker's replay also killed the legitimate successor.
    succ = client.post("/api/auth/refresh", json={"refresh_token": ok["refresh_token"]})
    assert succ.status_code == 401


def test_expired_refresh_token_rejected(client, strong_password, monkeypatch) -> None:
    import database.sessions as sessions

    first = _register(client, strong_password, headers=REFRESH)
    real_time = time.time
    monkeypatch.setattr(sessions.time, "time", lambda: real_time() + 31 * 86400)
    r = client.post("/api/auth/refresh", json={"refresh_token": first["refresh_token"]})
    assert r.status_code == 401


def test_garbage_refresh_token_rejected(client) -> None:
    r = client.post("/api/auth/refresh", json={"refresh_token": "x" * 40})
    assert r.status_code == 401


def test_logout_revokes_only_this_device(client, strong_password) -> None:
    phone = _register(client, strong_password, headers=REFRESH)
    laptop = client.post(
        "/api/auth/login",
        headers=REFRESH,
        json={"username": "sess_user", "password": strong_password},
    ).json()
    assert client.post("/api/auth/logout", json={"refresh_token": phone["refresh_token"]}).status_code == 200
    assert client.post("/api/auth/refresh", json={"refresh_token": phone["refresh_token"]}).status_code == 401
    assert client.post("/api/auth/refresh", json={"refresh_token": laptop["refresh_token"]}).status_code == 200


def test_logout_all_and_password_change_revoke_refresh_tokens(client, strong_password) -> None:
    a = _register(client, strong_password, headers=REFRESH)
    assert client.post("/api/auth/logout-all", headers=auth_header(a["access_token"])).status_code == 200
    assert client.post("/api/auth/refresh", json={"refresh_token": a["refresh_token"]}).status_code == 401

    b = client.post(
        "/api/auth/login", headers=REFRESH, json={"username": "sess_user", "password": strong_password}
    ).json()
    ch = client.post(
        "/api/auth/change-password",
        headers={**auth_header(b["access_token"]), **REFRESH},
        json={"current_password": strong_password, "new_password": "Newpass9876xy"},
    )
    assert ch.status_code == 200, ch.text
    assert client.post("/api/auth/refresh", json={"refresh_token": b["refresh_token"]}).status_code == 401
    # The caller got a fresh pair and stays signed in.
    assert client.post("/api/auth/refresh", json={"refresh_token": ch.json()["refresh_token"]}).status_code == 200


def test_account_deletion_removes_refresh_tokens(client, strong_password) -> None:
    a = _register(client, strong_password, headers=REFRESH)
    r = client.post(
        "/api/auth/delete-account",
        headers=auth_header(a["access_token"]),
        json={"password": strong_password},
    )
    assert r.status_code == 200
    assert client.post("/api/auth/refresh", json={"refresh_token": a["refresh_token"]}).status_code == 401


def test_refresh_tokens_are_stored_hashed(client, strong_password) -> None:
    import deps

    a = _register(client, strong_password, headers=REFRESH)
    conn = deps.db.get_connection()
    try:
        hashes = [r[0] for r in conn.execute("SELECT token_hash FROM refresh_tokens")]
    finally:
        conn.close()
    assert hashes and a["refresh_token"] not in hashes


def test_cors_preflight_allows_the_refresh_opt_in_header(client) -> None:
    """Browser clients (Expo web) send X-Closet-Refresh; preflight must allow it."""
    r = client.options(
        "/api/auth/login",
        headers={
            "Origin": "http://localhost:8081",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,x-closet-refresh",
        },
    )
    assert r.status_code == 200, r.text
    assert "x-closet-refresh" in r.headers.get("access-control-allow-headers", "").lower()
