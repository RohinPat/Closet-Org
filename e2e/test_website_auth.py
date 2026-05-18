"""Authentication flows in the browser."""

from __future__ import annotations

import uuid

from playwright.sync_api import Page, expect

from conftest import assert_app_shell, dismiss_onboarding, login_via_ui, session_account


def test_login_invalid_credentials_show_error(page: Page, require_server: str) -> None:
    page.goto(f"{require_server}/frontend/login.html", wait_until="domcontentloaded")
    page.fill("#username", "nobody")
    page.fill("#password", "WrongPass99xx")
    page.click("#login-btn")
    error = page.locator("#error-message")
    expect(error).to_be_visible(timeout=10_000)
    expect(error).not_to_have_class("hidden")


def test_register_and_login_flow(page: Page, require_server: str, strong_password: str) -> None:
    suffix = uuid.uuid4().hex[:8]
    username = f"web_{suffix}"
    email = f"{username}@example.com"

    page.goto(f"{require_server}/register", wait_until="domcontentloaded")
    page.fill("#username", username)
    page.fill("#email", email)
    page.fill("#password", strong_password)
    page.fill("#confirm_password", strong_password)
    page.fill("#full_name", "Web Tester")
    page.click("#register-btn")
    page.wait_for_url("**/app**", timeout=20_000)
    dismiss_onboarding(page)
    assert_app_shell(page)

    page.evaluate("() => { localStorage.clear(); }")
    login_via_ui(page, require_server, username, strong_password)
    assert_app_shell(page)


def test_stored_token_boots_app(
    page: Page, require_server: str, session_account: dict
) -> None:
    page.goto(f"{require_server}/frontend/login.html", wait_until="domcontentloaded")
    page.evaluate(
        """(payload) => {
            localStorage.setItem('access_token', payload.token);
            localStorage.setItem('user', JSON.stringify(payload.user));
            localStorage.setItem('onboarding_carousel_v1', 'done');
        }""",
        {"token": session_account["access_token"], "user": session_account["user"]},
    )
    page.goto(f"{require_server}/app", wait_until="domcontentloaded")
    page.wait_for_url("**/app**", timeout=15_000)
    assert_app_shell(page)


def test_logout_returns_to_login(
    page: Page, require_server: str, session_account: dict
) -> None:
    login_via_ui(
        page, require_server, session_account["username"], session_account["password"]
    )
    page.evaluate(
        """() => {
            document.getElementById('dropdown-menu')?.classList.remove('hidden');
            document.getElementById('logout-btn')?.click();
        }"""
    )
    page.wait_for_url("**/login**", timeout=15_000)
    expect(page.locator("#login-form")).to_be_visible()
