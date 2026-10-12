"""Guard: route handlers must not block the event loop.

Prod runs a single uvicorn worker. An ``async def`` handler that does blocking
work (SQLite, CLIP, rembg, urllib) freezes every other request until it
returns. Plain ``def`` handlers run in FastAPI's threadpool instead. So any
``async def`` route must actually ``await`` something.
"""

from __future__ import annotations

import ast
from contextlib import contextmanager
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
ROUTE_FILES = [BACKEND / "main.py", *sorted((BACKEND / "routers").glob("*.py"))]


def test_async_routes_actually_await() -> None:
    offenders = []
    for path in ROUTE_FILES:
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in tree.body:
            if not isinstance(node, ast.AsyncFunctionDef):
                continue
            if not any(isinstance(n, (ast.Await, ast.AsyncFor, ast.AsyncWith)) for n in ast.walk(node)):
                offenders.append(f"{path.name}:{node.name} (line {node.lineno})")
    assert not offenders, (
        "async def handlers with no await block the event loop; use plain def: "
        + ", ".join(offenders)
    )


@contextmanager
def _restore(module, original):
    try:
        yield
    finally:
        module.get_classifier = original


def test_slow_handler_does_not_block_health_check(client) -> None:
    """A slow classifier on one request must not stall an unrelated request."""
    import threading
    import time
    from io import BytesIO

    import deps
    from closet_org_pytest_helpers import MIN_PNG, auth_header, register_account

    tok = register_account(client, password="Abcd5678ef")["access_token"]

    class SlowClassifier:
        def classify(self, image_path):
            time.sleep(1.5)
            return {
                "category": "T-Shirt",
                "subcategory": "Top",
                "confidence": 95.0,
                "colors": ["Blue"],
                "season": "All-Season",
                "style": "Casual",
            }

        def encode_image_embedding(self, image_path):
            return None

    slow = SlowClassifier()
    original = deps.get_classifier
    deps.get_classifier = lambda: slow
    # As a context manager the TestClient shares one event loop across requests,
    # like a real uvicorn worker; otherwise each request gets its own loop.
    with client, _restore(deps, original):
        done = {}

        def upload():
            done["status"] = client.post(
                "/api/upload-clothing",
                headers=auth_header(tok),
                files=[("files", ("a.png", BytesIO(MIN_PNG), "image/png"))],
            ).status_code

        t = threading.Thread(target=upload)
        t.start()
        time.sleep(0.3)  # let the upload get into classify()
        start = time.monotonic()
        assert client.get("/healthz").status_code == 200
        elapsed = time.monotonic() - start
        t.join()

    assert done.get("status") == 200
    assert elapsed < 1.0, f"/healthz waited {elapsed:.2f}s behind a slow upload"
