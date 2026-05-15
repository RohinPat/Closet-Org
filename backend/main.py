"""FastAPI app + routes.

Security posture (see SECURITY.md for the long version):
- All /api/ routes outside /api/auth/{register,login} require a valid Bearer
  JWT. Every route that takes an item / queue id as a path parameter checks
  ownership against the authenticated user before doing anything.
- Uploads go through ``security.save_uploaded_image``: server-generated
  filenames, magic-byte sniffing, PIL re-validation, byte cap.
- Auth endpoints are rate-limited per IP; failed logins also tick a
  per-account counter that locks the account after enough failures.
- Internal exceptions are never echoed back to clients — generic messages
  only. The actual traceback goes to the server log.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime
from pathlib import Path
from typing import List, Optional

import uvicorn
from fastapi import (
    Depends,
    FastAPI,
    File,
    HTTPException,
    Request,
    UploadFile,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr, Field

from auth import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)

# Pre-baked dummy bcrypt hash used to mask login timing for unknown
# usernames. Lazily computed on first miss so unit tests don't pay for it.
_DUMMY_PASSWORD_HASH: Optional[str] = None


def _dummy_hash() -> str:
    global _DUMMY_PASSWORD_HASH
    if _DUMMY_PASSWORD_HASH is None:
        _DUMMY_PASSWORD_HASH = hash_password("__dummy_login_padding__")
    return _DUMMY_PASSWORD_HASH
from database.db_manager import get_db
from models.outfit_recommender import OutfitRecommender
from security import (
    ALLOWED_ORIGINS,
    BodyLimitMiddleware,
    PRODUCTION,
    SecurityHeadersMiddleware,
    clip_text,
    normalize_email,
    normalize_username,
    rate_limit,
    safe_uploads_url,
    save_uploaded_image,
    validate_password,
)

logger = logging.getLogger("closet_org")


app = FastAPI(
    title="Closet-Org API",
    version="1.0.0",
    docs_url=None if PRODUCTION else "/docs",
    redoc_url=None if PRODUCTION else "/redoc",
    openapi_url=None if PRODUCTION else "/openapi.json",
)


# ---- Middleware --------------------------------------------------------------
# Order matters: outermost runs first on requests, last on responses.

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(BodyLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
    max_age=600,
)


# ---- Pydantic models ---------------------------------------------------------

class UserRegister(BaseModel):
    username: str = Field(..., min_length=3, max_length=30)
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=512)
    full_name: Optional[str] = Field(default=None, max_length=120)


class UserLogin(BaseModel):
    username: str = Field(..., min_length=1, max_length=60)
    password: str = Field(..., min_length=1, max_length=512)


class UserProfile(BaseModel):
    full_name: Optional[str] = Field(default=None, max_length=120)
    bio: Optional[str] = Field(default=None, max_length=500)
    theme_preference: Optional[str] = Field(default=None, max_length=16)


class PasswordChange(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=512)
    new_password: str = Field(..., min_length=1, max_length=512)


class ItemStatusUpdate(BaseModel):
    worn: Optional[bool] = None
    washed: Optional[bool] = None
    wear_again: Optional[bool] = None
    occasion: Optional[str] = Field(default=None, max_length=120)
    rating: Optional[int] = Field(default=None, ge=1, le=5)


class ItemDetailsUpdate(BaseModel):
    brand: Optional[str] = Field(default=None, max_length=80)
    size: Optional[str] = Field(default=None, max_length=20)
    notes: Optional[str] = Field(default=None, max_length=2000)
    purchase_date: Optional[str] = Field(default=None, max_length=20)
    purchase_price: Optional[float] = Field(default=None, ge=0, le=1_000_000)
    purchase_location: Optional[str] = Field(default=None, max_length=120)
    storage_location: Optional[str] = Field(default=None, max_length=120)


class ItemLendRequest(BaseModel):
    lent_to: str = Field(..., min_length=1, max_length=80)
    # ISO date string, e.g. "2026-06-01".
    lent_until: Optional[str] = Field(default=None, max_length=20)


class WishlistCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    category: Optional[str] = Field(default="Other", max_length=40)
    subcategory: Optional[str] = Field(default="Wishlist", max_length=40)
    intent: Optional[str] = Field(default=None, max_length=20)
    price: Optional[float] = Field(default=None, ge=0, le=1_000_000)
    url: Optional[str] = Field(default=None, max_length=500)


class WishlistUpdate(BaseModel):
    wishlist_name: Optional[str] = Field(default=None, max_length=120)
    wishlist_intent: Optional[str] = Field(default=None, max_length=20)
    wishlist_url: Optional[str] = Field(default=None, max_length=500)
    brand: Optional[str] = Field(default=None, max_length=80)
    size: Optional[str] = Field(default=None, max_length=20)
    notes: Optional[str] = Field(default=None, max_length=2000)
    purchase_price: Optional[float] = Field(default=None, ge=0, le=1_000_000)


class FriendRequestCreate(BaseModel):
    user_id: int = Field(..., ge=1)


class ReactionToggle(BaseModel):
    emoji: str = Field(..., min_length=1, max_length=16)


class CommentCreate(BaseModel):
    body: str = Field(..., min_length=1, max_length=1000)


# ---- Globals -----------------------------------------------------------------

db = get_db()
outfit_recommender = OutfitRecommender()

_classifier = None

_VALID_THEMES = {"light", "dark", "system"}
_VALID_LAUNDRY_PRIORITY = {"low", "normal", "urgent"}
_VALID_LAUNDRY_STATUS = {"queued", "washing", "drying", "ready"}
_VALID_WISHLIST_INTENTS = {"want", "gift", "saving", "sale_watch"}


def get_classifier():
    global _classifier
    if _classifier is None:
        from models.clothing_classifier import ClothingClassifier
        _classifier = ClothingClassifier()
    return _classifier


BASE_DIR = Path(__file__).resolve().parent.parent
UPLOAD_DIR = BASE_DIR / "uploads"
FRONTEND_DIR = BASE_DIR / "frontend"
UPLOAD_DIR.mkdir(exist_ok=True)


app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")
app.mount("/frontend", StaticFiles(directory=str(FRONTEND_DIR)), name="frontend")


# ---- Static pages ------------------------------------------------------------

@app.get("/")
async def root():
    return FileResponse(str(FRONTEND_DIR / "landing.html"))


@app.get("/app")
async def app_page():
    return FileResponse(str(FRONTEND_DIR / "index.html"))


@app.get("/login")
async def login_page():
    return FileResponse(str(FRONTEND_DIR / "login.html"))


@app.get("/register")
async def register_page():
    return FileResponse(str(FRONTEND_DIR / "register.html"))


@app.get("/healthz")
async def healthz():
    """Liveness probe. Doesn't touch the database — just confirms the
    process is serving. Use /readyz for a deeper check once you add one.
    """
    return {"status": "ok"}


# ---- Auth --------------------------------------------------------------------

def _public_user(user: dict) -> dict:
    """Strip secret fields before returning a user record to the client."""
    return {
        "id": user["id"],
        "username": user["username"],
        "email": user["email"],
        "full_name": user.get("full_name"),
        "avatar_url": user.get("avatar_url"),
        "bio": user.get("bio"),
        "theme_preference": user.get("theme_preference", "light"),
        "created_at": user.get("created_at"),
        "last_login": user.get("last_login"),
    }


@app.post("/api/auth/register")
async def register(user_data: UserRegister, request: Request):
    """Register a new user."""
    # Tight per-IP cap. Doesn't stop a botnet but stops 1-IP signup floods.
    rate_limit(request, "auth.register", limit=5, window=300)

    username = normalize_username(user_data.username)
    email = normalize_email(user_data.email)
    validate_password(user_data.password, username=username)

    if db.get_user_by_username(username):
        raise HTTPException(status_code=400, detail="Username already exists")
    if db.get_user_by_email(email):
        raise HTTPException(status_code=400, detail="Email already exists")

    full_name = clip_text(user_data.full_name, max_len=120)
    password_hash = hash_password(user_data.password)
    user_id = db.create_user(
        username=username,
        email=email,
        password_hash=password_hash,
        full_name=full_name,
    )
    if user_id is None:
        raise HTTPException(status_code=500, detail="Failed to create user")

    access_token = create_access_token(
        user_id=user_id, username=username, token_version=0
    )
    return {
        "success": True,
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user_id,
            "username": username,
            "email": email,
            "full_name": full_name,
        },
    }


@app.post("/api/auth/login")
async def login(credentials: UserLogin, request: Request):
    """Exchange username/password for an access token."""
    # Per-IP throttle. Account-level lockout below adds a second layer.
    rate_limit(request, "auth.login", limit=10, window=300)

    raw_username = (credentials.username or "").strip()
    if not raw_username:
        # Still pay the bcrypt cost so an empty username doesn't return
        # noticeably faster than a real one with the wrong password.
        verify_password(credentials.password, _dummy_hash())
        raise HTTPException(status_code=401, detail="Invalid username or password")

    user = db.get_user_by_username(raw_username)

    # Always run a bcrypt compare against *something* — against the real hash
    # if the user exists, against a stable dummy hash if not. Without this,
    # the response time leaks whether the username exists.
    expected_hash = user["password_hash"] if user else _dummy_hash()
    password_ok = verify_password(credentials.password, expected_hash)

    if user is None or not password_ok:
        if user is not None:
            db.record_login_failure(user["id"])
        raise HTTPException(status_code=401, detail="Invalid username or password")

    lockout = db.get_login_lockout(user["id"])
    if lockout:
        # Even with the right password we refuse during lockout — otherwise
        # the lockout offers no defence against an attacker who eventually
        # guesses correctly.
        raise HTTPException(
            status_code=429,
            detail="Account temporarily locked due to repeated failed logins",
        )

    db.clear_login_failures(user["id"])
    db.update_last_login(user["id"])

    token_version = int(user.get("token_version") or 0)
    access_token = create_access_token(
        user_id=user["id"],
        username=user["username"],
        token_version=token_version,
    )
    return {
        "success": True,
        "access_token": access_token,
        "token_type": "bearer",
        "user": _public_user(user),
    }


@app.post("/api/auth/logout-all")
async def logout_all(current_user: dict = Depends(get_current_user)):
    """Invalidate every outstanding token for the calling user.

    The next request from any device will get a 401 and need to log in
    again. Useful after a suspected token leak or shared-device cleanup.
    """
    db.bump_token_version(current_user["user_id"])
    return {"success": True}


@app.post("/api/auth/change-password")
async def change_password(
    body: PasswordChange,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Verify the current password, set a new one, and revoke all old tokens."""
    rate_limit(request, "auth.change_password", limit=5, window=300)

    user = db.get_user_by_id(current_user["user_id"])
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not verify_password(body.current_password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    validate_password(body.new_password, username=user["username"])

    new_hash = hash_password(body.new_password)
    db.update_password(user_id=user["id"], password_hash=new_hash)
    db.bump_token_version(user["id"])

    # Re-issue a token so the caller doesn't have to redo the login flow.
    new_version = db.get_user_token_version(user["id"]) or 0
    token = create_access_token(
        user_id=user["id"], username=user["username"], token_version=new_version
    )
    return {"success": True, "access_token": token, "token_type": "bearer"}


@app.get("/api/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    user = db.get_user_by_id(current_user["user_id"])
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return _public_user(user)


@app.put("/api/auth/profile")
async def update_profile(
    profile_data: UserProfile,
    current_user: dict = Depends(get_current_user),
):
    theme = profile_data.theme_preference
    if theme is not None and theme not in _VALID_THEMES:
        raise HTTPException(status_code=400, detail="Invalid theme")
    success = db.update_user_profile(
        user_id=current_user["user_id"],
        full_name=clip_text(profile_data.full_name, max_len=120),
        bio=clip_text(profile_data.bio, max_len=500),
        theme_preference=theme,
    )
    if not success:
        raise HTTPException(status_code=500, detail="Failed to update profile")
    return {"success": True}


# ---- Ownership guard ---------------------------------------------------------

def _require_item_owner(item_id: int, user_id: int) -> None:
    """Raise 404 if the item doesn't exist OR isn't owned by the caller.

    Returning 404 (not 403) avoids leaking the existence of other users'
    items via id enumeration.
    """
    if not db.item_belongs_to(item_id, user_id):
        raise HTTPException(status_code=404, detail="Item not found")


# ---- Clothing ----------------------------------------------------------------

@app.post("/api/upload-clothing")
async def upload_clothing(
    request: Request,
    files: List[UploadFile] = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload and classify a clothing item.

    Up to 8 photos per request — the first is the front (drives
    classification), the rest are extras whose colors are merged in.
    """
    rate_limit(request, "upload.clothing", limit=60, window=600)

    if not files:
        raise HTTPException(status_code=400, detail="No file uploaded")
    if len(files) > 8:
        raise HTTPException(status_code=400, detail="At most 8 photos per upload")

    try:
        from models.clothing_classifier import generate_cutout_thumbnail

        saved_paths: List[str] = []
        thumb_paths: List[Optional[str]] = []
        classifications = []

        for upload in files:
            saved = save_uploaded_image(upload, UPLOAD_DIR, prefix="item")
            saved_paths.append(str(saved))

            classifications.append(get_classifier().classify(str(saved)))

            thumb = saved.with_name(saved.stem + ".thumb.png")
            thumb_ok = generate_cutout_thumbnail(str(saved), str(thumb))
            thumb_paths.append(str(thumb) if thumb_ok else None)

        front = classifications[0]
        merged_colors: List[str] = []
        for cls in classifications:
            for c in cls.get("colors", []):
                if c not in merged_colors:
                    merged_colors.append(c)
        classification = {
            **front,
            "colors": merged_colors or front.get("colors", []),
        }

        item_id = db.add_clothing_item(
            user_id=current_user["user_id"],
            image_path=saved_paths[0],
            thumbnail_path=thumb_paths[0],
            image_paths=saved_paths,
            thumbnail_paths=thumb_paths,
            category=classification["category"],
            subcategory=classification["subcategory"],
            colors=classification["colors"],
            season=classification["season"],
            style=classification["style"],
        )

        return {
            "success": True,
            "item_id": item_id,
            "classification": classification,
            "image_url": safe_uploads_url(saved_paths[0], UPLOAD_DIR),
            "thumbnail_url": safe_uploads_url(thumb_paths[0], UPLOAD_DIR),
            "image_urls": [safe_uploads_url(p, UPLOAD_DIR) for p in saved_paths],
            "thumbnail_urls": [safe_uploads_url(p, UPLOAD_DIR) for p in thumb_paths],
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("upload-clothing failed")
        raise HTTPException(status_code=500, detail="Upload failed")


@app.get("/api/closet")
async def get_closet(
    category: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    items = db.get_all_items(
        user_id=current_user["user_id"],
        category=category,
        status=status,
    )
    return {"items": items}


@app.get("/api/item/{item_id}")
async def get_item(
    item_id: int,
    current_user: dict = Depends(get_current_user),
):
    """Get one item. 404s if it isn't yours — id enumeration leaks nothing."""
    _require_item_owner(item_id, current_user["user_id"])
    item = db.get_item(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


@app.put("/api/item/{item_id}/status")
async def update_item_status(
    item_id: int,
    status_update: ItemStatusUpdate,
    current_user: dict = Depends(get_current_user),
):
    _require_item_owner(item_id, current_user["user_id"])
    success = db.update_item_status(
        item_id,
        worn=status_update.worn,
        washed=status_update.washed,
        wear_again=status_update.wear_again,
        occasion=clip_text(status_update.occasion, max_len=120),
        rating=status_update.rating,
    )
    if not success:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"success": True, "item_id": item_id}


@app.put("/api/item/{item_id}")
async def update_item_details(
    item_id: int,
    details: ItemDetailsUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Patch user-editable metadata (brand, size, notes, purchase fields)."""
    _require_item_owner(item_id, current_user["user_id"])
    patch = details.dict(exclude_unset=True)
    if not patch:
        raise HTTPException(status_code=400, detail="No fields to update")

    success = db.update_item_details(
        item_id=item_id,
        user_id=current_user["user_id"],
        **patch,
    )
    if not success:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"success": True, "item_id": item_id}


@app.delete("/api/item/{item_id}")
async def delete_item(
    item_id: int,
    current_user: dict = Depends(get_current_user),
):
    _require_item_owner(item_id, current_user["user_id"])
    success = db.delete_item(item_id)
    if not success:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"success": True}


@app.get("/api/outfits/recommend")
async def recommend_outfit(
    occasion: Optional[str] = None,
    season: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    try:
        items = db.get_all_items(
            user_id=current_user["user_id"],
            status="clean",
        )
        items = [i for i in items if not i.get("lent_to")]
        outfits = outfit_recommender.generate_outfits(
            items, occasion=occasion, season=season
        )
        return {"outfits": outfits}
    except Exception:
        logger.exception("outfit recommendation failed")
        raise HTTPException(status_code=500, detail="Recommendation failed")


@app.get("/api/stats")
async def get_stats(current_user: dict = Depends(get_current_user)):
    return db.get_statistics(user_id=current_user["user_id"])


@app.get("/api/neglected-items")
async def get_neglected_items(
    days: int = 30,
    current_user: dict = Depends(get_current_user),
):
    if days < 1 or days > 3650:
        raise HTTPException(status_code=400, detail="days must be between 1 and 3650")
    items = db.get_neglected_items(
        user_id=current_user["user_id"], days_threshold=days
    )
    return {"items": items}


@app.put("/api/item/{item_id}/favorite")
async def toggle_favorite(
    item_id: int,
    current_user: dict = Depends(get_current_user),
):
    _require_item_owner(item_id, current_user["user_id"])
    success = db.toggle_favorite(item_id)
    if not success:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"success": True}


@app.put("/api/item/{item_id}/lend")
async def lend_item(
    item_id: int,
    body: ItemLendRequest,
    current_user: dict = Depends(get_current_user),
):
    lent_to = clip_text(body.lent_to, max_len=80)
    if not lent_to:
        raise HTTPException(status_code=400, detail="lent_to required")
    lent_until = body.lent_until
    if lent_until is not None:
        # Validate ISO date format; reject anything we can't parse so we
        # don't store junk that later breaks date math in the recommender.
        try:
            datetime.fromisoformat(lent_until)
        except ValueError:
            raise HTTPException(status_code=400, detail="lent_until must be YYYY-MM-DD")

    success = db.lend_item(
        item_id=item_id,
        user_id=current_user["user_id"],
        lent_to=lent_to,
        lent_until=lent_until,
    )
    if not success:
        raise HTTPException(status_code=400, detail="Could not lend item")
    return {"success": True, "item_id": item_id}


@app.put("/api/item/{item_id}/return")
async def return_item(
    item_id: int,
    current_user: dict = Depends(get_current_user),
):
    success = db.return_item(item_id=item_id, user_id=current_user["user_id"])
    if not success:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"success": True, "item_id": item_id}


# ---- Wishlist ----------------------------------------------------------------

@app.get("/api/wishlist")
async def get_wishlist(current_user: dict = Depends(get_current_user)):
    return {"items": db.get_wishlist_items(user_id=current_user["user_id"])}


@app.post("/api/wishlist")
async def create_wishlist_item(
    body: WishlistCreate,
    current_user: dict = Depends(get_current_user),
):
    name = clip_text(body.name, max_len=120)
    if not name:
        raise HTTPException(status_code=400, detail="name required")
    if body.intent is not None and body.intent not in _VALID_WISHLIST_INTENTS:
        raise HTTPException(
            status_code=400,
            detail=f"intent must be one of {sorted(_VALID_WISHLIST_INTENTS)}",
        )
    try:
        item_id = db.add_wishlist_item(
            user_id=current_user["user_id"],
            name=name,
            category=clip_text(body.category, max_len=40) or "Other",
            subcategory=clip_text(body.subcategory, max_len=40) or "Wishlist",
            intent=body.intent,
            price=body.price,
            url=clip_text(body.url, max_len=500),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"success": True, "item_id": item_id}


@app.put("/api/item/{item_id}/promote")
async def promote_wishlist_item(
    item_id: int,
    current_user: dict = Depends(get_current_user),
):
    success = db.promote_wishlist_item(
        item_id=item_id, user_id=current_user["user_id"]
    )
    if not success:
        raise HTTPException(status_code=404, detail="Wishlist item not found")
    return {"success": True, "item_id": item_id}


@app.put("/api/wishlist/{item_id}")
async def update_wishlist_item(
    item_id: int,
    body: WishlistUpdate,
    current_user: dict = Depends(get_current_user),
):
    patch = body.dict(exclude_unset=True)
    if "wishlist_intent" in patch and patch["wishlist_intent"] is not None:
        if patch["wishlist_intent"] not in _VALID_WISHLIST_INTENTS:
            raise HTTPException(
                status_code=400,
                detail=f"intent must be one of {sorted(_VALID_WISHLIST_INTENTS)}",
            )
    if not patch:
        raise HTTPException(status_code=400, detail="No fields to update")
    success = db.update_wishlist_item(
        item_id=item_id,
        user_id=current_user["user_id"],
        **patch,
    )
    if not success:
        raise HTTPException(status_code=404, detail="Wishlist item not found")
    return {"success": True, "item_id": item_id}


# ---- Laundry -----------------------------------------------------------------

@app.get("/api/laundry")
async def get_laundry_queue(current_user: dict = Depends(get_current_user)):
    return db.get_laundry_queue(user_id=current_user["user_id"])


@app.post("/api/laundry/add/{item_id}")
async def add_to_laundry(
    item_id: int,
    priority: str = "normal",
    current_user: dict = Depends(get_current_user),
):
    if priority not in _VALID_LAUNDRY_PRIORITY:
        raise HTTPException(status_code=400, detail="Invalid priority")
    _require_item_owner(item_id, current_user["user_id"])
    queue_id = db.add_to_laundry_queue(item_id, priority)
    if queue_id == -1:
        raise HTTPException(status_code=400, detail="Item already in laundry queue")
    return {"success": True, "queue_id": queue_id}


@app.put("/api/laundry/{queue_id}/status")
async def update_laundry_status(
    queue_id: int,
    status: str,
    current_user: dict = Depends(get_current_user),
):
    if status not in _VALID_LAUNDRY_STATUS:
        raise HTTPException(status_code=400, detail="Invalid status")
    if not db.laundry_entry_belongs_to(queue_id, current_user["user_id"]):
        raise HTTPException(status_code=404, detail="Queue item not found")
    success = db.update_laundry_status(queue_id, status)
    if not success:
        raise HTTPException(status_code=404, detail="Queue item not found")
    return {"success": True}


@app.post("/api/refresh-scores")
async def refresh_freshness_scores(current_user: dict = Depends(get_current_user)):
    db.update_freshness_scores(user_id=current_user["user_id"])
    return {"success": True}


# ---- Social: avatar / search / friends / posts -------------------------------

@app.post("/api/auth/avatar")
async def upload_avatar(
    request: Request,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload a profile picture. Stored under /uploads/ like clothing photos."""
    rate_limit(request, "upload.avatar", limit=20, window=600)
    saved = save_uploaded_image(
        file, UPLOAD_DIR, prefix=f"avatar_{current_user['user_id']}"
    )
    avatar_url = safe_uploads_url(saved, UPLOAD_DIR)
    db.set_user_avatar(current_user["user_id"], avatar_url)
    return {"success": True, "avatar_url": avatar_url}


@app.get("/api/users/search")
async def search_users(
    q: str = "",
    current_user: dict = Depends(get_current_user),
):
    q = (q or "").strip()[:60]  # cap input length; SQL LIKE handles the rest
    return {"users": db.search_users(q, viewer_id=current_user["user_id"])}


@app.get("/api/users/{user_id}")
async def get_public_user(
    user_id: int,
    current_user: dict = Depends(get_current_user),
):
    profile = db.get_public_profile(
        target_id=user_id, viewer_id=current_user["user_id"]
    )
    if not profile:
        raise HTTPException(status_code=404, detail="User not found")
    return profile


@app.get("/api/users/by-username/{username}")
async def get_public_user_by_username(
    username: str,
    current_user: dict = Depends(get_current_user),
):
    user = db.get_user_by_username(username.strip()[:60])
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return db.get_public_profile(
        target_id=user["id"], viewer_id=current_user["user_id"]
    )


@app.get("/api/users/{user_id}/posts")
async def get_user_posts_endpoint(
    user_id: int,
    current_user: dict = Depends(get_current_user),
):
    return {
        "posts": db.get_user_posts(
            target_id=user_id, viewer_id=current_user["user_id"]
        )
    }


@app.get("/api/friends")
async def list_friends(current_user: dict = Depends(get_current_user)):
    return {"friends": db.get_friends(current_user["user_id"])}


@app.get("/api/friends/requests")
async def list_friend_requests(current_user: dict = Depends(get_current_user)):
    return db.get_friend_requests(current_user["user_id"])


@app.post("/api/friends/requests")
async def create_friend_request(
    body: FriendRequestCreate,
    current_user: dict = Depends(get_current_user),
):
    result = db.send_friend_request(
        requester_id=current_user["user_id"], addressee_id=body.user_id
    )
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("error", "Failed"))
    return result


@app.post("/api/friends/requests/{friendship_id}/accept")
async def accept_friend_request(
    friendship_id: int,
    current_user: dict = Depends(get_current_user),
):
    ok = db.respond_to_friend_request(
        friendship_id=friendship_id,
        user_id=current_user["user_id"],
        accept=True,
    )
    if not ok:
        raise HTTPException(status_code=404, detail="Request not found")
    return {"success": True}


@app.post("/api/friends/requests/{friendship_id}/reject")
async def reject_friend_request(
    friendship_id: int,
    current_user: dict = Depends(get_current_user),
):
    ok = db.respond_to_friend_request(
        friendship_id=friendship_id,
        user_id=current_user["user_id"],
        accept=False,
    )
    if not ok:
        raise HTTPException(status_code=404, detail="Request not found")
    return {"success": True}


@app.delete("/api/friends/{user_id}")
async def remove_friend(
    user_id: int,
    current_user: dict = Depends(get_current_user),
):
    ok = db.remove_friend(current_user["user_id"], user_id)
    if not ok:
        raise HTTPException(status_code=404, detail="No relationship")
    return {"success": True}


@app.get("/api/feed")
async def get_feed(
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
    return {"posts": db.get_feed(user_id=current_user["user_id"], before=before)}


@app.post("/api/fits")
async def create_fit_post(
    request: Request,
    file: UploadFile = File(...),
    caption: Optional[str] = None,
    item_ids: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Post a fit pic. Optional caption + comma-separated tagged item ids."""
    rate_limit(request, "fits.create", limit=30, window=600)

    saved = save_uploaded_image(
        file, UPLOAD_DIR, prefix=f"fit_{current_user['user_id']}"
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

    post_id = db.create_fit_post(
        user_id=current_user["user_id"],
        image_path=str(saved),
        caption=clean_caption,
        item_ids=parsed_ids,
    )
    post = db.get_post(post_id=post_id, viewer_id=current_user["user_id"])
    return {"success": True, "post": post}


@app.get("/api/fits/{post_id}")
async def get_fit_post(
    post_id: int,
    current_user: dict = Depends(get_current_user),
):
    post = db.get_post(post_id=post_id, viewer_id=current_user["user_id"])
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    return post


@app.delete("/api/fits/{post_id}")
async def delete_fit_post(
    post_id: int,
    current_user: dict = Depends(get_current_user),
):
    ok = db.delete_fit_post(post_id=post_id, user_id=current_user["user_id"])
    if not ok:
        raise HTTPException(status_code=404, detail="Post not found")
    return {"success": True}


@app.post("/api/fits/{post_id}/react")
async def react_to_fit(
    post_id: int,
    body: ReactionToggle,
    current_user: dict = Depends(get_current_user),
):
    result = db.toggle_reaction(
        post_id=post_id, user_id=current_user["user_id"], emoji=body.emoji
    )
    if result is None:
        raise HTTPException(status_code=400, detail="Could not react")
    return {"success": True, "active": result}


@app.get("/api/fits/{post_id}/comments")
async def list_comments(
    post_id: int,
    current_user: dict = Depends(get_current_user),
):
    comments = db.get_comments(post_id=post_id, viewer_id=current_user["user_id"])
    if comments is None:
        raise HTTPException(status_code=404, detail="Post not found")
    return {"comments": comments}


@app.post("/api/fits/{post_id}/comments")
async def post_comment(
    post_id: int,
    body: CommentCreate,
    current_user: dict = Depends(get_current_user),
):
    cid = db.add_comment(
        post_id=post_id, user_id=current_user["user_id"], body=body.body
    )
    if cid is None:
        raise HTTPException(status_code=400, detail="Could not add comment")
    return {"success": True, "comment_id": cid}


@app.delete("/api/comments/{comment_id}")
async def delete_comment_endpoint(
    comment_id: int,
    current_user: dict = Depends(get_current_user),
):
    ok = db.delete_comment(comment_id=comment_id, user_id=current_user["user_id"])
    if not ok:
        raise HTTPException(status_code=404, detail="Comment not found")
    return {"success": True}


# ---- Entry point -------------------------------------------------------------

if __name__ == "__main__":
    # `0.0.0.0` only binds to all interfaces in dev (so LAN devices can hit it
    # via your laptop's IP for Expo Go). Production deployments should put a
    # reverse proxy in front and bind to 127.0.0.1.
    host = os.getenv("HOST", "127.0.0.1" if PRODUCTION else "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    reload = not PRODUCTION and os.getenv("UVICORN_RELOAD", "1") == "1"
    uvicorn.run("main:app", host=host, port=port, reload=reload)
