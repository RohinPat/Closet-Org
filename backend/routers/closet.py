"""Uploads, imports, closet listing/search, locations and insights."""

from __future__ import annotations

import csv
import io
from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
)
from typing import List, Optional, Set
from pathlib import Path
from models.closet_insights import build_closet_insights
from security import (
    clip_text,
    rate_limit,
    safe_uploads_url,
    save_uploaded_image,
)
from auth import get_current_user
from models.closet_pairing import rank_closet_pairings
import deps
from schemas import (
    BulkItemCreate,
    ClosetLocationCreate,
    ClosetLocationUpdate,
    CsvImportBody,
    ManualClosetImportBody,
    PackedBulkUpdate,
)
from route_helpers import (
    _VALID_BULK_SUBCATEGORIES,
    _VALID_LOCATION_KINDS,
    _bulk_defaults_for_text,
    _closet_item_matches_query,
    _color_hexes,
    _csv_bool,
    _csv_float,
    _csv_int,
    _csv_value,
    _detect_pattern,
    _split_csv_list,
    _unlink_temp_upload,
    _visual_explanation,
    logger,
)

router = APIRouter()


# ---- Clothing ----------------------------------------------------------------



@router.post("/api/upload-clothing")

def upload_clothing(

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

        try:
            classifier = deps.get_classifier()
        except Exception as exc:
            logger.exception("Classifier init failed")
            raise HTTPException(
                status_code=503,
                detail=(
                    "AI model failed to load (first upload may need a few minutes). "
                    "Check server disk space and /opt/closet-org/.cache permissions."
                ),
            ) from exc

        for upload in files:

            saved = save_uploaded_image(upload, deps.UPLOAD_DIR, prefix="item")

            saved_paths.append(str(saved))

            classifications.append(classifier.classify(str(saved)))



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

            existing_similar = deps.db.count_owned_similar_by_category_color(

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



        item_id = deps.db.add_clothing_item(

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
        deps.db.update_item_details(
            item_id=item_id,
            user_id=current_user["user_id"],
            color_hexes=classification["color_hexes"],
            pattern=classification["pattern"],
            laundry_state="clean",
        )



        try:

            emb = deps.get_classifier().encode_image_embedding(saved_paths[0])

            if emb:

                deps.db.set_clip_embedding(item_id, emb)
                neighbors = deps.db.get_duplicate_candidates(current_user["user_id"], threshold=0.91)
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

            "image_url": safe_uploads_url(saved_paths[0], deps.UPLOAD_DIR),

            "thumbnail_url": safe_uploads_url(thumb_paths[0], deps.UPLOAD_DIR),

            "image_urls": [safe_uploads_url(p, deps.UPLOAD_DIR) for p in saved_paths],

            "thumbnail_urls": [safe_uploads_url(p, deps.UPLOAD_DIR) for p in thumb_paths],

        }

    except HTTPException:

        raise

    except Exception:

        logger.exception("upload-clothing failed")

        raise HTTPException(status_code=500, detail="Upload failed")


@router.get("/api/closet/insights")

def get_closet_insights(current_user: dict = Depends(get_current_user)):

    items = deps.db.get_all_items(user_id=current_user["user_id"])

    insights = build_closet_insights(items)
    insights["duplicate_candidates"] = deps.db.get_duplicate_candidates(current_user["user_id"])
    return insights


@router.get("/api/reminders")
def get_reminders(current_user: dict = Depends(get_current_user)):
    return {"cards": deps.db.get_reminder_cards(current_user["user_id"])}


@router.post("/api/closet/embedding-backfill")
def backfill_embeddings(
    limit: int = 10,
    current_user: dict = Depends(get_current_user),
):
    lim = max(1, min(int(limit), 25))
    rows = deps.db.list_items_missing_embeddings(current_user["user_id"], limit=lim)
    updated = 0
    failed: List[int] = []
    for row in rows:
        try:
            emb = deps.get_classifier().encode_image_embedding(row["image_path"])
            if emb and deps.db.set_clip_embedding(int(row["id"]), emb):
                updated += 1
        except Exception:
            logger.debug("embedding backfill failed for item %s", row.get("id"), exc_info=True)
            failed.append(int(row["id"]))
    return {"success": True, "updated": updated, "failed_item_ids": failed}


@router.post("/api/closet/fit-check")

def closet_fit_check(

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

        saved = save_uploaded_image(files[0], deps.UPLOAD_DIR, prefix="fitcheck")

        classification = deps.get_classifier().classify(str(saved))

        candidate = {

            "category": classification["category"],

            "subcategory": classification["subcategory"],

            "colors": classification["colors"],

            "style": classification.get("style"),

            "season": classification.get("season"),

        }

        closet_items = deps.db.get_all_items(

            user_id=current_user["user_id"],

            status="clean",

        )

        closet_items = [

            i

            for i in closet_items

            if not i.get("lent_to") and not i.get("packed_for_trip")

        ]

        pairings = rank_closet_pairings(

            candidate, closet_items, deps.outfit_recommender, limit=30

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


@router.post("/api/closet/bulk-item")

def create_bulk_item(

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

        item_id = deps.db.add_bulk_clothing_item(

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


@router.post("/api/closet/bulk-item/upload")

def create_bulk_item_with_photo(

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

        saved = save_uploaded_image(photo, deps.UPLOAD_DIR, prefix="bulkref")

        spath = str(saved)

        classifications = deps.get_classifier().classify(spath)

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

            emb_list = deps.get_classifier().encode_image_embedding(spath)

        except Exception:

            logger.debug("bulk ref CLIP embedding failed", exc_info=True)



        item_id = deps.db.add_bulk_clothing_item(

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


@router.post("/api/closet/import-csv")

def import_closet_csv(

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

            item_id = deps.db.add_imported_clothing_item(

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


@router.post("/api/closet/import-manual")

def import_closet_manual(

    request: Request,

    body: ManualClosetImportBody,

    current_user: dict = Depends(get_current_user),

):

    """Add one spreadsheet-style row via a form instead of pasted CSV."""

    rate_limit(request, "closet.import_manual", limit=60, window=600)

    def _squeeze_str_list(raw: Optional[List[str]], *, cap: int) -> List[str]:

        if not raw:

            return []

        out: List[str] = []

        seen: Set[str] = set()

        for x in raw:

            s = str(x).strip()

            if not s or len(s) > 120:

                continue

            key = s.lower()

            if key in seen:

                continue

            seen.add(key)

            out.append(s)

            if len(out) >= cap:

                break

        return out



    cols = _squeeze_str_list(body.colors, cap=24)

    tag_list = _squeeze_str_list(body.tags, cap=48)

    notes = clip_text(body.description, max_len=2000) if body.description else None

    try:

        item_id = deps.db.add_imported_clothing_item(

            current_user["user_id"],

            category=clip_text(body.title, max_len=40) or "Other",

            subcategory=clip_text(body.subcategory, max_len=40) or "Other",

            colors=cols,

            notes=notes,

            user_tags=tag_list,

            quantity=1,

            clean_count=None,

            is_bulk=False,

        )

    except HTTPException:

        raise

    except Exception:

        logger.exception("manual closet import failed")

        raise HTTPException(status_code=500, detail="Could not add item")

    return {"success": True, "created": 1, "item_id": item_id}


@router.post("/api/closet/visual-search")

def closet_visual_search(

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

        saved = save_uploaded_image(files[0], deps.UPLOAD_DIR, prefix="vfind")

        qvec = deps.get_classifier().encode_image_embedding(str(saved))

        if not qvec:

            raise HTTPException(

                status_code=500, detail="Could not encode that image — try another photo",

            )

        rows = deps.db.list_owned_clip_embeddings(current_user["user_id"])

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

            row = deps.db.get_item(iid)

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


@router.get("/api/closet/locations")

def list_closet_locations(current_user: dict = Depends(get_current_user)):

    return {"locations": deps.db.list_closet_locations(current_user["user_id"])}


@router.post("/api/closet/locations")

def create_closet_location(

    body: ClosetLocationCreate,

    current_user: dict = Depends(get_current_user),

):

    kind = (body.kind or "home").strip().lower()

    if kind not in _VALID_LOCATION_KINDS:

        kind = "other"

    try:

        loc_id = deps.db.create_closet_location(

            current_user["user_id"],

            clip_text(body.name, max_len=80) or "Closet",

            kind,

            bool(body.is_default),

        )

    except ValueError:

        raise HTTPException(status_code=400, detail="Location name required")

    return {"success": True, "location": deps.db.get_closet_location(loc_id, current_user["user_id"])}


@router.put("/api/closet/locations/{location_id}")

def update_closet_location(

    location_id: int,

    body: ClosetLocationUpdate,

    current_user: dict = Depends(get_current_user),

):

    kind = body.kind.strip().lower() if body.kind else None

    if kind is not None and kind not in _VALID_LOCATION_KINDS:

        kind = "other"

    ok = deps.db.update_closet_location(

        current_user["user_id"],

        location_id,

        name=clip_text(body.name, max_len=80) if body.name is not None else None,

        kind=kind,

        is_default=body.is_default,

    )

    if not ok:

        raise HTTPException(status_code=404, detail="Location not found")

    return {"success": True, "location": deps.db.get_closet_location(location_id, current_user["user_id"])}


@router.delete("/api/closet/locations/{location_id}")

def delete_closet_location(

    location_id: int,

    current_user: dict = Depends(get_current_user),

):

    ok = deps.db.delete_closet_location(current_user["user_id"], location_id)

    if not ok:

        raise HTTPException(status_code=404, detail="Location not found")

    return {"success": True, "locations": deps.db.list_closet_locations(current_user["user_id"])}


@router.get("/api/closet")

def get_closet(

    category: Optional[str] = None,

    status: Optional[str] = None,

    q: Optional[str] = None,

    packed: Optional[bool] = None,

    closet_location_id: Optional[int] = None,

    current_user: dict = Depends(get_current_user),

):

    items = deps.db.get_all_items(

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


@router.put("/api/closet/packed")

def bulk_update_packed(

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

    updated = deps.db.set_packed_for_trip_bulk(

        user_id=current_user["user_id"],

        item_ids=item_ids,

        packed_for_trip=body.packed_for_trip,

    )

    return {"success": True, "updated": updated}
