"""HTTP tests for registration, login, and JWT-protected routes."""

from __future__ import annotations

from typing import Any, Dict


def _register(
    client,
    *,
    username: str = "testuser",
    email: str = "testuser@example.com",
    password: str,
) -> Dict[str, Any]:
    r = client.post(
        "/api/auth/register",
        json={
            "username": username,
            "email": email,
            "password": password,
            "full_name": "Test User",
        },
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["success"] is True
    assert data["access_token"]
    return data


def test_register_login_me(client, strong_password: str) -> None:
    _register(client, password=strong_password)

    r_login = client.post(
        "/api/auth/login",
        json={"username": "testuser", "password": strong_password},
    )
    assert r_login.status_code == 200, r_login.text
    token = r_login.json()["access_token"]

    r_me = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r_me.status_code == 200
    assert r_me.json()["username"] == "testuser"


def test_me_without_token_returns_401(client) -> None:
    r = client.get("/api/auth/me")
    assert r.status_code == 401


def test_register_weak_password(client) -> None:
    r = client.post(
        "/api/auth/register",
        json={
            "username": "weakuser",
            "email": "weakuser@example.com",
            "password": "short",
            "full_name": "X",
        },
    )
    assert r.status_code == 400


def test_register_duplicate_username(client, strong_password: str) -> None:
    _register(client, username="dup", email="a@example.com", password=strong_password)
    r = client.post(
        "/api/auth/register",
        json={
            "username": "dup",
            "email": "b@example.com",
            "password": strong_password,
        },
    )
    assert r.status_code == 400


def test_forgot_password_unknown_email_returns_success_shape(client) -> None:
    r = client.post(
        "/api/auth/forgot-password",
        json={"email": "nobody-here@example.com"},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["success"] is True
    assert "message" in data
    assert "dev_reset_token" not in data


def test_forgot_and_reset_password(client, strong_password: str) -> None:
    _register(
        client,
        username="resetme",
        email="resetme@example.com",
        password=strong_password,
    )
    r_f = client.post(
        "/api/auth/forgot-password",
        json={"email": "resetme@example.com"},
    )
    assert r_f.status_code == 200, r_f.text
    tok = r_f.json().get("dev_reset_token")
    assert tok

    new_pw = "Xyzzy9zz!extra"
    r_r = client.post(
        "/api/auth/reset-password",
        json={"token": tok, "new_password": new_pw},
    )
    assert r_r.status_code == 200, r_r.text

    r_login = client.post(
        "/api/auth/login",
        json={"username": "resetme", "password": new_pw},
    )
    assert r_login.status_code == 200, r_login.text

    r_bad_old = client.post(
        "/api/auth/login",
        json={"username": "resetme", "password": strong_password},
    )
    assert r_bad_old.status_code == 401


def test_register_rejects_same_email_different_case(client, strong_password: str) -> None:
    _register(client, username="user1", email="Same@Example.com", password=strong_password)
    r = client.post(
        "/api/auth/register",
        json={
            "username": "user2",
            "email": "same@example.com",
            "password": strong_password,
            "full_name": "Y",
        },
    )
    assert r.status_code == 400
    assert "email" in r.text.lower()
