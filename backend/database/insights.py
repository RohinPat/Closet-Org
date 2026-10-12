"""DatabaseManager methods: Stats, recommendation history, stylist feedback, freshness and neglect."""

from __future__ import annotations

from datetime import datetime
from typing import Dict
from typing import List
from typing import Optional
import json


class InsightsMixin:
    

    def get_statistics(self, user_id: int) -> Dict:

        """Get closet statistics for a specific user"""

        conn = self.get_connection()

        cursor = conn.cursor()

        

        # All counts here exclude wishlist items.

        owned_filter = "user_id = ? AND (status IS NULL OR status = 'owned')"



        # Total items

        cursor.execute(

            f"SELECT COUNT(*) as total FROM clothing_items WHERE {owned_filter}",

            (user_id,),

        )

        total = cursor.fetchone()["total"]



        # Items by category

        cursor.execute(f"""

            SELECT subcategory, COUNT(*) as count

            FROM clothing_items

            WHERE {owned_filter}

            GROUP BY subcategory

        """, (user_id,))

        by_category = {row["subcategory"]: row["count"] for row in cursor.fetchall()}



        # Dirty items

        cursor.execute(

            f"SELECT COUNT(*) as dirty FROM clothing_items WHERE {owned_filter} AND washed = 0",

            (user_id,),

        )

        dirty = cursor.fetchone()["dirty"]



        # Most worn items

        cursor.execute(f"""

            SELECT id, category, times_worn

            FROM clothing_items

            WHERE {owned_filter}

            ORDER BY times_worn DESC

            LIMIT 5

        """, (user_id,))

        most_worn = [dict(row) for row in cursor.fetchall()]



        # Recently added

        cursor.execute(f"""

            SELECT COUNT(*) as recent

            FROM clothing_items

            WHERE {owned_filter} AND date_added >= datetime('now', '-7 days')

        """, (user_id,))

        recent = cursor.fetchone()["recent"]



        best_cpw: List[Dict] = []

        cursor.execute(

            f"""

            SELECT id, category, subcategory, times_worn, purchase_price,

                   thumbnail_path, image_path,

                   (purchase_price * 1.0 / times_worn) AS cpw

            FROM clothing_items

            WHERE {owned_filter}

              AND times_worn > 0

              AND purchase_price IS NOT NULL

              AND purchase_price > 0

            ORDER BY cpw ASC

            LIMIT 5

            """,

            (user_id,),

        )

        for row in cursor.fetchall():

            d = dict(row)

            cpw_val = d.pop("cpw", None)

            d["cost_per_wear"] = round(float(cpw_val), 2) if cpw_val is not None else None

            best_cpw.append(d)



        conn.close()



        return {

            "total_items": total,

            "by_category": by_category,

            "dirty_items": dirty,

            "clean_items": total - dirty,

            "most_worn": most_worn,

            "recently_added": recent,

            "best_cpw": best_cpw,

        }

    def get_recent_outfit_signatures(

        self, user_id: int, days: int = 14, limit: int = 100

    ) -> set:

        conn = self.get_connection()

        cursor = conn.cursor()

        cursor.execute(

            f"""

            SELECT item_signature FROM outfit_suggestion_history

            WHERE user_id = ? AND created_at >= datetime('now', '-{int(days)} days')

            ORDER BY created_at DESC

            LIMIT ?

            """,

            (user_id, limit),

        )

        sigs = {row["item_signature"] for row in cursor.fetchall()}

        conn.close()

        return sigs

    def log_outfit_recommendations(self, user_id: int, outfits: List[Dict]) -> None:

        if not outfits:

            return

        conn = self.get_connection()

        cursor = conn.cursor()

        cursor.execute(

            """

            DELETE FROM outfit_suggestion_history

            WHERE user_id = ? AND created_at < datetime('now', '-90 days')

            """,

            (user_id,),

        )

        for o in outfits:

            items = o.get("items") or []

            if not items:

                continue

            sig = ",".join(

                str(i["id"]) for i in sorted(items, key=lambda x: int(x["id"]))

            )

            cursor.execute(

                """

                INSERT INTO outfit_suggestion_history (user_id, item_signature)

                VALUES (?, ?)

                """,

                (user_id, sig),

            )

        conn.commit()

        conn.close()

    def record_ai_stylist_feedback(

        self,

        user_id: int,

        *,

        item_signature: str,

        useful: bool,

        message: Optional[str] = None,

    ) -> None:

        conn = self.get_connection()

        cursor = conn.cursor()

        cursor.execute(

            """

            INSERT INTO ai_stylist_feedback (

                user_id, item_signature, useful, message

            )

            VALUES (?, ?, ?, ?)

            """,

            (user_id, item_signature, 1 if useful else 0, message),

        )

        conn.commit()

        conn.close()

    def get_ai_stylist_feedback_summary(

        self, user_id: int, days: int = 90, limit: int = 200

    ) -> Dict:

        conn = self.get_connection()

        cursor = conn.cursor()

        cursor.execute(

            f"""

            SELECT item_signature, useful

            FROM ai_stylist_feedback

            WHERE user_id = ? AND created_at >= datetime('now', '-{int(days)} days')

            ORDER BY created_at DESC

            LIMIT ?

            """,

            (user_id, limit),

        )

        liked_signatures = set()

        disliked_signatures = set()

        liked_item_ids = set()

        disliked_item_ids = set()

        for row in cursor.fetchall():

            signature = str(row["item_signature"] or "")

            useful = bool(row["useful"])

            if useful:

                liked_signatures.add(signature)

            else:

                disliked_signatures.add(signature)

            target = liked_item_ids if useful else disliked_item_ids

            for part in signature.split(","):

                try:

                    target.add(int(part))

                except ValueError:

                    continue

        conn.close()

        return {

            "liked_signatures": liked_signatures,

            "disliked_signatures": disliked_signatures,

            "liked_item_ids": liked_item_ids,

            "disliked_item_ids": disliked_item_ids,

        }

    

    def _calculate_rotation_category(self, times_worn: int, days_owned: int) -> str:

        """Calculate rotation category based on wear frequency"""

        if days_owned == 0:

            return "new"

        

        wear_rate = times_worn / max(days_owned / 30, 1)  # wears per month

        

        if wear_rate >= 4:

            return "high"

        elif wear_rate >= 2:

            return "medium"

        elif wear_rate >= 0.5:

            return "low"

        else:

            return "neglected"

    

    def _calculate_freshness_score(self, times_worn: int, days_since_worn: Optional[int], 

                                   wear_again_count: int) -> float:

        """Calculate psychological freshness score (0.0 to 1.0)"""

        base_score = 1.0

        

        # Penalty for each wear

        wear_penalty = times_worn * 0.02

        

        # Recovery bonus for time not worn (1% per day up to 30 days)

        if days_since_worn:

            time_recovery = min(days_since_worn * 0.01, 0.30)

        else:

            time_recovery = 0

        

        # Penalty for wear-again without washing

        wear_again_penalty = wear_again_count * 0.10

        

        freshness = base_score - wear_penalty + time_recovery - wear_again_penalty

        return max(0.0, min(1.0, freshness))

    

    def update_freshness_scores(self, user_id: int):

        """Batch update freshness scores for all items"""

        conn = self.get_connection()

        cursor = conn.cursor()

        

        cursor.execute("""

            SELECT id, times_worn, last_worn, wear_again_count 

            FROM clothing_items 

            WHERE user_id = ?

        """, (user_id,))

        

        items = cursor.fetchall()

        

        for item in items:

            days_since_worn = None

            if item["last_worn"]:

                last_worn_date = datetime.fromisoformat(item["last_worn"])

                days_since_worn = (datetime.now() - last_worn_date).days

            

            freshness = self._calculate_freshness_score(

                item["times_worn"],

                days_since_worn,

                item["wear_again_count"]

            )

            

            cursor.execute(

                "UPDATE clothing_items SET freshness_score = ? WHERE id = ?",

                (freshness, item["id"])

            )

        

        conn.commit()

        conn.close()

    

    def get_neglected_items(self, user_id: int, days_threshold: int = 30) -> List[Dict]:

        """Get items that haven't been worn recently"""

        conn = self.get_connection()

        cursor = conn.cursor()

        

        cursor.execute("""

            SELECT * FROM clothing_items

            WHERE user_id = ?

            AND (status IS NULL OR status = 'owned')

            AND (

                (last_worn IS NULL AND date_added <= datetime('now', '-' || ? || ' days'))

                OR last_worn <= datetime('now', '-' || ? || ' days')

            )

            AND rotation_category IN ('low', 'neglected')

            ORDER BY last_worn ASC NULLS FIRST

            LIMIT 20

        """, (user_id, days_threshold, days_threshold))

        

        items = []

        for row in cursor.fetchall():

            item = dict(row)

            item["colors"] = json.loads(item["colors"])

            self._decode_user_tags(item)

            self._decode_image_paths(item)

            items.append(item)



        conn.close()

        return items
