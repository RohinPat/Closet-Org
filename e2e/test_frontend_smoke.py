"""Browser smoke tests against a running FastAPI instance.

Set ``E2E_BASE_URL`` (default ``http://127.0.0.1:8000``). CI starts uvicorn and
points this at the ephemeral port.

Run::

    pip install -r requirements-dev.txt
    python -m playwright install chromium
    cd backend && uvicorn main:app --host 127.0.0.1 --port 8765
    # other shell:
    E2E_BASE_URL=http://127.0.0.1:8765 python -m pytest e2e -v
"""

from __future__ import annotations

import os
import urllib.error
import urllib.request

import pytest
from playwright.sync_api import sync_playwright


def _base_url() -> str:
    return os.environ.get("E2E_BASE_URL", "http://127.0.0.1:8000").rstrip("/")


@pytest.fixture(scope="module")
def require_server() -> str:
    base = _base_url()
    try:
        urllib.request.urlopen(f"{base}/healthz", timeout=10)
    except urllib.error.URLError as e:
        pytest.skip(f"E2E server not reachable at {base}/healthz: {e}")
    return base


def test_health_json(require_server: str) -> None:
    with urllib.request.urlopen(f"{require_server}/healthz", timeout=10) as r:
        assert r.status == 200
        body = r.read().decode()
    assert '"status"' in body and "ok" in body


def test_login_page_renders(require_server: str) -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(f"{require_server}/login", wait_until="domcontentloaded")
        assert page.locator("h1").inner_text() == "Closet-Org"
        browser.close()


def test_security_header_on_login(require_server: str) -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        response = page.goto(f"{require_server}/login", wait_until="domcontentloaded")
        assert response is not None
        assert response.headers.get("x-content-type-options") == "nosniff"
        browser.close()
