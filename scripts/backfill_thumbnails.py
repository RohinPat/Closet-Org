"""Backfill background-removed thumbnails for existing clothing items.

Walks every row in `clothing_items` where `thumbnail_path` is NULL or points
to a missing file, generates a cutout PNG next to the original via rembg,
and updates the row. Idempotent — re-running only processes items that still
need a thumbnail.

Run from the repo root:

    python scripts/backfill_thumbnails.py [--limit N] [--force]

`--force` regenerates thumbnails even if they already exist on disk.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Make `backend/` importable when invoked as a script.
REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "backend"))

from database.db_manager import DatabaseManager  # noqa: E402
from models.clothing_classifier import generate_cutout_thumbnail  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=0, help="Stop after N items (0 = no limit)")
    parser.add_argument("--force", action="store_true", help="Regenerate even if PNG exists")
    args = parser.parse_args()

    db = DatabaseManager()
    conn = db.get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, image_path, thumbnail_path FROM clothing_items ORDER BY id"
    )
    rows = cursor.fetchall()
    conn.close()

    processed = 0
    succeeded = 0
    skipped = 0
    failed = 0

    for row in rows:
        if args.limit and processed >= args.limit:
            break

        item_id = row["id"]
        image_path = row["image_path"]
        existing_thumb = row["thumbnail_path"]

        if not image_path or not Path(image_path).exists():
            print(f"[{item_id}] SKIP — source image missing: {image_path}")
            skipped += 1
            continue

        target = Path(image_path).with_name(Path(image_path).stem + ".thumb.png")

        if not args.force and existing_thumb and Path(existing_thumb).exists():
            skipped += 1
            continue

        processed += 1
        print(f"[{item_id}] generating thumbnail -> {target.name} ...", end=" ", flush=True)
        ok = generate_cutout_thumbnail(image_path, str(target))
        if ok:
            db.set_thumbnail_path(item_id, str(target))
            print("ok")
            succeeded += 1
        else:
            print("FAILED")
            failed += 1

    print(
        f"\nDone. processed={processed} succeeded={succeeded} "
        f"failed={failed} skipped={skipped}"
    )
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
