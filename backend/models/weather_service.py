from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass
from datetime import date, datetime, timezone
from typing import Dict, List, Optional, Tuple


OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
OPEN_METEO_GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
_CACHE_TTL_SECONDS = 10 * 60


@dataclass(frozen=True)
class ForecastDay:
    date: str
    min_temp_c: Optional[float]
    max_temp_c: Optional[float]
    precipitation_probability: Optional[int]
    condition: str


@dataclass(frozen=True)
class WeatherContext:
    location_name: Optional[str]
    latitude: float
    longitude: float
    date: str
    temperature_c: Optional[float]
    apparent_temperature_c: Optional[float]
    min_temp_c: Optional[float]
    max_temp_c: Optional[float]
    precipitation_probability: Optional[int]
    wind_speed_kmh: Optional[float]
    weather_code: Optional[int]
    condition: str
    derived_season: str
    cold: bool
    hot: bool
    rainy: bool
    snowy: bool
    windy: bool

    def to_dict(self) -> Dict:
        return asdict(self)


class WeatherServiceError(RuntimeError):
    pass


def _today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _round_coord(value: float) -> float:
    return round(float(value), 4)


def _weather_code_label(code: Optional[int]) -> str:
    if code is None:
        return "Unknown"
    if code == 0:
        return "Clear"
    if code in {1, 2}:
        return "Partly cloudy"
    if code == 3:
        return "Cloudy"
    if code in {45, 48}:
        return "Fog"
    if code in {51, 53, 55, 56, 57}:
        return "Drizzle"
    if code in {61, 63, 65, 66, 67, 80, 81, 82}:
        return "Rain"
    if code in {71, 73, 75, 77, 85, 86}:
        return "Snow"
    if code in {95, 96, 99}:
        return "Thunderstorm"
    return "Mixed"


def _derived_season(temp_c: Optional[float], month: int) -> str:
    if temp_c is not None:
        if temp_c <= 8:
            return "Winter"
        if temp_c >= 24:
            return "Summer"
    if month in {12, 1, 2}:
        return "Winter"
    if month in {6, 7, 8}:
        return "Summer"
    if month in {3, 4, 5}:
        return "Spring"
    return "Fall"


def _safe_float(value) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _safe_int(value) -> Optional[int]:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _list_get(values, idx: int):
    if not isinstance(values, list) or idx < 0 or idx >= len(values):
        return None
    return values[idx]


class OpenMeteoWeatherProvider:
    """Open-Meteo implementation behind a small provider boundary.

    This keeps the app keyless today while leaving one place to swap in a paid
    provider later.
    """

    def __init__(self):
        self._cache: Dict[Tuple[str, str], Tuple[float, object]] = {}

    def _cached_json(self, key: Tuple[str, str], url: str) -> Dict:
        now = time.time()
        hit = self._cache.get(key)
        if hit and now - hit[0] < _CACHE_TTL_SECONDS:
            return hit[1]  # type: ignore[return-value]

        req = urllib.request.Request(url, headers={"User-Agent": "Closet-Org/1.0"})
        try:
            # URL is always Open-Meteo HTTPS; query args are urlencoded.
            with urllib.request.urlopen(req, timeout=8) as response:  # nosec B310
                payload = json.loads(response.read().decode("utf-8"))
        except Exception as exc:
            raise WeatherServiceError("Weather provider unavailable") from exc

        self._cache[key] = (now, payload)
        return payload

    def geocode(self, query: str, limit: int = 5) -> List[Dict]:
        q = query.strip()
        if len(q) < 2:
            return []
        params = urllib.parse.urlencode(
            {"name": q, "count": max(1, min(limit, 10)), "language": "en", "format": "json"}
        )
        payload = self._cached_json(("geocode", params), f"{OPEN_METEO_GEOCODE_URL}?{params}")
        results = payload.get("results") or []
        out = []
        for row in results:
            lat = _safe_float(row.get("latitude"))
            lon = _safe_float(row.get("longitude"))
            if lat is None or lon is None:
                continue
            name_parts = [
                row.get("name"),
                row.get("admin1"),
                row.get("country"),
            ]
            label = ", ".join(str(p) for p in name_parts if p)
            out.append(
                {
                    "name": row.get("name") or label,
                    "label": label or row.get("name") or query,
                    "latitude": lat,
                    "longitude": lon,
                    "country": row.get("country"),
                    "admin1": row.get("admin1"),
                }
            )
        return out

    def _forecast_payload(
        self,
        latitude: float,
        longitude: float,
        *,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> Dict:
        params = {
            "latitude": str(_round_coord(latitude)),
            "longitude": str(_round_coord(longitude)),
            "timezone": "auto",
            "current": "temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m",
            "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
        }
        if start_date:
            params["start_date"] = start_date
        if end_date:
            params["end_date"] = end_date
        encoded = urllib.parse.urlencode(params)
        return self._cached_json(("forecast", encoded), f"{OPEN_METEO_FORECAST_URL}?{encoded}")

    def current(
        self,
        latitude: float,
        longitude: float,
        *,
        weather_date: Optional[str] = None,
        location_name: Optional[str] = None,
    ) -> WeatherContext:
        payload = self._forecast_payload(
            latitude,
            longitude,
            start_date=weather_date,
            end_date=weather_date,
        )
        current = payload.get("current") or {}
        daily = payload.get("daily") or {}
        dates = daily.get("time") or []
        idx = 0
        date_value = weather_date or current.get("time", "")[:10] or (dates[0] if dates else _today())
        if dates and date_value in dates:
            idx = dates.index(date_value)

        max_temp = _safe_float(_list_get(daily.get("temperature_2m_max"), idx))
        min_temp = _safe_float(_list_get(daily.get("temperature_2m_min"), idx))
        temp = _safe_float(current.get("temperature_2m"))
        apparent = _safe_float(current.get("apparent_temperature"))
        if weather_date and min_temp is not None and max_temp is not None:
            temp = (min_temp + max_temp) / 2
            apparent = None
        precip = _safe_int(_list_get(daily.get("precipitation_probability_max"), idx))
        code = _safe_int(current.get("weather_code"))
        if weather_date and dates:
            code = _safe_int(_list_get(daily.get("weather_code"), idx))
        wind = _safe_float(current.get("wind_speed_10m"))
        basis_temp = apparent if apparent is not None else temp
        month = 1
        try:
            month = date.fromisoformat(date_value).month
        except ValueError:
            pass
        condition = _weather_code_label(code)
        rainy = condition in {"Drizzle", "Rain", "Thunderstorm"} or (precip or 0) >= 55
        snowy = condition == "Snow"
        return WeatherContext(
            location_name=location_name,
            latitude=_round_coord(latitude),
            longitude=_round_coord(longitude),
            date=date_value,
            temperature_c=temp,
            apparent_temperature_c=apparent,
            min_temp_c=min_temp,
            max_temp_c=max_temp,
            precipitation_probability=precip,
            wind_speed_kmh=wind,
            weather_code=code,
            condition=condition,
            derived_season=_derived_season(basis_temp, month),
            cold=basis_temp is not None and basis_temp <= 10,
            hot=basis_temp is not None and basis_temp >= 26,
            rainy=rainy,
            snowy=snowy,
            windy=wind is not None and wind >= 28,
        )

    def forecast(
        self,
        latitude: float,
        longitude: float,
        *,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        location_name: Optional[str] = None,
    ) -> Dict:
        payload = self._forecast_payload(
            latitude,
            longitude,
            start_date=start_date,
            end_date=end_date,
        )
        daily = payload.get("daily") or {}
        dates = daily.get("time") or []
        days: List[ForecastDay] = []
        for idx, d in enumerate(dates):
            code = _safe_int(_list_get(daily.get("weather_code"), idx))
            days.append(
                ForecastDay(
                    date=d,
                    min_temp_c=_safe_float(_list_get(daily.get("temperature_2m_min"), idx)),
                    max_temp_c=_safe_float(_list_get(daily.get("temperature_2m_max"), idx)),
                    precipitation_probability=_safe_int(
                        _list_get(daily.get("precipitation_probability_max"), idx)
                    ),
                    condition=_weather_code_label(code),
                )
            )
        context = self.current(
            latitude,
            longitude,
            weather_date=days[0].date if days else start_date,
            location_name=location_name,
        )
        return {
            "location_name": location_name,
            "latitude": _round_coord(latitude),
            "longitude": _round_coord(longitude),
            "days": [asdict(day) for day in days],
            "context": context.to_dict(),
        }


weather_provider = OpenMeteoWeatherProvider()
