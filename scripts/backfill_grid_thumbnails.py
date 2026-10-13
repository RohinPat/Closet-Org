"""Create small WebP grid thumbnails for items that don't have one yet.

Source is the cutout thumbnail when present, else the original photo. Safe to
re-run: only items without a grid thumbnail on disk are processed. Run by
scripts/deploy_prod.sh on every deploy; manual use:

    python scripts/backfill_grid_thumbnails.py [--limit N]
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "backend"))

from database.db_manager import DatabaseManager  # noqa: E402
from images import make_grid_thumbnail  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=0, help="Stop after N items (0 = all)")
    args = parser.parse_args()

    db = DatabaseManager()
    conn = db.get_connection()
    try:
        rows = conn.execute(
            "SELECT id, image_path, thumbnail_path, grid_thumbnail_path FROM clothing_items ORDER BY id"
        ).fetchall()
    finally:
        conn.close()

    made = skipped = failed = 0
    for row in rows:
        if args.limit and made >= args.limit:
            break
        existing = row["grid_thumbnail_path"]
        if existing and Path(existing).exists():
            skipped += 1
            continue
        source = next(
            (p for p in (row["thumbnail_path"], row["image_path"]) if p and Path(p).exists()),
            None,
        )
        if source is None:
            skipped += 1
            continue
        grid = make_grid_thumbnail(source)
        if grid:
            db.set_grid_thumbnail_path(row["id"], str(grid))
            made += 1
        else:
            failed += 1

    print(f"grid thumbnails: created={made} skipped={skipped} failed={failed}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
