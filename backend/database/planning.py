"""DatabaseManager methods: Planned outfits (calendar) and reserved items."""

from __future__ import annotations

from datetime import datetime
from typing import Dict
from typing import List
from typing import Optional
import sqlite3


class PlanningMixin:
    def _owned_item_ids(self, cursor, user_id: int, item_ids: List[int]) -> List[int]:

        clean_ids = sorted({int(i) for i in item_ids if int(i) > 0})

        if not clean_ids:

            return []

        placeholders = ",".join("?" for _ in clean_ids)

        cursor.execute(

            f"""

            SELECT id FROM clothing_items

            WHERE user_id = ?

              AND (status IS NULL OR status = 'owned')

              AND id IN ({placeholders})

            """,

            [user_id, *clean_ids],

        )

        owned = {int(row["id"]) for row in cursor.fetchall()}

        return [item_id for item_id in clean_ids if item_id in owned]

    def _planned_item_refs(self, cursor, plan_id: int) -> List[Dict]:

        cursor.execute(

            """

            SELECT ci.id, ci.category, ci.subcategory, ci.thumbnail_path, ci.image_path,

                   ci.washed, ci.physical_location, ci.packed_for_trip, ci.lent_to,

                   ci.is_bulk, ci.quantity, ci.clean_count

            FROM planned_outfit_items poi

            JOIN clothing_items ci ON ci.id = poi.item_id

            WHERE poi.plan_id = ?

            ORDER BY ci.subcategory, ci.category, ci.id

            """,

            (plan_id,),

        )

        items = []

        for row in cursor.fetchall():

            item = dict(row)

            item["washed"] = bool(item.get("washed"))

            item["packed_for_trip"] = bool(item.get("packed_for_trip"))

            item["is_bulk"] = bool(item.get("is_bulk"))

            item["quantity"] = int(item.get("quantity") or 1)

            item["clean_count"] = int(item.get("clean_count") or item["quantity"])

            items.append(item)

        return items

    def _planned_outfit_conflicts(

        self, cursor, user_id: int, plan_id: int, planned_for: str, items: List[Dict]

    ) -> List[Dict]:

        conflicts: List[Dict] = []

        for item in items:

            item_id = int(item["id"])

            if not item.get("washed") or item.get("physical_location") in {"laundry", "needs_wash"}:

                conflicts.append({

                    "item_id": item_id,

                    "kind": "laundry",

                    "message": f"{item['subcategory']} needs laundry before this plan.",

                })

            if item.get("lent_to"):

                conflicts.append({

                    "item_id": item_id,

                    "kind": "lent",

                    "message": f"{item['subcategory']} is lent to {item['lent_to']}.",

                })

            if item.get("packed_for_trip"):

                conflicts.append({

                    "item_id": item_id,

                    "kind": "packed",

                    "message": f"{item['subcategory']} is currently in the travel bag.",

                })

            cursor.execute(

                """

                SELECT po.id, po.title, po.planned_for

                FROM planned_outfits po

                JOIN planned_outfit_items poi ON poi.plan_id = po.id

                WHERE po.user_id = ?

                  AND po.id != ?

                  AND poi.item_id = ?

                  AND po.status IN ('draft', 'confirmed')

                  AND po.planned_for = ?

                ORDER BY po.planned_for ASC

                LIMIT 3

                """,

                (user_id, plan_id, item_id, planned_for),

            )

            for row in cursor.fetchall():

                conflicts.append({

                    "item_id": item_id,

                    "kind": "double_booked",

                    "plan_id": row["id"],

                    "message": f"{item['subcategory']} is also planned for {row['title']}.",

                })

        return conflicts

    def _planned_outfit_dict(self, cursor, row, include_conflicts: bool = True) -> Dict:

        plan = dict(row)

        plan["prep_clean"] = bool(plan.get("prep_clean"))

        plan["prep_packed"] = bool(plan.get("prep_packed"))

        plan["prep_steamed"] = bool(plan.get("prep_steamed"))

        plan["prep_accessories"] = bool(plan.get("prep_accessories"))

        items = self._planned_item_refs(cursor, int(plan["id"]))

        plan["items"] = items

        plan["item_ids"] = [int(item["id"]) for item in items]

        plan["conflicts"] = (

            self._planned_outfit_conflicts(

                cursor,

                int(plan["user_id"]),

                int(plan["id"]),

                str(plan["planned_for"]),

                items,

            )

            if include_conflicts

            else []

        )

        return plan

    def list_planned_outfits(self, user_id: int, include_past: bool = True) -> List[Dict]:

        conn = self.get_connection()

        cursor = conn.cursor()

        query = "SELECT * FROM planned_outfits WHERE user_id = ?"

        params: List = [user_id]

        if not include_past:

            query += " AND planned_for >= date('now')"

        query += """

            ORDER BY

              CASE WHEN planned_for >= date('now') THEN 0 ELSE 1 END,

              planned_for ASC,

              created_at DESC

        """

        cursor.execute(query, params)

        plans = [self._planned_outfit_dict(cursor, row) for row in cursor.fetchall()]

        conn.close()

        return plans

    def get_planned_outfit(self, user_id: int, plan_id: int) -> Optional[Dict]:

        conn = self.get_connection()

        cursor = conn.cursor()

        cursor.execute(

            "SELECT * FROM planned_outfits WHERE id = ? AND user_id = ?",

            (plan_id, user_id),

        )

        row = cursor.fetchone()

        plan = self._planned_outfit_dict(cursor, row) if row else None

        conn.close()

        return plan

    def create_planned_outfit(

        self,

        user_id: int,

        *,

        title: str,

        planned_for: str,

        occasion: Optional[str] = None,

        notes: Optional[str] = None,

        status: str = "draft",

        item_ids: Optional[List[int]] = None,

    ) -> Optional[Dict]:

        conn = self.get_connection()

        cursor = conn.cursor()

        owned_ids = self._owned_item_ids(cursor, user_id, item_ids or [])

        try:

            cursor.execute(

                """

                INSERT INTO planned_outfits (

                    user_id, title, planned_for, occasion, notes, status

                )

                VALUES (?, ?, ?, ?, ?, ?)

                """,

                (user_id, title.strip(), planned_for, occasion, notes, status),

            )

            plan_id = int(cursor.lastrowid)

            for item_id in owned_ids:

                cursor.execute(

                    "INSERT OR IGNORE INTO planned_outfit_items (plan_id, item_id) VALUES (?, ?)",

                    (plan_id, item_id),

                )

            conn.commit()

        except sqlite3.Error:

            conn.rollback()

            conn.close()

            return None

        cursor.execute("SELECT * FROM planned_outfits WHERE id = ?", (plan_id,))

        row = cursor.fetchone()

        plan = self._planned_outfit_dict(cursor, row) if row else None

        conn.close()

        return plan

    def update_planned_outfit(

        self,

        user_id: int,

        plan_id: int,

        *,

        fields: Dict,

        item_ids: Optional[List[int]] = None,

    ) -> Optional[Dict]:

        allowed = {

            "title",

            "planned_for",

            "occasion",

            "notes",

            "status",

            "prep_clean",

            "prep_packed",

            "prep_steamed",

            "prep_accessories",

        }

        clean: Dict = {}

        for key, value in fields.items():

            if key not in allowed:

                continue

            if key.startswith("prep_"):

                clean[key] = 1 if bool(value) else 0

            elif isinstance(value, str):

                clean[key] = value.strip() or None

            else:

                clean[key] = value



        conn = self.get_connection()

        cursor = conn.cursor()

        cursor.execute(

            "SELECT id FROM planned_outfits WHERE id = ? AND user_id = ?",

            (plan_id, user_id),

        )

        if not cursor.fetchone():

            conn.close()

            return None



        try:

            if clean:

                clean["updated_at"] = datetime.now().isoformat(timespec="seconds")

                assignments = ", ".join(f"{col} = ?" for col in clean.keys())

                cursor.execute(

                    f"UPDATE planned_outfits SET {assignments} WHERE id = ? AND user_id = ?",

                    [*clean.values(), plan_id, user_id],

                )

            if item_ids is not None:

                owned_ids = self._owned_item_ids(cursor, user_id, item_ids)

                cursor.execute("DELETE FROM planned_outfit_items WHERE plan_id = ?", (plan_id,))

                for item_id in owned_ids:

                    cursor.execute(

                        "INSERT OR IGNORE INTO planned_outfit_items (plan_id, item_id) VALUES (?, ?)",

                        (plan_id, item_id),

                    )

            conn.commit()

        except sqlite3.Error:

            conn.rollback()

            conn.close()

            return None



        cursor.execute(

            "SELECT * FROM planned_outfits WHERE id = ? AND user_id = ?",

            (plan_id, user_id),

        )

        row = cursor.fetchone()

        plan = self._planned_outfit_dict(cursor, row) if row else None

        conn.close()

        return plan

    def delete_planned_outfit(self, user_id: int, plan_id: int) -> bool:

        conn = self.get_connection()

        cursor = conn.cursor()

        cursor.execute(

            "DELETE FROM planned_outfits WHERE id = ? AND user_id = ?",

            (plan_id, user_id),

        )

        success = cursor.rowcount > 0

        conn.commit()

        conn.close()

        return success

    def get_reserved_item_ids(self, user_id: int) -> set:

        conn = self.get_connection()

        cursor = conn.cursor()

        cursor.execute(

            """

            SELECT DISTINCT poi.item_id

            FROM planned_outfits po

            JOIN planned_outfit_items poi ON poi.plan_id = po.id

            WHERE po.user_id = ?

              AND po.status = 'confirmed'

              AND po.planned_for >= date('now')

            """,

            (user_id,),

        )

        ids = {int(row["item_id"]) for row in cursor.fetchall()}

        conn.close()

        return ids

    def get_ai_stylist_planning_context(

        self, user_id: int, days_ahead: int = 7

    ) -> List[Dict]:

        conn = self.get_connection()

        cursor = conn.cursor()

        cursor.execute(

            """

            SELECT *

            FROM planned_outfits

            WHERE user_id = ?

              AND status IN ('draft', 'confirmed')

              AND planned_for BETWEEN date('now') AND date('now', ?)

            ORDER BY planned_for ASC, created_at DESC

            LIMIT 12

            """,

            (user_id, f"+{max(1, min(int(days_ahead), 30))} days"),

        )

        plans = [

            self._planned_outfit_dict(cursor, row, include_conflicts=False)

            for row in cursor.fetchall()

        ]

        conn.close()

        return plans
