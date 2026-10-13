"""Users, friends, feed, fit posts and comments."""

from __future__ import annotations

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
)
from typing import List, Optional
from security import clip_text, rate_limit, save_uploaded_image
from datetime import datetime
from auth import get_current_user
import deps
from schemas import (
    CommentCreate,
    FriendRequestCreate,
    ReactionToggle,
)
from route_helpers import (
    _validate_iso_date,
)

router = APIRouter()


@router.get("/api/users/search")

def search_users(

    q: str = "",

    current_user: dict = Depends(get_current_user),

):

    q = (q or "").strip()[:60]  # cap input length; SQL LIKE handles the rest

    return {"users": deps.db.search_users(q, viewer_id=current_user["user_id"])}


@router.get("/api/users/{user_id}")

def get_public_user(

    user_id: int,

    current_user: dict = Depends(get_current_user),

):

    profile = deps.db.get_public_profile(

        target_id=user_id, viewer_id=current_user["user_id"]

    )

    if not profile:

        raise HTTPException(status_code=404, detail="User not found")

    return profile


@router.get("/api/users/by-username/{username}")

def get_public_user_by_username(

    username: str,

    current_user: dict = Depends(get_current_user),

):

    user = deps.db.get_user_by_username(username.strip()[:60])

    if not user:

        raise HTTPException(status_code=404, detail="User not found")

    return deps.db.get_public_profile(

        target_id=user["id"], viewer_id=current_user["user_id"]

    )


@router.get("/api/users/{user_id}/posts")

def get_user_posts_endpoint(

    user_id: int,

    current_user: dict = Depends(get_current_user),

):

    return {

        "posts": deps.db.get_user_posts(

            target_id=user_id, viewer_id=current_user["user_id"]

        )

    }


@router.get("/api/friends")

def list_friends(current_user: dict = Depends(get_current_user)):

    return {"friends": deps.db.get_friends(current_user["user_id"])}


@router.get("/api/friends/requests")

def list_friend_requests(current_user: dict = Depends(get_current_user)):

    return deps.db.get_friend_requests(current_user["user_id"])


@router.post("/api/friends/requests")

def create_friend_request(

    body: FriendRequestCreate,

    current_user: dict = Depends(get_current_user),

):

    result = deps.db.send_friend_request(

        requester_id=current_user["user_id"], addressee_id=body.user_id

    )

    if not result.get("ok"):

        raise HTTPException(status_code=400, detail=result.get("error", "Failed"))

    return result


@router.post("/api/friends/requests/{friendship_id}/accept")

def accept_friend_request(

    friendship_id: int,

    current_user: dict = Depends(get_current_user),

):

    ok = deps.db.respond_to_friend_request(

        friendship_id=friendship_id,

        user_id=current_user["user_id"],

        accept=True,

    )

    if not ok:

        raise HTTPException(status_code=404, detail="Request not found")

    return {"success": True}


@router.post("/api/friends/requests/{friendship_id}/reject")

def reject_friend_request(

    friendship_id: int,

    current_user: dict = Depends(get_current_user),

):

    ok = deps.db.respond_to_friend_request(

        friendship_id=friendship_id,

        user_id=current_user["user_id"],

        accept=False,

    )

    if not ok:

        raise HTTPException(status_code=404, detail="Request not found")

    return {"success": True}


@router.delete("/api/friends/{user_id}")

def remove_friend(

    user_id: int,

    current_user: dict = Depends(get_current_user),

):

    ok = deps.db.remove_friend(current_user["user_id"], user_id)

    if not ok:

        raise HTTPException(status_code=404, detail="No relationship")

    return {"success": True}


@router.get("/api/feed")

def get_feed(

    before: Optional[str] = None,

    current_user: dict = Depends(get_current_user),

):

    """Chronological feed of self + friends' fit posts."""

    if before is not None:

        # Validate the cursor — otherwise a client could pass arbitrary

        # strings that hit the SQL comparison and turn into runtime errors.

        try:

            datetime.fromisoformat(before)

        except ValueError:

            raise HTTPException(

                status_code=400, detail="before must be an ISO timestamp"

            )

    return {"posts": deps.db.get_feed(user_id=current_user["user_id"], before=before)}


@router.post("/api/fits")

def create_fit_post(

    request: Request,

    file: UploadFile = File(...),

    caption: Optional[str] = Form(None),

    item_ids: Optional[str] = Form(None),

    trip_name: Optional[str] = Form(None),

    trip_destination: Optional[str] = Form(None),

    trip_start: Optional[str] = Form(None),

    trip_end: Optional[str] = Form(None),

    current_user: dict = Depends(get_current_user),

):

    """Post a fit pic. Optional caption, item tags, and trip album metadata."""

    rate_limit(request, "fits.create", limit=30, window=600)



    saved = save_uploaded_image(

        file, deps.UPLOAD_DIR, prefix=f"fit_{current_user['user_id']}"

    )



    parsed_ids: List[int] = []

    if item_ids:

        for tok in item_ids.split(","):

            tok = tok.strip()

            if not tok:

                continue

            try:

                parsed_ids.append(int(tok))

            except ValueError:

                continue

            if len(parsed_ids) >= 30:

                break  # cap tag count, no need to scan unbounded input



    clean_caption = clip_text(caption, max_len=2000)

    clean_trip_name = clip_text(trip_name, max_len=120)

    clean_trip_destination = clip_text(trip_destination, max_len=120)

    clean_trip_start = _validate_iso_date(trip_start, "trip_start")

    clean_trip_end = _validate_iso_date(trip_end, "trip_end")

    if clean_trip_start and clean_trip_end and clean_trip_end < clean_trip_start:

        raise HTTPException(status_code=400, detail="trip_end must be after trip_start")



    post_id = deps.db.create_fit_post(

        user_id=current_user["user_id"],

        image_path=str(saved),

        caption=clean_caption,

        item_ids=parsed_ids,

        trip_name=clean_trip_name,

        trip_destination=clean_trip_destination,

        trip_start=clean_trip_start,

        trip_end=clean_trip_end,

    )

    post = deps.db.get_post(post_id=post_id, viewer_id=current_user["user_id"])

    return {"success": True, "post": post}


@router.get("/api/fits/{post_id}")

def get_fit_post(

    post_id: int,

    current_user: dict = Depends(get_current_user),

):

    post = deps.db.get_post(post_id=post_id, viewer_id=current_user["user_id"])

    if not post:

        raise HTTPException(status_code=404, detail="Post not found")

    return post


@router.delete("/api/fits/{post_id}")

def delete_fit_post(

    post_id: int,

    current_user: dict = Depends(get_current_user),

):

    ok = deps.db.delete_fit_post(post_id=post_id, user_id=current_user["user_id"])

    if not ok:

        raise HTTPException(status_code=404, detail="Post not found")

    return {"success": True}


@router.post("/api/fits/{post_id}/react")

def react_to_fit(

    post_id: int,

    body: ReactionToggle,

    current_user: dict = Depends(get_current_user),

):

    result = deps.db.toggle_reaction(

        post_id=post_id, user_id=current_user["user_id"], emoji=body.emoji

    )

    if result is None:

        raise HTTPException(status_code=400, detail="Could not react")

    return {"success": True, "active": result}


@router.get("/api/fits/{post_id}/comments")

def list_comments(

    post_id: int,

    current_user: dict = Depends(get_current_user),

):

    comments = deps.db.get_comments(post_id=post_id, viewer_id=current_user["user_id"])

    if comments is None:

        raise HTTPException(status_code=404, detail="Post not found")

    return {"comments": comments}


@router.post("/api/fits/{post_id}/comments")

def post_comment(

    post_id: int,

    body: CommentCreate,

    current_user: dict = Depends(get_current_user),

):

    cid = deps.db.add_comment(

        post_id=post_id, user_id=current_user["user_id"], body=body.body

    )

    if cid is None:

        raise HTTPException(status_code=400, detail="Could not add comment")

    return {"success": True, "comment_id": cid}


@router.delete("/api/comments/{comment_id}")

def delete_comment_endpoint(

    comment_id: int,

    current_user: dict = Depends(get_current_user),

):

    ok = deps.db.delete_comment(comment_id=comment_id, user_id=current_user["user_id"])

    if not ok:

        raise HTTPException(status_code=404, detail="Comment not found")

    return {"success": True}
