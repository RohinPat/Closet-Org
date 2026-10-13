"""Single-item views and edits, wishlist, laundry, stats."""

from __future__ import annotations

import random
from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Request,
    UploadFile,
)
from typing import Optional
from pathlib import Path
from security import clip_text, rate_limit, save_uploaded_image
from datetime import datetime, timezone
from auth import get_current_user
import deps
from schemas import (
    ClassificationCorrection,
    ItemDetailsUpdate,
    ItemLendRequest,
    ItemStatusUpdate,
    PromoteBulkBody,
    WishlistCreate,
    WishlistUpdate,
)
from route_helpers import (
    _VALID_LAUNDRY_PRIORITY,
    _VALID_LAUNDRY_STATUS,
    _VALID_WISHLIST_INTENTS,
    _care_summary_from_text,
    _color_hexes,
    _extract_care_label_text,
    _normalize_vibe,
    _require_item_owner,
    _unlink_temp_upload,
    logger,
)

router = APIRouter()


@router.get("/api/item/{item_id}")

def get_item(

    item_id: int,

    current_user: dict = Depends(get_current_user),

):

    """Get one item. 404s if it isn't yours — id enumeration leaks nothing."""

    _require_item_owner(item_id, current_user["user_id"])

    item = deps.db.get_item(item_id)

    if not item:

        raise HTTPException(status_code=404, detail="Item not found")

    return item


@router.get("/api/item/{item_id}/outfits")

def item_suggested_outfits(

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

        items = deps.db.get_all_items(user_id=current_user["user_id"], status="clean")

        items = [

            i for i in items if not i.get("lent_to") and not i.get("packed_for_trip")

        ]

        reserved = deps.db.get_reserved_item_ids(current_user["user_id"])

        items = [i for i in items if int(i["id"]) not in reserved or int(i["id"]) == item_id]

        day = int(datetime.now(timezone.utc).timestamp() // 86400)

        rng_seed = (current_user["user_id"] * 1_000_003 ^ day) % (2**31)

        if seed is not None:

            rng_seed = seed % (2**31)

        rng = random.Random(rng_seed)

        vibe_key = _normalize_vibe(vibe)

        outfits = deps.outfit_recommender.generate_outfits(

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


@router.get("/api/item/{item_id}/wear-history")
def item_wear_history(
    item_id: int,
    current_user: dict = Depends(get_current_user),
):
    _require_item_owner(item_id, current_user["user_id"])
    return {"history": deps.db.get_item_wear_history(current_user["user_id"], item_id)}


@router.get("/api/item/{item_id}/worn-outfits")
def item_worn_outfits(
    item_id: int,
    current_user: dict = Depends(get_current_user),
):
    _require_item_owner(item_id, current_user["user_id"])
    return {"posts": deps.db.get_worn_posts_for_item(current_user["user_id"], item_id)}


@router.post("/api/item/{item_id}/classification-correction")
def save_classification_correction(
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
        deps.db.update_item_details(
            item_id=item_id,
            user_id=current_user["user_id"],
            **update_fields,
        )
    ok = deps.db.record_classification_correction(
        current_user["user_id"], item_id, corrected
    )
    if not ok:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"success": True, "item_id": item_id}


@router.put("/api/item/{item_id}/status")

def update_item_status(

    item_id: int,

    status_update: ItemStatusUpdate,

    current_user: dict = Depends(get_current_user),

):

    _require_item_owner(item_id, current_user["user_id"])

    if status_update.worn is True:

        row = deps.db.get_item(item_id)

        if row and row.get("is_bulk") and (row.get("clean_count") or 0) <= 0:

            raise HTTPException(

                status_code=400,

                detail="No clean units left — mark a wash first or refill clean count.",

            )

    success = deps.db.update_item_status(

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


@router.put("/api/item/{item_id}")

def update_item_details(

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



    success = deps.db.update_item_details(

        item_id=item_id,

        user_id=current_user["user_id"],

        **patch,

    )

    if not success:

        raise HTTPException(status_code=404, detail="Item not found")

    return {"success": True, "item_id": item_id}


@router.post("/api/item/{item_id}/care-label")

def scan_item_care_label(

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

        saved = save_uploaded_image(file, deps.UPLOAD_DIR, prefix=f"care_{item_id}")

        raw_text = clip_text(_extract_care_label_text(str(saved)), max_len=4000) or ""

        summary = clip_text(_care_summary_from_text(raw_text), max_len=1000) or ""

        if not raw_text:

            raise HTTPException(

                status_code=422,

                detail="No care text detected. Try a flatter, brighter tag photo.",

            )

        ok = deps.db.update_item_details(

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


@router.post("/api/item/{item_id}/promote-bulk")

def promote_bulk_item(

    item_id: int,

    body: PromoteBulkBody,

    current_user: dict = Depends(get_current_user),

):

    """Turn N clean bulk units into separate closet rows (or remove bulk if all promoted)."""

    _require_item_owner(item_id, current_user["user_id"])

    created = deps.db.promote_bulk_to_individuals(

        item_id, current_user["user_id"], body.count

    )

    if created is None:

        raise HTTPException(

            status_code=400,

            detail="Cannot promote — need a bulk item and count ≤ quantity and clean count.",

        )

    bulk_left = deps.db.get_item(item_id)

    return {

        "success": True,

        "created_ids": created,

        "bulk_item": bulk_left,

        "bulk_removed": bulk_left is None,

    }


@router.delete("/api/item/{item_id}")

def delete_item(

    item_id: int,

    current_user: dict = Depends(get_current_user),

):

    _require_item_owner(item_id, current_user["user_id"])

    success = deps.db.delete_item(item_id)

    if not success:

        raise HTTPException(status_code=404, detail="Item not found")

    return {"success": True}


@router.get("/api/stats")

def get_stats(current_user: dict = Depends(get_current_user)):

    return deps.db.get_statistics(user_id=current_user["user_id"])


@router.get("/api/neglected-items")

def get_neglected_items(

    days: int = 30,

    current_user: dict = Depends(get_current_user),

):

    if days < 1 or days > 3650:

        raise HTTPException(status_code=400, detail="days must be between 1 and 3650")

    items = deps.db.get_neglected_items(

        user_id=current_user["user_id"], days_threshold=days

    )

    return {"items": items}


@router.put("/api/item/{item_id}/favorite")

def toggle_favorite(

    item_id: int,

    current_user: dict = Depends(get_current_user),

):

    _require_item_owner(item_id, current_user["user_id"])

    success = deps.db.toggle_favorite(item_id)

    if not success:

        raise HTTPException(status_code=404, detail="Item not found")

    return {"success": True}


@router.put("/api/item/{item_id}/lend")

def lend_item(

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



    success = deps.db.lend_item(

        item_id=item_id,

        user_id=current_user["user_id"],

        lent_to=lent_to,

        lent_until=lent_until,

    )

    if not success:

        raise HTTPException(status_code=400, detail="Could not lend item")

    return {"success": True, "item_id": item_id}


@router.put("/api/item/{item_id}/return")

def return_item(

    item_id: int,

    current_user: dict = Depends(get_current_user),

):

    success = deps.db.return_item(item_id=item_id, user_id=current_user["user_id"])

    if not success:

        raise HTTPException(status_code=404, detail="Item not found")

    return {"success": True, "item_id": item_id}


# ---- Wishlist ----------------------------------------------------------------



@router.get("/api/wishlist")

def get_wishlist(current_user: dict = Depends(get_current_user)):

    return {"items": deps.db.get_wishlist_items(user_id=current_user["user_id"])}


@router.post("/api/wishlist")

def create_wishlist_item(

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

        item_id = deps.db.add_wishlist_item(

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


@router.put("/api/item/{item_id}/promote")

def promote_wishlist_item(

    item_id: int,

    current_user: dict = Depends(get_current_user),

):

    success = deps.db.promote_wishlist_item(

        item_id=item_id, user_id=current_user["user_id"]

    )

    if not success:

        raise HTTPException(status_code=404, detail="Wishlist item not found")

    return {"success": True, "item_id": item_id}


@router.put("/api/wishlist/{item_id}")

def update_wishlist_item(

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

    success = deps.db.update_wishlist_item(

        item_id=item_id,

        user_id=current_user["user_id"],

        **patch,

    )

    if not success:

        raise HTTPException(status_code=404, detail="Wishlist item not found")

    return {"success": True, "item_id": item_id}


# ---- Laundry -----------------------------------------------------------------



@router.get("/api/laundry")

def get_laundry_queue(current_user: dict = Depends(get_current_user)):

    return deps.db.get_laundry_queue(user_id=current_user["user_id"])


@router.post("/api/laundry/add/{item_id}")

def add_to_laundry(

    item_id: int,

    priority: str = "normal",

    current_user: dict = Depends(get_current_user),

):

    if priority not in _VALID_LAUNDRY_PRIORITY:

        raise HTTPException(status_code=400, detail="Invalid priority")

    _require_item_owner(item_id, current_user["user_id"])

    queue_id = deps.db.add_to_laundry_queue(item_id, priority)

    if queue_id == -2:

        raise HTTPException(

            status_code=400,

            detail="Bulk basics track laundry on the item (clean count), not the queue.",

        )

    if queue_id == -1:

        raise HTTPException(status_code=400, detail="Item already in laundry queue")

    return {"success": True, "queue_id": queue_id}


@router.put("/api/laundry/{queue_id}/status")

def update_laundry_status(

    queue_id: int,

    status: str,

    current_user: dict = Depends(get_current_user),

):

    if status not in _VALID_LAUNDRY_STATUS:

        raise HTTPException(status_code=400, detail="Invalid status")

    if not deps.db.laundry_entry_belongs_to(queue_id, current_user["user_id"]):

        raise HTTPException(status_code=404, detail="Queue item not found")

    success = deps.db.update_laundry_status(queue_id, status)

    if not success:

        raise HTTPException(status_code=404, detail="Queue item not found")

    return {"success": True}


@router.post("/api/refresh-scores")

def refresh_freshness_scores(current_user: dict = Depends(get_current_user)):

    deps.db.update_freshness_scores(user_id=current_user["user_id"])

    return {"success": True}
