"""Hot queries must use an index, not scan the whole table.

Without these, every closet read scans all users' items and every item view
scans all wear history; cost grows with total users, not the caller's data.
"""

from __future__ import annotations

import pytest

from database import db_manager as dm

HOT_QUERIES = [
    "SELECT * FROM clothing_items WHERE user_id = 1 AND (status IS NULL OR status = 'owned')",
    "SELECT id, item_id, worn_date FROM wear_history WHERE item_id = 1 ORDER BY worn_date DESC LIMIT 365",
    "SELECT id FROM laundry_queue WHERE item_id = 1 AND status != 'ready'",
    "SELECT lq.*, ci.* FROM laundry_queue lq JOIN clothing_items ci ON lq.item_id = ci.id WHERE ci.user_id = 1",
    "DELETE FROM classification_corrections WHERE item_id = 1",
    "DELETE FROM reminder_cards WHERE item_id = 1",
    "DELETE FROM post_comments WHERE user_id = 1",
]


@pytest.mark.parametrize("sql", HOT_QUERIES)
def test_hot_query_uses_index(tmp_path, sql: str) -> None:
    db = dm.DatabaseManager(str(tmp_path / "plan.sqlite"))
    conn = db.get_connection()
    try:
        plan = [row[-1] for row in conn.execute("EXPLAIN QUERY PLAN " + sql)]
    finally:
        conn.close()
    full_scans = [p for p in plan if p.startswith("SCAN") and "USING" not in p]
    assert not full_scans, f"{sql}\nplan: {plan}"
