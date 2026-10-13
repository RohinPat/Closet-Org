"""Small WebP grid thumbnails + long-lived private caching for uploads."""

from __future__ import annotations

import importlib.util
from io import BytesIO
from pathlib import Path

from PIL import Image

from closet_org_pytest_helpers import auth_header, register_account

REPO = Path(__file__).resolve().parents[2]


def _photo_png(w: int = 1600, h: int = 1200) -> bytes:
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    im.paste((40, 90, 200, 255), (200, 150, w - 200, h - 150))
    buf = BytesIO()
    im.save(buf, "PNG")
    return buf.getvalue()


def _use_tmp_uploads(monkeypatch, tmp_path) -> Path:
    import deps

    uploads = tmp_path / "uploads"
    uploads.mkdir()
    monkeypatch.setattr(deps, "UPLOAD_DIR", uploads)
    return uploads


def test_upload_creates_small_webp_grid_thumbnail(client, strong_password, tmp_path, monkeypatch) -> None:
    import deps

    _use_tmp_uploads(monkeypatch, tmp_path)
    h = auth_header(register_account(client, password=strong_password)["access_token"])
    r = client.post(
        "/api/upload-clothing",
        headers=h,
        files=[("files", ("shirt.png", BytesIO(_photo_png()), "image/png"))],
    )
    assert r.status_code == 200, r.text
    item = deps.db.get_item(r.json()["item_id"])

    grid = Path(item["grid_thumbnail_path"])
    assert grid.exists() and grid.name.endswith(".grid.webp")
    with Image.open(grid) as im:
        assert im.format == "WEBP"
        assert max(im.size) <= 480
        assert im.mode == "RGBA"  # cutout transparency survives
    original = Path(item["image_path"])
    assert grid.stat().st_size < original.stat().st_size / 5

    # The closet list exposes it to clients.
    closet = client.get("/api/closet", headers=h).json()
    items = closet["items"] if isinstance(closet, dict) else closet
    assert items[0]["grid_thumbnail_path"] == item["grid_thumbnail_path"]


def test_uploads_are_cached_privately(client, strong_password, tmp_path, monkeypatch) -> None:
    uploads = Path(__import__("deps").UPLOAD_DIR)
    name = "zz_cache_probe_test.png"
    (uploads / name).write_bytes(_photo_png(10, 10))
    try:
        r = client.get(f"/uploads/{name}")
        assert r.status_code == 200
        assert r.headers["cache-control"] == "private, max-age=31536000, immutable"
        missing = client.get("/uploads/does-not-exist.png")
        assert missing.status_code == 404
        assert "immutable" not in missing.headers.get("cache-control", "")
    finally:
        (uploads / name).unlink(missing_ok=True)


def test_backfill_script_creates_missing_grid_thumbnails(client, tmp_path, monkeypatch) -> None:
    import deps

    src = tmp_path / "item_old.jpg"
    Image.new("RGB", (1200, 900), (200, 30, 30)).save(src, "JPEG")
    uid = deps.db.create_user("backfill_u", "backfill_u@example.com", "x")
    item_id = deps.db.add_clothing_item(
        user_id=uid, image_path=str(src), category="Shirt", subcategory="Top",
        colors=["Red"], season="All-Season", style="Casual",
    )
    assert not deps.db.get_item(item_id).get("grid_thumbnail_path")

    spec = importlib.util.spec_from_file_location(
        "backfill_grid", REPO / "scripts" / "backfill_grid_thumbnails.py"
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    monkeypatch.setattr(mod, "DatabaseManager", lambda: deps.db)
    monkeypatch.setattr("sys.argv", ["backfill"])

    assert mod.main() == 0
    grid = Path(deps.db.get_item(item_id)["grid_thumbnail_path"])
    assert grid.exists() and grid.suffix == ".webp"
    first_mtime = grid.stat().st_mtime_ns
    assert mod.main() == 0  # idempotent: nothing regenerated
    assert grid.stat().st_mtime_ns == first_mtime
