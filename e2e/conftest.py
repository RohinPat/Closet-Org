"""Shared fixtures for Playwright browser tests against a running API."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
import uuid
from typing import Any, Dict, Generator

import pytest
from playwright.sync_api import Browser, Page, expect, sync_playwright


def base_url() -> str:
    return os.environ.get("E2E_BASE_URL", "http://127.0.0.1:8000").rstrip("/")


def api_json(
    method: str,
    path: str,
    *,
    payload: Dict[str, Any] | None = None,
    headers: Dict[str, str] | None = None,
) -> tuple[int, Any]:
    url = f"{base_url()}{path}"
    body = None
    req_headers = {"Accept": "application/json", **(headers or {})}
    if payload is not None:
        body = json.dumps(payload).encode()
        req_headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=body, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = resp.read().decode()
            return resp.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode()
        try:
            data = json.loads(raw) if raw else None
        except json.JSONDecodeError:
            data = raw
        return exc.code, data


def register_account(
    *,
    password: str = "Abcd5678ef",
    username: str | None = None,
    email: str | None = None,
) -> Dict[str, Any]:
    suffix = uuid.uuid4().hex[:10]
    user = username or f"e2e_{suffix}"
    mail = email or f"{user}@example.com"
    status, data = api_json(
        "POST",
        "/api/auth/register",
        payload={
            "username": user,
            "email": mail,
            "password": password,
            "full_name": "E2E User",
        },
    )
    assert status == 200, data
    assert isinstance(data, dict) and data.get("access_token")
    data["username"] = user
    data["password"] = password
    return data


@pytest.fixture(scope="session")
def require_server() -> str:
    base = base_url()
    try:
        urllib.request.urlopen(f"{base}/healthz", timeout=10)
    except urllib.error.URLError as exc:
        pytest.skip(f"E2E server not reachable at {base}/healthz: {exc}")
    return base


@pytest.fixture(scope="session")
def session_account(require_server: str) -> Dict[str, Any]:
    """One registered user for the whole E2E run (avoids auth rate limits)."""
    return register_account()


@pytest.fixture(scope="session")
def browser_instance(require_server: str) -> Generator[Browser, None, None]:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        yield browser
        browser.close()


@pytest.fixture
def page(browser_instance: Browser, require_server: str) -> Generator[Page, None, None]:
    context = browser_instance.new_context(viewport={"width": 1280, "height": 720})
    pg = context.new_page()
    pg.add_init_script(
        "localStorage.setItem('onboarding_carousel_v1', 'done');"
    )
    yield pg
    context.close()


def dismiss_onboarding(page: Page) -> None:
    root = page.locator("#onboarding-carousel.is-active")
    if root.count() and root.is_visible():
        page.locator("#onboarding-carousel-skip").click()
        expect(root).to_be_hidden(timeout=5_000)


def login_via_ui(page: Page, base: str, username: str, password: str) -> None:
    page.goto(f"{base}/frontend/login.html", wait_until="domcontentloaded")
    page.fill("#username", username)
    page.fill("#password", password)
    page.click("#login-btn")
    page.wait_for_url("**/app**", timeout=20_000)
    dismiss_onboarding(page)


def assert_app_shell(page: Page) -> None:
    expect(page.locator(".header .logo, .app-brand, h1.logo").first).to_contain_text(
        "Closet-Org"
    )
    expect(page.locator(".tab-content.active")).to_have_count(1)


@pytest.fixture
def strong_password() -> str:
    return "Abcd5678ef"
