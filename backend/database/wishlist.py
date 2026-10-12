"""DatabaseManager methods: Wishlist items and promotion into the closet."""

from __future__ import annotations

from datetime import datetime
from typing import Dict
from typing import List
from typing import Optional
import json


class WishlistMixin:
    # Wishlist Methods

    #

    # Wishlist items live in clothing_items with status='wishlist'. They're

    # excluded from closet listings, outfit recommendations, stats, and the

    # neglected-items list. Promoting a wishlist item flips status to 'owned'

    # so it joins the regular closet — no data loss.

    #

    # Photo-less wishlist entries store '' for image_path (NOT NULL constraint)

    # and an empty JSON array for image_paths. The mobile UI shows a placeholder

    # in that case.

    _WISHLIST_INTENTS = {"want", "gift", "saving", "sale_watch"}

    _EDITABLE_WISHLIST_FIELDS = {

        "wishlist_name",

        "wishlist_intent",

        "wishlist_url",

        "brand",

        "size",

        "notes",

        "purchase_price",

    }

    def add_wishlist_item(

        self,

        user_id: int,

        name: str,

        category: str = "Other",

        subcategory: str = "Wishlist",

        intent: Optional[str] = None,

        price: Optional[float] = None,

        url: Optional[str] = None,

        image_path: Optional[str] = None,

        thumbnail_path: Optional[str] = None,

        colors: Optional[List[str]] = None,

    ) -> int:

        """Insert a wishlist entry. Photo is optional — pass image_path=None

        for a metadata-only row. `intent` must be one of _WISHLIST_INTENTS

        (validated at the endpoint) or None.

        """

        if not name or not name.strip():

            raise ValueError("name required")



        conn = self.get_connection()

        cursor = conn.cursor()



        img = image_path or ""

        imgs_json = json.dumps([image_path] if image_path else [])

        thumbs_json = json.dumps([thumbnail_path] if image_path else [])

        colors_json = json.dumps(colors or [])



        cursor.execute(

            """

            INSERT INTO clothing_items

            (user_id, image_path, thumbnail_path, image_paths, thumbnail_paths,

             category, subcategory, colors, season, style,

             purchase_price, status, wishlist_name, wishlist_intent, wishlist_url)

            VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, 'wishlist', ?, ?, ?)

            """,

            (

                user_id, img, thumbnail_path, imgs_json, thumbs_json,

                category, subcategory, colors_json,

                price, name.strip(), intent, url,

            ),

        )

        item_id = cursor.lastrowid

        conn.commit()

        conn.close()

        return item_id

    def get_wishlist_items(self, user_id: int) -> List[Dict]:

        """List all wishlist entries for a user, newest first."""

        conn = self.get_connection()

        cursor = conn.cursor()



        cursor.execute(

            """

            SELECT * FROM clothing_items

            WHERE user_id = ? AND status = 'wishlist'

            ORDER BY date_added DESC

            """,

            (user_id,),

        )

        rows = cursor.fetchall()



        items: List[Dict] = []

        for row in rows:

            item = dict(row)

            item["colors"] = json.loads(item["colors"]) if item.get("colors") else []

            self._decode_user_tags(item)

            item["worn"] = bool(item["worn"])

            item["washed"] = bool(item["washed"])

            item["is_favorite"] = bool(item.get("is_favorite", False))

            self._decode_image_paths(item)

            self._strip_clip_embedding_public(item)

            items.append(item)



        conn.close()

        return items

    def promote_wishlist_item(self, item_id: int, user_id: int) -> bool:

        """Convert a wishlist entry into an owned item.



        Clears wishlist-only fields so the row looks like a normal closet

        entry. Returns False if the item isn't the caller's or isn't on the

        wishlist.

        """

        conn = self.get_connection()

        cursor = conn.cursor()



        cursor.execute(

            "SELECT user_id, status FROM clothing_items WHERE id = ?",

            (item_id,),

        )

        row = cursor.fetchone()

        if not row or row["user_id"] != user_id or row["status"] != "wishlist":

            conn.close()

            return False



        cursor.execute(

            """

            UPDATE clothing_items

            SET status = 'owned',

                wishlist_intent = NULL,

                wishlist_url = NULL,

                wishlist_name = NULL,

                date_added = ?

            WHERE id = ?

            """,

            (datetime.now().isoformat(), item_id),

        )

        success = cursor.rowcount > 0

        conn.commit()

        conn.close()

        return success

    def update_wishlist_item(self, item_id: int, user_id: int, **fields) -> bool:

        """Patch wishlist-editable fields. Reuses the existing update path

        when the field is a regular detail; handles wishlist-specific ones

        (wishlist_name/intent/url) directly.

        """

        clean: Dict = {}

        for key, value in fields.items():

            if key not in self._EDITABLE_WISHLIST_FIELDS:

                continue

            if isinstance(value, str) and value.strip() == "":

                clean[key] = None

            else:

                clean[key] = value

        if not clean:

            return False



        conn = self.get_connection()

        cursor = conn.cursor()



        cursor.execute(

            "SELECT user_id, status FROM clothing_items WHERE id = ?",

            (item_id,),

        )

        row = cursor.fetchone()

        if not row or row["user_id"] != user_id or row["status"] != "wishlist":

            conn.close()

            return False



        assignments = ", ".join(f"{col} = ?" for col in clean.keys())

        params = list(clean.values()) + [item_id]

        cursor.execute(

            f"UPDATE clothing_items SET {assignments} WHERE id = ?",

            params,

        )

        success = cursor.rowcount > 0

        conn.commit()

        conn.close()

        return success
