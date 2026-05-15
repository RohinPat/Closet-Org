import sqlite3
from datetime import datetime
from typing import List, Dict, Optional
import json
from pathlib import Path


_BACKEND_DIR = Path(__file__).resolve().parent.parent
_DEFAULT_DB = str(_BACKEND_DIR / "closet.db")

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
        self.db_path = db_path or _DEFAULT_DB
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
                status TEXT DEFAULT 'owned',
                wishlist_intent TEXT,
                wishlist_url TEXT,
                wishlist_name TEXT,
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
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        ''')

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
            "CREATE INDEX IF NOT EXISTS idx_post_reactions_post "
            "ON post_reactions(post_id)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_post_comments_post "
            "ON post_comments(post_id, created_at)"
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
            "SELECT * FROM users WHERE email = ? COLLATE NOCASE",
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
                           theme_preference: Optional[str] = None) -> bool:
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
             purchase_date, purchase_price, purchase_location, brand, size, max_wear_before_wash)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (user_id, image_path, thumbnail_path, image_paths_json, thumbnail_paths_json,
              category, subcategory, colors_json, season, style,
              purchase_date, purchase_price, purchase_location, brand, size, max_wear_before_wash))

        item_id = cursor.lastrowid
        conn.commit()
        conn.close()

        return item_id

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
    }

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
            "SELECT user_id FROM clothing_items WHERE id = ?",
            (item_id,),
        )
        row = cursor.fetchone()
        if not row or row["user_id"] != user_id:
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
    
    def get_all_items(self, user_id: int, category: Optional[str] = None,
                     status: Optional[str] = None) -> List[Dict]:
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

        query += " ORDER BY date_added DESC"
        
        cursor.execute(query, params)
        rows = cursor.fetchall()
        
        items = []
        for row in rows:
            item = dict(row)
            item["colors"] = json.loads(item["colors"])
            item["worn"] = bool(item["worn"])
            item["washed"] = bool(item["washed"])
            self._decode_image_paths(item)
            items.append(item)

        conn.close()
        return items

    def get_item(self, item_id: int) -> Optional[Dict]:
        """Get a specific clothing item with calculated metrics"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT * FROM clothing_items WHERE id = ?", (item_id,))
        row = cursor.fetchone()
        
        if row:
            item = dict(row)
            item["colors"] = json.loads(item["colors"])
            item["worn"] = bool(item["worn"])
            item["washed"] = bool(item["washed"])
            item["is_favorite"] = bool(item.get("is_favorite", False))
            self._decode_image_paths(item)

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
        
        # Get current item state. Wear/wash doesn't apply to wishlist entries.
        cursor.execute("""
            SELECT wear_again_count, max_wear_before_wash, times_worn, freshness_score, status
            FROM clothing_items WHERE id = ?
        """, (item_id,))
        item = cursor.fetchone()

        if not item or (item["status"] and item["status"] != "owned"):
            conn.close()
            return False
        
        updates = []
        params = []
        
        if worn is not None:
            updates.append("worn = ?")
            params.append(1 if worn else 0)
            
            if worn:
                # Increment times worn
                updates.append("times_worn = times_worn + 1")
                updates.append("last_worn = ?")
                params.append(datetime.now().isoformat())
                
                # Increment wear-again count
                updates.append("wear_again_count = wear_again_count + 1")
                
                # Add to wear history
                cursor.execute(
                    "INSERT INTO wear_history (item_id, occasion, rating) VALUES (?, ?, ?)",
                    (item_id, occasion, rating)
                )
                
                # Check if needs washing
                new_wear_count = item["wear_again_count"] + 1
                if new_wear_count >= item["max_wear_before_wash"]:
                    updates.append("washed = 0")
                    updates.append("physical_location = 'needs_wash'")
                
                # Update freshness score (decrease slightly with each wear)
                new_freshness = max(0.0, float(item["freshness_score"]) - 0.05)
                updates.append("freshness_score = ?")
                params.append(new_freshness)
        
        if wear_again is not None:
            # User decided item can be worn again without washing
            if wear_again:
                updates.append("washed = 1")  # Still considered "clean enough"
                updates.append("physical_location = 'closet'")
            else:
                # Send to laundry
                updates.append("washed = 0")
                updates.append("physical_location = 'laundry'")
        
        if washed is not None:
            updates.append("washed = ?")
            params.append(1 if washed else 0)
            
            if washed:
                # Reset wear-again count when washed
                updates.append("wear_again_count = 0")
                updates.append("freshness_score = 1.0")
                updates.append("physical_location = 'closet'")
        
        if not updates:
            conn.close()
            return True
        
        query = f"UPDATE clothing_items SET {', '.join(updates)} WHERE id = ?"
        params.append(item_id)
        
        cursor.execute(query, params)
        success = cursor.rowcount > 0
        
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
        
        conn.close()
        
        return {
            "total_items": total,
            "by_category": by_category,
            "dirty_items": dirty,
            "clean_items": total - dirty,
            "most_worn": most_worn,
            "recently_added": recent
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
            item["worn"] = bool(item["worn"])
            item["washed"] = bool(item["washed"])
            item["is_favorite"] = bool(item.get("is_favorite", False))
            self._decode_image_paths(item)
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
        """Add item to laundry queue"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
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
            self._decode_image_paths(item)
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
    ) -> int:
        conn = self.get_connection()
        cursor = conn.cursor()
        ids_json = json.dumps(item_ids or [])
        cursor.execute(
            "INSERT INTO fit_posts (user_id, image_path, caption, item_ids) "
            "VALUES (?, ?, ?, ?)",
            (user_id, image_path, caption, ids_json),
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
                    wear_again_count = 0, freshness_score = 1.0
                WHERE id = (SELECT item_id FROM laundry_queue WHERE id = ?)
            """, (queue_id,))
            
            cursor.execute("DELETE FROM laundry_queue WHERE id = ?", (queue_id,))
        
        success = cursor.rowcount > 0
        conn.commit()
        conn.close()
        return success


