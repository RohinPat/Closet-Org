"""Middleware + rate-limit branches."""

from __future__ import annotations

import asyncio
from unittest.mock import MagicMock

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

import security
from security import BodyLimitMiddleware, SecurityHeadersMiddleware, client_ip, rate_limit


def test_client_ip_respects_forwarded_for(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TRUST_PROXY_HEADERS", "1")

    class _Addr:
        host = "10.0.0.1"

    class _Req:
        client = _Addr()
        headers = {"x-forwarded-for": "203.0.113.9, 10.0.0.2"}

    assert client_ip(_Req()) == "203.0.113.9"  # type: ignore[arg-type]


def test_security_headers_on_upload_path() -> None:
    app = FastAPI()
    app.add_middleware(SecurityHeadersMiddleware)

    @app.get("/uploads/demo.png")
    async def fake_upload():
        return "ok"

    client = TestClient(app)
    r = client.get("/uploads/demo.png")
    csp = r.headers.get("Content-Security-Policy", "")
    assert "default-src 'none'" in csp or "sandbox" in csp.lower()


def test_rate_limit_triggers_429() -> None:
    security.rate_limiter._buckets.clear()

    class _R:
        client = type("C", (), {"host": "198.51.100.7"})()

    req = _R()
    for _ in range(5):
        security.rate_limit(req, "auth.register", limit=5, window=300)
    with pytest.raises(Exception) as ei:  # HTTPException
        security.rate_limit(req, "auth.register", limit=5, window=300)
    assert getattr(ei.value, "status_code", None) == 429


def test_validate_password_non_string() -> None:
    with pytest.raises(Exception) as ei:
        security.validate_password(123)  # type: ignore[arg-type]
    assert getattr(ei.value, "status_code", None) == 400


def test_body_limit_middleware_rejects_invalid_content_length() -> None:
    async def run():
        from unittest.mock import AsyncMock

        app = FastAPI()
        mw = BodyLimitMiddleware(app, max_bytes=1000)

        def cl_get(name: str, default=None):
            return "not-a-number" if name == "content-length" else default

        req = MagicMock()
        req.headers.get = cl_get
        call_next = AsyncMock(return_value=MagicMock())
        with pytest.raises(HTTPException) as ei:
            await mw.dispatch(req, call_next)
        return ei.value.status_code

    assert asyncio.run(run()) == 400


def test_body_limit_middleware_rejects_oversized_declared_body() -> None:
    async def run():
        from unittest.mock import AsyncMock

        app = FastAPI()
        mw = BodyLimitMiddleware(app, max_bytes=10)

        def cl_get(name: str, default=None):
            return "99999" if name == "content-length" else default

        req = MagicMock()
        req.headers.get = cl_get
        call_next = AsyncMock(return_value=MagicMock())
        with pytest.raises(HTTPException) as ei:
            await mw.dispatch(req, call_next)
        return ei.value.status_code

    assert asyncio.run(run()) == 413


def test_security_headers_hsts_in_production(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(security, "PRODUCTION", True)
    app = FastAPI()
    app.add_middleware(SecurityHeadersMiddleware)

    @app.get("/")
    async def root():
        return {"ok": True}

    client = TestClient(app)
    r = client.get("/")
    assert "Strict-Transport-Security" in r.headers
