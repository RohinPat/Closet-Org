"""Broad HTTP coverage against ``main`` with faked weather + classifier (see ``conftest.client``)."""

from __future__ import annotations

from io import BytesIO

import pytest

from closet_org_pytest_helpers import MIN_PNG, auth_header, register_account


@pytest.fixture
def tok(client, strong_password: str) -> str:
    return register_account(client, password=strong_password)["access_token"]


@pytest.fixture
def h(tok: str):
    return auth_header(tok)


def test_static_pages(client) -> None:
    assert client.get("/healthz").json() == {"status": "ok"}
    for path in ("/", "/app", "/login", "/register"):
        assert client.get(path).status_code == 200


def test_weather_and_bad_inputs(client, h: dict) -> None:
    assert client.get("/api/weather/geocode?q=Boston", headers=h).status_code == 200
    assert client.get("/api/weather/geocode?q=x", headers=h).status_code == 400
    assert client.get("/api/weather/current?lat=42&lon=-71", headers=h).status_code == 200
    assert client.get("/api/weather/current?lat=999&lon=0", headers=h).status_code == 400
    bad = client.get("/api/weather/current?lat=40", headers=h)
    assert bad.status_code == 422  # missing lon
    assert (
        client.get(
            "/api/weather/forecast?lat=42&lon=-71&start_date=2026-05-01",
            headers=h,
        ).status_code
        == 200
    )


def test_auth_extensions(client, strong_password: str, h: dict) -> None:
    assert client.get("/api/auth/me", headers=h).status_code == 200
    ch = client.post(
        "/api/auth/change-password",
        headers=h,
        json={
            "current_password": strong_password,
            "new_password": "Xyz987654321",
        },
    )
    assert ch.status_code == 200, ch.text
    h2 = auth_header(ch.json()["access_token"])
    assert client.post("/api/auth/logout-all", headers=h2).status_code == 200


def test_profile_and_settings(client, strong_password: str) -> None:
    tok = register_account(
        client,
        username="prof_user",
        email="prof_user@example.com",
        password=strong_password,
    )["access_token"]
    hdr = auth_header(tok)
    assert (
        client.put(
            "/api/auth/profile",
            headers=hdr,
            json={"full_name": "Prof Name", "bio": "Hello"},
        ).status_code
        == 200
    )
    assert client.get("/api/settings", headers=hdr).status_code == 200
    assert (
        client.put(
            "/api/settings",
            headers=hdr,
            json={"social_enabled": False, "theme_preference": "dark"},
        ).status_code
        == 200
    )


def test_closet_reads_and_bulk(client, h: dict) -> None:
    assert client.get("/api/closet", headers=h).status_code == 200
    assert client.get("/api/closet/insights", headers=h).status_code == 200
    assert client.get("/api/reminders", headers=h).status_code == 200
    assert (
        client.post(
            "/api/closet/bulk-item",
            headers=h,
            json={
                "name": "socks pack",
                "subcategory": "Footwear",
                "quantity": 3,
                "clean_count": 3,
                "colors": ["Black"],
            },
        ).status_code
        == 200
    )


def test_laundry_state_keeps_queue_in_sync(client, h: dict) -> None:
    up = client.post(
        "/api/upload-clothing",
        headers=h,
        files=[("files", ("a.png", BytesIO(MIN_PNG), "image/png"))],
    )
    assert up.status_code == 200, up.text
    item_id = up.json()["item_id"]

    empty = client.get("/api/laundry", headers=h)
    assert empty.status_code == 200
    assert empty.json()["total"] == 0

    ham = client.put(
        f"/api/item/{item_id}",
        headers=h,
        json={"laundry_state": "in_hamper"},
    )
    assert ham.status_code == 200, ham.text
    queued = client.get("/api/laundry", headers=h)
    assert queued.status_code == 200
    bucket = queued.json()["queued"]
    ids = [int(it["item_id"]) for it in bucket]
    assert item_id in ids

    dry = client.put(
        f"/api/item/{item_id}",
        headers=h,
        json={"laundry_state": "washing"},
    )
    assert dry.status_code == 200, dry.text
    washers = client.get("/api/laundry", headers=h)
    assert washers.status_code == 200
    ws = washers.json()["washing"]
    wids = [int(it["item_id"]) for it in ws]
    assert item_id in wids

    fresh = client.put(
        f"/api/item/{item_id}",
        headers=h,
        json={"laundry_state": "clean"},
    )
    assert fresh.status_code == 200, fresh.text
    done = client.get("/api/laundry", headers=h)
    assert done.status_code == 200
    assert done.json()["total"] == 0


def test_upload_and_item_family(client, h: dict) -> None:
    up = client.post(
        "/api/upload-clothing",
        headers=h,
        files=[("files", ("a.png", BytesIO(MIN_PNG), "image/png"))],
    )
    assert up.status_code == 200, up.text
    item_id = up.json()["item_id"]

    assert client.get(f"/api/item/{item_id}", headers=h).status_code == 200
    assert (
        client.get(f"/api/item/{item_id}/outfits", headers=h).status_code == 200
    )
    assert (
        client.get(f"/api/item/{item_id}/wear-history", headers=h).status_code == 200
    )
    assert (
        client.get(f"/api/item/{item_id}/worn-outfits", headers=h).status_code == 200
    )
    assert (
        client.put(
            "/api/item/%s/status" % item_id,
            headers=h,
            json={"worn": True},
        ).status_code
        == 200
    )
    assert (
        client.put(
            "/api/item/%s/favorite" % item_id,
            headers=h,
            json={"favorite": True},
        ).status_code
        in (200, 204)
    )
    assert client.get("/api/stats", headers=h).status_code == 200
    assert client.get("/api/neglected-items", headers=h).status_code == 200
    assert (
        client.get("/api/outfits/recommend", headers=h).status_code == 200
    )


def test_fit_check_visual_embedding_csv(client, h: dict) -> None:
    fc = client.post(
        "/api/closet/fit-check",
        headers=h,
        files=[("files", ("fc.png", BytesIO(MIN_PNG), "image/png"))],
    )
    assert fc.status_code == 200, fc.text

    vs = client.post(
        "/api/closet/visual-search",
        headers=h,
        files=[("files", ("vs.png", BytesIO(MIN_PNG), "image/png"))],
    )
    assert vs.status_code == 200, vs.text

    eb = client.post("/api/closet/embedding-backfill", headers=h)
    assert eb.status_code == 200

    csv_body = "name,category,subcategory,color\nImported Tee,T-Shirt,Top,Red\n"
    imp = client.post(
        "/api/closet/import-csv",
        headers=h,
        json={"csv_text": csv_body},
    )
    assert imp.status_code == 200, imp.text

    man = client.post(
        "/api/closet/import-manual",
        headers=h,
        json={
            "title": "Manual olive chinos",
            "subcategory": "Bottom",
            "colors": ["Olive"],
            "description": "Straight fit.",
            "tags": ["work", "basics"],
        },
    )
    assert man.status_code == 200, man.text
    assert man.json().get("created") == 1
    assert isinstance(man.json().get("item_id"), int)


def test_trips_and_locations(client, h: dict) -> None:
    bulk = client.post(
        "/api/closet/bulk-item",
        headers=h,
        json={
            "name": "trip socks",
            "subcategory": "Footwear",
            "quantity": 1,
            "clean_count": 1,
        },
    )
    assert bulk.status_code == 200, bulk.text
    item_id = bulk.json()["item_id"]

    assert client.get("/api/trips", headers=h).status_code == 200
    tr = client.post(
        "/api/trips",
        headers=h,
        json={"name": "Weekend", "destination": "NYC"},
    )
    assert tr.status_code == 200, tr.text
    tid = tr.json()["trip"]["id"]
    assert (
        client.put(
            f"/api/trips/{tid}",
            headers=h,
            json={"name": "Weekend trip"},
        ).status_code
        == 200
    )
    assert (
        client.put(
            f"/api/trips/{tid}/packed",
            headers=h,
            json={"item_id": item_id, "packed": True},
        ).status_code
        == 200
    )
    assert client.post("/api/trips/auto-unpack", headers=h).status_code == 200

    assert client.get("/api/closet/locations", headers=h).status_code == 200
    lr = client.post(
        "/api/closet/locations",
        headers=h,
        json={"name": "Shelf A", "kind": "home"},
    )
    assert lr.status_code == 200, lr.text
    lid = lr.json()["location"]["id"]
    assert (
        client.put(
            f"/api/closet/locations/{lid}",
            headers=h,
            json={"name": "Shelf A+"},
        ).status_code
        == 200
    )
    assert (
        client.delete(f"/api/closet/locations/{lid}", headers=h).status_code == 200
    )


def test_planned_outfits(client, h: dict) -> None:
    assert client.get("/api/planned-outfits", headers=h).status_code == 200
    pr = client.post(
        "/api/planned-outfits",
        headers=h,
        json={
            "title": "Monday look",
            "planned_for": "2026-06-01",
            "status": "draft",
        },
    )
    assert pr.status_code == 200, pr.text
    pid = pr.json()["plan"]["id"]
    assert client.get(f"/api/planned-outfits/{pid}", headers=h).status_code == 200
    assert (
        client.put(
            f"/api/planned-outfits/{pid}",
            headers=h,
            json={"title": "Monday look v2"},
        ).status_code
        == 200
    )
    assert (
        client.delete(f"/api/planned-outfits/{pid}", headers=h).status_code == 200
    )


def test_wishlist_laundry_refresh(client, h: dict) -> None:
    assert client.get("/api/wishlist", headers=h).status_code == 200
    wr = client.post(
        "/api/wishlist",
        headers=h,
        json={"name": "Dream jacket", "category": "Jacket"},
    )
    assert wr.status_code == 200, wr.text
    wid = wr.json()["item_id"]
    assert (
        client.put(f"/api/wishlist/{wid}", headers=h, json={"notes": "sale"}).status_code
        == 200
    )

    up = client.post(
        "/api/upload-clothing",
        headers=h,
        files=[("files", ("b.png", BytesIO(MIN_PNG), "image/png"))],
    )
    assert up.status_code == 200
    iid = up.json()["item_id"]
    assert (
        client.post(f"/api/laundry/add/{iid}", headers=h).status_code == 200
    )
    assert client.get("/api/laundry", headers=h).status_code == 200
    assert client.post("/api/refresh-scores", headers=h).status_code == 200


def test_ai_stylist_and_errors(client, h: dict) -> None:
    assert (
        client.post(
            "/api/upload-clothing",
            headers=h,
            files=[("files", ("sty.png", BytesIO(MIN_PNG), "image/png"))],
        ).status_code
        == 200
    )
    base = {"message": "Help me dress for work tomorrow"}
    assert client.post("/api/ai-stylist", headers=h, json=base).status_code == 200
    latlon_bad = {**base, "lat": 10.0}
    assert client.post("/api/ai-stylist", headers=h, json=latlon_bad).status_code == 400

    assert (
        client.post(
            "/api/ai-stylist/feedback",
            headers=h,
            json={"item_signature": "1", "useful": True},
        ).status_code
        == 200
    )


def test_social_feed_and_friends_flow(client, strong_password: str) -> None:
    a = register_account(
        client,
        username="soc_a",
        email="soc_a@example.com",
        password=strong_password,
    )
    b = register_account(
        client,
        username="soc_b",
        email="soc_b@example.com",
        password=strong_password,
    )
    ha = auth_header(a["access_token"])
    hb = auth_header(b["access_token"])
    uid_b = b["user"]["id"]

    assert (
        client.post("/api/friends/requests", headers=ha, json={"user_id": uid_b}).status_code
        == 200
    )
    inbox = client.get("/api/friends/requests", headers=hb).json()
    assert inbox["incoming"]
    fid = inbox["incoming"][0]["friendship_id"]
    assert (
        client.post(f"/api/friends/requests/{fid}/accept", headers=hb).status_code
        == 200
    )
    assert client.get("/api/friends", headers=ha).status_code == 200

    fit = client.post(
        "/api/fits",
        headers=ha,
        files={"file": ("fit.png", BytesIO(MIN_PNG), "image/png")},
        data={"caption": "OOTD"},
    )
    assert fit.status_code == 200, fit.text
    post_id = fit.json()["post"]["id"]

    assert client.get("/api/feed", headers=ha).status_code == 200
    bad_cursor = client.get(
        "/api/feed",
        headers=ha,
        params={"before": "not-an-iso-ts"},
    )
    assert bad_cursor.status_code == 400

    assert client.get(f"/api/fits/{post_id}", headers=ha).status_code == 200
    assert (
        client.post(
            f"/api/fits/{post_id}/react",
            headers=hb,
            json={"emoji": "heart"},
        ).status_code
        == 200
    )
    cm = client.post(
        f"/api/fits/{post_id}/comments",
        headers=hb,
        json={"body": "Nice fit"},
    )
    assert cm.status_code == 200, cm.text
    cid = cm.json()["comment_id"]
    assert (
        client.delete(f"/api/comments/{cid}", headers=hb).status_code == 200
    )

    assert (
        client.delete("/api/friends/%s" % uid_b, headers=ha).status_code == 200
    )


def test_users_search_and_public(client, strong_password: str) -> None:
    register_account(
        client,
        username="findme_x",
        email="findme_x@example.com",
        password=strong_password,
    )
    tok = register_account(
        client,
        username="searcher_y",
        email="searcher_y@example.com",
        password=strong_password,
    )["access_token"]
    hdr = auth_header(tok)
    r = client.get("/api/users/search", headers=hdr, params={"q": "findme"})
    assert r.status_code == 200
    rows = r.json().get("users") or []
    assert rows
    uid = rows[0]["id"]
    assert client.get(f"/api/users/{uid}", headers=hdr).status_code == 200
    assert (
        client.get("/api/users/by-username/findme_x", headers=hdr).status_code == 200
    )
    assert (
        client.get(f"/api/users/{uid}/posts", headers=hdr).status_code == 200
    )


def test_avatar_and_trips_logs(client, h: dict) -> None:
    av = client.post(
        "/api/auth/avatar",
        headers=h,
        files={"file": ("av.png", BytesIO(MIN_PNG), "image/png")},
    )
    assert av.status_code == 200, av.text
    assert client.get("/api/trips/logs", headers=h).status_code == 200


def test_feed_cursor_iso_ok(client, strong_password: str) -> None:
    u = register_account(
        client,
        username="feed_iso",
        email="feed_iso@example.com",
        password=strong_password,
    )
    hdr = auth_header(u["access_token"])
    ts = "2026-01-15T12:00:00+00:00"
    assert (
        client.get("/api/feed", headers=hdr, params={"before": ts}).status_code == 200
    )


def test_packed_bulk_put(client, h: dict) -> None:
    """Smoke ``PUT /api/closet/packed`` when ``item_ids`` is omitted (bulk all)."""
    assert (
        client.put(
            "/api/closet/packed",
            headers=h,
            json={"packed_for_trip": False},
        ).status_code
        == 200
    )


def test_delete_fit_post(client, strong_password: str) -> None:
    u = register_account(
        client,
        username="fit_del",
        email="fit_del@example.com",
        password=strong_password,
    )
    hdr = auth_header(u["access_token"])
    fit = client.post(
        "/api/fits",
        headers=hdr,
        files={"file": ("fit.png", BytesIO(MIN_PNG), "image/png")},
        data={"caption": "temp"},
    )
    assert fit.status_code == 200, fit.text
    pid = fit.json()["post"]["id"]
    assert client.delete(f"/api/fits/{pid}", headers=hdr).status_code == 200


def test_friend_request_reject(client, strong_password: str) -> None:
    a = register_account(
        client,
        username="rej_a",
        email="rej_a@example.com",
        password=strong_password,
    )
    b = register_account(
        client,
        username="rej_b",
        email="rej_b@example.com",
        password=strong_password,
    )
    ha = auth_header(a["access_token"])
    hb = auth_header(b["access_token"])
    uid_b = b["user"]["id"]
    assert (
        client.post("/api/friends/requests", headers=ha, json={"user_id": uid_b}).status_code
        == 200
    )
    inbox = client.get("/api/friends/requests", headers=hb).json()
    fid = inbox["incoming"][0]["friendship_id"]
    assert (
        client.post(f"/api/friends/requests/{fid}/reject", headers=hb).status_code == 200
    )
