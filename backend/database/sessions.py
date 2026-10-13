"""DatabaseManager methods: refresh-token sessions (rotation + reuse detection).

Only a SHA-256 hash of each refresh token is stored. Every refresh consumes the
presented token and issues a new one in the same *family* (one family per
login). Presenting an already-rotated token again means it was copied, so the
whole family is revoked, logging that device out everywhere it was used.
"""

from __future__ import annotations

import hashlib
import secrets
import time
import uuid
from typing import Optional, Tuple

# A second refresh with the same token inside this window is treated as a
# client race (two tabs / two requests refreshing at once), not theft.
ROTATION_GRACE_SECONDS = 30


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


class SessionsMixin:
    def create_refresh_token(
        self, user_id: int, ttl_seconds: int, family_id: Optional[str] = None
    ) -> str:
        """Issue a new refresh token (new family unless one is given)."""
        token = secrets.token_urlsafe(48)
        now = int(time.time())
        conn = self.get_connection()
        try:
            conn.execute(
                "INSERT INTO refresh_tokens (user_id, family_id, token_hash, created_at, expires_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (user_id, family_id or uuid.uuid4().hex, _hash(token), now, now + ttl_seconds),
            )
            # Opportunistic cleanup of long-dead rows.
            conn.execute(
                "DELETE FROM refresh_tokens WHERE expires_at < ?", (now - 7 * 86400,)
            )
            conn.commit()
        finally:
            conn.close()
        return token

    def rotate_refresh_token(
        self, token: str, ttl_seconds: int
    ) -> Tuple[str, Optional[int], Optional[str]]:
        """Consume ``token`` and issue its successor.

        Returns ``(status, user_id, new_token)`` where status is one of
        ``ok``, ``invalid``, ``expired``, ``revoked``, ``conflict`` (rotated a
        moment ago by a concurrent request) or ``reused`` (family revoked).
        """
        now = int(time.time())
        conn = self.get_connection()
        try:
            # IMMEDIATE takes the write lock up front so two concurrent
            # refreshes of the same token can't both succeed.
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute(
                "SELECT id, user_id, family_id, expires_at, rotated_at, revoked_at "
                "FROM refresh_tokens WHERE token_hash = ?",
                (_hash(token),),
            ).fetchone()
            if row is None:
                conn.rollback()
                return "invalid", None, None
            if row["revoked_at"] is not None:
                conn.rollback()
                return "revoked", None, None
            if row["rotated_at"] is not None:
                if now - row["rotated_at"] <= ROTATION_GRACE_SECONDS:
                    conn.rollback()
                    return "conflict", None, None
                conn.execute(
                    "UPDATE refresh_tokens SET revoked_at = ? "
                    "WHERE family_id = ? AND revoked_at IS NULL",
                    (now, row["family_id"]),
                )
                conn.commit()
                return "reused", row["user_id"], None
            if row["expires_at"] <= now:
                conn.rollback()
                return "expired", None, None

            new_token = secrets.token_urlsafe(48)
            conn.execute(
                "UPDATE refresh_tokens SET rotated_at = ? WHERE id = ?", (now, row["id"])
            )
            conn.execute(
                "INSERT INTO refresh_tokens (user_id, family_id, token_hash, created_at, expires_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (row["user_id"], row["family_id"], _hash(new_token), now, now + ttl_seconds),
            )
            conn.commit()
            return "ok", row["user_id"], new_token
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def revoke_refresh_family(self, token: str) -> bool:
        """Log out one device: revoke the family the token belongs to."""
        now = int(time.time())
        conn = self.get_connection()
        try:
            row = conn.execute(
                "SELECT family_id FROM refresh_tokens WHERE token_hash = ?", (_hash(token),)
            ).fetchone()
            if row is None:
                return False
            conn.execute(
                "UPDATE refresh_tokens SET revoked_at = ? "
                "WHERE family_id = ? AND revoked_at IS NULL",
                (now, row["family_id"]),
            )
            conn.commit()
            return True
        finally:
            conn.close()

    def revoke_all_refresh_tokens(self, user_id: int) -> None:
        now = int(time.time())
        conn = self.get_connection()
        try:
            conn.execute(
                "UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL",
                (now, user_id),
            )
            conn.commit()
        finally:
            conn.close()
