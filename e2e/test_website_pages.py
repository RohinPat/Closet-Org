"""Static page smoke tests — every public HTML route the web app serves."""

from __future__ import annotations

import urllib.request

import pytest
from playwright.sync_api import Page, expect

PUBLIC_PAGES = [
    ("/", "Closet-Org"),
    ("/login", "Welcome Back"),
    ("/register", "Create Account"),
    ("/privacy", "Privacy"),
    ("/terms", "Terms"),
    ("/frontend/login.html", "Welcome Back"),
    ("/frontend/register.html", "Create Account"),
    ("/frontend/forgot-password.html", "Reset password"),
    ("/frontend/reset-password.html", "Choose a new password"),
    ("/frontend/privacy.html", "Privacy"),
    ("/frontend/terms.html", "Terms"),
]

SECURITY_HEADER_PAGES = ["/", "/login", "/register", "/app", "/frontend/login.html"]


def test_health_json(require_server: str) -> None:
    with urllib.request.urlopen(f"{require_server}/healthz", timeout=10) as resp:
        assert resp.status == 200
        body = resp.read().decode()
    assert '"status"' in body and "ok" in body


@pytest.mark.parametrize("path,needle", PUBLIC_PAGES)
def test_public_page_renders(page: Page, require_server: str, path: str, needle: str) -> None:
    page.goto(f"{require_server}{path}", wait_until="domcontentloaded")
    expect(page.locator("body")).to_contain_text(needle)


def test_landing_has_cta_to_register(page: Page, require_server: str) -> None:
    page.goto(f"{require_server}/", wait_until="domcontentloaded")
    register_link = page.locator('a[href="/frontend/register.html"]')
    expect(register_link.first).to_be_visible()


def test_app_requires_auth_redirect(page: Page, require_server: str) -> None:
    page.goto(f"{require_server}/app", wait_until="domcontentloaded")
    page.wait_for_url("**/login**", timeout=15_000)
    expect(page.locator("#login-form")).to_be_visible()


@pytest.mark.parametrize("path", SECURITY_HEADER_PAGES)
def test_security_headers(page: Page, require_server: str, path: str) -> None:
    response = page.goto(f"{require_server}{path}", wait_until="domcontentloaded")
    assert response is not None
    assert response.headers.get("x-content-type-options") == "nosniff"


def test_frontend_static_assets_load(page: Page, require_server: str) -> None:
    page.goto(f"{require_server}/login", wait_until="domcontentloaded")
    response = page.request.get(f"{require_server}/frontend/lib/web-utils.js")
    assert response.status == 200
    assert "escapeHtml" in response.text()
