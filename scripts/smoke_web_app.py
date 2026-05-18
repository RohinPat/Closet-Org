"""Quick smoke test for /app (not part of pytest e2e suite)."""
import json
import urllib.request
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8000"


def login():
    body = json.dumps({"username": "testweb_129516278", "password": "TestPass1!"}).encode()
    req = urllib.request.Request(
        f"{BASE}/api/auth/login",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    return json.loads(urllib.request.urlopen(req).read())["access_token"]


def main():
    token = login()
    errors = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))

        page.goto(f"{BASE}/frontend/login.html", wait_until="domcontentloaded")
        page.evaluate("(t) => localStorage.setItem('access_token', t)", token)
        page.evaluate("() => localStorage.setItem('onboarding_carousel_v1', 'done')")
        page.goto(f"{BASE}/app", wait_until="networkidle")
        page.wait_for_timeout(2500)

        page.locator('.nav-btn[data-tab="closet"]').first.click()
        page.wait_for_timeout(2000)

        grid = page.locator("#closet-grid")
        html = grid.inner_html()
        stuck = "Loading your closet" in html
        print("grid_ok:", not stuck, "| snippet:", html[:120].replace("\n", " "))
        print("js_errors:", errors or "none")

        page.locator('.nav-btn[data-tab="upload"]').first.click()
        page.wait_for_timeout(500)
        upload_visible = page.locator("#upload-tab").evaluate(
            "el => el.classList.contains('active')"
        )
        print("upload_tab:", upload_visible)

        browser.close()

    if stuck or errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
