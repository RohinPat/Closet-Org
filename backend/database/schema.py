"""DatabaseManager methods: Table creation and in-place migrations."""

from __future__ import annotations



class SchemaMixin:
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
