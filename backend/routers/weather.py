"""Weather lookups for outfit suggestions."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from typing import Optional
from models.weather_service import WeatherServiceError
from security import clip_text
from auth import get_current_user
import deps
from route_helpers import (
    _validate_iso_date,
    _validate_lat_lon,
    logger,
)

router = APIRouter()


# ---- Weather -----------------------------------------------------------------



@router.get("/api/weather/geocode")

def weather_geocode(

    q: str,

    current_user: dict = Depends(get_current_user),

):

    query = clip_text(q, max_len=120)

    if not query or len(query) < 2:

        raise HTTPException(status_code=400, detail="Search query must be at least 2 characters")

    try:

        return {"results": deps.weather_provider.geocode(query)}

    except WeatherServiceError:

        logger.exception("weather geocode failed")

        raise HTTPException(status_code=502, detail="Weather provider unavailable")


@router.get("/api/weather/current")

def weather_current(

    lat: float,

    lon: float,

    date: Optional[str] = None,

    location_name: Optional[str] = None,

    current_user: dict = Depends(get_current_user),

):

    lat_f, lon_f = _validate_lat_lon(lat, lon)

    weather_date = _validate_iso_date(date, "date")

    try:

        context = deps.weather_provider.current(

            lat_f,

            lon_f,

            weather_date=weather_date,

            location_name=clip_text(location_name, max_len=120),

        )

        return {"weather": context.to_dict()}

    except WeatherServiceError:

        logger.exception("weather current failed")

        raise HTTPException(status_code=502, detail="Weather provider unavailable")


@router.get("/api/weather/forecast")

def weather_forecast(

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

        return deps.weather_provider.forecast(

            lat_f,

            lon_f,

            start_date=start,

            end_date=end,

            location_name=clip_text(location_name, max_len=120),

        )

    except WeatherServiceError:

        logger.exception("weather forecast failed")

        raise HTTPException(status_code=502, detail="Weather provider unavailable")
