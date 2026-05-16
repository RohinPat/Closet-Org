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



import csv

import io

import logging

import os

import random

import re

from datetime import datetime, timezone

from pathlib import Path

from typing import Annotated, Dict, List, Optional, Set



import uvicorn

from fastapi import (

    Depends,

    FastAPI,

    File,

    Form,

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

from models.ai_stylist import build_ai_stylist_response

from models.closet_insights import build_closet_insights

from models.closet_pairing import rank_closet_pairings

from models.outfit_recommender import OutfitRecommender

from models.weather_service import WeatherServiceError, weather_provider

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



_cors_common = dict(

    allow_credentials=True,

    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],

    allow_headers=["Authorization", "Content-Type", "Accept"],

    max_age=600,

)

if PRODUCTION:

    app.add_middleware(

        CORSMiddleware,

        allow_origins=ALLOWED_ORIGINS,

        **_cors_common,

    )

else:

    # LAN Expo Web (http://192.168.x.x:8084) and odd hostnames — regex covers dev-only.

    app.add_middleware(

        CORSMiddleware,

        allow_origins=ALLOWED_ORIGINS,

        allow_origin_regex=r"https?://[\w.\-]+(:\d+)?",

        **_cors_common,

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

    email: Optional[EmailStr] = None

    bio: Optional[str] = Field(default=None, max_length=500)

    theme_preference: Optional[str] = Field(default=None, max_length=16)





class UserSettingsUpdate(BaseModel):

    social_enabled: Optional[bool] = None

    app_mode: Optional[str] = Field(default=None, max_length=24)

    default_tab: Optional[str] = Field(default=None, max_length=24)

    default_closet_location_id: Optional[int] = Field(default=None, ge=1)

    theme_preference: Optional[str] = Field(default=None, max_length=16)





class ClosetLocationCreate(BaseModel):

    name: str = Field(..., min_length=1, max_length=80)

    kind: Optional[str] = Field(default="home", max_length=32)

    is_default: Optional[bool] = False





class ClosetLocationUpdate(BaseModel):

    name: Optional[str] = Field(default=None, min_length=1, max_length=80)

    kind: Optional[str] = Field(default=None, max_length=32)

    is_default: Optional[bool] = None





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

    care_label_text: Optional[str] = Field(default=None, max_length=4000)

    care_summary: Optional[str] = Field(default=None, max_length=1000)

    purchase_date: Optional[str] = Field(default=None, max_length=20)

    purchase_price: Optional[float] = Field(default=None, ge=0, le=1_000_000)

    purchase_location: Optional[str] = Field(default=None, max_length=120)

    storage_location: Optional[str] = Field(default=None, max_length=120)

    category: Optional[str] = Field(default=None, max_length=40)

    subcategory: Optional[str] = Field(default=None, max_length=40)

    colors: Optional[Annotated[List[str], Field(max_length=8)]] = None
    color_hexes: Optional[Annotated[List[str], Field(max_length=8)]] = None

    season: Optional[str] = Field(default=None, max_length=20)

    style: Optional[str] = Field(default=None, max_length=40)
    pattern: Optional[str] = Field(default=None, max_length=40)
    laundry_state: Optional[str] = Field(default=None, max_length=40)

    user_tags: Optional[Annotated[List[str], Field(max_length=20)]] = None

    packed_for_trip: Optional[bool] = None

    quantity: Optional[int] = Field(default=None, ge=1, le=999)

    clean_count: Optional[int] = Field(default=None, ge=0, le=999)

    closet_location_id: Optional[int] = Field(default=None, ge=1)

    status: Optional[str] = Field(default=None, max_length=20)

    wishlist_name: Optional[str] = Field(default=None, max_length=120)

    wishlist_intent: Optional[str] = Field(default=None, max_length=20)

    wishlist_url: Optional[str] = Field(default=None, max_length=500)





class PackedBulkUpdate(BaseModel):

    packed_for_trip: bool

    item_ids: Optional[List[int]] = None


class TripCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    destination: Optional[str] = Field(default=None, max_length=120)
    start_date: Optional[str] = Field(default=None, max_length=20)
    end_date: Optional[str] = Field(default=None, max_length=20)
    activities: Optional[Annotated[List[str], Field(max_length=20)]] = None
    item_ids: Optional[Annotated[List[int], Field(max_length=100)]] = None


class TripUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    destination: Optional[str] = Field(default=None, max_length=120)
    start_date: Optional[str] = Field(default=None, max_length=20)
    end_date: Optional[str] = Field(default=None, max_length=20)
    activities: Optional[Annotated[List[str], Field(max_length=20)]] = None
    item_ids: Optional[Annotated[List[int], Field(max_length=100)]] = None


class TripPackedUpdate(BaseModel):
    item_id: int = Field(..., ge=1)
    packed: bool


class ClassificationCorrection(BaseModel):
    corrected_data: Dict[str, object]





class PlannedOutfitCreate(BaseModel):

    title: str = Field(..., min_length=1, max_length=120)

    planned_for: str = Field(..., min_length=10, max_length=10)

    occasion: Optional[str] = Field(default=None, max_length=80)

    notes: Optional[str] = Field(default=None, max_length=1000)

    status: Optional[str] = Field(default="draft", max_length=20)

    item_ids: Optional[Annotated[List[int], Field(max_length=50)]] = None



class PlannedOutfitUpdate(BaseModel):

    title: Optional[str] = Field(default=None, min_length=1, max_length=120)

    planned_for: Optional[str] = Field(default=None, min_length=10, max_length=10)

    occasion: Optional[str] = Field(default=None, max_length=80)

    notes: Optional[str] = Field(default=None, max_length=1000)

    status: Optional[str] = Field(default=None, max_length=20)

    item_ids: Optional[Annotated[List[int], Field(max_length=50)]] = None

    prep_clean: Optional[bool] = None

    prep_packed: Optional[bool] = None

    prep_steamed: Optional[bool] = None

    prep_accessories: Optional[bool] = None





class BulkItemCreate(BaseModel):

    name: str = Field(..., min_length=1, max_length=120)

    subcategory: str = Field(..., min_length=1, max_length=40)

    quantity: int = Field(..., ge=1, le=999)

    clean_count: Optional[int] = Field(default=None, ge=0, le=999)

    colors: Optional[Annotated[List[str], Field(max_length=8)]] = None

    style: Optional[str] = Field(default="Casual", max_length=40)

    season: Optional[str] = Field(default="All-Season", max_length=20)





class CsvImportBody(BaseModel):

    csv_text: str = Field(..., min_length=1, max_length=200_000)





class PromoteBulkBody(BaseModel):

    count: int = Field(..., ge=1, le=999)





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





class AiStylistRequest(BaseModel):

    message: str = Field(..., min_length=1, max_length=500)

    closet_location_id: Optional[int] = Field(default=None, ge=1)

    include_packed: Optional[bool] = False

    exclude_item_ids: Optional[List[int]] = None

    pin_item_ids: Optional[Annotated[List[int], Field(max_length=8)]] = None

    lat: Optional[float] = None

    lon: Optional[float] = None

    weather_date: Optional[str] = Field(default=None, max_length=20)

    location_name: Optional[str] = Field(default=None, max_length=120)





class AiStylistFeedbackRequest(BaseModel):

    item_signature: str = Field(..., min_length=1, max_length=120)

    useful: bool

    message: Optional[str] = Field(default=None, max_length=500)





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

_VALID_APP_MODES = {"normal", "closet_only"}

_VALID_DEFAULT_TABS = {"closet", "feed", "upload", "outfits", "profile"}

_VALID_LOCATION_KINDS = {

    "home", "school", "parent", "work", "storage", "travel", "other"

}

_VALID_LAUNDRY_PRIORITY = {"low", "normal", "urgent"}

_VALID_LAUNDRY_STATUS = {"queued", "washing", "drying", "ready"}

_VALID_WISHLIST_INTENTS = {"want", "gift", "saving", "sale_watch"}

_VALID_OUTFIT_VIBES = frozenset({
    "clean_prep",
    "streetwear",
    "cozy",
    "minimal",
    "bold",
    "athleisure",
})

_VALID_PLANNED_OUTFIT_STATUSES = {"draft", "confirmed", "worn", "skipped"}

_VALID_BULK_SUBCATEGORIES = frozenset(

    {"Top", "Bottom", "Dress", "Footwear", "Accessory", "Other"}

)

_BULK_DEFAULT_KEYWORDS = {

    "sock": ("Crew socks", "Footwear", 6),

    "socks": ("Crew socks", "Footwear", 6),

    "underwear": ("Underwear", "Other", 5),

    "boxer": ("Underwear", "Other", 5),

    "brief": ("Underwear", "Other", 5),

    "undershirt": ("Undershirts", "Top", 4),

    "basic tee": ("Basic tees", "Top", 4),

    "plain tee": ("Basic tees", "Top", 4),

}





def _normalize_vibe(raw: Optional[str]) -> Optional[str]:

    if not raw or not raw.strip():

        return None

    key = raw.strip().lower()

    if key not in _VALID_OUTFIT_VIBES:

        raise HTTPException(

            status_code=400,

            detail="Invalid vibe — use clean_prep, streetwear, cozy, minimal, bold, or athleisure",

        )

    return key


_COLOR_HEX_MAP = {
    "Black": "#111111",
    "White": "#f8f8f8",
    "Gray": "#808080",
    "Navy": "#1f2a44",
    "Blue": "#2563eb",
    "Red": "#dc2626",
    "Green": "#16a34a",
    "Yellow": "#eab308",
    "Brown": "#7c4a2d",
    "Beige": "#d8c3a5",
    "Pink": "#ec4899",
    "Purple": "#7c3aed",
    "Orange": "#f97316",
    "Teal": "#0f766e",
}


def _color_hexes(colors: List[str]) -> List[str]:
    return [_COLOR_HEX_MAP.get(c, "#9ca3af") for c in colors[:8]]


def _detect_pattern(classification: Dict) -> str:
    hay = " ".join(
        str(classification.get(k) or "")
        for k in ("category", "subcategory", "style", "season")
    ).lower()
    if "stripe" in hay:
        return "striped"
    if "graphic" in hay or "print" in hay:
        return "graphic"
    if "plaid" in hay or "check" in hay:
        return "plaid"
    return "solid"


def _visual_explanation(score: float, item: Dict) -> str:
    colors = item.get("colors") or []
    color_text = ", ".join(colors[:2]) if colors else "similar palette"
    if score >= 0.94:
        closeness = "Very close visual match"
    elif score >= 0.86:
        closeness = "Strong shape and color similarity"
    else:
        closeness = "Related visual features"
    return f"{closeness}; likely matched on {color_text} and {item.get('subcategory') or 'garment'} cues."





def _split_csv_list(raw: Optional[str]) -> List[str]:

    if not raw:

        return []

    return [

        p.strip()

        for p in re.split(r"[,;|]", raw)

        if p and p.strip()

    ]





def _care_summary_from_text(raw: str) -> str:

    text = " ".join((raw or "").split())

    if not text:

        return ""

    lower = text.lower()

    hints: List[str] = []

    rules = [

        (r"machine wash|wash.*cold|cold wash", "Machine wash cold"),

        (r"hand wash", "Hand wash"),

        (r"do not wash", "Do not wash"),

        (r"tumble dry low|low tumble", "Tumble dry low"),

        (r"do not tumble dry", "Do not tumble dry"),

        (r"line dry|hang dry", "Line dry"),

        (r"dry clean", "Dry clean"),

        (r"do not bleach", "Do not bleach"),

        (r"bleach", "Bleach allowed"),

        (r"cool iron|iron low", "Cool iron"),

        (r"do not iron", "Do not iron"),

    ]

    for pattern, label in rules:

        if re.search(pattern, lower) and label not in hints:

            hints.append(label)

    if hints:

        return "; ".join(hints[:6])

    return clip_text(text, max_len=240) or ""





def _extract_care_label_text(image_path: str) -> str:

    try:

        import pytesseract  # type: ignore

        from PIL import Image, ImageOps

    except ImportError:

        raise HTTPException(

            status_code=501,

            detail="Care label OCR needs pytesseract installed on the API host.",

        )

    try:

        with Image.open(image_path) as img:

            gray = ImageOps.grayscale(img)

            gray = ImageOps.autocontrast(gray)

            return pytesseract.image_to_string(gray).strip()

    except HTTPException:

        raise

    except Exception:

        logger.exception("care label OCR failed")

        raise HTTPException(status_code=422, detail="Could not read that care label")





def _csv_value(row: dict, *names: str) -> Optional[str]:

    lookup = {

        re.sub(r"[^a-z0-9]+", "", str(k).lower()): v

        for k, v in row.items()

    }

    for name in names:

        key = re.sub(r"[^a-z0-9]+", "", name.lower())

        val = lookup.get(key)

        if val is None:

            continue

        text = str(val).strip()

        if text:

            return text

    return None





def _csv_int(row: dict, *names: str) -> Optional[int]:

    raw = _csv_value(row, *names)

    if not raw:

        return None

    try:

        return int(float(raw))

    except ValueError:

        return None





def _csv_float(row: dict, *names: str) -> Optional[float]:

    raw = _csv_value(row, *names)

    if not raw:

        return None

    try:

        return float(raw.replace("$", "").replace(",", ""))

    except ValueError:

        return None





def _csv_bool(row: dict, *names: str) -> bool:

    raw = (_csv_value(row, *names) or "").strip().lower()

    return raw in {"1", "true", "yes", "y", "bulk"}





def _bulk_defaults_for_text(*parts: Optional[str]) -> Optional[tuple[str, str, int]]:

    text = " ".join(p or "" for p in parts).lower()

    for key, defaults in _BULK_DEFAULT_KEYWORDS.items():

        if key in text:

            return defaults

    return None





def _outfit_item_signature(outfit_items: List[dict]) -> str:

    return ",".join(

        str(i["id"]) for i in sorted(outfit_items, key=lambda x: int(x["id"]))

    )





def _validate_item_signature(raw: str) -> str:

    parts = []

    for part in raw.split(","):

        part = part.strip()

        if not part:

            continue

        if not part.isdigit():

            raise HTTPException(status_code=400, detail="Invalid item signature")

        parts.append(str(int(part)))

    if not parts:

        raise HTTPException(status_code=400, detail="Invalid item signature")

    return ",".join(sorted(set(parts), key=lambda value: int(value)))





def _unlink_temp_upload(path: Path) -> None:

    try:

        path.unlink(missing_ok=True)

        thumb = path.with_name(path.stem + ".thumb.png")

        thumb.unlink(missing_ok=True)

    except OSError:

        pass





def _parse_outfit_id_list(raw: Optional[str]) -> List[int]:

    if not raw:

        return []

    seen: Set[int] = set()

    out: List[int] = []

    for part in raw.split(","):

        part = part.strip()

        if not part:

            continue

        try:

            n = int(part)

        except ValueError:

            continue

        if n not in seen:

            seen.add(n)

            out.append(n)

    return out





def _validate_lat_lon(lat: float, lon: float) -> tuple[float, float]:

    try:

        lat_f = float(lat)

        lon_f = float(lon)

    except (TypeError, ValueError):

        raise HTTPException(status_code=400, detail="Invalid latitude/longitude")

    if lat_f < -90 or lat_f > 90 or lon_f < -180 or lon_f > 180:

        raise HTTPException(status_code=400, detail="Invalid latitude/longitude")

    return lat_f, lon_f





def _validate_iso_date(raw: Optional[str], field: str) -> Optional[str]:

    if not raw:

        return None

    try:

        datetime.strptime(raw, "%Y-%m-%d")

    except ValueError:

        raise HTTPException(status_code=400, detail=f"{field} must be YYYY-MM-DD")

    return raw





def _validate_planned_status(raw: Optional[str]) -> str:

    status = (raw or "draft").strip().lower()

    if status not in _VALID_PLANNED_OUTFIT_STATUSES:

        raise HTTPException(

            status_code=400,

            detail=f"status must be one of {sorted(_VALID_PLANNED_OUTFIT_STATUSES)}",

        )

    return status





def _closet_item_matches_query(item: dict, q_lower: str) -> bool:

    if not q_lower:

        return True

    parts: List = [

        item.get("category"),

        item.get("subcategory"),

        item.get("style"),

        item.get("season"),

        item.get("brand"),

        item.get("notes"),

        item.get("storage_location"),

    ]

    for c in item.get("colors") or []:

        parts.append(c)

    for t in item.get("user_tags") or []:

        parts.append(t)

    hay = " ".join(str(p) for p in parts if p is not None and str(p).strip()).lower()

    return q_lower in hay





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





# ---- Weather -----------------------------------------------------------------



@app.get("/api/weather/geocode")

async def weather_geocode(

    q: str,

    current_user: dict = Depends(get_current_user),

):

    query = clip_text(q, max_len=120)

    if not query or len(query) < 2:

        raise HTTPException(status_code=400, detail="Search query must be at least 2 characters")

    try:

        return {"results": weather_provider.geocode(query)}

    except WeatherServiceError:

        logger.exception("weather geocode failed")

        raise HTTPException(status_code=502, detail="Weather provider unavailable")





@app.get("/api/weather/current")

async def weather_current(

    lat: float,

    lon: float,

    date: Optional[str] = None,

    location_name: Optional[str] = None,

    current_user: dict = Depends(get_current_user),

):

    lat_f, lon_f = _validate_lat_lon(lat, lon)

    weather_date = _validate_iso_date(date, "date")

    try:

        context = weather_provider.current(

            lat_f,

            lon_f,

            weather_date=weather_date,

            location_name=clip_text(location_name, max_len=120),

        )

        return {"weather": context.to_dict()}

    except WeatherServiceError:

        logger.exception("weather current failed")

        raise HTTPException(status_code=502, detail="Weather provider unavailable")





@app.get("/api/weather/forecast")

async def weather_forecast(

    lat: float,

    lon: float,

    start_date: Optional[str] = None,

    end_date: Optional[str] = None,

    location_name: Optional[str] = None,

    current_user: dict = Depends(get_current_user),

):

    lat_f, lon_f = _validate_lat_lon(lat, lon)

    start = _validate_iso_date(start_date, "start_date")

    end = _validate_iso_date(end_date, "end_date")

    try:

        return weather_provider.forecast(

            lat_f,

            lon_f,

            start_date=start,

            end_date=end,

            location_name=clip_text(location_name, max_len=120),

        )

    except WeatherServiceError:

        logger.exception("weather forecast failed")

        raise HTTPException(status_code=502, detail="Weather provider unavailable")





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

        "social_enabled": bool(user.get("social_enabled", 1)),

        "app_mode": user.get("app_mode", "normal"),

        "default_tab": user.get("default_tab", "closet"),

        "default_closet_location_id": user.get("default_closet_location_id"),

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

    email = normalize_email(str(profile_data.email)) if profile_data.email else None

    if email is not None:

        existing = db.get_user_by_email(email)

        if existing and int(existing["id"]) != int(current_user["user_id"]):

            raise HTTPException(status_code=400, detail="Email already exists")

    success = db.update_user_profile(

        user_id=current_user["user_id"],

        full_name=clip_text(profile_data.full_name, max_len=120),

        bio=clip_text(profile_data.bio, max_len=500),

        theme_preference=theme,

        email=email,

    )

    if not success:

        raise HTTPException(status_code=500, detail="Failed to update profile")

    return {"success": True}





@app.get("/api/settings")

async def get_settings(current_user: dict = Depends(get_current_user)):

    settings = db.get_user_settings(current_user["user_id"])

    if settings is None:

        raise HTTPException(status_code=404, detail="User not found")

    return settings





@app.put("/api/settings")

async def update_settings(

    settings: UserSettingsUpdate,

    current_user: dict = Depends(get_current_user),

):

    patch = settings.dict(exclude_unset=True)

    if not patch:

        return db.get_user_settings(current_user["user_id"])

    if settings.theme_preference is not None and settings.theme_preference not in _VALID_THEMES:

        raise HTTPException(status_code=400, detail="Invalid theme")

    if settings.app_mode is not None and settings.app_mode not in _VALID_APP_MODES:

        raise HTTPException(status_code=400, detail="Invalid app mode")

    if settings.default_tab is not None and settings.default_tab not in _VALID_DEFAULT_TABS:

        raise HTTPException(status_code=400, detail="Invalid default tab")

    ok = db.update_user_settings(

        current_user["user_id"],

        social_enabled=settings.social_enabled,

        app_mode=settings.app_mode,

        default_tab=settings.default_tab,

        default_closet_location_id=settings.default_closet_location_id,

        theme_preference=settings.theme_preference,

    )

    if not ok:

        raise HTTPException(status_code=400, detail="Could not update settings")

    return db.get_user_settings(current_user["user_id"])





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
        classification["color_hexes"] = _color_hexes(classification["colors"])
        classification["pattern"] = _detect_pattern(classification)



        duplicate_hint = None

        dominant: Optional[str] = None

        if classification.get("colors"):

            dominant = classification["colors"][0]

            existing_similar = db.count_owned_similar_by_category_color(

                current_user["user_id"],

                classification["category"],

                dominant,

            )

            if existing_similar > 0:

                duplicate_hint = {

                    "category": classification["category"],

                    "color": dominant,

                    "existing_similar_count": existing_similar,

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
        db.update_item_details(
            item_id=item_id,
            user_id=current_user["user_id"],
            color_hexes=classification["color_hexes"],
            pattern=classification["pattern"],
            laundry_state="clean",
        )



        try:

            emb = get_classifier().encode_image_embedding(saved_paths[0])

            if emb:

                db.set_clip_embedding(item_id, emb)
                neighbors = db.get_duplicate_candidates(current_user["user_id"], threshold=0.91)
                item_neighbors = [
                    row for row in neighbors
                    if any(int(item["id"]) == item_id for item in row.get("items", []))
                ]
                if item_neighbors:
                    duplicate_hint = {
                        **(duplicate_hint or {}),
                        "visual_candidates": item_neighbors[:3],
                    }

        except Exception:

            logger.debug("CLIP embedding not stored for upload", exc_info=True)



        return {

            "success": True,

            "item_id": item_id,

            "classification": classification,

            "duplicate_hint": duplicate_hint,

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





@app.get("/api/closet/insights")

async def get_closet_insights(current_user: dict = Depends(get_current_user)):

    items = db.get_all_items(user_id=current_user["user_id"])

    insights = build_closet_insights(items)
    insights["duplicate_candidates"] = db.get_duplicate_candidates(current_user["user_id"])
    return insights


@app.get("/api/reminders")
async def get_reminders(current_user: dict = Depends(get_current_user)):
    return {"cards": db.get_reminder_cards(current_user["user_id"])}


@app.get("/api/trips")
async def list_trips(current_user: dict = Depends(get_current_user)):
    db.auto_unpack_expired_trips(current_user["user_id"])
    return {"trips": db.list_trips(current_user["user_id"])}


@app.post("/api/trips")
async def create_trip(body: TripCreate, current_user: dict = Depends(get_current_user)):
    activities = [clip_text(a, max_len=60) for a in (body.activities or [])]
    activities = [a for a in activities if a]
    trip = db.create_trip(
        current_user["user_id"],
        name=clip_text(body.name, max_len=120) or "Trip",
        destination=clip_text(body.destination, max_len=120),
        start_date=_validate_iso_date(body.start_date, "start_date") if body.start_date else None,
        end_date=_validate_iso_date(body.end_date, "end_date") if body.end_date else None,
        activities=activities,
        item_ids=body.item_ids or [],
    )
    return {"success": True, "trip": trip}


@app.put("/api/trips/{trip_id}")
async def update_trip(
    trip_id: int,
    body: TripUpdate,
    current_user: dict = Depends(get_current_user),
):
    patch = body.dict(exclude_unset=True)
    item_ids = patch.pop("item_ids", None)
    if "name" in patch:
        patch["name"] = clip_text(patch["name"], max_len=120) or "Trip"
    if "destination" in patch:
        patch["destination"] = clip_text(patch["destination"], max_len=120)
    if patch.get("start_date"):
        patch["start_date"] = _validate_iso_date(patch["start_date"], "start_date")
    if patch.get("end_date"):
        patch["end_date"] = _validate_iso_date(patch["end_date"], "end_date")
    if "activities" in patch:
        patch["activities"] = [
            a for a in (clip_text(x, max_len=60) for x in (patch["activities"] or [])) if a
        ]
    trip = db.update_trip(
        current_user["user_id"],
        trip_id,
        fields=patch,
        item_ids=item_ids,
    )
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    return {"success": True, "trip": trip}


@app.put("/api/trips/{trip_id}/packed")
async def set_trip_packed(
    trip_id: int,
    body: TripPackedUpdate,
    current_user: dict = Depends(get_current_user),
):
    trip = db.set_trip_item_packed(
        current_user["user_id"], trip_id, body.item_id, body.packed
    )
    if not trip:
        raise HTTPException(status_code=404, detail="Trip or item not found")
    return {"success": True, "trip": trip}


@app.post("/api/trips/auto-unpack")
async def auto_unpack_trips(current_user: dict = Depends(get_current_user)):
    return {"success": True, "updated": db.auto_unpack_expired_trips(current_user["user_id"])}


@app.post("/api/closet/embedding-backfill")
async def backfill_embeddings(
    limit: int = 10,
    current_user: dict = Depends(get_current_user),
):
    lim = max(1, min(int(limit), 25))
    rows = db.list_items_missing_embeddings(current_user["user_id"], limit=lim)
    updated = 0
    failed: List[int] = []
    for row in rows:
        try:
            emb = get_classifier().encode_image_embedding(row["image_path"])
            if emb and db.set_clip_embedding(int(row["id"]), emb):
                updated += 1
        except Exception:
            logger.debug("embedding backfill failed for item %s", row.get("id"), exc_info=True)
            failed.append(int(row["id"]))
    return {"success": True, "updated": updated, "failed_item_ids": failed}





@app.post("/api/closet/fit-check")

async def closet_fit_check(

    request: Request,

    files: List[UploadFile] = File(...),

    current_user: dict = Depends(get_current_user),

):

    """Classify one candidate photo and rank closet items that pair with it."""

    rate_limit(request, "closet.fit_check", limit=40, window=600)

    if not files:

        raise HTTPException(status_code=400, detail="No file uploaded")

    if len(files) != 1:

        raise HTTPException(

            status_code=400, detail="Fit-check uses exactly one front photo",

        )

    saved: Optional[Path] = None

    try:

        saved = save_uploaded_image(files[0], UPLOAD_DIR, prefix="fitcheck")

        classification = get_classifier().classify(str(saved))

        candidate = {

            "category": classification["category"],

            "subcategory": classification["subcategory"],

            "colors": classification["colors"],

            "style": classification.get("style"),

            "season": classification.get("season"),

        }

        closet_items = db.get_all_items(

            user_id=current_user["user_id"],

            status="clean",

        )

        closet_items = [

            i

            for i in closet_items

            if not i.get("lent_to") and not i.get("packed_for_trip")

        ]

        pairings = rank_closet_pairings(

            candidate, closet_items, outfit_recommender, limit=30

        )

        return {"classification": classification, "pairings": pairings}

    except HTTPException:

        raise

    except Exception:

        logger.exception("closet fit-check failed")

        raise HTTPException(status_code=500, detail="Fit check failed")

    finally:

        if saved is not None:

            _unlink_temp_upload(saved)





@app.post("/api/closet/bulk-item")

async def create_bulk_item(

    request: Request,

    body: BulkItemCreate,

    current_user: dict = Depends(get_current_user),

):

    """Add socks/underwear/basics as one row with quantity + clean inventory."""

    rate_limit(request, "closet.bulk_item", limit=80, window=600)

    slot = body.subcategory.strip()

    if slot not in _VALID_BULK_SUBCATEGORIES:

        raise HTTPException(

            status_code=400,

            detail=f"Invalid subcategory — use {', '.join(sorted(_VALID_BULK_SUBCATEGORIES))}",

        )

    tgt_clean = body.clean_count if body.clean_count is not None else body.quantity

    if tgt_clean > body.quantity:

        raise HTTPException(

            status_code=400,

            detail="clean_count cannot exceed quantity",

        )

    colors = body.colors[:] if body.colors else []

    st = clip_text(body.style, max_len=40) if body.style else "Casual"

    season = clip_text(body.season, max_len=20) if body.season else "All-Season"

    try:

        item_id = db.add_bulk_clothing_item(

            current_user["user_id"],

            clip_text(body.name, max_len=120),

            slot,

            body.quantity,

            tgt_clean,

            colors,

            season,

            st,

        )

        return {"success": True, "item_id": item_id}

    except Exception:

        logger.exception("bulk-item create failed")

        raise HTTPException(status_code=500, detail="Could not save bulk item")





@app.post("/api/closet/bulk-item/upload")

async def create_bulk_item_with_photo(

    request: Request,

    name: str = Form(..., min_length=1, max_length=120),

    subcategory: str = Form(..., min_length=1, max_length=40),

    quantity: int = Form(..., ge=1, le=999),

    clean_count: Optional[int] = Form(None),

    style: Optional[str] = Form(None),

    season: Optional[str] = Form(None),

    photo: UploadFile = File(...),

    current_user: dict = Depends(get_current_user),

):

    """Create a bulk row with one reference photo (thumbnail + optional CLIP embedding)."""

    rate_limit(request, "closet.bulk_item", limit=80, window=600)

    from models.clothing_classifier import generate_cutout_thumbnail



    slot = subcategory.strip()

    if slot not in _VALID_BULK_SUBCATEGORIES:

        raise HTTPException(

            status_code=400,

            detail=f"Invalid subcategory — use {', '.join(sorted(_VALID_BULK_SUBCATEGORIES))}",

        )

    tgt_clean = clean_count if clean_count is not None else quantity

    if tgt_clean > quantity:

        raise HTTPException(status_code=400, detail="clean_count cannot exceed quantity")



    saved: Optional[Path] = None

    try:

        saved = save_uploaded_image(photo, UPLOAD_DIR, prefix="bulkref")

        spath = str(saved)

        classifications = get_classifier().classify(spath)

        cols = classifications.get("colors") or ["Neutral"]

        st = (

            clip_text(style, max_len=40)

            if style and style.strip()

            else classifications.get("style") or "Casual"

        )

        sn = (

            clip_text(season, max_len=20)

            if season and season.strip()

            else classifications.get("season") or "All-Season"

        )

        thumb = saved.with_name(saved.stem + ".thumb.png")

        thumb_ok = generate_cutout_thumbnail(spath, str(thumb))

        thumb_str = str(thumb) if thumb_ok else None

        emb_list = None

        try:

            emb_list = get_classifier().encode_image_embedding(spath)

        except Exception:

            logger.debug("bulk ref CLIP embedding failed", exc_info=True)



        item_id = db.add_bulk_clothing_item(

            current_user["user_id"],

            clip_text(name, max_len=120),

            slot,

            quantity,

            tgt_clean,

            cols,

            sn,

            st,

            image_path=spath,

            thumbnail_path=thumb_str,

            image_paths=[spath],

            thumbnail_paths=[thumb_str],

            clip_embedding=emb_list,

        )

        return {"success": True, "item_id": item_id}

    except HTTPException:

        raise

    except Exception:

        logger.exception("bulk-item-with-photo failed")

        raise HTTPException(status_code=500, detail="Could not save bulk item")





@app.post("/api/closet/import-csv")

async def import_closet_csv(

    request: Request,

    body: CsvImportBody,

    current_user: dict = Depends(get_current_user),

):

    """Import spreadsheet rows into the closet.



    Accepts pasted CSV text so mobile can support this without a document-picker

    dependency. Common headers like type/name/category, color(s), brand, size,

    quantity, tags, and care are normalized.

    """

    rate_limit(request, "closet.import_csv", limit=20, window=600)

    try:

        sample = body.csv_text[:2048]

        dialect = csv.Sniffer().sniff(sample) if "," in sample or "\t" in sample else csv.excel

    except csv.Error:

        dialect = csv.excel



    reader = csv.DictReader(io.StringIO(body.csv_text), dialect=dialect)

    if not reader.fieldnames:

        raise HTTPException(status_code=400, detail="CSV needs a header row")



    created: List[int] = []

    skipped: List[dict] = []

    for idx, row in enumerate(reader, start=2):

        name = _csv_value(row, "name", "item", "type", "category")

        category = _csv_value(row, "category", "type", "item", "name") or "Other"

        subcategory = _csv_value(row, "subcategory", "group", "section")

        colors = _split_csv_list(_csv_value(row, "colors", "color", "colour", "colours"))

        quantity = _csv_int(row, "quantity", "qty", "count") or 1

        clean_count = _csv_int(row, "clean_count", "clean count", "clean")

        is_bulk = _csv_bool(row, "is_bulk", "bulk", "bulk mode")

        bulk_defaults = _bulk_defaults_for_text(name, category, subcategory)

        if not subcategory:

            subcategory = bulk_defaults[1] if bulk_defaults else "Other"

        if bulk_defaults and (is_bulk or quantity > 1):

            category = name or bulk_defaults[0]

            subcategory = subcategory or bulk_defaults[1]

            is_bulk = True

        if not name and not category:

            skipped.append({"row": idx, "reason": "missing item name/category"})

            continue

        try:

            item_id = db.add_imported_clothing_item(

                current_user["user_id"],

                category=clip_text(category, max_len=40) or "Other",

                subcategory=clip_text(subcategory, max_len=40) or "Other",

                colors=colors,

                season=clip_text(_csv_value(row, "season"), max_len=20),

                style=clip_text(_csv_value(row, "style", "vibe"), max_len=40),

                brand=clip_text(_csv_value(row, "brand"), max_len=80),

                size=clip_text(_csv_value(row, "size"), max_len=20),

                notes=clip_text(_csv_value(row, "notes", "note"), max_len=2000),

                purchase_date=clip_text(

                    _csv_value(row, "purchase_date", "purchased", "date bought"),

                    max_len=20,

                ),

                purchase_price=_csv_float(row, "purchase_price", "price", "cost"),

                purchase_location=clip_text(

                    _csv_value(row, "purchase_location", "store", "where"),

                    max_len=120,

                ),

                storage_location=clip_text(

                    _csv_value(row, "storage_location", "location", "stored"),

                    max_len=120,

                ),

                user_tags=_split_csv_list(_csv_value(row, "tags", "user_tags")),

                care_summary=clip_text(_csv_value(row, "care", "care_summary"), max_len=1000),

                quantity=quantity,

                clean_count=clean_count,

                is_bulk=is_bulk,

            )

            created.append(item_id)

        except Exception:

            logger.exception("CSV row import failed")

            skipped.append({"row": idx, "reason": "could not import row"})



    if not created and skipped:

        raise HTTPException(status_code=400, detail={"created": 0, "skipped": skipped[:20]})

    return {"success": True, "created": len(created), "item_ids": created, "skipped": skipped[:20]}





@app.post("/api/closet/visual-search")

async def closet_visual_search(

    request: Request,

    files: List[UploadFile] = File(...),

    limit: int = 20,

    current_user: dict = Depends(get_current_user),

):

    """Find nearest closet pieces by CLIP embedding (needs indexed uploads)."""

    rate_limit(request, "closet.visual_search", limit=40, window=600)

    if len(files) != 1:

        raise HTTPException(

            status_code=400, detail="Upload exactly one reference image",

        )

    lim = max(1, min(int(limit), 50))

    saved: Optional[Path] = None

    try:

        saved = save_uploaded_image(files[0], UPLOAD_DIR, prefix="vfind")

        qvec = get_classifier().encode_image_embedding(str(saved))

        if not qvec:

            raise HTTPException(

                status_code=500, detail="Could not encode that image — try another photo",

            )

        rows = db.list_owned_clip_embeddings(current_user["user_id"])

        if not rows:

            return {"matches": [], "hint": "No indexed items yet — add new photos so we can embed them."}

        scored = []

        for iid, vec in rows:

            if len(vec) != len(qvec):

                continue

            s = sum(a * b for a, b in zip(qvec, vec))

            scored.append((float(s), iid))

        scored.sort(key=lambda t: -t[0])

        top = scored[:lim]

        out: List = []

        for score, iid in top:

            row = db.get_item(iid)

            if row:

                out.append({
                    "score": round(score, 4),
                    "item": row,
                    "explanation": _visual_explanation(score, row),
                })

        return {"matches": out}

    except HTTPException:

        raise

    except Exception:

        logger.exception("visual search failed")

        raise HTTPException(status_code=500, detail="Visual search failed")

    finally:

        if saved is not None:

            _unlink_temp_upload(saved)





@app.get("/api/closet/locations")

async def list_closet_locations(current_user: dict = Depends(get_current_user)):

    return {"locations": db.list_closet_locations(current_user["user_id"])}





@app.post("/api/closet/locations")

async def create_closet_location(

    body: ClosetLocationCreate,

    current_user: dict = Depends(get_current_user),

):

    kind = (body.kind or "home").strip().lower()

    if kind not in _VALID_LOCATION_KINDS:

        kind = "other"

    try:

        loc_id = db.create_closet_location(

            current_user["user_id"],

            clip_text(body.name, max_len=80) or "Closet",

            kind,

            bool(body.is_default),

        )

    except ValueError:

        raise HTTPException(status_code=400, detail="Location name required")

    return {"success": True, "location": db.get_closet_location(loc_id, current_user["user_id"])}





@app.put("/api/closet/locations/{location_id}")

async def update_closet_location(

    location_id: int,

    body: ClosetLocationUpdate,

    current_user: dict = Depends(get_current_user),

):

    kind = body.kind.strip().lower() if body.kind else None

    if kind is not None and kind not in _VALID_LOCATION_KINDS:

        kind = "other"

    ok = db.update_closet_location(

        current_user["user_id"],

        location_id,

        name=clip_text(body.name, max_len=80) if body.name is not None else None,

        kind=kind,

        is_default=body.is_default,

    )

    if not ok:

        raise HTTPException(status_code=404, detail="Location not found")

    return {"success": True, "location": db.get_closet_location(location_id, current_user["user_id"])}





@app.delete("/api/closet/locations/{location_id}")

async def delete_closet_location(

    location_id: int,

    current_user: dict = Depends(get_current_user),

):

    ok = db.delete_closet_location(current_user["user_id"], location_id)

    if not ok:

        raise HTTPException(status_code=404, detail="Location not found")

    return {"success": True, "locations": db.list_closet_locations(current_user["user_id"])}





@app.get("/api/closet")

async def get_closet(

    category: Optional[str] = None,

    status: Optional[str] = None,

    q: Optional[str] = None,

    packed: Optional[bool] = None,

    closet_location_id: Optional[int] = None,

    current_user: dict = Depends(get_current_user),

):

    items = db.get_all_items(

        user_id=current_user["user_id"],

        category=category,

        status=status,

        packed=packed,

        closet_location_id=closet_location_id,

    )

    if q and q.strip():

        qq = q.strip().lower()

        items = [i for i in items if _closet_item_matches_query(i, qq)]

    return {"items": items}





@app.put("/api/closet/packed")

async def bulk_update_packed(

    body: PackedBulkUpdate,

    current_user: dict = Depends(get_current_user),

):

    item_ids = body.item_ids

    if item_ids is not None:

        item_ids = [int(i) for i in item_ids if int(i) > 0]

        if not item_ids:

            raise HTTPException(status_code=400, detail="item_ids cannot be empty")

        if len(item_ids) > 500:

            raise HTTPException(status_code=400, detail="Pack batches are limited to 500 items")

    updated = db.set_packed_for_trip_bulk(

        user_id=current_user["user_id"],

        item_ids=item_ids,

        packed_for_trip=body.packed_for_trip,

    )

    return {"success": True, "updated": updated}





@app.get("/api/planned-outfits")

async def list_planned_outfits(

    include_past: bool = True,

    current_user: dict = Depends(get_current_user),

):

    return {

        "plans": db.list_planned_outfits(

            user_id=current_user["user_id"], include_past=include_past

        )

    }





@app.post("/api/planned-outfits")

async def create_planned_outfit(

    body: PlannedOutfitCreate,

    current_user: dict = Depends(get_current_user),

):

    title = clip_text(body.title, max_len=120)

    if not title:

        raise HTTPException(status_code=400, detail="title required")

    item_ids = [int(i) for i in (body.item_ids or []) if int(i) > 0]

    if len(item_ids) > 50:

        raise HTTPException(status_code=400, detail="Plans are limited to 50 items")

    plan = db.create_planned_outfit(

        user_id=current_user["user_id"],

        title=title,

        planned_for=_validate_iso_date(body.planned_for, "planned_for") or body.planned_for,

        occasion=clip_text(body.occasion, max_len=80),

        notes=clip_text(body.notes, max_len=1000),

        status=_validate_planned_status(body.status),

        item_ids=item_ids,

    )

    if not plan:

        raise HTTPException(status_code=500, detail="Could not create plan")

    return {"success": True, "plan": plan}





@app.get("/api/planned-outfits/{plan_id}")

async def get_planned_outfit(

    plan_id: int,

    current_user: dict = Depends(get_current_user),

):

    plan = db.get_planned_outfit(current_user["user_id"], plan_id)

    if not plan:

        raise HTTPException(status_code=404, detail="Plan not found")

    return plan





@app.put("/api/planned-outfits/{plan_id}")

async def update_planned_outfit(

    plan_id: int,

    body: PlannedOutfitUpdate,

    current_user: dict = Depends(get_current_user),

):

    patch = body.dict(exclude_unset=True)

    if not patch:

        raise HTTPException(status_code=400, detail="No fields to update")

    item_ids = patch.pop("item_ids", None)

    if item_ids is not None:

        item_ids = [int(i) for i in item_ids if int(i) > 0]

        if len(item_ids) > 50:

            raise HTTPException(status_code=400, detail="Plans are limited to 50 items")

    if "planned_for" in patch and patch["planned_for"] is not None:

        patch["planned_for"] = _validate_iso_date(patch["planned_for"], "planned_for")

    if "status" in patch and patch["status"] is not None:

        patch["status"] = _validate_planned_status(patch["status"])

    if "title" in patch:

        patch["title"] = clip_text(patch["title"], max_len=120)

    if "occasion" in patch:

        patch["occasion"] = clip_text(patch["occasion"], max_len=80)

    if "notes" in patch:

        patch["notes"] = clip_text(patch["notes"], max_len=1000)

    plan = db.update_planned_outfit(

        user_id=current_user["user_id"],

        plan_id=plan_id,

        fields=patch,

        item_ids=item_ids,

    )

    if not plan:

        raise HTTPException(status_code=404, detail="Plan not found")

    return {"success": True, "plan": plan}





@app.delete("/api/planned-outfits/{plan_id}")

async def delete_planned_outfit(

    plan_id: int,

    current_user: dict = Depends(get_current_user),

):

    if not db.delete_planned_outfit(current_user["user_id"], plan_id):

        raise HTTPException(status_code=404, detail="Plan not found")

    return {"success": True}





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





@app.get("/api/item/{item_id}/outfits")

async def item_suggested_outfits(

    item_id: int,

    occasion: Optional[str] = None,

    season: Optional[str] = None,

    seed: Optional[int] = None,

    vibe: Optional[str] = None,

    current_user: dict = Depends(get_current_user),

):

    """Rule-based outfits that always include this closet item."""

    _require_item_owner(item_id, current_user["user_id"])

    try:

        items = db.get_all_items(user_id=current_user["user_id"], status="clean")

        items = [

            i for i in items if not i.get("lent_to") and not i.get("packed_for_trip")

        ]

        reserved = db.get_reserved_item_ids(current_user["user_id"])

        items = [i for i in items if int(i["id"]) not in reserved or int(i["id"]) == item_id]

        day = int(datetime.now(timezone.utc).timestamp() // 86400)

        rng_seed = (current_user["user_id"] * 1_000_003 ^ day) % (2**31)

        if seed is not None:

            rng_seed = seed % (2**31)

        rng = random.Random(rng_seed)

        vibe_key = _normalize_vibe(vibe)

        outfits = outfit_recommender.generate_outfits(

            items,

            occasion=occasion,

            season=season,

            vibe=vibe_key,

            rng=rng,

            pin_item_ids=[item_id],

            max_outfits=8,

        )

        return {"outfits": outfits}

    except HTTPException:

        raise

    except Exception:

        logger.exception("item outfits failed")

        raise HTTPException(status_code=500, detail="Outfit lookup failed")





@app.get("/api/item/{item_id}/wear-history")
async def item_wear_history(
    item_id: int,
    current_user: dict = Depends(get_current_user),
):
    _require_item_owner(item_id, current_user["user_id"])
    return {"history": db.get_item_wear_history(current_user["user_id"], item_id)}


@app.get("/api/item/{item_id}/worn-outfits")
async def item_worn_outfits(
    item_id: int,
    current_user: dict = Depends(get_current_user),
):
    _require_item_owner(item_id, current_user["user_id"])
    return {"posts": db.get_worn_posts_for_item(current_user["user_id"], item_id)}


@app.post("/api/item/{item_id}/classification-correction")
async def save_classification_correction(
    item_id: int,
    body: ClassificationCorrection,
    current_user: dict = Depends(get_current_user),
):
    _require_item_owner(item_id, current_user["user_id"])
    corrected = dict(body.corrected_data or {})
    if not corrected:
        raise HTTPException(status_code=400, detail="corrected_data required")
    update_fields = {
        key: corrected[key]
        for key in (
            "category",
            "subcategory",
            "colors",
            "color_hexes",
            "season",
            "style",
            "pattern",
        )
        if key in corrected
    }
    if update_fields:
        if "colors" in update_fields and "color_hexes" not in update_fields:
            update_fields["color_hexes"] = _color_hexes(update_fields.get("colors") or [])
        db.update_item_details(
            item_id=item_id,
            user_id=current_user["user_id"],
            **update_fields,
        )
    ok = db.record_classification_correction(
        current_user["user_id"], item_id, corrected
    )
    if not ok:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"success": True, "item_id": item_id}


@app.put("/api/item/{item_id}/status")

async def update_item_status(

    item_id: int,

    status_update: ItemStatusUpdate,

    current_user: dict = Depends(get_current_user),

):

    _require_item_owner(item_id, current_user["user_id"])

    if status_update.worn is True:

        row = db.get_item(item_id)

        if row and row.get("is_bulk") and (row.get("clean_count") or 0) <= 0:

            raise HTTPException(

                status_code=400,

                detail="No clean units left — mark a wash first or refill clean count.",

            )

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

    """Patch user-editable metadata (brand, size, notes, tags, purchase fields)."""

    _require_item_owner(item_id, current_user["user_id"])

    patch = details.dict(exclude_unset=True)

    if not patch:

        raise HTTPException(status_code=400, detail="No fields to update")

    if patch.get("status") is not None and patch["status"] not in {"owned", "wishlist"}:

        raise HTTPException(status_code=400, detail="status must be owned or wishlist")

    if patch.get("wishlist_intent") is not None:

        if patch["wishlist_intent"] not in _VALID_WISHLIST_INTENTS:

            raise HTTPException(

                status_code=400,

                detail=f"intent must be one of {sorted(_VALID_WISHLIST_INTENTS)}",

            )



    success = db.update_item_details(

        item_id=item_id,

        user_id=current_user["user_id"],

        **patch,

    )

    if not success:

        raise HTTPException(status_code=404, detail="Item not found")

    return {"success": True, "item_id": item_id}





@app.post("/api/item/{item_id}/care-label")

async def scan_item_care_label(

    request: Request,

    item_id: int,

    file: UploadFile = File(...),

    current_user: dict = Depends(get_current_user),

):

    """OCR a care tag photo and store the raw text plus a short summary."""

    rate_limit(request, "item.care_label", limit=30, window=600)

    _require_item_owner(item_id, current_user["user_id"])

    saved: Optional[Path] = None

    try:

        saved = save_uploaded_image(file, UPLOAD_DIR, prefix=f"care_{item_id}")

        raw_text = clip_text(_extract_care_label_text(str(saved)), max_len=4000) or ""

        summary = clip_text(_care_summary_from_text(raw_text), max_len=1000) or ""

        if not raw_text:

            raise HTTPException(

                status_code=422,

                detail="No care text detected. Try a flatter, brighter tag photo.",

            )

        ok = db.update_item_details(

            item_id=item_id,

            user_id=current_user["user_id"],

            care_label_text=raw_text,

            care_summary=summary,

        )

        if not ok:

            raise HTTPException(status_code=404, detail="Item not found")

        return {

            "success": True,

            "item_id": item_id,

            "care_label_text": raw_text,

            "care_summary": summary,

        }

    except HTTPException:

        raise

    except Exception:

        logger.exception("care label scan failed")

        raise HTTPException(status_code=500, detail="Care label scan failed")

    finally:

        if saved is not None:

            _unlink_temp_upload(saved)





@app.post("/api/item/{item_id}/promote-bulk")

async def promote_bulk_item(

    item_id: int,

    body: PromoteBulkBody,

    current_user: dict = Depends(get_current_user),

):

    """Turn N clean bulk units into separate closet rows (or remove bulk if all promoted)."""

    _require_item_owner(item_id, current_user["user_id"])

    created = db.promote_bulk_to_individuals(

        item_id, current_user["user_id"], body.count

    )

    if created is None:

        raise HTTPException(

            status_code=400,

            detail="Cannot promote — need a bulk item and count ≤ quantity and clean count.",

        )

    bulk_left = db.get_item(item_id)

    return {

        "success": True,

        "created_ids": created,

        "bulk_item": bulk_left,

        "bulk_removed": bulk_left is None,

    }





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

    seed: Optional[int] = None,

    exclude_item_ids: Optional[str] = None,

    pin_item_ids: Optional[str] = None,

    vibe: Optional[str] = None,

    include_packed: bool = False,

    closet_location_id: Optional[int] = None,

    lat: Optional[float] = None,

    lon: Optional[float] = None,

    weather_date: Optional[str] = None,

    location_name: Optional[str] = None,

    current_user: dict = Depends(get_current_user),

):

    try:

        weather_context = None

        if lat is not None or lon is not None:

            if lat is None or lon is None:

                raise HTTPException(status_code=400, detail="lat and lon are both required")

            lat_f, lon_f = _validate_lat_lon(lat, lon)

            weather_context = weather_provider.current(

                lat_f,

                lon_f,

                weather_date=_validate_iso_date(weather_date, "weather_date"),

                location_name=clip_text(location_name, max_len=120),

            ).to_dict()

        items = db.get_all_items(

            user_id=current_user["user_id"],

            status="clean",

            closet_location_id=closet_location_id,

        )

        items = [i for i in items if not i.get("lent_to")]

        if not include_packed:

            items = [i for i in items if not i.get("packed_for_trip")]

        reserved = db.get_reserved_item_ids(current_user["user_id"])

        pins = _parse_outfit_id_list(pin_item_ids) or None

        pinned = set(pins or [])

        items = [

            i for i in items

            if int(i["id"]) not in reserved or int(i["id"]) in pinned

        ]

        day = int(datetime.now(timezone.utc).timestamp() // 86400)

        rng_seed = (current_user["user_id"] * 1_000_003 ^ day) % (2**31)

        if seed is not None:

            rng_seed = seed % (2**31)

        rng = random.Random(rng_seed)

        exclude = set(_parse_outfit_id_list(exclude_item_ids))

        vibe_key = _normalize_vibe(vibe)

        raw_outfits = outfit_recommender.generate_outfits(

            items,

            occasion=occasion,

            season=season,

            vibe=vibe_key,

            rng=rng,

            exclude_item_ids=exclude,

            pin_item_ids=pins,

            max_outfits=14,

            weather=weather_context,

        )

        recent = db.get_recent_outfit_signatures(

            current_user["user_id"], days=14, limit=120

        )
        worn_recent = db.get_worn_outfit_signatures(
            current_user["user_id"], days=180, limit=200
        )
        avoid_signatures = set(recent) | set(worn_recent)

        filtered = [

            o for o in raw_outfits

            if _outfit_item_signature(o["items"]) not in avoid_signatures

        ]

        outfits = filtered[:5]

        if len(outfits) < 2:

            outfits = raw_outfits[:5]

        db.log_outfit_recommendations(current_user["user_id"], outfits)

        return {"outfits": outfits, "weather": weather_context}

    except HTTPException:

        raise

    except WeatherServiceError:

        logger.exception("weather-aware outfit recommendation failed")

        raise HTTPException(status_code=502, detail="Weather provider unavailable")

    except Exception:

        logger.exception("outfit recommendation failed")

        raise HTTPException(status_code=500, detail="Recommendation failed")





@app.post("/api/ai-stylist")

async def ai_stylist(

    body: AiStylistRequest,

    current_user: dict = Depends(get_current_user),

):

    try:

        weather_context = None

        if body.lat is not None or body.lon is not None:

            if body.lat is None or body.lon is None:

                raise HTTPException(status_code=400, detail="lat and lon are both required")

            lat_f, lon_f = _validate_lat_lon(body.lat, body.lon)

            weather_context = weather_provider.current(

                lat_f,

                lon_f,

                weather_date=_validate_iso_date(body.weather_date, "weather_date"),

                location_name=clip_text(body.location_name, max_len=120),

            ).to_dict()



        items = db.get_all_items(

            user_id=current_user["user_id"],

            status="clean",

            closet_location_id=body.closet_location_id,

        )

        items = [i for i in items if not i.get("lent_to")]

        if not body.include_packed:

            items = [i for i in items if not i.get("packed_for_trip")]

        exclude = {int(i) for i in body.exclude_item_ids or [] if int(i) > 0}

        if exclude:

            items = [i for i in items if int(i.get("id") or 0) not in exclude]

        pin_item_ids = [int(i) for i in body.pin_item_ids or [] if int(i) > 0]



        day = int(datetime.now(timezone.utc).timestamp() // 86400)

        rng_seed = (current_user["user_id"] * 1_000_003 ^ day ^ hash(body.message)) % (2**31)

        recent = set(db.get_recent_outfit_signatures(current_user["user_id"], days=14, limit=120))

        planned_outfits = db.get_ai_stylist_planning_context(current_user["user_id"])

        feedback = db.get_ai_stylist_feedback_summary(current_user["user_id"])

        result = build_ai_stylist_response(

            message=clip_text(body.message, max_len=500) or "",

            items=items,

            recommender=outfit_recommender,

            weather=weather_context,

            rng=random.Random(rng_seed),

            recent_signatures=recent,

            explicit_pin_item_ids=pin_item_ids,

            planned_outfits=planned_outfits,

            feedback=feedback,

        )

        db.log_outfit_recommendations(

            current_user["user_id"],

            [suggestion["outfit"] for suggestion in result["suggestions"]],

        )

        result["weather"] = weather_context

        return result

    except HTTPException:

        raise

    except WeatherServiceError:

        logger.exception("weather-aware AI stylist failed")

        raise HTTPException(status_code=502, detail="Weather provider unavailable")

    except Exception:

        logger.exception("AI stylist failed")

        raise HTTPException(status_code=500, detail="AI stylist failed")





@app.post("/api/ai-stylist/feedback")

async def ai_stylist_feedback(

    body: AiStylistFeedbackRequest,

    current_user: dict = Depends(get_current_user),

):

    signature = _validate_item_signature(body.item_signature)

    db.record_ai_stylist_feedback(

        current_user["user_id"],

        item_signature=signature,

        useful=body.useful,

        message=clip_text(body.message, max_len=500),

    )

    return {"success": True}





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

    if queue_id == -2:

        raise HTTPException(

            status_code=400,

            detail="Bulk basics track laundry on the item (clean count), not the queue.",

        )

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

    clean_trip_name = clip_text(trip_name, max_len=120)

    clean_trip_destination = clip_text(trip_destination, max_len=120)

    clean_trip_start = _validate_iso_date(trip_start, "trip_start")

    clean_trip_end = _validate_iso_date(trip_end, "trip_end")

    if clean_trip_start and clean_trip_end and clean_trip_end < clean_trip_start:

        raise HTTPException(status_code=400, detail="trip_end must be after trip_start")



    post_id = db.create_fit_post(

        user_id=current_user["user_id"],

        image_path=str(saved),

        caption=clean_caption,

        item_ids=parsed_ids,

        trip_name=clean_trip_name,

        trip_destination=clean_trip_destination,

        trip_start=clean_trip_start,

        trip_end=clean_trip_end,

    )

    post = db.get_post(post_id=post_id, viewer_id=current_user["user_id"])

    return {"success": True, "post": post}





@app.get("/api/trips/logs")

async def list_trip_logs(current_user: dict = Depends(get_current_user)):

    return {"trips": db.get_trip_logs(user_id=current_user["user_id"])}





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

