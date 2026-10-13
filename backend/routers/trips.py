"""Trips, packing and trip logs."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from security import clip_text
from auth import get_current_user
import deps
from schemas import (
    TripCreate,
    TripPackedUpdate,
    TripUpdate,
)
from route_helpers import (
    _validate_iso_date,
)

router = APIRouter()


@router.get("/api/trips")
def list_trips(current_user: dict = Depends(get_current_user)):
    deps.db.auto_unpack_expired_trips(current_user["user_id"])
    return {"trips": deps.db.list_trips(current_user["user_id"])}


@router.post("/api/trips")
def create_trip(body: TripCreate, current_user: dict = Depends(get_current_user)):
    activities = [clip_text(a, max_len=60) for a in (body.activities or [])]
    activities = [a for a in activities if a]
    trip = deps.db.create_trip(
        current_user["user_id"],
        name=clip_text(body.name, max_len=120) or "Trip",
        destination=clip_text(body.destination, max_len=120),
        start_date=_validate_iso_date(body.start_date, "start_date") if body.start_date else None,
        end_date=_validate_iso_date(body.end_date, "end_date") if body.end_date else None,
        activities=activities,
        item_ids=body.item_ids or [],
    )
    return {"success": True, "trip": trip}


@router.put("/api/trips/{trip_id}")
def update_trip(
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
    trip = deps.db.update_trip(
        current_user["user_id"],
        trip_id,
        fields=patch,
        item_ids=item_ids,
    )
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    return {"success": True, "trip": trip}


@router.put("/api/trips/{trip_id}/packed")
def set_trip_packed(
    trip_id: int,
    body: TripPackedUpdate,
    current_user: dict = Depends(get_current_user),
):
    trip = deps.db.set_trip_item_packed(
        current_user["user_id"], trip_id, body.item_id, body.packed
    )
    if not trip:
        raise HTTPException(status_code=404, detail="Trip or item not found")
    return {"success": True, "trip": trip}


@router.post("/api/trips/auto-unpack")
def auto_unpack_trips(current_user: dict = Depends(get_current_user)):
    return {"success": True, "updated": deps.db.auto_unpack_expired_trips(current_user["user_id"])}


@router.get("/api/trips/logs")

def list_trip_logs(current_user: dict = Depends(get_current_user)):

    return {"trips": deps.db.get_trip_logs(user_id=current_user["user_id"])}
