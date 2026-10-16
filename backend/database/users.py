"""DatabaseManager methods: Accounts, settings, auth state (lockout, tokens, password reset) and account deletion."""

from __future__ import annotations

from datetime import datetime
from typing import Dict
from typing import List
from typing import Optional
import json
import sqlite3
import time


class UsersMixin:
    # User Management Methods

    

    def create_user(self, username: str, email: str, password_hash: str, 

                    full_name: Optional[str] = None) -> int:

        """Create a new user account"""

        conn = self.get_connection()

        cursor = conn.cursor()

        

        try:

            cursor.execute('''

                INSERT INTO users (username, email, password_hash, full_name)

                VALUES (?, ?, ?, ?)

            ''', (username, email, password_hash, full_name))

            

            user_id = cursor.lastrowid

            conn.commit()

            conn.close()

            return user_id

        except sqlite3.IntegrityError:

            conn.close()

            return None

    

    def get_user_by_username(self, username: str) -> Optional[Dict]:

        """Get user by username (case-insensitive).



        Endpoints normalize to lowercase before calling, but COLLATE NOCASE

        keeps existing mixed-case rows reachable through their original

        casing during the transition.

        """

        conn = self.get_connection()

        cursor = conn.cursor()



        cursor.execute(

            "SELECT * FROM users WHERE username = ? COLLATE NOCASE",

            (username,),

        )

        row = cursor.fetchone()

        

        if row:

            user = dict(row)

            conn.close()

            return user

        

        conn.close()

        return None

    

    def get_user_by_email(self, email: str) -> Optional[Dict]:

        """Get user by email (case-insensitive)."""

        conn = self.get_connection()

        cursor = conn.cursor()



        cursor.execute(

            "SELECT * FROM users WHERE email = ? COLLATE NOCASE ORDER BY id LIMIT 1",

            (email,),

        )

        row = cursor.fetchone()

        

        if row:

            user = dict(row)

            conn.close()

            return user

        

        conn.close()

        return None

    

    def get_user_by_id(self, user_id: int) -> Optional[Dict]:

        """Get user by ID"""

        conn = self.get_connection()

        cursor = conn.cursor()

        

        cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))

        row = cursor.fetchone()

        

        if row:

            user = dict(row)

            conn.close()

            return user

        

        conn.close()

        return None

    

    def update_last_login(self, user_id: int):

        """Update user's last login timestamp"""

        conn = self.get_connection()

        cursor = conn.cursor()

        

        cursor.execute(

            "UPDATE users SET last_login = ? WHERE id = ?",

            (datetime.now().isoformat(), user_id)

        )

        

        conn.commit()

        conn.close()

    

    def update_user_profile(self, user_id: int, full_name: Optional[str] = None,

                           bio: Optional[str] = None, avatar_url: Optional[str] = None,

                           theme_preference: Optional[str] = None,

                           email: Optional[str] = None) -> bool:

        """Update user profile information"""

        conn = self.get_connection()

        cursor = conn.cursor()

        

        updates = []

        params = []

        

        if full_name is not None:

            updates.append("full_name = ?")

            params.append(full_name)

        if bio is not None:

            updates.append("bio = ?")

            params.append(bio)

        if avatar_url is not None:

            updates.append("avatar_url = ?")

            params.append(avatar_url)

        if theme_preference is not None:

            updates.append("theme_preference = ?")

            params.append(theme_preference)

        if email is not None:

            updates.append("email = ?")

            params.append(email)

        

        if not updates:

            conn.close()

            return True

        

        query = f"UPDATE users SET {', '.join(updates)} WHERE id = ?"

        params.append(user_id)

        

        cursor.execute(query, params)

        success = cursor.rowcount > 0

        

        conn.commit()

        conn.close()

        

        return success

    def get_user_settings(self, user_id: int) -> Optional[Dict]:

        self.ensure_default_closet_location(user_id)

        user = self.get_user_by_id(user_id)

        if not user:

            return None

        return {

            "social_enabled": bool(user.get("social_enabled", 1)),

            "app_mode": user.get("app_mode") or "normal",

            "default_tab": user.get("default_tab") or "closet",

            "default_closet_location_id": user.get("default_closet_location_id"),

            "theme_preference": user.get("theme_preference") or "system",

        }

    def update_user_settings(

        self,

        user_id: int,

        *,

        social_enabled: Optional[bool] = None,

        app_mode: Optional[str] = None,

        default_tab: Optional[str] = None,

        default_closet_location_id: Optional[int] = None,

        theme_preference: Optional[str] = None,

    ) -> bool:

        updates = []

        params = []

        if social_enabled is not None:

            updates.append("social_enabled = ?")

            params.append(1 if social_enabled else 0)

            updates.append("app_mode = ?")

            params.append("normal" if social_enabled else "closet_only")

        if app_mode is not None:

            updates.append("app_mode = ?")

            params.append(app_mode)

        if default_tab is not None:

            updates.append("default_tab = ?")

            params.append(default_tab)

        if theme_preference is not None:

            updates.append("theme_preference = ?")

            params.append(theme_preference)

        if default_closet_location_id is not None:

            loc = self.get_closet_location(default_closet_location_id, user_id)

            if not loc:

                return False

            self.set_default_closet_location(user_id, default_closet_location_id)

            updates.append("default_closet_location_id = ?")

            params.append(default_closet_location_id)

        if not updates:

            return True

        conn = self.get_connection()

        cursor = conn.cursor()

        cursor.execute(

            f"UPDATE users SET {', '.join(updates)} WHERE id = ?",

            [*params, user_id],

        )

        success = cursor.rowcount > 0

        conn.commit()

        conn.close()

        return success

    def set_user_avatar(self, user_id: int, avatar_url: str) -> bool:

        conn = self.get_connection()

        cursor = conn.cursor()

        cursor.execute(

            "UPDATE users SET avatar_url = ? WHERE id = ?",

            (avatar_url, user_id),

        )

        success = cursor.rowcount > 0

        conn.commit()

        conn.close()

        return success

    # ---- Authorization helpers ----------------------------------------------



    def get_user_token_version(self, user_id: int) -> Optional[int]:

        """Current token_version for a user, or None if the user doesn't exist.



        Used by the JWT verifier on every request — bumping this column

        invalidates every outstanding token for the user.

        """

        conn = self.get_connection()

        cursor = conn.cursor()

        cursor.execute(

            "SELECT token_version FROM users WHERE id = ?", (user_id,)

        )

        row = cursor.fetchone()

        conn.close()

        if row is None:

            return None

        return int(row["token_version"] or 0)

    def bump_token_version(self, user_id: int) -> bool:

        """Revoke every JWT for this user by incrementing token_version.

        Also revokes every refresh token, so no device can mint new access
        tokens. Called from password change/reset, `/auth/logout-all`, and
        incident response.
        """

        conn = self.get_connection()

        cursor = conn.cursor()

        cursor.execute(

            "UPDATE users SET token_version = COALESCE(token_version, 0) + 1 "

            "WHERE id = ?",

            (user_id,),

        )

        success = cursor.rowcount > 0

        conn.commit()

        conn.close()

        self.revoke_all_refresh_tokens(user_id)

        return success

    def delete_user_account(self, user_id: int) -> Optional[List[str]]:
        """Permanently delete a user and everything they own, in one transaction.

        Returns the stored image/thumbnail/avatar paths so the caller can
        remove the files from disk, or ``None`` if the user does not exist.
        Children are deleted explicitly because most FKs here have no
        ``ON DELETE CASCADE``.
        """
        conn = self.get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("SELECT avatar_url FROM users WHERE id = ?", (user_id,))
            user = cursor.fetchone()
            if not user:
                return None

            files: List[str] = []
            if user["avatar_url"]:
                files.append(user["avatar_url"])

            cursor.execute(
                "SELECT image_path, thumbnail_path, grid_thumbnail_path, image_paths, "
                "thumbnail_paths FROM clothing_items WHERE user_id = ?",
                (user_id,),
            )
            for row in cursor.fetchall():
                for single in (row["image_path"], row["thumbnail_path"], row["grid_thumbnail_path"]):
                    if single:
                        files.append(single)
                for multi in (row["image_paths"], row["thumbnail_paths"]):
                    if not multi:
                        continue
                    try:
                        parsed = json.loads(multi)
                    except (TypeError, ValueError):
                        continue
                    if isinstance(parsed, list):
                        files.extend(p for p in parsed if isinstance(p, str) and p)

            cursor.execute("SELECT image_path FROM fit_posts WHERE user_id = ?", (user_id,))
            files.extend(r["image_path"] for r in cursor.fetchall() if r["image_path"])

            items = "SELECT id FROM clothing_items WHERE user_id = ?"
            posts = "SELECT id FROM fit_posts WHERE user_id = ?"
            plans = "SELECT id FROM planned_outfits WHERE user_id = ?"
            trips = "SELECT id FROM trips WHERE user_id = ?"
            u = (user_id,)
            statements = [
                (f"DELETE FROM post_reactions WHERE user_id = ? OR post_id IN ({posts})", u * 2),
                (f"DELETE FROM post_comments WHERE user_id = ? OR post_id IN ({posts})", u * 2),
                ("DELETE FROM fit_posts WHERE user_id = ?", u),
                ("DELETE FROM friendships WHERE requester_id = ? OR addressee_id = ?", u * 2),
                (
                    f"DELETE FROM reminder_cards WHERE user_id = ? "
                    f"OR item_id IN ({items}) OR plan_id IN ({plans})",
                    u * 3,
                ),
                (
                    f"DELETE FROM classification_corrections WHERE user_id = ? "
                    f"OR item_id IN ({items})",
                    u * 2,
                ),
                (
                    f"DELETE FROM trip_packed_items WHERE trip_id IN ({trips}) "
                    f"OR item_id IN ({items})",
                    u * 2,
                ),
                ("DELETE FROM trips WHERE user_id = ?", u),
                (
                    f"DELETE FROM planned_outfit_items WHERE plan_id IN ({plans}) "
                    f"OR item_id IN ({items})",
                    u * 2,
                ),
                ("DELETE FROM planned_outfits WHERE user_id = ?", u),
                (f"DELETE FROM laundry_queue WHERE item_id IN ({items})", u),
                (f"DELETE FROM wear_history WHERE item_id IN ({items})", u),
                ("DELETE FROM clothing_items WHERE user_id = ?", u),
                ("DELETE FROM closet_locations WHERE user_id = ?", u),
                ("DELETE FROM outfit_suggestion_history WHERE user_id = ?", u),
                ("DELETE FROM ai_stylist_feedback WHERE user_id = ?", u),
                ("DELETE FROM password_reset_tokens WHERE user_id = ?", u),
                ("DELETE FROM refresh_tokens WHERE user_id = ?", u),
                ("DELETE FROM outfit_wears WHERE user_id = ?", u),
                ("DELETE FROM users WHERE id = ?", u),
            ]
            for sql, params in statements:
                cursor.execute(sql, params)
            conn.commit()
            return files
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    # ---- Login throttling ---------------------------------------------------



    def get_login_lockout(self, user_id: int) -> Optional[str]:

        """ISO timestamp the account is locked until, or None if not locked."""

        conn = self.get_connection()

        cursor = conn.cursor()

        cursor.execute(

            "SELECT lockout_until FROM users WHERE id = ?", (user_id,)

        )

        row = cursor.fetchone()

        conn.close()

        if not row:

            return None

        until = row["lockout_until"]

        if not until:

            return None

        try:

            if datetime.fromisoformat(until) > datetime.now():

                return until

        except (TypeError, ValueError):

            pass

        return None

    def record_login_failure(self, user_id: int, *, lock_after: int = 8,

                              lock_for_minutes: int = 15) -> None:

        """Bump the failed-login counter; lock the account after N failures.



        The lockout is per-account, not per-IP. Combined with the per-IP rate

        limit in the route layer, this gives us defence in depth against both

        targeted and distributed brute-force attempts.

        """

        from datetime import timedelta

        conn = self.get_connection()

        cursor = conn.cursor()

        cursor.execute(

            "SELECT failed_login_count FROM users WHERE id = ?", (user_id,)

        )

        row = cursor.fetchone()

        if not row:

            conn.close()

            return

        new_count = int(row["failed_login_count"] or 0) + 1

        lock_until: Optional[str] = None

        if new_count >= lock_after:

            lock_until = (

                datetime.now() + timedelta(minutes=lock_for_minutes)

            ).isoformat()

        cursor.execute(

            "UPDATE users SET failed_login_count = ?, lockout_until = ? "

            "WHERE id = ?",

            (new_count, lock_until, user_id),

        )

        conn.commit()

        conn.close()

    def clear_login_failures(self, user_id: int) -> None:

        """Reset the counter on a successful login."""

        conn = self.get_connection()

        cursor = conn.cursor()

        cursor.execute(

            "UPDATE users SET failed_login_count = 0, lockout_until = NULL "

            "WHERE id = ?",

            (user_id,),

        )

        conn.commit()

        conn.close()

    def update_password(self, user_id: int, password_hash: str) -> bool:

        """Set a new password hash. Callers must bump_token_version() too

        so existing tokens stop working — kept separate so a future password-

        reset flow can choose its own revocation policy.

        """

        conn = self.get_connection()

        cursor = conn.cursor()

        cursor.execute(

            "UPDATE users SET password_hash = ? WHERE id = ?",

            (password_hash, user_id),

        )

        success = cursor.rowcount > 0

        conn.commit()

        conn.close()

        return success

    

    def issue_password_reset_token(

        self, user_id: int, token_hash: str, expires_at_unix: int

    ) -> None:

        """Replace any existing reset tokens for this user with a new one."""

        conn = self.get_connection()

        cursor = conn.cursor()

        cursor.execute(

            "DELETE FROM password_reset_tokens WHERE user_id = ?",

            (user_id,),

        )

        cursor.execute(

            """

            INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)

            VALUES (?, ?, ?)

            """,

            (user_id, token_hash, expires_at_unix),

        )

        conn.commit()

        conn.close()

    

    def consume_password_reset_token(self, token_hash: str) -> Optional[int]:

        """If the token exists and is not expired, delete it and return user_id."""

        now = int(time.time())

        conn = self.get_connection()

        cursor = conn.cursor()

        cursor.execute(

            """

            SELECT id, user_id, expires_at FROM password_reset_tokens

            WHERE token_hash = ?

            """,

            (token_hash,),

        )

        row = cursor.fetchone()

        if row is None:

            conn.close()

            return None

        row_id = int(row["id"])

        if int(row["expires_at"]) < now:

            cursor.execute(

                "DELETE FROM password_reset_tokens WHERE id = ?", (row_id,)

            )

            conn.commit()

            conn.close()

            return None

        cursor.execute(

            "DELETE FROM password_reset_tokens WHERE id = ?", (row_id,)

        )

        conn.commit()

        conn.close()

        return int(row["user_id"])
