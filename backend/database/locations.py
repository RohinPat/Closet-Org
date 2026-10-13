"""DatabaseManager methods: Closet locations (rooms, storage spots)."""

from __future__ import annotations

from typing import Dict
from typing import List
from typing import Optional


class LocationsMixin:
    def ensure_default_closet_location(self, user_id: int) -> Dict:

        conn = self.get_connection()

        cursor = conn.cursor()

        cursor.execute(

            """

            SELECT * FROM closet_locations

            WHERE user_id = ?

            ORDER BY is_default DESC, id ASC

            LIMIT 1

            """,

            (user_id,),

        )

        row = cursor.fetchone()

        if row:

            loc = dict(row)

            if not loc.get("is_default"):

                cursor.execute(

                    "UPDATE closet_locations SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END WHERE user_id = ?",

                    (loc["id"], user_id),

                )

            cursor.execute(

                "UPDATE users SET default_closet_location_id = ? WHERE id = ?",

                (loc["id"], user_id),

            )

            conn.commit()

            conn.close()

            loc["is_default"] = True

            return loc

        cursor.execute(

            """

            INSERT INTO closet_locations (user_id, name, kind, is_default)

            VALUES (?, 'Home', 'home', 1)

            """,

            (user_id,),

        )

        loc_id = cursor.lastrowid

        cursor.execute(

            "UPDATE users SET default_closet_location_id = ? WHERE id = ?",

            (loc_id, user_id),

        )

        conn.commit()

        cursor.execute("SELECT * FROM closet_locations WHERE id = ?", (loc_id,))

        loc = dict(cursor.fetchone())

        conn.close()

        loc["is_default"] = True

        return loc

    def list_closet_locations(self, user_id: int) -> List[Dict]:

        self.ensure_default_closet_location(user_id)

        conn = self.get_connection()

        cursor = conn.cursor()

        cursor.execute(

            """

            SELECT * FROM closet_locations

            WHERE user_id = ?

            ORDER BY is_default DESC, name COLLATE NOCASE

            """,

            (user_id,),

        )

        rows = []

        for row in cursor.fetchall():

            loc = dict(row)

            loc["is_default"] = bool(loc.get("is_default", 0))

            rows.append(loc)

        conn.close()

        return rows

    def get_closet_location(self, location_id: int, user_id: int) -> Optional[Dict]:

        conn = self.get_connection()

        cursor = conn.cursor()

        cursor.execute(

            "SELECT * FROM closet_locations WHERE id = ? AND user_id = ?",

            (location_id, user_id),

        )

        row = cursor.fetchone()

        conn.close()

        if not row:

            return None

        loc = dict(row)

        loc["is_default"] = bool(loc.get("is_default", 0))

        return loc

    def set_default_closet_location(self, user_id: int, location_id: int) -> bool:

        if not self.get_closet_location(location_id, user_id):

            return False

        conn = self.get_connection()

        cursor = conn.cursor()

        cursor.execute(

            "UPDATE closet_locations SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?",

            (location_id, user_id),

        )

        cursor.execute(

            "UPDATE users SET default_closet_location_id = ? WHERE id = ?",

            (location_id, user_id),

        )

        conn.commit()

        conn.close()

        return True

    def create_closet_location(

        self, user_id: int, name: str, kind: str = "home", is_default: bool = False

    ) -> int:

        clean_name = name.strip()

        if not clean_name:

            raise ValueError("name required")

        conn = self.get_connection()

        cursor = conn.cursor()

        if is_default:

            cursor.execute("UPDATE closet_locations SET is_default = 0 WHERE user_id = ?", (user_id,))

        cursor.execute(

            """

            INSERT INTO closet_locations (user_id, name, kind, is_default)

            VALUES (?, ?, ?, ?)

            """,

            (user_id, clean_name, kind.strip() or "home", 1 if is_default else 0),

        )

        loc_id = cursor.lastrowid

        if is_default:

            cursor.execute(

                "UPDATE users SET default_closet_location_id = ? WHERE id = ?",

                (loc_id, user_id),

            )

        conn.commit()

        conn.close()

        self.ensure_default_closet_location(user_id)

        return loc_id

    def update_closet_location(

        self,

        user_id: int,

        location_id: int,

        *,

        name: Optional[str] = None,

        kind: Optional[str] = None,

        is_default: Optional[bool] = None,

    ) -> bool:

        if not self.get_closet_location(location_id, user_id):

            return False

        updates = []

        params = []

        if name is not None and name.strip():

            updates.append("name = ?")

            params.append(name.strip())

        if kind is not None and kind.strip():

            updates.append("kind = ?")

            params.append(kind.strip())

        if updates:

            updates.append("updated_at = CURRENT_TIMESTAMP")

            conn = self.get_connection()

            cursor = conn.cursor()

            cursor.execute(

                f"UPDATE closet_locations SET {', '.join(updates)} WHERE id = ? AND user_id = ?",

                [*params, location_id, user_id],

            )

            conn.commit()

            conn.close()

        if is_default is True:

            return self.set_default_closet_location(user_id, location_id)

        return True

    def delete_closet_location(self, user_id: int, location_id: int) -> bool:

        loc = self.get_closet_location(location_id, user_id)

        if not loc:

            return False

        conn = self.get_connection()

        cursor = conn.cursor()

        cursor.execute(

            "UPDATE clothing_items SET closet_location_id = NULL WHERE user_id = ? AND closet_location_id = ?",

            (user_id, location_id),

        )

        cursor.execute(

            "DELETE FROM closet_locations WHERE id = ? AND user_id = ?",

            (location_id, user_id),

        )

        success = cursor.rowcount > 0

        cursor.execute(

            "UPDATE users SET default_closet_location_id = NULL WHERE id = ? AND default_closet_location_id = ?",

            (user_id, location_id),

        )

        conn.commit()

        conn.close()

        self.ensure_default_closet_location(user_id)

        return success
