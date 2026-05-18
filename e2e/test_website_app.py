"""Logged-in app shell: navigation, closet view, theme."""

from __future__ import annotations

import re

import pytest
from playwright.sync_api import Page, expect

from conftest import dismiss_onboarding, login_via_ui, session_account


@pytest.fixture
def logged_in_page(page: Page, require_server: str, session_account: dict) -> Page:
    login_via_ui(
        page, require_server, session_account["username"], session_account["password"]
    )
    page.locator('.nav-btn[data-tab="closet"], .sidebar-nav-btn[data-tab="closet"]').first.click()
    dismiss_onboarding(page)
    return page


def test_main_tabs_navigate(logged_in_page: Page) -> None:
    page = logged_in_page
    for tab, selector in [
        ("closet", "#closet-tab"),
        ("upload", "#upload-tab"),
        ("outfits", "#outfits-tab"),
        ("profile", "#profile-tab"),
    ]:
        page.locator(
            f'.header .nav-btn[data-tab="{tab}"], .mobile-tab-bar .nav-btn[data-tab="{tab}"], .sidebar-nav-btn[data-tab="{tab}"]'
        ).first.click()
        dismiss_onboarding(page)
        expect(page.locator(selector)).to_be_visible()
        expect(page.locator(selector)).to_have_class(re.compile(r"\bactive\b"))


def test_closet_empty_state(logged_in_page: Page) -> None:
    page = logged_in_page
    page.locator('.nav-btn[data-tab="closet"], .sidebar-nav-btn[data-tab="closet"]').first.click()
    empty = page.locator("#closet-grid .empty-state, #closet-grid .closet-card")
    expect(empty.first).to_be_visible(timeout=10_000)


def test_closet_density_toggle(logged_in_page: Page) -> None:
    page = logged_in_page
    page.locator('.nav-btn[data-tab="closet"], .sidebar-nav-btn[data-tab="closet"]').first.click()
    dismiss_onboarding(page)
    density_btn = page.locator("#closet-density-btn")
    if density_btn.count() == 0:
        pytest.skip("Density control not present in this layout")
    before = density_btn.get_attribute("title") or density_btn.get_attribute("aria-label") or ""
    density_btn.click()
    after = density_btn.get_attribute("title") or density_btn.get_attribute("aria-label") or ""
    assert before
    assert after != before


def test_theme_toggle(logged_in_page: Page) -> None:
    page = logged_in_page
    dismiss_onboarding(page)
    page.locator('.nav-btn[data-tab="profile"], .sidebar-nav-btn[data-tab="profile"]').first.click()
    page.locator('.hub-card[data-tab="settings"]').click()
    theme_select = page.locator("#settings-theme")
    expect(theme_select).to_be_visible(timeout=10_000)
    before = page.evaluate("() => document.documentElement.getAttribute('data-theme')")
    next_theme = "dark" if before != "dark" else "light"
    theme_select.select_option(next_theme)
    expect(page.locator("html")).to_have_attribute("data-theme", next_theme, timeout=10_000)
    after = page.evaluate("() => document.documentElement.getAttribute('data-theme')")
    assert after == next_theme
    assert before != after


def test_upload_tab_shows_modes(logged_in_page: Page) -> None:
    page = logged_in_page
    page.locator('.nav-btn[data-tab="upload"], .sidebar-nav-btn[data-tab="upload"]').first.click()
    dismiss_onboarding(page)
    expect(page.locator("#upload-tab")).to_be_visible()
    expect(page.locator(".upload-mode-btn").first).to_be_visible()
