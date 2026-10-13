"""Outfit recommendations and the AI stylist."""

from __future__ import annotations

import random
from fastapi import APIRouter, Depends, HTTPException
from typing import Optional
from models.weather_service import WeatherServiceError
from models.ai_stylist import build_ai_stylist_response
from security import clip_text
from datetime import datetime, timezone
from auth import get_current_user
import deps
from schemas import (
    AiStylistFeedbackRequest,
    AiStylistRequest,
)
from route_helpers import (
    _normalize_vibe,
    _outfit_item_signature,
    _parse_outfit_id_list,
    _validate_iso_date,
    _validate_item_signature,
    _validate_lat_lon,
    logger,
)

router = APIRouter()


@router.get("/api/outfits/recommend")

def recommend_outfit(

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

            weather_context = deps.weather_provider.current(

                lat_f,

                lon_f,

                weather_date=_validate_iso_date(weather_date, "weather_date"),

                location_name=clip_text(location_name, max_len=120),

            ).to_dict()

        items = deps.db.get_all_items(

            user_id=current_user["user_id"],

            status="clean",

            closet_location_id=closet_location_id,

        )

        items = [i for i in items if not i.get("lent_to")]

        if not include_packed:

            items = [i for i in items if not i.get("packed_for_trip")]

        reserved = deps.db.get_reserved_item_ids(current_user["user_id"])

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

        raw_outfits = deps.outfit_recommender.generate_outfits(

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

        recent = deps.db.get_recent_outfit_signatures(

            current_user["user_id"], days=14, limit=120

        )
        worn_recent = deps.db.get_worn_outfit_signatures(
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

        deps.db.log_outfit_recommendations(current_user["user_id"], outfits)

        return {"outfits": outfits, "weather": weather_context}

    except HTTPException:

        raise

    except WeatherServiceError:

        logger.exception("weather-aware outfit recommendation failed")

        raise HTTPException(status_code=502, detail="Weather provider unavailable")

    except Exception:

        logger.exception("outfit recommendation failed")

        raise HTTPException(status_code=500, detail="Recommendation failed")


@router.post("/api/ai-stylist")

def ai_stylist(

    body: AiStylistRequest,

    current_user: dict = Depends(get_current_user),

):

    try:

        weather_context = None

        if body.lat is not None or body.lon is not None:

            if body.lat is None or body.lon is None:

                raise HTTPException(status_code=400, detail="lat and lon are both required")

            lat_f, lon_f = _validate_lat_lon(body.lat, body.lon)

            weather_context = deps.weather_provider.current(

                lat_f,

                lon_f,

                weather_date=_validate_iso_date(body.weather_date, "weather_date"),

                location_name=clip_text(body.location_name, max_len=120),

            ).to_dict()



        items = deps.db.get_all_items(

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

        recent = set(deps.db.get_recent_outfit_signatures(current_user["user_id"], days=14, limit=120))

        planned_outfits = deps.db.get_ai_stylist_planning_context(current_user["user_id"])

        feedback = deps.db.get_ai_stylist_feedback_summary(current_user["user_id"])

        result = build_ai_stylist_response(

            message=clip_text(body.message, max_len=500) or "",

            items=items,

            recommender=deps.outfit_recommender,

            weather=weather_context,

            rng=random.Random(rng_seed),

            recent_signatures=recent,

            explicit_pin_item_ids=pin_item_ids,

            planned_outfits=planned_outfits,

            feedback=feedback,

        )

        deps.db.log_outfit_recommendations(

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


@router.post("/api/ai-stylist/feedback")

def ai_stylist_feedback(

    body: AiStylistFeedbackRequest,

    current_user: dict = Depends(get_current_user),

):

    signature = _validate_item_signature(body.item_signature)

    deps.db.record_ai_stylist_feedback(

        current_user["user_id"],

        item_signature=signature,

        useful=body.useful,

        message=clip_text(body.message, max_len=500),

    )

    return {"success": True}
