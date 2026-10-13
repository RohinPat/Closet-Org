"""Validation, parsing and formatting helpers shared by the routers."""

from __future__ import annotations

import logging
import re
from typing import (
    Dict,
    List,
    Optional,
    Set,
)
from fastapi import HTTPException
from pathlib import Path
from security import clip_text
from datetime import datetime
from auth import hash_password
import deps


# Pre-baked dummy bcrypt hash used to mask login timing for unknown

# usernames. Lazily computed on first miss so unit tests don't pay for it.

_DUMMY_PASSWORD_HASH: Optional[str] = None


def _dummy_hash() -> str:

    global _DUMMY_PASSWORD_HASH

    if _DUMMY_PASSWORD_HASH is None:

        _DUMMY_PASSWORD_HASH = hash_password("__dummy_login_padding__")

    return _DUMMY_PASSWORD_HASH


logger = logging.getLogger("closet_org")


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


_RESET_TTL_SECONDS = 3600


def _remove_user_upload_files(stored_paths: List[str]) -> None:
    """Best-effort unlink of a deleted user's files.

    Stored values are a mix of absolute paths and ``/uploads/<name>`` URLs;
    both are reduced to a bare filename inside ``UPLOAD_DIR`` so nothing
    outside the uploads folder can ever be touched. Shared bulk placeholders
    are skipped.
    """
    root = deps.UPLOAD_DIR.resolve()
    for stored in stored_paths:
        name = Path(str(stored).replace("\\", "/")).name
        if not name or name.startswith("_bulk_placeholder"):
            continue
        target = (root / name).resolve()
        if target.parent != root:
            continue
        try:
            target.unlink(missing_ok=True)
        except OSError:
            logger.warning("Could not remove upload %s during account deletion", name)


# ---- Ownership guard ---------------------------------------------------------



def _require_item_owner(item_id: int, user_id: int) -> None:

    """Raise 404 if the item doesn't exist OR isn't owned by the caller.



    Returning 404 (not 403) avoids leaking the existence of other users'

    items via id enumeration.

    """

    if not deps.db.item_belongs_to(item_id, user_id):

        raise HTTPException(status_code=404, detail="Item not found")
