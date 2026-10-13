"""Account deletion: password gate, full data removal, file cleanup, other users untouched."""

from __future__ import annotations

from io import BytesIO

from closet_org_pytest_helpers import MIN_PNG, auth_header, register_account


def _setup_two_friends_with_content(client, password: str):
    a = register_account(client, username="del_a", email="del_a@example.com", password=password)
    b = register_account(client, username="del_b", email="del_b@example.com", password=password)
    ha, hb = auth_header(a["access_token"]), auth_header(b["access_token"])

    up = client.post(
        "/api/upload-clothing",
        headers=ha,
        files=[("files", ("a.png", BytesIO(MIN_PNG), "image/png"))],
    )
    assert up.status_code == 200, up.text
    up_b = client.post(
        "/api/upload-clothing",
        headers=hb,
        files=[("files", ("b.png", BytesIO(MIN_PNG), "image/png"))],
    )
    assert up_b.status_code == 200, up_b.text

    client.post("/api/friends/requests", headers=ha, json={"user_id": b["user"]["id"]})
    fid = client.get("/api/friends/requests", headers=hb).json()["incoming"][0]["friendship_id"]
    client.post(f"/api/friends/requests/{fid}/accept", headers=hb)

    fit = client.post(
        "/api/fits",
        headers=ha,
        files={"file": ("fit.png", BytesIO(MIN_PNG), "image/png")},
        data={"caption": "OOTD"},
    )
    assert fit.status_code == 200, fit.text
    post_id = fit.json()["post"]["id"]
    assert client.post(
        f"/api/fits/{post_id}/comments", headers=hb, json={"body": "Nice"}
    ).status_code == 200
    return a, b, ha, hb


def test_delete_account_requires_correct_password(client, strong_password: str) -> None:
    tok = register_account(client, password=strong_password)["access_token"]
    r = client.post(
        "/api/auth/delete-account",
        headers=auth_header(tok),
        json={"password": "wrong-password-123"},
    )
    assert r.status_code == 401
    assert client.get("/api/auth/me", headers=auth_header(tok)).status_code == 200


def test_delete_account_requires_auth(client) -> None:
    r = client.post("/api/auth/delete-account", json={"password": "whatever"})
    assert r.status_code == 401


def test_delete_account_removes_data_and_files(
    client, strong_password: str, tmp_path, monkeypatch
) -> None:
    import deps

    uploads = tmp_path / "uploads"
    uploads.mkdir()
    monkeypatch.setattr(deps, "UPLOAD_DIR", uploads)
    placeholder = uploads / "_bulk_placeholder_socks.png"
    placeholder.write_bytes(MIN_PNG)

    a, b, ha, hb = _setup_two_friends_with_content(client, strong_password)
    files_before = {p.name for p in uploads.iterdir()}
    # A item + its grid thumb, B item + its grid thumb, A fit, placeholder
    assert len(files_before) == 6

    r = client.post("/api/auth/delete-account", headers=ha, json={"password": strong_password})
    assert r.status_code == 200, r.text

    # Old token is dead and the username can't log in.
    assert client.get("/api/auth/me", headers=ha).status_code == 401
    login = client.post(
        "/api/auth/login", json={"username": "del_a", "password": strong_password}
    )
    assert login.status_code == 401

    db = deps.db
    conn = db.get_connection()
    uid = a["user"]["id"]
    try:
        for sql in (
            "SELECT COUNT(*) FROM users WHERE id = ?",
            "SELECT COUNT(*) FROM clothing_items WHERE user_id = ?",
            "SELECT COUNT(*) FROM fit_posts WHERE user_id = ?",
            "SELECT COUNT(*) FROM friendships WHERE requester_id = ? OR addressee_id = ?",
        ):
            params = (uid,) * sql.count("?")
            assert conn.execute(sql, params).fetchone()[0] == 0, sql
        # B's comment on A's post is gone with the post.
        assert conn.execute("SELECT COUNT(*) FROM post_comments").fetchone()[0] == 0
    finally:
        conn.close()

    # B is untouched: still logged in, still has their item.
    assert client.get("/api/auth/me", headers=hb).status_code == 200
    closet_b = client.get("/api/closet", headers=hb).json()
    items_b = closet_b["items"] if isinstance(closet_b, dict) else closet_b
    assert len(items_b) == 1

    # Only B's photo (+ grid thumb) and the shared placeholder survive.
    remaining = {p.name for p in uploads.iterdir()}
    assert placeholder.name in remaining
    assert len(remaining) == 3


def test_delete_account_files_cannot_escape_uploads(tmp_path, monkeypatch) -> None:
    import deps
    from route_helpers import _remove_user_upload_files

    uploads = tmp_path / "uploads"
    uploads.mkdir()
    outside = tmp_path / "secret.txt"
    outside.write_text("keep me")
    monkeypatch.setattr(deps, "UPLOAD_DIR", uploads)

    _remove_user_upload_files([str(outside), "../secret.txt", "/uploads/../secret.txt"])
    assert outside.exists()


def test_public_delete_account_url_points_at_privacy_section(client) -> None:
    r = client.get("/delete-account", follow_redirects=False)
    assert r.status_code == 302
    assert r.headers["location"] == "/privacy#delete-account"
    page = client.get("/privacy").text
    assert 'id="delete-account"' in page
