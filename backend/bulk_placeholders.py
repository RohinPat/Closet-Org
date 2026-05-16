"""Simple generated placeholder images for bulk closet rows (socks, underwear, tees).

Created on demand under the repo ``uploads/`` directory so mobile/web grids always
have a thumbnail without requiring the user to snap a reference photo.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

SIZE = 384

_PLACEHOLDER_FILES = {
    "socks": "_bulk_placeholder_socks.png",
    "underwear": "_bulk_placeholder_underwear.png",
    "undershirt": "_bulk_placeholder_undershirt.png",
    "tee": "_bulk_placeholder_tee.png",
    "basic": "_bulk_placeholder_basic.png",
}


def repo_uploads_dir() -> Path:
    """``uploads`` at repository root (matches ``main.UPLOAD_DIR``)."""
    return Path(__file__).resolve().parent.parent / "uploads"


def bulk_placeholder_kind(name: str, subcategory: str) -> str:
    """Pick which illustration fits this bulk row."""
    t = f"{name} {subcategory}".lower()
    if "sock" in t:
        return "socks"
    if any(k in t for k in ("underwear", "boxer", "brief", "panty", "boxers")):
        return "underwear"
    if "undershirt" in t or "tank" in t:
        return "undershirt"
    if any(k in t for k in ("tee", "t-shirt", "tshirt", "basic tee", "plain tee")):
        return "tee"
    if subcategory.strip().lower() == "footwear":
        return "socks"
    return "basic"


def _draw_socks(draw: ImageDraw.ImageDraw, w: int, h: int) -> None:
    bg = "#e6e7ea"
    tube = "#fbfbfb"
    cuff = "#ececee"
    draw.rectangle([0, 0, w, h], fill=bg)
    centers = [(w * 0.28, h * 0.42), (w * 0.5, h * 0.38), (w * 0.72, h * 0.42)]
    for cx, cy in centers:
        # Foot + ankle tube
        draw.rounded_rectangle(
            [cx - 38, cy + 10, cx + 38, cy + h * 0.42],
            radius=18,
            fill=tube,
            outline="#dcdde2",
            width=2,
        )
        draw.rounded_rectangle(
            [cx - 34, cy - h * 0.18, cx + 34, cy + 22],
            radius=14,
            fill=cuff,
            outline="#dcdde2",
            width=2,
        )


def _draw_underwear(draw: ImageDraw.ImageDraw, w: int, h: int) -> None:
    bg = "#e8e9ec"
    fill = "#fdfdfd"
    draw.rectangle([0, 0, w, h], fill=bg)
    mid_x, mid_y = w // 2, h // 2
    # Brief silhouette
    draw.polygon(
        [
            (mid_x - w * 0.28, mid_y - h * 0.12),
            (mid_x + w * 0.28, mid_y - h * 0.12),
            (mid_x + w * 0.22, mid_y + h * 0.22),
            (mid_x, mid_y + h * 0.08),
            (mid_x - w * 0.22, mid_y + h * 0.22),
        ],
        fill=fill,
        outline="#cfd0d6",
        width=2,
    )


def _draw_tee(draw: ImageDraw.ImageDraw, w: int, h: int, fitted: bool) -> None:
    bg = "#e6e7ea"
    shirt = "#fcfcfd"
    draw.rectangle([0, 0, w, h], fill=bg)
    cx = w // 2
    cy = h * 0.42
    bw = w * (0.42 if fitted else 0.48)
    body_h = h * 0.38
    # Torso
    draw.rounded_rectangle(
        [cx - bw / 2, cy - body_h * 0.15, cx + bw / 2, cy + body_h],
        radius=22,
        fill=shirt,
        outline="#d6d7dd",
        width=2,
    )
    # Sleeves
    arm_y = cy - body_h * 0.05
    draw.rounded_rectangle(
        [cx - bw * 0.95, arm_y, cx - bw * 0.42, cy + body_h * 0.35],
        radius=14,
        fill=shirt,
        outline="#d6d7dd",
        width=2,
    )
    draw.rounded_rectangle(
        [cx + bw * 0.42, arm_y, cx + bw * 0.95, cy + body_h * 0.35],
        radius=14,
        fill=shirt,
        outline="#d6d7dd",
        width=2,
    )
    # Neck
    neck_w = bw * 0.28
    draw.rounded_rectangle(
        [cx - neck_w / 2, cy - body_h * 0.28, cx + neck_w / 2, cy],
        radius=10,
        fill=bg,
        outline="#d6d7dd",
        width=2,
    )


def _draw_basic(draw: ImageDraw.ImageDraw, w: int, h: int) -> None:
    bg = "#e5e6e9"
    fold = "#fafafa"
    draw.rectangle([0, 0, w, h], fill=bg)
    inset = int(min(w, h) * 0.14)
    draw.rounded_rectangle(
        [inset, inset + 20, w - inset, h - inset - 10],
        radius=24,
        fill=fold,
        outline="#cfd0d6",
        width=2,
    )
    draw.line([inset + 30, h // 2 + 10, w - inset - 30, h // 2 + 10], fill="#e0e1e6", width=3)


_GENERATORS = {
    "socks": _draw_socks,
    "underwear": _draw_underwear,
    "undershirt": lambda d, w, h: _draw_tee(d, w, h, fitted=True),
    "tee": lambda d, w, h: _draw_tee(d, w, h, fitted=False),
    "basic": _draw_basic,
}


def _write_placeholder_png(kind: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    img = Image.new("RGB", (SIZE, SIZE), "#e8e8e8")
    draw = ImageDraw.Draw(img)
    fn = _GENERATORS.get(kind, _draw_basic)
    fn(draw, SIZE, SIZE)
    img.save(dest, format="PNG")


def ensure_bulk_placeholder_file(upload_dir: Path, kind: str) -> Path:
    """Ensure ``kind`` placeholder PNG exists; return its path."""
    fname = _PLACEHOLDER_FILES.get(kind, _PLACEHOLDER_FILES["basic"])
    path = upload_dir / fname
    if not path.is_file():
        _write_placeholder_png(kind, path)
    return path


def bulk_placeholder_paths(upload_dir: Path, name: str, subcategory: str) -> tuple[str, str]:
    """Absolute paths for primary image + thumbnail (same file for placeholders)."""
    kind = bulk_placeholder_kind(name, subcategory)
    path = ensure_bulk_placeholder_file(upload_dir, kind)
    s = str(path)
    return s, s
