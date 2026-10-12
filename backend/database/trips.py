"""DatabaseManager methods: Trips and packing."""

from __future__ import annotations

from datetime import datetime
from typing import Dict
from typing import List
from typing import Optional
import json


class TripsMixin:
    def _trip_dict(self, cursor, row) -> Dict:
        trip = dict(row)
        try:
            trip["activities"] = json.loads(trip.get("activities") or "[]")
        except (TypeError, json.JSONDecodeError):
            trip["activities"] = []
        cursor.execute(
            """
            SELECT tpi.item_id, tpi.packed, tpi.packed_at, ci.category, ci.subcategory,
                   ci.thumbnail_path, ci.image_path, ci.colors
            FROM trip_packed_items tpi
            JOIN clothing_items ci ON ci.id = tpi.item_id
            WHERE tpi.trip_id = ?
            ORDER BY ci.subcategory, ci.category, ci.id
            """,
            (trip["id"],),
        )
        items = []
        packed_count = 0
        for irow in cursor.fetchall():
            item = dict(irow)
            item["packed"] = bool(item.get("packed"))
            if item["packed"]:
                packed_count += 1
            try:
                item["colors"] = json.loads(item.get("colors") or "[]")
            except (TypeError, json.JSONDecodeError):
                item["colors"] = []
            items.append(item)
        trip["items"] = items
        trip["packed_count"] = packed_count
        trip["item_count"] = len(items)
        trip["progress"] = round(packed_count / len(items), 3) if items else 0
        return trip

    def create_trip(
        self,
        user_id: int,
        *,
        name: str,
        destination: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        activities: Optional[List[str]] = None,
        item_ids: Optional[List[int]] = None,
    ) -> Dict:
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO trips (user_id, name, destination, start_date, end_date, activities)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (user_id, name, destination, start_date, end_date, json.dumps(activities or [])),
        )
        trip_id = cursor.lastrowid
        for item_id in self._owned_item_ids(cursor, user_id, item_ids or []):
            cursor.execute(
                "INSERT OR IGNORE INTO trip_packed_items (trip_id, item_id) VALUES (?, ?)",
                (trip_id, item_id),
            )
        conn.commit()
        cursor.execute("SELECT * FROM trips WHERE id = ?", (trip_id,))
        trip = self._trip_dict(cursor, cursor.fetchone())
        conn.close()
        return trip

    def list_trips(self, user_id: int) -> List[Dict]:
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT * FROM trips
            WHERE user_id = ?
            ORDER BY COALESCE(start_date, created_at) DESC, id DESC
            """,
            (user_id,),
        )
        trips = [self._trip_dict(cursor, row) for row in cursor.fetchall()]
        conn.close()
        return trips

    def get_trip(self, user_id: int, trip_id: int) -> Optional[Dict]:
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM trips WHERE id = ? AND user_id = ?", (trip_id, user_id))
        row = cursor.fetchone()
        trip = self._trip_dict(cursor, row) if row else None
        conn.close()
        return trip

    def update_trip(
        self,
        user_id: int,
        trip_id: int,
        *,
        fields: Dict,
        item_ids: Optional[List[int]] = None,
    ) -> Optional[Dict]:
        allowed = {"name", "destination", "start_date", "end_date", "activities"}
        clean = {k: v for k, v in fields.items() if k in allowed}
        if "activities" in clean:
            clean["activities"] = json.dumps(clean["activities"] or [])
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM trips WHERE id = ? AND user_id = ?", (trip_id, user_id))
        if not cursor.fetchone():
            conn.close()
            return None
        if clean:
            clean["updated_at"] = datetime.now().isoformat(timespec="seconds")
            assignments = ", ".join(f"{col} = ?" for col in clean)
            cursor.execute(
                f"UPDATE trips SET {assignments} WHERE id = ? AND user_id = ?",
                [*clean.values(), trip_id, user_id],
            )
        if item_ids is not None:
            owned = self._owned_item_ids(cursor, user_id, item_ids)
            cursor.execute("DELETE FROM trip_packed_items WHERE trip_id = ?", (trip_id,))
            for item_id in owned:
                cursor.execute(
                    "INSERT OR IGNORE INTO trip_packed_items (trip_id, item_id) VALUES (?, ?)",
                    (trip_id, item_id),
                )
        conn.commit()
        cursor.execute("SELECT * FROM trips WHERE id = ? AND user_id = ?", (trip_id, user_id))
        trip = self._trip_dict(cursor, cursor.fetchone())
        conn.close()
        return trip

    def set_trip_item_packed(
        self, user_id: int, trip_id: int, item_id: int, packed: bool
    ) -> Optional[Dict]:
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM trips WHERE id = ? AND user_id = ?", (trip_id, user_id))
        if not cursor.fetchone() or item_id not in self._owned_item_ids(cursor, user_id, [item_id]):
            conn.close()
            return None
        cursor.execute(
            """
            INSERT INTO trip_packed_items (trip_id, item_id, packed, packed_at)
            VALUES (?, ?, ?, CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE NULL END)
            ON CONFLICT(trip_id, item_id) DO UPDATE SET
                packed = excluded.packed,
                packed_at = excluded.packed_at
            """,
            (trip_id, item_id, 1 if packed else 0, 1 if packed else 0),
        )
        cursor.execute(
            "UPDATE clothing_items SET packed_for_trip = ? WHERE id = ? AND user_id = ?",
            (1 if packed else 0, item_id, user_id),
        )
        conn.commit()
        cursor.execute("SELECT * FROM trips WHERE id = ? AND user_id = ?", (trip_id, user_id))
        trip = self._trip_dict(cursor, cursor.fetchone())
        conn.close()
        return trip

    def auto_unpack_expired_trips(self, user_id: int) -> int:
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id FROM trips
            WHERE user_id = ?
              AND end_date IS NOT NULL
              AND date(end_date) < date('now')
              AND auto_unpacked_at IS NULL
            """,
            (user_id,),
        )
        trip_ids = [int(row["id"]) for row in cursor.fetchall()]
        if not trip_ids:
            conn.close()
            return 0
        placeholders = ",".join("?" for _ in trip_ids)
        cursor.execute(
            f"""
            UPDATE clothing_items
            SET packed_for_trip = 0
            WHERE user_id = ?
              AND id IN (
                SELECT item_id FROM trip_packed_items WHERE trip_id IN ({placeholders})
              )
            """,
            [user_id, *trip_ids],
        )
        updated = cursor.rowcount
        cursor.execute(
            f"UPDATE trips SET auto_unpacked_at = CURRENT_TIMESTAMP WHERE id IN ({placeholders})",
            trip_ids,
        )
        conn.commit()
        conn.close()
        return updated
