"""Small grid thumbnails for closet lists.

The cutout thumbnails are 1024px PNGs with alpha (hundreds of KB each), and
grids show them at ~100-200px. A 480px WebP keeps transparency and is
typically 10-30x smaller, which is what a phone on cellular wants for a
closet of a few hundred items. Detail screens keep using the full images.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional, Union

from PIL import Image, ImageOps

logger = logging.getLogger("closet_org.images")

GRID_MAX_PX = 480
GRID_SUFFIX = ".grid.webp"


def grid_thumbnail_path_for(source: Union[str, Path]) -> Path:
    src = Path(source)
    return src.with_name(src.stem + GRID_SUFFIX)


def make_grid_thumbnail(source: Union[str, Path, None]) -> Optional[Path]:
    """Write ``<stem>.grid.webp`` next to ``source``; return its path or None."""
    if not source:
        return None
    src = Path(source)
    dest = grid_thumbnail_path_for(src)
    try:
        with Image.open(src) as im:
            im = ImageOps.exif_transpose(im)
            has_alpha = im.mode in ("RGBA", "LA") or "transparency" in im.info
            im = im.convert("RGBA" if has_alpha else "RGB")
            im.thumbnail((GRID_MAX_PX, GRID_MAX_PX), Image.LANCZOS)
            im.save(dest, "WEBP", quality=80, method=4)
        return dest
    except Exception:
        logger.warning("Grid thumbnail failed for %s", src.name, exc_info=True)
        try:
            dest.unlink(missing_ok=True)
        except OSError:
            pass
        return None
