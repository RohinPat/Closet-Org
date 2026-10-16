"""DatabaseManager methods: whole-outfit wear log ("I'm wearing this today").

Per-item wear tracking (times_worn, last_worn, wear_history, laundry) still
happens through update_item_status. This table records the outfit as a unit
so the recommender can avoid re-suggesting it and the Today screen can show
what's already been picked today.
"""

from __future__ import annotations

import json
from typing import Dict, List, Optional


class WearsMixin:
    def log_outfit_wear(self, user_id: int, item_ids: List[int], occasion: Optional[str]) -> int:
        ids = sorted({int(i) for i in item_ids})
        conn = self.get_connection()
        try:
            cur = conn.execute(
                "INSERT INTO outfit_wears (user_id, item_ids, occasion) VALUES (?, ?, ?)",
                (user_id, json.dumps(ids), occasion),
            )
            conn.commit()
            return int(cur.lastrowid)
        finally:
            conn.close()

    def get_todays_outfit_wear(self, user_id: int) -> Optional[Dict]:
        """Most recent outfit logged today (UTC day), with its items."""
        conn = self.get_connection()
        try:
            row = conn.execute(
                "SELECT id, item_ids, occasion, worn_at FROM outfit_wears "
                "WHERE user_id = ? AND worn_at >= date('now') "
                "ORDER BY worn_at DESC, id DESC LIMIT 1",
                (user_id,),
            ).fetchone()
        finally:
            conn.close()
        if row is None:
            return None
        items = []
        for item_id in json.loads(row["item_ids"] or "[]"):
            item = self.get_item(int(item_id))
            if item and item.get("user_id") == user_id:
                item.pop("clip_embedding", None)
                items.append(item)
        return {"id": row["id"], "occasion": row["occasion"], "worn_at": row["worn_at"], "items": items}

    def get_logged_outfit_signatures(self, user_id: int, days: int = 180) -> set:
        conn = self.get_connection()
        try:
            rows = conn.execute(
                "SELECT item_ids FROM outfit_wears WHERE user_id = ? "
                "AND worn_at >= datetime('now', ?)",
                (user_id, f"-{int(days)} days"),
            ).fetchall()
        finally:
            conn.close()
        sigs = set()
        for row in rows:
            try:
                ids = sorted(int(x) for x in json.loads(row["item_ids"] or "[]"))
            except (TypeError, ValueError):
                continue
            if ids:
                sigs.add(",".join(str(i) for i in ids))
        return sigs
