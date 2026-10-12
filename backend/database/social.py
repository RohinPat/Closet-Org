"""DatabaseManager methods: Public profiles, friends, fit posts, feed, reactions and comments."""

from __future__ import annotations

from datetime import datetime
from typing import Dict
from typing import List
from typing import Optional
import json


class SocialMixin:
    

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
