"""Logged-in app shell: navigation, closet view, theme."""

from __future__ import annotations

import re

import pytest
from playwright.sync_api import Page, expect

from conftest import register_account


@pytest.fixture
def logged_in_page(page: Page, require_server: str) -> Page:
    account = register_account()
    page.goto(f"{require_server}/login", wait_until="domcontentloaded")
    page.fill("#username", account["username"])
    page.fill("#password", account["password"])
    page.click("#login-btn")
    page.wait_for_url("**/app**", timeout=20_000)
    page.locator('.nav-btn[data-tab="closet"]').first.click()
    return page


def test_main_tabs_navigate(logged_in_page: Page) -> None:
    page = logged_in_page
    for tab, selector in [
        ("closet", "#closet-tab"),
        ("upload", "#upload-tab"),
        ("outfits", "#outfits-tab"),
        ("profile", "#profile-tab"),
    ]:
        page.locator(f'.nav-btn[data-tab="{tab}"]').first.click()
        expect(page.locator(selector)).to_be_visible()
        expect(page.locator(selector)).to_have_class(re.compile(r"\bactive\b"))


def test_closet_empty_state(logged_in_page: Page) -> None:
    page = logged_in_page
    page.locator('.nav-btn[data-tab="closet"]').first.click()
    empty = page.locator("#closet-grid .empty-state, #closet-grid .closet-card")
    expect(empty.first).to_be_visible(timeout=10_000)


def test_closet_density_toggle(logged_in_page: Page) -> None:
    page = logged_in_page
    page.locator('.nav-btn[data-tab="closet"]').first.click()
    density_btn = page.locator("#closet-density-btn")
    if density_btn.count() == 0:
        pytest.skip("Density control not present in this layout")
    before = density_btn.inner_text()
    density_btn.click()
    expect(density_btn).not_to_have_text(before)


def test_theme_toggle(logged_in_page: Page) -> None:
    page = logged_in_page
    toggle = page.locator("#theme-toggle")
    expect(toggle).to_be_visible()
    before = page.evaluate("() => document.documentElement.getAttribute('data-theme')")
    toggle.click()
    after = page.evaluate("() => document.documentElement.getAttribute('data-theme')")
    assert before in ("light", "dark")
    assert after in ("light", "dark")
    assert before != after


def test_upload_tab_shows_modes(logged_in_page: Page) -> None:
    page = logged_in_page
    page.locator('.nav-btn[data-tab="upload"]').first.click()
    expect(page.locator("#upload-tab")).to_be_visible()
    expect(page.locator(".upload-mode-btn").first).to_be_visible()
