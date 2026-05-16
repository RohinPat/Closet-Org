import json
import os
import sqlite3
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple


from bulk_placeholders import bulk_placeholder_paths, repo_uploads_dir





_BACKEND_DIR = Path(__file__).resolve().parent.parent

_DEFAULT_DB = str(_BACKEND_DIR / "closet.db")


def _resolve_db_path() -> str:
    """Prefer CLOSET_DB_PATH for tests and multi-instance deploys."""
    env = os.environ.get("CLOSET_DB_PATH")
    if env and env.strip():
        return env.strip()
    return _DEFAULT_DB



_db_singleton: Optional["DatabaseManager"] = None





def get_db() -> "DatabaseManager":

    """Process-wide DatabaseManager singleton.



    Multiple call sites (main.py, auth.py) need a database handle. Sharing

    one instance avoids re-running the migration block on import and keeps

    behaviour identical to a single ``DatabaseManager()`` call.

    """

    global _db_singleton

    if _db_singleton is None:

        _db_singleton = DatabaseManager()

    return _db_singleton





class DatabaseManager:

    """SQLite database manager for clothing inventory and user management"""

    

    def __init__(self, db_path: Optional[str] = None):

        self.db_path = db_path or _resolve_db_path()

        self.init_database()

    

    def get_connection(self):

        """Get a database connection with safe pragmas applied.



        - ``foreign_keys=ON`` is per-connection in SQLite and must be set every

          time. Without it, ``ON DELETE CASCADE`` is silently ignored.

        - ``journal_mode=WAL`` is database-wide; setting it on every connect is

          cheap (it's a no-op after the first call) and ensures readers don't

          block writers during long-running requests.

        """

        conn = sqlite3.connect(self.db_path, timeout=30.0)

        conn.row_factory = sqlite3.Row

        try:

            conn.execute("PRAGMA foreign_keys = ON")

            conn.execute("PRAGMA journal_mode = WAL")

            conn.execute("PRAGMA synchronous = NORMAL")

        except sqlite3.Error:

            pass  # pragmas are best-effort; don't refuse a working connection

        return conn



    def init_database(self):

        """Initialize database tables"""

        conn = self.get_connection()

        cursor = conn.cursor()

        

        # Users table

        cursor.execute('''

            CREATE TABLE IF NOT EXISTS users (

                id INTEGER PRIMARY KEY AUTOINCREMENT,

                username TEXT UNIQUE NOT NULL,

                email TEXT UNIQUE NOT NULL,

                password_hash TEXT NOT NULL,

                full_name TEXT,

                avatar_url TEXT,

                bio TEXT,

                theme_preference TEXT DEFAULT 'light',

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                last_login TIMESTAMP

            )

        ''')

        

        # Clothing items table (with user_id)

        # NOTE: image_path / thumbnail_path are the *primary* (front) photo.

        # image_paths / thumbnail_paths are JSON arrays of all photos

        # (front first, then back / extras). Kept side-by-side so existing

        # endpoints and the closet grid keep working without touching JSON.

        cursor.execute('''

            CREATE TABLE IF NOT EXISTS clothing_items (

                id INTEGER PRIMARY KEY AUTOINCREMENT,

                user_id INTEGER NOT NULL,

                image_path TEXT NOT NULL,

                thumbnail_path TEXT,

                image_paths TEXT,

                thumbnail_paths TEXT,

                category TEXT NOT NULL,

                subcategory TEXT NOT NULL,

                colors TEXT NOT NULL,

                season TEXT,

                style TEXT,

                worn BOOLEAN DEFAULT 0,

                washed BOOLEAN DEFAULT 1,

                times_worn INTEGER DEFAULT 0,

                date_added TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                last_worn TIMESTAMP,

                purchase_date DATE,

                purchase_price DECIMAL(10,2),

                purchase_location TEXT,

                brand TEXT,

                size TEXT,

                wear_again_count INTEGER DEFAULT 0,

                max_wear_before_wash INTEGER DEFAULT 1,

                freshness_score DECIMAL(3,2) DEFAULT 1.00,

                condition_score DECIMAL(3,2) DEFAULT 1.00,

                is_favorite BOOLEAN DEFAULT 0,

                physical_location TEXT DEFAULT 'closet',

                storage_location TEXT,

                lent_to TEXT,

                lent_at TIMESTAMP,

                lent_until DATE,

                rotation_category TEXT DEFAULT 'new',

                notes TEXT,

                user_tags TEXT DEFAULT '[]',

                status TEXT DEFAULT 'owned',

                wishlist_intent TEXT,

                wishlist_url TEXT,

                wishlist_name TEXT,

                care_label_text TEXT,

                care_summary TEXT,

                is_bulk INTEGER NOT NULL DEFAULT 0,

                quantity INTEGER NOT NULL DEFAULT 1,

                clean_count INTEGER NOT NULL DEFAULT 1,

                clip_embedding TEXT,

                color_hexes TEXT,

                pattern TEXT,

                laundry_state TEXT DEFAULT 'clean',

                FOREIGN KEY (user_id) REFERENCES users (id)

            )

        ''')

        

        # Wear history table

        cursor.execute('''

            CREATE TABLE IF NOT EXISTS wear_history (

                id INTEGER PRIMARY KEY AUTOINCREMENT,

                item_id INTEGER,

                worn_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                occasion TEXT,

                rating INTEGER,

                notes TEXT,

                FOREIGN KEY (item_id) REFERENCES clothing_items (id)

            )

        ''')

        

        # Laundry queue table

        cursor.execute('''

            CREATE TABLE IF NOT EXISTS laundry_queue (

                id INTEGER PRIMARY KEY AUTOINCREMENT,

                item_id INTEGER,

                added_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                priority TEXT DEFAULT 'normal',

                status TEXT DEFAULT 'queued',

                estimated_ready DATE,

                FOREIGN KEY (item_id) REFERENCES clothing_items (id) ON DELETE CASCADE

            )

        ''')

        cursor.execute(

            '''

            CREATE TABLE IF NOT EXISTS password_reset_tokens (

                id INTEGER PRIMARY KEY AUTOINCREMENT,

                user_id INTEGER NOT NULL,

                token_hash TEXT NOT NULL,

                expires_at INTEGER NOT NULL,

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE

            )

            '''

        )

        cursor.execute(

            "CREATE UNIQUE INDEX IF NOT EXISTS ix_password_reset_token_hash "

            "ON password_reset_tokens (token_hash)"

        )

        

        # Lightweight migration: add columns to existing tables if missing.

        cursor.execute("PRAGMA table_info(users)")

        existing_user_cols = {row["name"] for row in cursor.fetchall()}

        if "token_version" not in existing_user_cols:

            # Bumping this column invalidates every outstanding JWT for the

            # user. Used by password change, "log out everywhere", and incident

            # response. Starts at 0 so existing tokens (which encode tv=0) keep

            # working after the migration runs.

            cursor.execute(

                "ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0"

            )

        if "failed_login_count" not in existing_user_cols:

            cursor.execute(

                "ALTER TABLE users ADD COLUMN failed_login_count INTEGER NOT NULL DEFAULT 0"

            )

        if "lockout_until" not in existing_user_cols:

            cursor.execute(

                "ALTER TABLE users ADD COLUMN lockout_until TIMESTAMP"

            )

        if "social_enabled" not in existing_user_cols:

            cursor.execute(

                "ALTER TABLE users ADD COLUMN social_enabled INTEGER NOT NULL DEFAULT 1"

            )

        if "app_mode" not in existing_user_cols:

            cursor.execute(

                "ALTER TABLE users ADD COLUMN app_mode TEXT NOT NULL DEFAULT 'normal'"

            )

        if "default_tab" not in existing_user_cols:

            cursor.execute(

                "ALTER TABLE users ADD COLUMN default_tab TEXT NOT NULL DEFAULT 'closet'"

            )

        if "default_closet_location_id" not in existing_user_cols:

            cursor.execute(

                "ALTER TABLE users ADD COLUMN default_closet_location_id INTEGER"

            )



        # Exactly one account per email, case-insensitive. Refuse to boot if the
        # DB already violates this (legacy case-only duplicates or manual edits).
        cursor.execute(
            """
            SELECT lower(email) AS lem, COUNT(*) AS n
            FROM users
            GROUP BY lem
            HAVING n > 1
            """
        )
        bad = cursor.fetchall()
        if bad:
            detail = ", ".join(
                f"{row['lem']!r} ({int(row['n'])} rows)" for row in bad
            )
            raise RuntimeError(
                "Duplicate emails (case-insensitive) in users table: "
                f"{detail}. "
                "Delete or merge duplicate rows, or change emails so each is "
                "unique ignoring case, then restart."
            )

        cursor.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email_lower "
            "ON users (lower(email))"
        )

        

        cursor.execute("PRAGMA table_info(clothing_items)")

        existing_cols = {row["name"] for row in cursor.fetchall()}

        if "thumbnail_path" not in existing_cols:

            cursor.execute(

                "ALTER TABLE clothing_items ADD COLUMN thumbnail_path TEXT"

            )

        if "image_paths" not in existing_cols:

            cursor.execute(

                "ALTER TABLE clothing_items ADD COLUMN image_paths TEXT"

            )

        if "thumbnail_paths" not in existing_cols:

            cursor.execute(

                "ALTER TABLE clothing_items ADD COLUMN thumbnail_paths TEXT"

            )

        if "storage_location" not in existing_cols:

            # User-set physical place ("front rack, left"). Separate from

            # physical_location, which the wash-state machine clobbers.

            cursor.execute(

                "ALTER TABLE clothing_items ADD COLUMN storage_location TEXT"

            )

        if "lent_to" not in existing_cols:

            cursor.execute("ALTER TABLE clothing_items ADD COLUMN lent_to TEXT")

        if "lent_at" not in existing_cols:

            cursor.execute(

                "ALTER TABLE clothing_items ADD COLUMN lent_at TIMESTAMP"

            )

        if "lent_until" not in existing_cols:

            cursor.execute("ALTER TABLE clothing_items ADD COLUMN lent_until DATE")

        if "status" not in existing_cols:

            # 'owned' = real garment in the closet (default).

            # 'wishlist' = something the user wants; excluded from closet views,

            # outfit recommender, laundry, stats. Promote to 'owned' on arrival.

            cursor.execute(

                "ALTER TABLE clothing_items ADD COLUMN status TEXT DEFAULT 'owned'"

            )

        if "wishlist_intent" not in existing_cols:

            # 'want' | 'gift' | 'saving' | 'sale_watch' — free-text validated at endpoint.

            cursor.execute(

                "ALTER TABLE clothing_items ADD COLUMN wishlist_intent TEXT"

            )

        if "wishlist_url" not in existing_cols:

            cursor.execute(

                "ALTER TABLE clothing_items ADD COLUMN wishlist_url TEXT"

            )

        if "wishlist_name" not in existing_cols:

            # Free-text name for photo-less wishlist entries ("Carhartt Detroit jacket").

            cursor.execute(

                "ALTER TABLE clothing_items ADD COLUMN wishlist_name TEXT"

            )

        if "care_label_text" not in existing_cols:

            cursor.execute(

                "ALTER TABLE clothing_items ADD COLUMN care_label_text TEXT"

            )

        if "care_summary" not in existing_cols:

            cursor.execute(

                "ALTER TABLE clothing_items ADD COLUMN care_summary TEXT"

            )

        if "user_tags" not in existing_cols:

            cursor.execute(

                "ALTER TABLE clothing_items ADD COLUMN user_tags TEXT DEFAULT '[]'"

            )

        if "packed_for_trip" not in existing_cols:

            cursor.execute(

                "ALTER TABLE clothing_items ADD COLUMN packed_for_trip INTEGER NOT NULL DEFAULT 0"

            )

        if "is_bulk" not in existing_cols:

            cursor.execute(

                "ALTER TABLE clothing_items ADD COLUMN is_bulk INTEGER NOT NULL DEFAULT 0"

            )

        if "quantity" not in existing_cols:

            cursor.execute(

                "ALTER TABLE clothing_items ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1"

            )

        if "clean_count" not in existing_cols:

            cursor.execute(

                "ALTER TABLE clothing_items ADD COLUMN clean_count INTEGER NOT NULL DEFAULT 1"

            )

        if "clip_embedding" not in existing_cols:

            cursor.execute("ALTER TABLE clothing_items ADD COLUMN clip_embedding TEXT")

        if "closet_location_id" not in existing_cols:

            cursor.execute(

                "ALTER TABLE clothing_items ADD COLUMN closet_location_id INTEGER"

            )

        if "color_hexes" not in existing_cols:

            cursor.execute("ALTER TABLE clothing_items ADD COLUMN color_hexes TEXT")

        if "pattern" not in existing_cols:

            cursor.execute("ALTER TABLE clothing_items ADD COLUMN pattern TEXT")

        if "laundry_state" not in existing_cols:

            cursor.execute(

                "ALTER TABLE clothing_items ADD COLUMN laundry_state TEXT DEFAULT 'clean'"

            )



        cursor.execute('''

            CREATE TABLE IF NOT EXISTS closet_locations (

                id INTEGER PRIMARY KEY AUTOINCREMENT,

                user_id INTEGER NOT NULL,

                name TEXT NOT NULL,

                kind TEXT DEFAULT 'home',

                is_default INTEGER NOT NULL DEFAULT 0,

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (user_id) REFERENCES users (id)

            )

        ''')

        cursor.execute(

            "CREATE INDEX IF NOT EXISTS idx_closet_locations_user "

            "ON closet_locations(user_id, is_default)"

        )



        # Social: friendships, fit posts, reactions, comments.

        cursor.execute('''

            CREATE TABLE IF NOT EXISTS friendships (

                id INTEGER PRIMARY KEY AUTOINCREMENT,

                requester_id INTEGER NOT NULL,

                addressee_id INTEGER NOT NULL,

                status TEXT NOT NULL DEFAULT 'pending',

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                responded_at TIMESTAMP,

                UNIQUE(requester_id, addressee_id),

                FOREIGN KEY (requester_id) REFERENCES users (id),

                FOREIGN KEY (addressee_id) REFERENCES users (id)

            )

        ''')



        cursor.execute('''

            CREATE TABLE IF NOT EXISTS fit_posts (

                id INTEGER PRIMARY KEY AUTOINCREMENT,

                user_id INTEGER NOT NULL,

                image_path TEXT NOT NULL,

                caption TEXT,

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                item_ids TEXT,

                trip_name TEXT,

                trip_destination TEXT,

                trip_start DATE,

                trip_end DATE,

                FOREIGN KEY (user_id) REFERENCES users (id)

            )

        ''')

        cursor.execute("PRAGMA table_info(fit_posts)")

        existing_fit_post_cols = {row["name"] for row in cursor.fetchall()}

        if "trip_name" not in existing_fit_post_cols:

            cursor.execute("ALTER TABLE fit_posts ADD COLUMN trip_name TEXT")

        if "trip_destination" not in existing_fit_post_cols:

            cursor.execute("ALTER TABLE fit_posts ADD COLUMN trip_destination TEXT")

        if "trip_start" not in existing_fit_post_cols:

            cursor.execute("ALTER TABLE fit_posts ADD COLUMN trip_start DATE")

        if "trip_end" not in existing_fit_post_cols:

            cursor.execute("ALTER TABLE fit_posts ADD COLUMN trip_end DATE")



        cursor.execute('''

            CREATE TABLE IF NOT EXISTS post_reactions (

                id INTEGER PRIMARY KEY AUTOINCREMENT,

                post_id INTEGER NOT NULL,

                user_id INTEGER NOT NULL,

                emoji TEXT NOT NULL,

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                UNIQUE(post_id, user_id, emoji),

                FOREIGN KEY (post_id) REFERENCES fit_posts (id) ON DELETE CASCADE,

                FOREIGN KEY (user_id) REFERENCES users (id)

            )

        ''')



        cursor.execute('''

            CREATE TABLE IF NOT EXISTS post_comments (

                id INTEGER PRIMARY KEY AUTOINCREMENT,

                post_id INTEGER NOT NULL,

                user_id INTEGER NOT NULL,

                body TEXT NOT NULL,

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (post_id) REFERENCES fit_posts (id) ON DELETE CASCADE,

                FOREIGN KEY (user_id) REFERENCES users (id)

            )

        ''')



        # Indexes that matter for the feed query and friend lookups.

        cursor.execute(

            "CREATE INDEX IF NOT EXISTS idx_friendships_addressee "

            "ON friendships(addressee_id, status)"

        )

        cursor.execute(

            "CREATE INDEX IF NOT EXISTS idx_friendships_requester "

            "ON friendships(requester_id, status)"

        )

        cursor.execute(

            "CREATE INDEX IF NOT EXISTS idx_fit_posts_user "

            "ON fit_posts(user_id, created_at DESC)"

        )

        cursor.execute(

            "CREATE INDEX IF NOT EXISTS idx_fit_posts_trip "

            "ON fit_posts(user_id, trip_name, created_at DESC)"

        )

        cursor.execute(

            "CREATE INDEX IF NOT EXISTS idx_post_reactions_post "

            "ON post_reactions(post_id)"

        )

        cursor.execute(

            "CREATE INDEX IF NOT EXISTS idx_post_comments_post "

            "ON post_comments(post_id, created_at)"

        )



        cursor.execute(

            """

            CREATE TABLE IF NOT EXISTS outfit_suggestion_history (

                id INTEGER PRIMARY KEY AUTOINCREMENT,

                user_id INTEGER NOT NULL,

                item_signature TEXT NOT NULL,

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (user_id) REFERENCES users (id)

            )

            """

        )

        cursor.execute(

            "CREATE INDEX IF NOT EXISTS idx_osh_user_time "

            "ON outfit_suggestion_history(user_id, created_at DESC)"

        )

        cursor.execute(

            """

            CREATE TABLE IF NOT EXISTS ai_stylist_feedback (

                id INTEGER PRIMARY KEY AUTOINCREMENT,

                user_id INTEGER NOT NULL,

                item_signature TEXT NOT NULL,

                useful INTEGER NOT NULL,

                message TEXT,

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (user_id) REFERENCES users (id)

            )

            """

        )

        cursor.execute(

            "CREATE INDEX IF NOT EXISTS idx_ai_stylist_feedback_user_time "

            "ON ai_stylist_feedback(user_id, created_at DESC)"

        )



        cursor.execute(

            """

            CREATE TABLE IF NOT EXISTS planned_outfits (

                id INTEGER PRIMARY KEY AUTOINCREMENT,

                user_id INTEGER NOT NULL,

                title TEXT NOT NULL,

                planned_for DATE NOT NULL,

                occasion TEXT,

                notes TEXT,

                status TEXT NOT NULL DEFAULT 'draft',

                prep_clean INTEGER NOT NULL DEFAULT 0,

                prep_packed INTEGER NOT NULL DEFAULT 0,

                prep_steamed INTEGER NOT NULL DEFAULT 0,

                prep_accessories INTEGER NOT NULL DEFAULT 0,

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (user_id) REFERENCES users (id)

            )

            """

        )

        cursor.execute(

            """

            CREATE TABLE IF NOT EXISTS planned_outfit_items (

                plan_id INTEGER NOT NULL,

                item_id INTEGER NOT NULL,

                PRIMARY KEY (plan_id, item_id),

                FOREIGN KEY (plan_id) REFERENCES planned_outfits (id) ON DELETE CASCADE,

                FOREIGN KEY (item_id) REFERENCES clothing_items (id) ON DELETE CASCADE

            )

            """

        )

        cursor.execute(

            "CREATE INDEX IF NOT EXISTS idx_planned_outfits_user_date "

            "ON planned_outfits(user_id, planned_for, status)"

        )

        cursor.execute(

            "CREATE INDEX IF NOT EXISTS idx_planned_outfit_items_item "

            "ON planned_outfit_items(item_id)"

        )

        cursor.execute(

            """

            CREATE TABLE IF NOT EXISTS trips (

                id INTEGER PRIMARY KEY AUTOINCREMENT,

                user_id INTEGER NOT NULL,

                name TEXT NOT NULL,

                destination TEXT,

                start_date DATE,

                end_date DATE,

                activities TEXT DEFAULT '[]',

                auto_unpacked_at TIMESTAMP,

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (user_id) REFERENCES users (id)

            )

            """

        )

        cursor.execute(

            "CREATE INDEX IF NOT EXISTS idx_trips_user_dates "

            "ON trips(user_id, start_date, end_date)"

        )

        cursor.execute(

            """

            CREATE TABLE IF NOT EXISTS trip_packed_items (

                trip_id INTEGER NOT NULL,

                item_id INTEGER NOT NULL,

                packed INTEGER NOT NULL DEFAULT 0,

                packed_at TIMESTAMP,

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                PRIMARY KEY (trip_id, item_id),

                FOREIGN KEY (trip_id) REFERENCES trips (id) ON DELETE CASCADE,

                FOREIGN KEY (item_id) REFERENCES clothing_items (id) ON DELETE CASCADE

            )

            """

        )

        cursor.execute(

            "CREATE INDEX IF NOT EXISTS idx_trip_packed_items_item "

            "ON trip_packed_items(item_id)"

        )

        cursor.execute(

            """

            CREATE TABLE IF NOT EXISTS classification_corrections (

                id INTEGER PRIMARY KEY AUTOINCREMENT,

                user_id INTEGER NOT NULL,

                item_id INTEGER NOT NULL,

                previous_data TEXT,

                corrected_data TEXT NOT NULL,

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (user_id) REFERENCES users (id),

                FOREIGN KEY (item_id) REFERENCES clothing_items (id) ON DELETE CASCADE

            )

            """

        )

        cursor.execute(

            "CREATE INDEX IF NOT EXISTS idx_classification_corrections_user "

            "ON classification_corrections(user_id, created_at DESC)"

        )

        cursor.execute(

            """

            CREATE TABLE IF NOT EXISTS reminder_cards (

                id INTEGER PRIMARY KEY AUTOINCREMENT,

                user_id INTEGER NOT NULL,

                kind TEXT NOT NULL,

                title TEXT NOT NULL,

                detail TEXT,

                due_date DATE,

                item_id INTEGER,

                plan_id INTEGER,

                dismissed_at TIMESTAMP,

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (user_id) REFERENCES users (id),

                FOREIGN KEY (item_id) REFERENCES clothing_items (id) ON DELETE CASCADE,

                FOREIGN KEY (plan_id) REFERENCES planned_outfits (id) ON DELETE CASCADE

            )

            """

        )

        cursor.execute(

            "CREATE INDEX IF NOT EXISTS idx_reminder_cards_user_due "

            "ON reminder_cards(user_id, dismissed_at, due_date)"

        )



        conn.commit()

        conn.close()



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

    

    # Social methods (friendships, fit posts, reactions, comments)



    @staticmethod

    def _public_user_row(row) -> Dict:

        """Strip secrets off a users row before returning to clients."""

        return {

            "id": row["id"],

            "username": row["username"],

            "full_name": row["full_name"],

            "avatar_url": row["avatar_url"],

            "bio": row["bio"],

        }



    def search_users(self, query: str, viewer_id: int, limit: int = 20) -> List[Dict]:

        """Find users by username or full_name. Excludes the viewer."""

        q = (query or "").strip()

        if not q:

            return []

        like = f"%{q}%"

        conn = self.get_connection()

        cursor = conn.cursor()

        cursor.execute(

            """

            SELECT id, username, full_name, avatar_url, bio

            FROM users

            WHERE id != ?

              AND (username LIKE ? OR COALESCE(full_name, '') LIKE ?)

            ORDER BY

                CASE WHEN username = ? THEN 0 ELSE 1 END,

                username

            LIMIT ?

            """,

            (viewer_id, like, like, q, limit),

        )

        rows = cursor.fetchall()

        conn.close()

        return [self._public_user_row(r) for r in rows]



    def get_public_profile(self, target_id: int, viewer_id: int) -> Optional[Dict]:

        """Public profile + friendship state from viewer's POV."""

        conn = self.get_connection()

        cursor = conn.cursor()

        cursor.execute(

            "SELECT id, username, full_name, avatar_url, bio, created_at "

            "FROM users WHERE id = ?",

            (target_id,),

        )

        row = cursor.fetchone()

        if not row:

            conn.close()

            return None

        profile = dict(row)



        cursor.execute(

            "SELECT COUNT(*) AS c FROM clothing_items "

            "WHERE user_id = ? AND COALESCE(status, 'owned') = 'owned'",

            (target_id,),

        )

        profile["item_count"] = cursor.fetchone()["c"]



        cursor.execute(

            "SELECT COUNT(*) AS c FROM fit_posts WHERE user_id = ?",

            (target_id,),

        )

        profile["post_count"] = cursor.fetchone()["c"]



        cursor.execute(

            "SELECT COUNT(*) AS c FROM friendships "

            "WHERE status = 'accepted' AND (requester_id = ? OR addressee_id = ?)",

            (target_id, target_id),

        )

        profile["friend_count"] = cursor.fetchone()["c"]



        relationship = "none"

        request_id: Optional[int] = None

        if viewer_id == target_id:

            relationship = "self"

        else:

            cursor.execute(

                """

                SELECT id, requester_id, addressee_id, status

                FROM friendships

                WHERE (requester_id = ? AND addressee_id = ?)

                   OR (requester_id = ? AND addressee_id = ?)

                """,

                (viewer_id, target_id, target_id, viewer_id),

            )

            f = cursor.fetchone()

            if f:

                request_id = f["id"]

                if f["status"] == "accepted":

                    relationship = "friends"

                elif f["status"] == "pending":

                    if f["requester_id"] == viewer_id:

                        relationship = "request_sent"

                    else:

                        relationship = "request_received"

        profile["relationship"] = relationship

        profile["friendship_id"] = request_id

        conn.close()

        return profile



    def send_friend_request(self, requester_id: int, addressee_id: int) -> Dict:

        """Create a pending friendship. Auto-accepts a reverse pending request."""

        if requester_id == addressee_id:

            return {"ok": False, "error": "Can't friend yourself"}



        conn = self.get_connection()

        cursor = conn.cursor()



        cursor.execute("SELECT id FROM users WHERE id = ?", (addressee_id,))

        if not cursor.fetchone():

            conn.close()

            return {"ok": False, "error": "User not found"}



        cursor.execute(

            """

            SELECT id, requester_id, status FROM friendships

            WHERE (requester_id = ? AND addressee_id = ?)

               OR (requester_id = ? AND addressee_id = ?)

            """,

            (requester_id, addressee_id, addressee_id, requester_id),

        )

        existing = cursor.fetchone()

        if existing:

            if existing["status"] == "accepted":

                conn.close()

                return {"ok": False, "error": "Already friends"}

            if existing["status"] == "pending":

                # Reverse pending = they sent first; accept it.

                if existing["requester_id"] == addressee_id:

                    cursor.execute(

                        "UPDATE friendships SET status = 'accepted', "

                        "responded_at = ? WHERE id = ?",

                        (datetime.now().isoformat(), existing["id"]),

                    )

                    conn.commit()

                    conn.close()

                    return {"ok": True, "status": "accepted", "id": existing["id"]}

                conn.close()

                return {"ok": False, "error": "Request already pending"}



        cursor.execute(

            "INSERT INTO friendships (requester_id, addressee_id, status) "

            "VALUES (?, ?, 'pending')",

            (requester_id, addressee_id),

        )

        new_id = cursor.lastrowid

        conn.commit()

        conn.close()

        return {"ok": True, "status": "pending", "id": new_id}



    def respond_to_friend_request(

        self, friendship_id: int, user_id: int, accept: bool

    ) -> bool:

        """Accept or reject a pending request addressed to user_id."""

        conn = self.get_connection()

        cursor = conn.cursor()

        cursor.execute(

            "SELECT addressee_id, status FROM friendships WHERE id = ?",

            (friendship_id,),

        )

        row = cursor.fetchone()

        if not row or row["addressee_id"] != user_id or row["status"] != "pending":

            conn.close()

            return False



        if accept:

            cursor.execute(

                "UPDATE friendships SET status = 'accepted', responded_at = ? "

                "WHERE id = ?",

                (datetime.now().isoformat(), friendship_id),

            )

        else:

            cursor.execute("DELETE FROM friendships WHERE id = ?", (friendship_id,))

        conn.commit()

        conn.close()

        return True



    def remove_friend(self, user_id: int, other_id: int) -> bool:

        """Tear down a friendship (or cancel a pending request) from either side."""

        conn = self.get_connection()

        cursor = conn.cursor()

        cursor.execute(

            """

            DELETE FROM friendships

            WHERE (requester_id = ? AND addressee_id = ?)

               OR (requester_id = ? AND addressee_id = ?)

            """,

            (user_id, other_id, other_id, user_id),

        )

        success = cursor.rowcount > 0

        conn.commit()

        conn.close()

        return success



    def get_friends(self, user_id: int) -> List[Dict]:

        """Accepted friends, most recently confirmed first."""

        conn = self.get_connection()

        cursor = conn.cursor()

        cursor.execute(

            """

            SELECT u.id, u.username, u.full_name, u.avatar_url, u.bio,

                   COALESCE(f.responded_at, f.created_at) AS since

            FROM friendships f

            JOIN users u ON u.id = CASE

                WHEN f.requester_id = ? THEN f.addressee_id

                ELSE f.requester_id

            END

            WHERE f.status = 'accepted'

              AND (f.requester_id = ? OR f.addressee_id = ?)

            ORDER BY since DESC

            """,

            (user_id, user_id, user_id),

        )

        rows = cursor.fetchall()

        conn.close()

        return [

            {

                "id": r["id"],

                "username": r["username"],

                "full_name": r["full_name"],

                "avatar_url": r["avatar_url"],

                "bio": r["bio"],

                "since": r["since"],

            }

            for r in rows

        ]



    def get_friend_requests(self, user_id: int) -> Dict:

        """Pending requests, split into incoming and outgoing."""

        conn = self.get_connection()

        cursor = conn.cursor()

        cursor.execute(

            """

            SELECT f.id, f.created_at, u.id AS uid, u.username, u.full_name,

                   u.avatar_url, u.bio

            FROM friendships f

            JOIN users u ON u.id = f.requester_id

            WHERE f.addressee_id = ? AND f.status = 'pending'

            ORDER BY f.created_at DESC

            """,

            (user_id,),

        )

        incoming = []

        for r in cursor.fetchall():

            incoming.append({

                "friendship_id": r["id"],

                "created_at": r["created_at"],

                "user": {

                    "id": r["uid"],

                    "username": r["username"],

                    "full_name": r["full_name"],

                    "avatar_url": r["avatar_url"],

                    "bio": r["bio"],

                },

            })



        cursor.execute(

            """

            SELECT f.id, f.created_at, u.id AS uid, u.username, u.full_name,

                   u.avatar_url, u.bio

            FROM friendships f

            JOIN users u ON u.id = f.addressee_id

            WHERE f.requester_id = ? AND f.status = 'pending'

            ORDER BY f.created_at DESC

            """,

            (user_id,),

        )

        outgoing = []

        for r in cursor.fetchall():

            outgoing.append({

                "friendship_id": r["id"],

                "created_at": r["created_at"],

                "user": {

                    "id": r["uid"],

                    "username": r["username"],

                    "full_name": r["full_name"],

                    "avatar_url": r["avatar_url"],

                    "bio": r["bio"],

                },

            })

        conn.close()

        return {"incoming": incoming, "outgoing": outgoing}



    def are_friends(self, user_a: int, user_b: int) -> bool:

        if user_a == user_b:

            return True

        conn = self.get_connection()

        cursor = conn.cursor()

        cursor.execute(

            """

            SELECT 1 FROM friendships

            WHERE status = 'accepted'

              AND ((requester_id = ? AND addressee_id = ?)

                   OR (requester_id = ? AND addressee_id = ?))

            """,

            (user_a, user_b, user_b, user_a),

        )

        found = cursor.fetchone() is not None

        conn.close()

        return found



    # Fit posts



    def create_fit_post(

        self,

        user_id: int,

        image_path: str,

        caption: Optional[str] = None,

        item_ids: Optional[List[int]] = None,

        trip_name: Optional[str] = None,

        trip_destination: Optional[str] = None,

        trip_start: Optional[str] = None,

        trip_end: Optional[str] = None,

    ) -> int:

        conn = self.get_connection()

        cursor = conn.cursor()

        ids_json = json.dumps(item_ids or [])

        cursor.execute(

            """

            INSERT INTO fit_posts (

                user_id, image_path, caption, item_ids,

                trip_name, trip_destination, trip_start, trip_end

            )

            VALUES (?, ?, ?, ?, ?, ?, ?, ?)

            """,

            (

                user_id,

                image_path,

                caption,

                ids_json,

                trip_name,

                trip_destination,

                trip_start,

                trip_end,

            ),

        )

        post_id = cursor.lastrowid



        # Bump times_worn on tagged items the poster owns. One bad id shouldn't

        # tank the whole post — silently skip foreign items.

        if item_ids:

            placeholders = ",".join("?" for _ in item_ids)

            cursor.execute(

                f"""

                UPDATE clothing_items

                SET times_worn = times_worn + 1,

                    last_worn = ?,

                    wear_again_count = wear_again_count + 1

                WHERE user_id = ? AND id IN ({placeholders})

                """,

                [datetime.now().isoformat(), user_id, *item_ids],

            )

        conn.commit()

        conn.close()

        return post_id



    def delete_fit_post(self, post_id: int, user_id: int) -> bool:

        conn = self.get_connection()

        cursor = conn.cursor()

        cursor.execute("SELECT user_id FROM fit_posts WHERE id = ?", (post_id,))

        row = cursor.fetchone()

        if not row or row["user_id"] != user_id:

            conn.close()

            return False

        # SQLite only enforces FK cascades when the foreign_keys pragma is on,

        # so wipe children explicitly for portability.

        cursor.execute("DELETE FROM post_reactions WHERE post_id = ?", (post_id,))

        cursor.execute("DELETE FROM post_comments WHERE post_id = ?", (post_id,))

        cursor.execute("DELETE FROM fit_posts WHERE id = ?", (post_id,))

        success = cursor.rowcount > 0

        conn.commit()

        conn.close()

        return success



    def _hydrate_post(self, cursor, post: Dict, viewer_id: int) -> Dict:

        """Attach author, reactions summary, comment count, item refs."""

        for key in ("trip_name", "trip_destination", "trip_start", "trip_end"):

            if key in post and post[key] == "":

                post[key] = None



        cursor.execute(

            "SELECT id, username, full_name, avatar_url "

            "FROM users WHERE id = ?",

            (post["user_id"],),

        )

        a = cursor.fetchone()

        post["author"] = (

            {

                "id": a["id"],

                "username": a["username"],

                "full_name": a["full_name"],

                "avatar_url": a["avatar_url"],

            }

            if a

            else None

        )



        try:

            ids = json.loads(post.get("item_ids") or "[]")

        except (TypeError, ValueError):

            ids = []

        post["item_ids"] = ids



        items: List[Dict] = []

        if ids:

            placeholders = ",".join("?" for _ in ids)

            cursor.execute(

                f"SELECT id, category, subcategory, thumbnail_path, image_path "

                f"FROM clothing_items WHERE id IN ({placeholders})",

                ids,

            )

            for row in cursor.fetchall():

                items.append({

                    "id": row["id"],

                    "category": row["category"],

                    "subcategory": row["subcategory"],

                    "thumbnail_path": row["thumbnail_path"],

                    "image_path": row["image_path"],

                })

        post["items"] = items



        cursor.execute(

            "SELECT emoji, COUNT(*) AS count, "

            "SUM(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS mine "

            "FROM post_reactions WHERE post_id = ? GROUP BY emoji",

            (viewer_id, post["id"]),

        )

        reactions = []

        for r in cursor.fetchall():

            reactions.append({

                "emoji": r["emoji"],

                "count": r["count"],

                "mine": bool(r["mine"]),

            })

        post["reactions"] = reactions



        cursor.execute(

            "SELECT COUNT(*) AS c FROM post_comments WHERE post_id = ?",

            (post["id"],),

        )

        post["comment_count"] = cursor.fetchone()["c"]

        return post



    def get_trip_logs(self, user_id: int, limit: int = 200) -> List[Dict]:

        """User-owned fit posts grouped into trip albums."""

        conn = self.get_connection()

        cursor = conn.cursor()

        cursor.execute(

            """

            SELECT * FROM fit_posts

            WHERE user_id = ?

              AND trip_name IS NOT NULL

              AND TRIM(trip_name) != ''

            ORDER BY created_at DESC

            LIMIT ?

            """,

            (user_id, limit),

        )



        groups: Dict[str, Dict] = {}

        order: List[str] = []

        for row in cursor.fetchall():

            post = dict(row)

            self._hydrate_post(cursor, post, user_id)

            key = "|".join(

                [

                    post.get("trip_name") or "",

                    post.get("trip_destination") or "",

                    post.get("trip_start") or "",

                    post.get("trip_end") or "",

                ]

            )

            if key not in groups:

                groups[key] = {

                    "name": post.get("trip_name"),

                    "destination": post.get("trip_destination"),

                    "start_date": post.get("trip_start"),

                    "end_date": post.get("trip_end"),

                    "post_count": 0,

                    "cover_image_path": post.get("image_path"),

                    "latest_post_at": post.get("created_at"),

                    "posts": [],

                }

                order.append(key)

            groups[key]["post_count"] += 1

            groups[key]["posts"].append(post)



        logs = [groups[key] for key in order]

        conn.close()

        return logs



    def get_feed(

        self, user_id: int, limit: int = 30, before: Optional[str] = None

    ) -> List[Dict]:

        """Reverse-chrono feed of posts from self + accepted friends."""

        conn = self.get_connection()

        cursor = conn.cursor()

        params: List = [user_id, user_id, user_id]

        time_clause = ""

        if before:

            time_clause = " AND p.created_at < ?"

            params.append(before)

        cursor.execute(

            f"""

            SELECT p.* FROM fit_posts p

            WHERE p.user_id = ?

               OR p.user_id IN (

                   SELECT CASE WHEN requester_id = ? THEN addressee_id

                               ELSE requester_id END

                   FROM friendships

                   WHERE status = 'accepted'

                     AND (requester_id = ? OR addressee_id = ?)

               )

               {time_clause}

            ORDER BY p.created_at DESC

            LIMIT ?

            """,

            params + [user_id, limit],

        )

        rows = cursor.fetchall()

        posts = []

        for row in rows:

            post = dict(row)

            self._hydrate_post(cursor, post, user_id)

            posts.append(post)

        conn.close()

        return posts



    def get_user_posts(

        self, target_id: int, viewer_id: int, limit: int = 30

    ) -> List[Dict]:

        """Posts by one user. Only visible to friends or self."""

        if target_id != viewer_id and not self.are_friends(target_id, viewer_id):

            return []

        conn = self.get_connection()

        cursor = conn.cursor()

        cursor.execute(

            "SELECT * FROM fit_posts WHERE user_id = ? "

            "ORDER BY created_at DESC LIMIT ?",

            (target_id, limit),

        )

        posts = []

        for row in cursor.fetchall():

            post = dict(row)

            self._hydrate_post(cursor, post, viewer_id)

            posts.append(post)

        conn.close()

        return posts



    def get_post(self, post_id: int, viewer_id: int) -> Optional[Dict]:

        """Single post; None if not visible to viewer."""

        conn = self.get_connection()

        cursor = conn.cursor()

        cursor.execute("SELECT * FROM fit_posts WHERE id = ?", (post_id,))

        row = cursor.fetchone()

        if not row:

            conn.close()

            return None

        post = dict(row)

        author_id = post["user_id"]

        if author_id != viewer_id and not self.are_friends(author_id, viewer_id):

            conn.close()

            return None

        self._hydrate_post(cursor, post, viewer_id)

        conn.close()

        return post



    def toggle_reaction(

        self, post_id: int, user_id: int, emoji: str

    ) -> Optional[bool]:

        """Toggle a reaction. True=added, False=removed, None=invalid/blocked."""

        emoji = (emoji or "").strip()

        if not emoji or len(emoji) > 16:

            return None

        conn = self.get_connection()

        cursor = conn.cursor()

        cursor.execute("SELECT user_id FROM fit_posts WHERE id = ?", (post_id,))

        row = cursor.fetchone()

        if not row:

            conn.close()

            return None

        author_id = row["user_id"]

        if author_id != user_id and not self.are_friends(author_id, user_id):

            conn.close()

            return None



        cursor.execute(

            "SELECT id FROM post_reactions "

            "WHERE post_id = ? AND user_id = ? AND emoji = ?",

            (post_id, user_id, emoji),

        )

        existing = cursor.fetchone()

        if existing:

            cursor.execute(

                "DELETE FROM post_reactions WHERE id = ?", (existing["id"],)

            )

            result = False

        else:

            cursor.execute(

                "INSERT INTO post_reactions (post_id, user_id, emoji) "

                "VALUES (?, ?, ?)",

                (post_id, user_id, emoji),

            )

            result = True

        conn.commit()

        conn.close()

        return result



    def add_comment(

        self, post_id: int, user_id: int, body: str

    ) -> Optional[int]:

        body = (body or "").strip()

        if not body or len(body) > 1000:

            return None

        conn = self.get_connection()

        cursor = conn.cursor()

        cursor.execute("SELECT user_id FROM fit_posts WHERE id = ?", (post_id,))

        row = cursor.fetchone()

        if not row:

            conn.close()

            return None

        author_id = row["user_id"]

        if author_id != user_id and not self.are_friends(author_id, user_id):

            conn.close()

            return None

        cursor.execute(

            "INSERT INTO post_comments (post_id, user_id, body) VALUES (?, ?, ?)",

            (post_id, user_id, body),

        )

        cid = cursor.lastrowid

        conn.commit()

        conn.close()

        return cid



    def get_comments(

        self, post_id: int, viewer_id: int

    ) -> Optional[List[Dict]]:

        conn = self.get_connection()

        cursor = conn.cursor()

        cursor.execute("SELECT user_id FROM fit_posts WHERE id = ?", (post_id,))

        row = cursor.fetchone()

        if not row:

            conn.close()

            return None

        author_id = row["user_id"]

        if author_id != viewer_id and not self.are_friends(author_id, viewer_id):

            conn.close()

            return None

        cursor.execute(

            """

            SELECT c.id, c.body, c.created_at, c.user_id,

                   u.username, u.full_name, u.avatar_url

            FROM post_comments c

            JOIN users u ON u.id = c.user_id

            WHERE c.post_id = ?

            ORDER BY c.created_at ASC

            """,

            (post_id,),

        )

        comments = []

        for r in cursor.fetchall():

            comments.append({

                "id": r["id"],

                "body": r["body"],

                "created_at": r["created_at"],

                "author": {

                    "id": r["user_id"],

                    "username": r["username"],

                    "full_name": r["full_name"],

                    "avatar_url": r["avatar_url"],

                },

            })

        conn.close()

        return comments



    def delete_comment(self, comment_id: int, user_id: int) -> bool:

        """Comment author OR post author may delete."""

        conn = self.get_connection()

        cursor = conn.cursor()

        cursor.execute(

            """

            SELECT c.user_id AS commenter_id, p.user_id AS post_author_id

            FROM post_comments c

            JOIN fit_posts p ON p.id = c.post_id

            WHERE c.id = ?

            """,

            (comment_id,),

        )

        row = cursor.fetchone()

        if not row:

            conn.close()

            return False

        if user_id != row["commenter_id"] and user_id != row["post_author_id"]:

            conn.close()

            return False

        cursor.execute("DELETE FROM post_comments WHERE id = ?", (comment_id,))

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



        Called from password change, `/auth/logout-all`, and incident response.

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





