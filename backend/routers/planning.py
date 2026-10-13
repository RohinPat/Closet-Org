"""Planned outfits (calendar)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from security import clip_text
from auth import get_current_user
import deps
from schemas import (
    PlannedOutfitCreate,
    PlannedOutfitUpdate,
)
from route_helpers import (
    _validate_iso_date,
    _validate_planned_status,
)

router = APIRouter()


@router.get("/api/planned-outfits")

def list_planned_outfits(

    include_past: bool = True,

    current_user: dict = Depends(get_current_user),

):

    return {

        "plans": deps.db.list_planned_outfits(

            user_id=current_user["user_id"], include_past=include_past

        )

    }


@router.post("/api/planned-outfits")

def create_planned_outfit(

    body: PlannedOutfitCreate,

    current_user: dict = Depends(get_current_user),

):

    title = clip_text(body.title, max_len=120)

    if not title:

        raise HTTPException(status_code=400, detail="title required")

    item_ids = [int(i) for i in (body.item_ids or []) if int(i) > 0]

    if len(item_ids) > 50:

        raise HTTPException(status_code=400, detail="Plans are limited to 50 items")

    plan = deps.db.create_planned_outfit(

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


@router.get("/api/planned-outfits/{plan_id}")

def get_planned_outfit(

    plan_id: int,

    current_user: dict = Depends(get_current_user),

):

    plan = deps.db.get_planned_outfit(current_user["user_id"], plan_id)

    if not plan:

        raise HTTPException(status_code=404, detail="Plan not found")

    return plan


@router.put("/api/planned-outfits/{plan_id}")

def update_planned_outfit(

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

    plan = deps.db.update_planned_outfit(

        user_id=current_user["user_id"],

        plan_id=plan_id,

        fields=patch,

        item_ids=item_ids,

    )

    if not plan:

        raise HTTPException(status_code=404, detail="Plan not found")

    return {"success": True, "plan": plan}


@router.delete("/api/planned-outfits/{plan_id}")

def delete_planned_outfit(

    plan_id: int,

    current_user: dict = Depends(get_current_user),

):

    if not deps.db.delete_planned_outfit(current_user["user_id"], plan_id):

        raise HTTPException(status_code=404, detail="Plan not found")

    return {"success": True}
