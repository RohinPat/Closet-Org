import os
import sqlite3
from pathlib import Path
from typing import Optional

from database.schema import SchemaMixin
from database.users import UsersMixin
from database.locations import LocationsMixin
from database.items import ItemsMixin
from database.planning import PlanningMixin
from database.trips import TripsMixin
from database.insights import InsightsMixin
from database.wishlist import WishlistMixin
from database.laundry import LaundryMixin
from database.social import SocialMixin
from database.sessions import SessionsMixin
from database.wears import WearsMixin
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


class DatabaseManager(
    SchemaMixin,
    UsersMixin,
    LocationsMixin,
    ItemsMixin,
    PlanningMixin,
    TripsMixin,
    InsightsMixin,
    WishlistMixin,
    LaundryMixin,
    SocialMixin,
    SessionsMixin,
    WearsMixin,
):

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
