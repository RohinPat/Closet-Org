"""Logging a whole outfit as worn (Today screen)."""

from __future__ import annotations

from closet_org_pytest_helpers import auth_header, register_account


def _make_items(client, h, n=3):
    ids = []
    for i in range(n):
        r = client.post(
            "/api/closet/bulk-item",
            headers=h,
            json={"name": f"piece {i}", "subcategory": "Top", "quantity": 1, "clean_count": 1,
                  "colors": ["Black"]},
        )
        assert r.status_code == 200, r.text
        ids.append(r.json()["item_id"])
    return ids


def test_nothing_logged_yet(client, strong_password) -> None:
    h = auth_header(register_account(client, password=strong_password)["access_token"])
    r = client.get("/api/outfits/wear/today", headers=h)
    assert r.status_code == 200
    assert r.json() == {"outfit": None}


def test_wear_marks_items_and_shows_as_today(client, strong_password) -> None:
    import deps

    h = auth_header(register_account(client, password=strong_password)["access_token"])
    ids = _make_items(client, h)
    r = client.post("/api/outfits/wear", headers=h, json={"item_ids": ids[:2], "occasion": "work"})
    assert r.status_code == 200, r.text
    outfit = r.json()["outfit"]
    assert sorted(i["id"] for i in outfit["items"]) == sorted(ids[:2])
    assert outfit["occasion"] == "work"
    for item_id in ids[:2]:
        item = deps.db.get_item(item_id)
        assert item["times_worn"] == 1 and item["last_worn"]
    assert deps.db.get_item(ids[2])["times_worn"] == 0

    today = client.get("/api/outfits/wear/today", headers=h).json()["outfit"]
    assert sorted(i["id"] for i in today["items"]) == sorted(ids[:2])
    # The recommender's avoid-list now includes this outfit.
    sig = ",".join(str(i) for i in sorted(ids[:2]))
    uid = client.get("/api/auth/me", headers=h).json()["id"]
    assert sig in deps.db.get_logged_outfit_signatures(uid)


def test_cannot_log_someone_elses_items(client, strong_password) -> None:
    a = auth_header(register_account(client, username="wear_a", email="wear_a@example.com",
                                     password=strong_password)["access_token"])
    b = auth_header(register_account(client, username="wear_b", email="wear_b@example.com",
                                     password=strong_password)["access_token"])
    a_ids = _make_items(client, a, 1)
    r = client.post("/api/outfits/wear", headers=b, json={"item_ids": a_ids})
    assert r.status_code == 404
    assert client.get("/api/outfits/wear/today", headers=b).json() == {"outfit": None}


def test_rejects_empty_or_oversized_outfits(client, strong_password) -> None:
    h = auth_header(register_account(client, password=strong_password)["access_token"])
    assert client.post("/api/outfits/wear", headers=h, json={"item_ids": []}).status_code == 422
    assert client.post("/api/outfits/wear", headers=h, json={"item_ids": list(range(1, 10))}).status_code == 422
