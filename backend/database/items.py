"""DatabaseManager methods: Clothing items: create/import, read, edit, status, embeddings, lending."""

from __future__ import annotations

from bulk_placeholders import bulk_placeholder_paths
from bulk_placeholders import repo_uploads_dir
from datetime import datetime
from typing import Dict
from typing import List
from typing import Optional
from typing import Tuple
import json
import sqlite3


class ItemsMixin:
    

    # Clothing Management Methods (Updated for multi-user)

    

    def add_clothing_item(self, user_id: int, image_path: str, category: str,

                         subcategory: str, colors: List[str], season: str, style: str,

                         purchase_date: Optional[str] = None, purchase_price: Optional[float] = None,

                         purchase_location: Optional[str] = None, brand: Optional[str] = None,

                         size: Optional[str] = None, max_wear_before_wash: int = 1,

                         thumbnail_path: Optional[str] = None,

                         image_paths: Optional[List[str]] = None,

                         thumbnail_paths: Optional[List[Optional[str]]] = None) -> int:

        """Add a new clothing item to the database.



        image_paths / thumbnail_paths are full arrays including the primary

        (front) photo at index 0. If omitted, we derive them from image_path /

        thumbnail_path so single-photo callers still work.

        """

        conn = self.get_connection()

        cursor = conn.cursor()

        default_loc = self.ensure_default_closet_location(user_id)



        colors_json = json.dumps(colors)

        if image_paths is None:

            image_paths = [image_path]

        if thumbnail_paths is None:

            thumbnail_paths = [thumbnail_path]

        image_paths_json = json.dumps(image_paths)

        thumbnail_paths_json = json.dumps(thumbnail_paths)



        # Set default max_wear_before_wash based on category

        if max_wear_before_wash == 1:

            category_lower = category.lower()

            if 'bottom' in category_lower or 'jeans' in subcategory.lower():

                max_wear_before_wash = 3

            elif 'jacket' in category_lower or 'blazer' in subcategory.lower() or 'sweater' in subcategory.lower():

                max_wear_before_wash = 5

            elif 'dress' in category_lower or 'shirt' in subcategory.lower():

                max_wear_before_wash = 1



        cursor.execute('''

            INSERT INTO clothing_items

            (user_id, image_path, thumbnail_path, image_paths, thumbnail_paths,

             category, subcategory, colors, season, style,

             purchase_date, purchase_price, purchase_location, brand, size,

             max_wear_before_wash, closet_location_id)

            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)

        ''', (user_id, image_path, thumbnail_path, image_paths_json, thumbnail_paths_json,

              category, subcategory, colors_json, season, style,

              purchase_date, purchase_price, purchase_location, brand, size,

              max_wear_before_wash, default_loc["id"]))



        item_id = cursor.lastrowid

        conn.commit()

        conn.close()



        return item_id

    def add_imported_clothing_item(

        self,

        user_id: int,

        *,

        category: str,

        subcategory: str,

        colors: List[str],

        season: Optional[str] = None,

        style: Optional[str] = None,

        brand: Optional[str] = None,

        size: Optional[str] = None,

        notes: Optional[str] = None,

        purchase_date: Optional[str] = None,

        purchase_price: Optional[float] = None,

        purchase_location: Optional[str] = None,

        storage_location: Optional[str] = None,

        user_tags: Optional[List[str]] = None,

        care_summary: Optional[str] = None,

        quantity: int = 1,

        clean_count: Optional[int] = None,

        is_bulk: bool = False,

    ) -> int:

        """Add an item from a spreadsheet row. Imported rows may not have photos."""

        conn = self.get_connection()

        cursor = conn.cursor()

        default_loc = self.ensure_default_closet_location(user_id)



        q = max(1, min(int(quantity or 1), 999))

        c = q if clean_count is None else max(0, min(int(clean_count), q))

        cols = [str(x).strip() for x in colors if str(x).strip()]

        if not cols:

            cols = ["Unknown"]

        tags: List[str] = []

        seen = set()

        for tag in user_tags or []:

            s = str(tag).strip()

            if not s or len(s) > self._MAX_USER_TAG_LEN:

                continue

            key = s.lower()

            if key in seen:

                continue

            seen.add(key)

            tags.append(s)

            if len(tags) >= self._MAX_USER_TAGS:

                break

        washed_flag = 1 if c > 0 else 0

        if is_bulk:

            bulk_img, bulk_thumb = bulk_placeholder_paths(

                repo_uploads_dir(),

                category.strip() or "Bulk item",

                subcategory.strip() or "Other",

            )

            bulk_images_json = json.dumps([bulk_img])

            bulk_thumbs_json = json.dumps([bulk_thumb])

        else:

            bulk_img = ""

            bulk_thumb = None

            bulk_images_json = "[]"

            bulk_thumbs_json = "[]"

        cursor.execute(

            """

            INSERT INTO clothing_items

            (user_id, image_path, thumbnail_path, image_paths, thumbnail_paths,

             category, subcategory, colors, season, style,

             purchase_date, purchase_price, purchase_location, brand, size,

             notes, user_tags, storage_location, care_summary,

             is_bulk, quantity, clean_count, washed, physical_location,

             closet_location_id)

            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,

                    ?, ?, ?, ?, ?, ?)

            """,

            (

                user_id,

                bulk_img,

                bulk_thumb,

                bulk_images_json,

                bulk_thumbs_json,

                category.strip() or "Other",

                subcategory.strip() or "Other",

                json.dumps(cols),

                season,

                style,

                purchase_date,

                purchase_price,

                purchase_location,

                brand,

                size,

                notes,

                json.dumps(tags),

                storage_location,

                care_summary,

                1 if is_bulk else 0,

                q,

                c,

                washed_flag,

                "closet" if washed_flag else "needs_wash",

                default_loc["id"],

            ),

        )

        item_id = cursor.lastrowid

        conn.commit()

        conn.close()

        return item_id

    def add_bulk_clothing_item(

        self,

        user_id: int,

        name: str,

        subcategory: str,

        quantity: int,

        clean_count: int,

        colors: List[str],

        season: str,

        style: str,

        *,

        image_path: str = "",

        thumbnail_path: Optional[str] = None,

        image_paths: Optional[List[str]] = None,

        thumbnail_paths: Optional[List[Optional[str]]] = None,

        clip_embedding: Optional[List[float]] = None,

    ) -> int:

        """Add an interchangeable multi-quantity item (socks, basics)."""

        conn = self.get_connection()

        cursor = conn.cursor()

        default_loc = self.ensure_default_closet_location(user_id)



        q = max(1, min(int(quantity), 999))

        c = max(0, min(int(clean_count), q))

        cols = [str(x).strip() for x in colors if str(x).strip()]

        if not cols:

            cols = ["Neutral"]

        colors_json = json.dumps(cols)

        primary_path = (image_path or "").strip()

        thumb_val: Optional[str] = thumbnail_path if thumbnail_path else None

        if not primary_path:

            primary_path, thumb_val = bulk_placeholder_paths(

                repo_uploads_dir(), name, subcategory

            )

        if image_paths is None:

            image_paths = [primary_path]

        if thumbnail_paths is None:

            thumbnail_paths = [thumb_val]

        image_paths_json = json.dumps(image_paths)

        thumbnail_paths_json = json.dumps(thumbnail_paths)



        washed_flag = 1 if c > 0 else 0

        emb_json = json.dumps(clip_embedding) if clip_embedding else None



        cursor.execute(

            """

            INSERT INTO clothing_items

            (user_id, image_path, thumbnail_path, image_paths, thumbnail_paths,

             category, subcategory, colors, season, style, max_wear_before_wash,

             is_bulk, quantity, clean_count, washed, physical_location, clip_embedding,

             closet_location_id)

            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)

            """,

            (

                user_id,

                primary_path,

                thumb_val,

                image_paths_json,

                thumbnail_paths_json,

                name.strip(),

                subcategory.strip(),

                colors_json,

                season,

                style,

                1,

                1,

                q,

                c,

                washed_flag,

                "closet" if washed_flag else "needs_wash",

                emb_json,

                default_loc["id"],

            ),

        )



        item_id = cursor.lastrowid

        conn.commit()

        conn.close()



        return item_id

    def count_owned_similar_by_category_color(

        self, user_id: int, category: str, color_name: str

    ) -> int:

        """How many owned items share this category and contain this color name."""

        color_key = (color_name or "").strip()

        if not color_key:

            return 0

        conn = self.get_connection()

        cursor = conn.cursor()

        cursor.execute(

            """

            SELECT colors FROM clothing_items

            WHERE user_id = ? AND category = ?

            AND (status IS NULL OR status = 'owned')

            AND COALESCE(is_bulk, 0) = 0

            """,

            (user_id, category),

        )

        n = 0

        for row in cursor.fetchall():

            try:

                cols = json.loads(row["colors"])

            except (TypeError, ValueError):

                continue

            if color_key in cols:

                n += 1

        conn.close()

        return n

    @staticmethod

    def _decode_image_paths(item: Dict) -> None:

        """Decode the image_paths / thumbnail_paths JSON columns in place.



        Falls back to the singular image_path / thumbnail_path for rows

        written before the multi-photo migration.

        """

        raw_imgs = item.get("image_paths")

        if raw_imgs:

            try:

                item["image_paths"] = json.loads(raw_imgs)

            except (TypeError, ValueError):

                item["image_paths"] = [item["image_path"]]

        else:

            item["image_paths"] = [item["image_path"]] if item.get("image_path") else []



        raw_thumbs = item.get("thumbnail_paths")

        if raw_thumbs:

            try:

                item["thumbnail_paths"] = json.loads(raw_thumbs)

            except (TypeError, ValueError):

                item["thumbnail_paths"] = [item.get("thumbnail_path")]

        else:

            item["thumbnail_paths"] = [item.get("thumbnail_path")] if item.get("image_path") else []

    @staticmethod

    def _decode_user_tags(item: Dict) -> None:

        raw = item.get("user_tags")

        if raw:

            try:

                parsed = json.loads(raw)

                item["user_tags"] = [

                    str(t).strip() for t in parsed if str(t).strip()

                ]

            except (TypeError, ValueError):

                item["user_tags"] = []

        else:

            item["user_tags"] = []

    @staticmethod

    def _normalize_bulk_fields(item: Dict) -> None:

        bulk = bool(item.get("is_bulk", 0))

        item["is_bulk"] = bulk

        q = int(item.get("quantity") or 1)

        q = max(1, q)

        raw_c = item.get("clean_count")

        if raw_c is None:

            c = q

        else:

            c = int(raw_c)

        c = max(0, min(c, q))

        item["quantity"] = q

        item["clean_count"] = c

    def set_thumbnail_path(self, item_id: int, thumbnail_path: Optional[str]) -> bool:

        """Update only the thumbnail_path for an existing item (used by backfill)."""

        conn = self.get_connection()

        cursor = conn.cursor()

        cursor.execute(

            "UPDATE clothing_items SET thumbnail_path = ? WHERE id = ?",

            (thumbnail_path, item_id),

        )

        success = cursor.rowcount > 0

        conn.commit()

        conn.close()

        return success

    def set_grid_thumbnail_path(self, item_id: int, path: Optional[str]) -> None:
        conn = self.get_connection()
        try:
            conn.execute(
                "UPDATE clothing_items SET grid_thumbnail_path = ? WHERE id = ?", (path, item_id)
            )
            conn.commit()
        finally:
            conn.close()

    def set_clip_embedding(self, item_id: int, embedding: List[float]) -> bool:

        """Persist a L2-normalized CLIP embedding (JSON float list) on an item."""

        conn = self.get_connection()

        cursor = conn.cursor()

        cursor.execute(

            "UPDATE clothing_items SET clip_embedding = ? WHERE id = ?",

            (json.dumps(embedding), item_id),

        )

        success = cursor.rowcount > 0

        conn.commit()

        conn.close()

        return success

    @staticmethod

    def _strip_clip_embedding_public(item: Optional[Dict]) -> None:

        if item is not None:

            item.pop("clip_embedding", None)

    def list_owned_clip_embeddings(self, user_id: int) -> List[Tuple[int, List[float]]]:

        conn = self.get_connection()

        cursor = conn.cursor()

        cursor.execute(

            """

            SELECT id, clip_embedding FROM clothing_items

            WHERE user_id = ?

              AND (status IS NULL OR status = 'owned')

              AND clip_embedding IS NOT NULL

              AND TRIM(clip_embedding) != ''

            """,

            (user_id,),

        )

        out: List[Tuple[int, List[float]]] = []

        for row in cursor.fetchall():

            try:

                vec = json.loads(row["clip_embedding"])

                if isinstance(vec, list) and len(vec) > 8:

                    out.append((int(row["id"]), [float(x) for x in vec]))

            except (TypeError, ValueError, KeyError):

                continue

        conn.close()

        return out

    def promote_bulk_to_individuals(

        self, item_id: int, user_id: int, count: int

    ) -> Optional[List[int]]:

        """Split ``count`` clean units off a bulk row into standalone items."""

        if count < 1:

            return None

        conn = self.get_connection()

        cursor = conn.cursor()

        cursor.execute(

            """

            SELECT * FROM clothing_items

            WHERE id = ? AND user_id = ? AND COALESCE(is_bulk, 0) = 1

              AND (status IS NULL OR status = 'owned')

            """,

            (item_id, user_id),

        )

        row = cursor.fetchone()

        if not row:

            conn.close()

            return None

        p = dict(row)

        qty = max(1, int(p.get("quantity") or 1))

        cc_raw = p.get("clean_count")

        cc = int(cc_raw) if cc_raw is not None else qty

        cc = max(0, min(cc, qty))

        if count > qty or count > cc:

            conn.close()

            return None



        created: List[int] = []

        mw = max(1, int(p.get("max_wear_before_wash") or 1))

        tags_raw = p.get("user_tags")

        tags_json = tags_raw if tags_raw else "[]"

        packed = int(p.get("packed_for_trip") or 0)

        clip_raw = p.get("clip_embedding")

        img_p = (p.get("image_path") or "") or ""

        img_paths_sql = (

            p.get("image_paths")

            if p.get("image_paths")

            else json.dumps([img_p])

        )

        thumbs_sql = (

            p.get("thumbnail_paths")

            if p.get("thumbnail_paths") is not None

            else json.dumps([p.get("thumbnail_path")])

        )



        try:

            for _ in range(count):

                cursor.execute(

                    """

                    INSERT INTO clothing_items (

                        user_id, image_path, thumbnail_path, image_paths, thumbnail_paths,

                        category, subcategory, colors, season, style,

                        purchase_date, purchase_price, purchase_location, brand, size,

                        max_wear_before_wash, notes, user_tags, storage_location, packed_for_trip,

                        is_bulk, quantity, clean_count, washed, physical_location,

                        clip_embedding, status

                    )

                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, 1, 1, 'closet', ?, 'owned')

                    """,

                    (

                        user_id,

                        img_p,

                        p.get("thumbnail_path"),

                        img_paths_sql,

                        thumbs_sql,

                        p["category"],

                        p["subcategory"],

                        p["colors"],

                        p.get("season"),

                        p.get("style"),

                        p.get("purchase_date"),

                        p.get("purchase_price"),

                        p.get("purchase_location"),

                        p.get("brand"),

                        p.get("size"),

                        mw,

                        p.get("notes"),

                        tags_json,

                        p.get("storage_location"),

                        packed,

                        clip_raw,

                    ),

                )

                created.append(cursor.lastrowid)



            if count >= qty:

                cursor.execute("DELETE FROM clothing_items WHERE id = ?", (item_id,))

            else:

                nq = qty - count

                nc = cc - count

                wf = 1 if nc > 0 else 0

                pl = "closet" if wf else "needs_wash"

                cursor.execute(

                    """

                    UPDATE clothing_items SET quantity = ?, clean_count = ?,

                           washed = ?, physical_location = ?

                    WHERE id = ?

                    """,

                    (nq, nc, wf, pl, item_id),

                )

            conn.commit()

        except sqlite3.Error:

            conn.rollback()

            conn.close()

            return None

        conn.close()

        return created

    # Whitelist of free-text/metadata columns the API is allowed to patch.

    # Keep this tight — anything wear/wash related goes through update_item_status.

    _EDITABLE_DETAIL_FIELDS = {

        "brand",

        "size",

        "notes",

        "purchase_date",

        "purchase_price",

        "purchase_location",

        "storage_location",

        "category",

        "subcategory",

        "season",

        "style",

        "colors",

        "user_tags",

        "care_label_text",

        "care_summary",

        "packed_for_trip",
        "color_hexes",
        "pattern",
        "laundry_state",

        "quantity",

        "clean_count",

        "closet_location_id",

        "status",

        "wishlist_name",

        "wishlist_intent",

        "wishlist_url",

    }

    _MAX_USER_TAGS = 20

    _MAX_USER_TAG_LEN = 40

    # category / subcategory are NOT NULL — never cleared to None.

    _REQUIRED_TEXT_FIELDS = {"category", "subcategory"}

    _VALID_ITEM_STATUSES = {"owned", "wishlist"}

    def update_item_details(self, item_id: int, user_id: int, **fields) -> bool:

        """Patch user-editable metadata on an item.



        Returns False if the item doesn't exist, belongs to another user, or

        no recognized fields were supplied. Unknown keys are silently dropped

        — the endpoint validates shape before getting here.

        """

        clean: Dict = {}

        for key, value in fields.items():

            if key not in self._EDITABLE_DETAIL_FIELDS:

                continue

            if key == "packed_for_trip":

                if value is None:

                    continue

                clean[key] = 1 if bool(value) else 0

                continue

            if key == "colors":

                if not isinstance(value, list):

                    continue

                names = [str(c).strip() for c in value if str(c).strip()]

                if not names:

                    continue

                clean[key] = json.dumps(names)

                continue
            if key == "color_hexes":

                if not isinstance(value, list):

                    continue

                hexes = [str(c).strip() for c in value if str(c).strip()]

                clean[key] = json.dumps(hexes[:8])

                continue

            if key == "user_tags":

                if not isinstance(value, list):

                    continue

                names: List[str] = []

                seen: set = set()

                for tag in value:

                    s = str(tag).strip()

                    if not s or len(s) > self._MAX_USER_TAG_LEN:

                        continue

                    key_lower = s.lower()

                    if key_lower in seen:

                        continue

                    seen.add(key_lower)

                    names.append(s)

                    if len(names) >= self._MAX_USER_TAGS:

                        break

                clean[key] = json.dumps(names)

                continue

            if key in ("quantity", "clean_count"):

                if value is None:

                    continue

                try:

                    clean[key] = int(value)

                except (TypeError, ValueError):

                    continue

                continue

            if key == "closet_location_id":

                if value is None:

                    clean[key] = None

                    continue

                try:

                    clean[key] = int(value)

                except (TypeError, ValueError):

                    continue

                continue

            if key == "status":

                if value not in self._VALID_ITEM_STATUSES:

                    continue

                clean[key] = value

                continue

            if key == "wishlist_intent":

                if value is None or value in self._WISHLIST_INTENTS:

                    clean[key] = value

                continue

            if key in self._REQUIRED_TEXT_FIELDS:

                if not isinstance(value, str) or not value.strip():

                    continue

                clean[key] = value.strip()

                continue

            # Treat empty strings as "clear this field" rather than storing ''.

            if isinstance(value, str) and value.strip() == "":

                clean[key] = None

            else:

                clean[key] = value



        if not clean:

            return False



        conn = self.get_connection()

        cursor = conn.cursor()



        cursor.execute(

            "SELECT user_id, is_bulk, quantity, clean_count FROM clothing_items WHERE id = ?",

            (item_id,),

        )

        row = cursor.fetchone()

        if not row or row["user_id"] != user_id:

            conn.close()

            return False



        if "quantity" in clean or "clean_count" in clean:

            if not row["is_bulk"]:

                clean.pop("quantity", None)

                clean.pop("clean_count", None)

            else:

                q0 = int(row["quantity"] or 1)

                c_raw = row["clean_count"]

                c0 = int(c_raw) if c_raw is not None else q0

                q = int(clean["quantity"]) if "quantity" in clean else q0

                c = int(clean["clean_count"]) if "clean_count" in clean else c0

                q = max(1, min(999, q))

                if "quantity" in clean and "clean_count" not in clean:

                    c = min(c0, q)

                else:

                    c = max(0, min(c, q))

                clean["quantity"] = q

                clean["clean_count"] = c

                clean["washed"] = 1 if c > 0 else 0

                clean["physical_location"] = "closet" if c > 0 else "needs_wash"



        if "closet_location_id" in clean and clean["closet_location_id"] is not None:

            if not self.get_closet_location(int(clean["closet_location_id"]), user_id):

                conn.close()

                return False



        if not clean:

            conn.close()

            return False



        assignments = ", ".join(f"{col} = ?" for col in clean.keys())

        params = list(clean.values()) + [item_id]

        cursor.execute(

            f"UPDATE clothing_items SET {assignments} WHERE id = ?",

            params,

        )

        success = cursor.rowcount > 0

        if success:

            self._sync_laundry_queue_from_item_snapshot(cursor, item_id)

        conn.commit()

        conn.close()

        return success

    

    def get_all_items(self, user_id: int, category: Optional[str] = None,

                     status: Optional[str] = None,

                     packed: Optional[bool] = None,

                     closet_location_id: Optional[int] = None) -> List[Dict]:

        """Get all owned clothing items with optional filters.



        Wishlist items (status='wishlist') are always excluded — they have

        their own endpoint (get_wishlist_items).

        """

        conn = self.get_connection()

        cursor = conn.cursor()



        query = "SELECT * FROM clothing_items WHERE user_id = ? AND (status IS NULL OR status = 'owned')"

        params = [user_id]



        if category:

            query += " AND category = ?"

            params.append(category)



        if status == "clean":

            query += " AND washed = 1"

        elif status == "dirty":

            query += " AND washed = 0"



        if packed is not None:

            query += " AND packed_for_trip = ?"

            params.append(1 if packed else 0)



        if closet_location_id is not None:

            query += " AND closet_location_id = ?"

            params.append(int(closet_location_id))



        query += " ORDER BY date_added DESC"

        

        cursor.execute(query, params)

        rows = cursor.fetchall()

        

        items = []

        for row in rows:

            item = dict(row)

            item["colors"] = json.loads(item["colors"])
            if item.get("color_hexes"):
                try:
                    item["color_hexes"] = json.loads(item["color_hexes"])
                except (TypeError, json.JSONDecodeError):
                    item["color_hexes"] = []
            else:
                item["color_hexes"] = []

            self._decode_user_tags(item)

            item["worn"] = bool(item["worn"])

            item["washed"] = bool(item["washed"])

            item["packed_for_trip"] = bool(item.get("packed_for_trip", 0))

            self._decode_image_paths(item)

            self._normalize_bulk_fields(item)

            self._strip_clip_embedding_public(item)

            items.append(item)



        conn.close()

        return items

    def set_packed_for_trip_bulk(

        self,

        user_id: int,

        packed_for_trip: bool,

        item_ids: Optional[List[int]] = None,

    ) -> int:

        """Bulk-pack owned items. If item_ids is omitted, update all packed rows."""

        conn = self.get_connection()

        cursor = conn.cursor()

        packed_value = 1 if packed_for_trip else 0



        if item_ids is None:

            cursor.execute(

                """

                UPDATE clothing_items

                SET packed_for_trip = ?

                WHERE user_id = ?

                  AND (status IS NULL OR status = 'owned')

                  AND packed_for_trip = 1

                """,

                (packed_value, user_id),

            )

        else:

            clean_ids = sorted({int(i) for i in item_ids if int(i) > 0})

            if not clean_ids:

                conn.close()

                return 0

            placeholders = ",".join("?" for _ in clean_ids)

            cursor.execute(

                f"""

                UPDATE clothing_items

                SET packed_for_trip = ?

                WHERE user_id = ?

                  AND (status IS NULL OR status = 'owned')

                  AND id IN ({placeholders})

                """,

                [packed_value, user_id, *clean_ids],

            )



        updated = cursor.rowcount

        conn.commit()

        conn.close()

        return updated

    def record_classification_correction(
        self, user_id: int, item_id: int, corrected_data: Dict
    ) -> bool:
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM clothing_items WHERE id = ? AND user_id = ?", (item_id, user_id))
        row = cursor.fetchone()
        if not row:
            conn.close()
            return False
        previous = dict(row)
        previous.pop("clip_embedding", None)
        cursor.execute(
            """
            INSERT INTO classification_corrections (
                user_id, item_id, previous_data, corrected_data
            )
            VALUES (?, ?, ?, ?)
            """,
            (user_id, item_id, json.dumps(previous, default=str), json.dumps(corrected_data)),
        )
        conn.commit()
        conn.close()
        return True

    def get_item_wear_history(self, user_id: int, item_id: int, limit: int = 365) -> List[Dict]:
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM clothing_items WHERE id = ? AND user_id = ?", (item_id, user_id))
        if not cursor.fetchone():
            conn.close()
            return []
        cursor.execute(
            """
            SELECT id, item_id, worn_date, occasion, rating, notes
            FROM wear_history
            WHERE item_id = ?
            ORDER BY worn_date DESC
            LIMIT ?
            """,
            (item_id, limit),
        )
        rows = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return rows

    def get_worn_posts_for_item(self, user_id: int, item_id: int, limit: int = 50) -> List[Dict]:
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT * FROM fit_posts
            WHERE user_id = ?
              AND item_ids IS NOT NULL
            ORDER BY created_at DESC
            LIMIT 300
            """,
            (user_id,),
        )
        posts = []
        for row in cursor.fetchall():
            post = dict(row)
            try:
                ids = [int(x) for x in json.loads(post.get("item_ids") or "[]")]
            except (TypeError, ValueError, json.JSONDecodeError):
                ids = []
            if item_id in ids:
                self._hydrate_post(cursor, post, user_id)
                posts.append(post)
                if len(posts) >= limit:
                    break
        conn.close()
        return posts

    def get_worn_outfit_signatures(self, user_id: int, days: int = 180, limit: int = 200) -> set:
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            f"""
            SELECT item_ids FROM fit_posts
            WHERE user_id = ?
              AND item_ids IS NOT NULL
              AND created_at >= datetime('now', '-{int(days)} days')
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (user_id, limit),
        )
        sigs = set()
        for row in cursor.fetchall():
            try:
                ids = sorted(int(x) for x in json.loads(row["item_ids"] or "[]"))
            except (TypeError, ValueError, json.JSONDecodeError):
                continue
            if ids:
                sigs.add(",".join(str(i) for i in ids))
        conn.close()
        return sigs

    def list_items_missing_embeddings(self, user_id: int, limit: int = 25) -> List[Dict]:
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, image_path FROM clothing_items
            WHERE user_id = ?
              AND (status IS NULL OR status = 'owned')
              AND image_path IS NOT NULL
              AND TRIM(image_path) != ''
              AND (clip_embedding IS NULL OR TRIM(clip_embedding) = '')
            ORDER BY date_added DESC
            LIMIT ?
            """,
            (user_id, limit),
        )
        rows = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return rows

    def get_duplicate_candidates(self, user_id: int, threshold: float = 0.91) -> List[Dict]:
        embeddings = self.list_owned_clip_embeddings(user_id)
        if len(embeddings) < 2:
            return []
        by_id = {int(item["id"]): item for item in self.get_all_items(user_id)}
        pairs = []
        for idx, (left_id, left_vec) in enumerate(embeddings):
            for right_id, right_vec in embeddings[idx + 1:]:
                if len(left_vec) != len(right_vec):
                    continue
                score = float(sum(a * b for a, b in zip(left_vec, right_vec)))
                if score >= threshold and left_id in by_id and right_id in by_id:
                    pairs.append({
                        "score": round(score, 4),
                        "items": [by_id[left_id], by_id[right_id]],
                    })
        pairs.sort(key=lambda row: -row["score"])
        return pairs[:20]

    def get_reminder_cards(self, user_id: int) -> List[Dict]:
        conn = self.get_connection()
        cursor = conn.cursor()
        cards: List[Dict] = []
        cursor.execute(
            """
            SELECT id, subcategory, lent_to, lent_until, thumbnail_path
            FROM clothing_items
            WHERE user_id = ?
              AND (status IS NULL OR status = 'owned')
              AND lent_to IS NOT NULL
              AND lent_until IS NOT NULL
              AND date(lent_until) <= date('now', '+3 days')
            ORDER BY lent_until ASC
            LIMIT 20
            """,
            (user_id,),
        )
        for row in cursor.fetchall():
            cards.append({
                "id": f"lend-{row['id']}",
                "kind": "lending",
                "title": f"{row['subcategory']} due back",
                "detail": f"Lent to {row['lent_to']}",
                "due_date": row["lent_until"],
                "item_id": row["id"],
                "thumbnail_path": row["thumbnail_path"],
            })
        cursor.execute(
            """
            SELECT po.*
            FROM planned_outfits po
            WHERE po.user_id = ?
              AND po.status IN ('draft', 'confirmed')
              AND date(po.planned_for) BETWEEN date('now') AND date('now', '+7 days')
              AND (
                po.prep_clean = 0 OR po.prep_packed = 0
                OR po.prep_steamed = 0 OR po.prep_accessories = 0
              )
            ORDER BY po.planned_for ASC
            LIMIT 20
            """,
            (user_id,),
        )
        for row in cursor.fetchall():
            missing = []
            if not row["prep_clean"]:
                missing.append("cleaning")
            if not row["prep_packed"]:
                missing.append("packing")
            if not row["prep_steamed"]:
                missing.append("ironing")
            if not row["prep_accessories"]:
                missing.append("accessories")
            cards.append({
                "id": f"prep-{row['id']}",
                "kind": "prep",
                "title": f"Prep {row['title']}",
                "detail": "Needs " + ", ".join(missing),
                "due_date": row["planned_for"],
                "plan_id": row["id"],
            })
        conn.close()
        return cards

    def get_item(self, item_id: int) -> Optional[Dict]:

        """Get a specific clothing item with calculated metrics"""

        conn = self.get_connection()

        cursor = conn.cursor()

        

        cursor.execute("SELECT * FROM clothing_items WHERE id = ?", (item_id,))

        row = cursor.fetchone()

        

        if row:

            item = dict(row)

            item["colors"] = json.loads(item["colors"])
            if item.get("color_hexes"):
                try:
                    item["color_hexes"] = json.loads(item["color_hexes"])
                except (TypeError, json.JSONDecodeError):
                    item["color_hexes"] = []
            else:
                item["color_hexes"] = []

            self._decode_user_tags(item)

            item["worn"] = bool(item["worn"])

            item["washed"] = bool(item["washed"])

            item["is_favorite"] = bool(item.get("is_favorite", False))

            item["packed_for_trip"] = bool(item.get("packed_for_trip", 0))

            self._decode_image_paths(item)

            self._normalize_bulk_fields(item)

            self._strip_clip_embedding_public(item)



            # Calculate cost per wear

            if item.get("purchase_price") and item["times_worn"] > 0:

                item["cost_per_wear"] = round(float(item["purchase_price"]) / item["times_worn"], 2)

            else:

                item["cost_per_wear"] = item.get("purchase_price")

            

            # Calculate days since last worn

            if item.get("last_worn"):

                last_worn_date = datetime.fromisoformat(item["last_worn"])

                item["days_since_worn"] = (datetime.now() - last_worn_date).days

            else:

                item["days_since_worn"] = None

                

            # Calculate days since added

            if item.get("date_added"):

                added_date = datetime.fromisoformat(item["date_added"])

                item["days_owned"] = (datetime.now() - added_date).days

            else:

                item["days_owned"] = None

            

            # Update rotation category if needed

            item["rotation_category"] = self._calculate_rotation_category(

                item["times_worn"], 

                item["days_owned"] if item["days_owned"] else 0

            )

            

            conn.close()

            return item

        

        conn.close()

        return None

    

    def update_item_status(self, item_id: int, worn: Optional[bool] = None,

                          washed: Optional[bool] = None, wear_again: Optional[bool] = None,

                          occasion: Optional[str] = None, rating: Optional[int] = None) -> bool:

        """Update the worn/washed status of an item with multi-wear tracking"""

        conn = self.get_connection()

        cursor = conn.cursor()



        cursor.execute(

            """

            SELECT wear_again_count, max_wear_before_wash, times_worn, freshness_score, status,

                   COALESCE(is_bulk, 0) AS is_bulk, quantity, clean_count

            FROM clothing_items WHERE id = ?

            """,

            (item_id,),

        )

        item = cursor.fetchone()



        if not item or (item["status"] and item["status"] != "owned"):

            conn.close()

            return False



        is_bulk = bool(item["is_bulk"])

        qty = max(1, int(item["quantity"] or 1))

        cc_raw = item["clean_count"]

        cc = int(cc_raw) if cc_raw is not None else qty

        cc = max(0, min(cc, qty))



        if is_bulk:

            updates: List[str] = []

            params: List = []



            if worn is not None:

                updates.append("worn = ?")

                params.append(1 if worn else 0)



                if worn:

                    if cc <= 0:

                        conn.close()

                        return False

                    new_cc = cc - 1

                    updates.append("times_worn = times_worn + 1")

                    updates.append("last_worn = ?")

                    params.append(datetime.now().isoformat())

                    updates.append("clean_count = ?")

                    params.append(new_cc)

                    updates.append("washed = ?")

                    params.append(1 if new_cc > 0 else 0)

                    updates.append(

                        "physical_location = ?"

                    )

                    params.append("closet" if new_cc > 0 else "needs_wash")
                    updates.append("laundry_state = ?")
                    params.append("clean" if new_cc > 0 else "worn")

                    cursor.execute(

                        "INSERT INTO wear_history (item_id, occasion, rating) VALUES (?, ?, ?)",

                        (item_id, occasion, rating),

                    )

                    new_fresh = max(0.0, float(item["freshness_score"]) - 0.02)

                    updates.append("freshness_score = ?")

                    params.append(new_fresh)



            if wear_again is not None:

                # Wear-again multi-wear skips bulk — counts already track inventory.

                pass



            if washed is not None:

                if washed:

                    updates.append("clean_count = ?")

                    params.append(qty)

                    updates.append("washed = 1")

                    updates.append("wear_again_count = 0")

                    updates.append("freshness_score = 1.0")

                    updates.append("physical_location = 'closet'")
                    updates.append("laundry_state = 'clean'")

                else:

                    updates.append("clean_count = 0")

                    updates.append("washed = 0")

                    updates.append("physical_location = 'needs_wash'")
                    updates.append("laundry_state = 'in_hamper'")



            if not updates:

                conn.close()

                return True



            query = f"UPDATE clothing_items SET {', '.join(updates)} WHERE id = ?"

            params.append(item_id)

            cursor.execute(query, params)

            success = cursor.rowcount > 0

            if success:

                self._sync_laundry_queue_from_item_snapshot(cursor, item_id)

            conn.commit()

            conn.close()

            return success



        updates = []

        params = []



        if worn is not None:

            updates.append("worn = ?")

            params.append(1 if worn else 0)



            if worn:

                updates.append("times_worn = times_worn + 1")

                updates.append("last_worn = ?")

                params.append(datetime.now().isoformat())



                updates.append("wear_again_count = wear_again_count + 1")



                cursor.execute(

                    "INSERT INTO wear_history (item_id, occasion, rating) VALUES (?, ?, ?)",

                    (item_id, occasion, rating),

                )



                new_wear_count = item["wear_again_count"] + 1

                if new_wear_count >= item["max_wear_before_wash"]:

                    updates.append("washed = 0")

                    updates.append("physical_location = 'needs_wash'")
                    updates.append("laundry_state = 'worn'")



                new_freshness = max(0.0, float(item["freshness_score"]) - 0.05)

                updates.append("freshness_score = ?")

                params.append(new_freshness)



        if wear_again is not None:

            if wear_again:

                updates.append("washed = 1")

                updates.append("physical_location = 'closet'")
                updates.append("laundry_state = 'clean'")

            else:

                updates.append("washed = 0")

                updates.append("physical_location = 'laundry'")
                updates.append("laundry_state = 'in_hamper'")



        if washed is not None:

            updates.append("washed = ?")

            params.append(1 if washed else 0)



            if washed:

                updates.append("wear_again_count = 0")

                updates.append("freshness_score = 1.0")

                updates.append("physical_location = 'closet'")
                updates.append("laundry_state = 'clean'")



        if not updates:

            conn.close()

            return True



        query = f"UPDATE clothing_items SET {', '.join(updates)} WHERE id = ?"

        params.append(item_id)



        cursor.execute(query, params)

        success = cursor.rowcount > 0

        if success:

            self._sync_laundry_queue_from_item_snapshot(cursor, item_id)

        conn.commit()

        conn.close()



        return success

    

    def delete_item(self, item_id: int) -> bool:

        """Delete a clothing item"""

        conn = self.get_connection()

        cursor = conn.cursor()

        

        # Delete wear history first

        cursor.execute("DELETE FROM wear_history WHERE item_id = ?", (item_id,))

        

        # Delete the item

        cursor.execute("DELETE FROM clothing_items WHERE id = ?", (item_id,))

        success = cursor.rowcount > 0

        

        conn.commit()

        conn.close()

        

        return success

    def toggle_favorite(self, item_id: int) -> bool:

        """Toggle favorite status of an item"""

        conn = self.get_connection()

        cursor = conn.cursor()

        

        cursor.execute("SELECT is_favorite FROM clothing_items WHERE id = ?", (item_id,))

        row = cursor.fetchone()

        

        if not row:

            conn.close()

            return False

        

        new_status = not bool(row["is_favorite"])

        cursor.execute("UPDATE clothing_items SET is_favorite = ? WHERE id = ?", 

                      (1 if new_status else 0, item_id))

        

        conn.commit()

        conn.close()

        return True

    

    def lend_item(

        self,

        item_id: int,

        user_id: int,

        lent_to: str,

        lent_until: Optional[str] = None,

    ) -> bool:

        """Mark an item as lent out. Returns False if the item isn't the

        caller's. lent_until is an ISO date string (YYYY-MM-DD) or None.

        """

        if not lent_to or not lent_to.strip():

            return False



        conn = self.get_connection()

        cursor = conn.cursor()



        cursor.execute(

            "SELECT user_id, status FROM clothing_items WHERE id = ?",

            (item_id,),

        )

        row = cursor.fetchone()

        if not row or row["user_id"] != user_id:

            conn.close()

            return False

        if row["status"] and row["status"] != "owned":

            # Can't lend something you don't own yet.

            conn.close()

            return False



        cursor.execute(

            """

            UPDATE clothing_items

            SET lent_to = ?, lent_at = ?, lent_until = ?

            WHERE id = ?

            """,

            (

                lent_to.strip(),

                datetime.now().isoformat(),

                lent_until,

                item_id,

            ),

        )

        success = cursor.rowcount > 0

        conn.commit()

        conn.close()

        return success

    def return_item(self, item_id: int, user_id: int) -> bool:

        """Clear lending fields when an item comes back."""

        conn = self.get_connection()

        cursor = conn.cursor()



        cursor.execute(

            "SELECT user_id FROM clothing_items WHERE id = ?",

            (item_id,),

        )

        row = cursor.fetchone()

        if not row or row["user_id"] != user_id:

            conn.close()

            return False



        cursor.execute(

            """

            UPDATE clothing_items

            SET lent_to = NULL, lent_at = NULL, lent_until = NULL

            WHERE id = ?

            """,

            (item_id,),

        )

        success = cursor.rowcount > 0

        conn.commit()

        conn.close()

        return success

    def item_belongs_to(self, item_id: int, user_id: int) -> bool:

        """True if ``item_id`` is owned by ``user_id``. False otherwise.



        The centralised check for endpoints that take a path-param item id.

        """

        conn = self.get_connection()

        cursor = conn.cursor()

        cursor.execute(

            "SELECT 1 FROM clothing_items WHERE id = ? AND user_id = ?",

            (item_id, user_id),

        )

        row = cursor.fetchone()

        conn.close()

        return row is not None
