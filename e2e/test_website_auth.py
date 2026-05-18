"""Authentication flows in the browser."""

from __future__ import annotations

import uuid

from playwright.sync_api import Page, expect

from conftest import register_account


def _fill_login(page: Page, username: str, password: str) -> None:
    page.fill("#username", username)
    page.fill("#password", password)
    page.click("#login-btn")


def _assert_app_shell(page: Page) -> None:
    expect(page.locator(".header .logo")).to_contain_text("Closet-Org")
    expect(page.locator(".tab-content.active")).to_have_count(1)


def test_login_invalid_credentials_show_error(page: Page, require_server: str) -> None:
    page.goto(f"{require_server}/login", wait_until="domcontentloaded")
    _fill_login(page, "nobody", "WrongPass99xx")
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
    _assert_app_shell(page)

    page.evaluate("() => { localStorage.clear(); }")
    page.goto(f"{require_server}/login", wait_until="domcontentloaded")
    _fill_login(page, username, strong_password)
    page.wait_for_url("**/app**", timeout=20_000)
    _assert_app_shell(page)


def test_api_register_then_browser_session(page: Page, require_server: str) -> None:
    account = register_account()
    page.goto(f"{require_server}/login", wait_until="domcontentloaded")
    page.evaluate(
        """(token, user) => {
            localStorage.setItem('access_token', token);
            localStorage.setItem('user', JSON.stringify(user));
        }""",
        account["access_token"],
        account["user"],
    )
    page.goto(f"{require_server}/app", wait_until="domcontentloaded")
    page.wait_for_url("**/app**", timeout=15_000)
    _assert_app_shell(page)


def test_logout_returns_to_login(page: Page, require_server: str) -> None:
    account = register_account()
    page.goto(f"{require_server}/login", wait_until="domcontentloaded")
    _fill_login(page, account["username"], account["password"])
    page.wait_for_url("**/app**", timeout=20_000)

    page.click("#user-profile-btn")
    page.click("#logout-btn")
    page.wait_for_url("**/login**", timeout=15_000)
    expect(page.locator("#login-form")).to_be_visible()
