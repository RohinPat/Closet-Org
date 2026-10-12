"""DatabaseManager methods: Laundry queue."""

from __future__ import annotations

from typing import Dict
import json
import sqlite3


class LaundryMixin:
    def add_to_laundry_queue(self, item_id: int, priority: str = "normal") -> int:

        """Add item to laundry queue. Returns ``-2`` if the item is a bulk SKU."""

        conn = self.get_connection()

        cursor = conn.cursor()



        cursor.execute(

            "SELECT COALESCE(is_bulk, 0) AS b FROM clothing_items WHERE id = ?",

            (item_id,),

        )

        chk = cursor.fetchone()

        if not chk:

            conn.close()

            return 0

        if chk["b"]:

            conn.close()

            return -2



        # Check if already in queue

        cursor.execute("""

            SELECT id FROM laundry_queue 

            WHERE item_id = ? AND status != 'ready'

        """, (item_id,))

        

        if cursor.fetchone():

            conn.close()

            return -1  # Already in queue

        

        cursor.execute("""

            INSERT INTO laundry_queue (item_id, priority)

            VALUES (?, ?)

        """, (item_id, priority))

        

        queue_id = cursor.lastrowid

        

        # Update item status

        cursor.execute("""

            UPDATE clothing_items 

            SET washed = 0, physical_location = 'laundry' 

            WHERE id = ?

        """, (item_id,))

        

        conn.commit()

        conn.close()

        return queue_id

    

    def _sync_laundry_queue_from_item_snapshot(self, cursor: sqlite3.Cursor, item_id: int) -> None:

        """Keep ``laundry_queue`` aligned with ``laundry_state`` for non-bulk owned items.



        Bulk SKUs intentionally skip queue rows (inventory-style laundry).

        """

        cursor.execute(

            """

            SELECT COALESCE(is_bulk, 0) AS is_bulk,

                   COALESCE(TRIM(laundry_state), '') AS ls,

                   washed

            FROM clothing_items WHERE id = ?

            """,

            (item_id,),

        )

        snap = cursor.fetchone()

        if not snap:

            return

        if int(snap["is_bulk"]) != 0:

            return

        raw_ls = str(snap["ls"] or "").strip().lower()

        washed = snap["washed"]

        if washed is None:

            washed = 1

        inferred = raw_ls if raw_ls else ("clean" if washed else "worn")

        if inferred == "clean":

            cursor.execute("DELETE FROM laundry_queue WHERE item_id = ?", (item_id,))

            return

        queue_row_status = {"in_hamper": "queued", "washing": "washing", "drying": "drying", "worn": "queued"}.get(inferred)

        if queue_row_status is None:

            return

        cursor.execute(

            "SELECT id FROM laundry_queue WHERE item_id = ? AND status != 'ready'",

            (item_id,),

        )

        existing = cursor.fetchone()

        if existing:

            cursor.execute(

                "UPDATE laundry_queue SET status = ? WHERE id = ?",

                (queue_row_status, int(existing["id"])),

            )

            return

        cursor.execute(

            "INSERT INTO laundry_queue (item_id, priority, status) VALUES (?, 'normal', ?)",

            (item_id, queue_row_status),

        )

    

    def get_laundry_queue(self, user_id: int) -> Dict:

        """Get laundry queue status"""

        conn = self.get_connection()

        cursor = conn.cursor()

        

        cursor.execute("""

            SELECT lq.*, ci.* 

            FROM laundry_queue lq

            JOIN clothing_items ci ON lq.item_id = ci.id

            WHERE ci.user_id = ?

            ORDER BY 

                CASE lq.priority 

                    WHEN 'urgent' THEN 1 

                    WHEN 'normal' THEN 2 

                    WHEN 'low' THEN 3 

                END,

                lq.added_date ASC

        """, (user_id,))

        

        items = []

        for row in cursor.fetchall():

            item = dict(row)

            item["colors"] = json.loads(item["colors"])

            self._decode_user_tags(item)

            self._decode_image_paths(item)

            self._strip_clip_embedding_public(item)

            items.append(item)



        # Group by status

        queued = [i for i in items if i["status"] == "queued"]

        washing = [i for i in items if i["status"] == "washing"]

        drying = [i for i in items if i["status"] == "drying"]

        

        conn.close()

        

        return {

            "queued": queued,

            "washing": washing,

            "drying": drying,

            "total": len(items)

        }

    def laundry_entry_belongs_to(self, queue_id: int, user_id: int) -> bool:

        """True if the laundry queue entry's item is owned by ``user_id``.



        Without this, a logged-in user could push state changes onto another

        user's laundry pipeline by guessing queue ids.

        """

        conn = self.get_connection()

        cursor = conn.cursor()

        cursor.execute(

            """

            SELECT 1 FROM laundry_queue lq

            JOIN clothing_items ci ON ci.id = lq.item_id

            WHERE lq.id = ? AND ci.user_id = ?

            """,

            (queue_id, user_id),

        )

        row = cursor.fetchone()

        conn.close()

        return row is not None

    def update_laundry_status(self, queue_id: int, status: str) -> bool:

        """Update laundry queue item status"""

        conn = self.get_connection()

        cursor = conn.cursor()



        cursor.execute("""

            UPDATE laundry_queue

            SET status = ?

            WHERE id = ?

        """, (status, queue_id))

        

        # If ready, update clothing item and remove from queue

        if status == "ready":

            cursor.execute("""

                UPDATE clothing_items 

                SET washed = 1, physical_location = 'closet', 

                    wear_again_count = 0, freshness_score = 1.0,

                    laundry_state = 'clean'

                WHERE id = (SELECT item_id FROM laundry_queue WHERE id = ?)

            """, (queue_id,))

            

            cursor.execute("DELETE FROM laundry_queue WHERE id = ?", (queue_id,))

        

        success = cursor.rowcount > 0

        conn.commit()

        conn.close()

        return success
