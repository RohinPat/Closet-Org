"""Unit tests for weather_service (mocked HTTP)."""

from __future__ import annotations

import time
from unittest.mock import MagicMock

import pytest

from models import weather_service as ws


def test_weather_code_label_branches() -> None:
    assert ws._weather_code_label(1) == "Partly cloudy"
    assert ws._weather_code_label(3) == "Cloudy"
    assert ws._weather_code_label(45) == "Fog"
    assert ws._weather_code_label(51) == "Drizzle"
    assert ws._weather_code_label(61) == "Rain"
    assert ws._weather_code_label(71) == "Snow"
    assert ws._weather_code_label(50) == "Mixed"


def test_derived_season_fall() -> None:
    assert ws._derived_season(16.0, 10) == "Fall"


def test_safe_int_and_list_get() -> None:
    assert ws._safe_int("42") == 42
    assert ws._safe_int("nope") is None
    assert ws._list_get([1, 2], 5) is None
    assert ws._list_get("not-list", 0) is None
    assert ws._list_get([7], 0) == 7


def test_weather_context_to_dict() -> None:
    ctx = ws.WeatherContext(
        location_name="Home",
        latitude=1.0,
        longitude=2.0,
        date="2026-05-01",
        temperature_c=12.0,
        apparent_temperature_c=None,
        min_temp_c=10.0,
        max_temp_c=14.0,
        precipitation_probability=20,
        wind_speed_kmh=10.0,
        weather_code=0,
        condition="Clear",
        derived_season="Spring",
        cold=False,
        hot=False,
        rainy=False,
        snowy=False,
        windy=False,
    )
    d = ctx.to_dict()
    assert d["latitude"] == 1.0
    assert d["condition"] == "Clear"


def test_open_meteo_geocode_short_query() -> None:
    p = ws.OpenMeteoWeatherProvider()
    assert p.geocode(" x ") == []


def test_open_meteo_geocode_parses_rows(monkeypatch: pytest.MonkeyPatch) -> None:
    p = ws.OpenMeteoWeatherProvider()

    def fake_cached(key, url):
        return {
            "results": [
                {
                    "latitude": -33.4,
                    "longitude": 151.2,
                    "name": "Sydney",
                    "admin1": "NSW",
                    "country": "AU",
                },
            ]
        }

    monkeypatch.setattr(p, "_cached_json", fake_cached)
    out = p.geocode("Sydney", limit=3)
    assert len(out) == 1
    assert out[0]["name"] == "Sydney"
    assert out[0]["latitude"] == -33.4


def test_geocode_skips_rows_missing_coords(monkeypatch: pytest.MonkeyPatch) -> None:
    p = ws.OpenMeteoWeatherProvider()

    def fake_cached(key, url):
        return {"results": [{"name": "Ghost", "latitude": None, "longitude": 1.0}]}

    monkeypatch.setattr(p, "_cached_json", fake_cached)
    assert p.geocode("Ghost") == []


def test_open_meteo_current_historical_date_branch(monkeypatch: pytest.MonkeyPatch) -> None:
    p = ws.OpenMeteoWeatherProvider()

    def fake_forecast(lat, lon, **kwargs):
        return {
            "current": {
                "time": "2025-01-15T12:00",
                "temperature_2m": 5.0,
                "apparent_temperature": 4.0,
                "weather_code": 3,
                "wind_speed_10m": 5.0,
            },
            "daily": {
                "time": ["2025-01-14", "2025-01-15", "2025-01-16"],
                "temperature_2m_max": [10.0, 8.0, 9.0],
                "temperature_2m_min": [2.0, 3.0, 4.0],
                "precipitation_probability_max": [30, 60, 10],
                "weather_code": [1, 65, 2],
            },
        }

    monkeypatch.setattr(p, "_forecast_payload", fake_forecast)
    ctx = p.current(-33.0, 151.0, weather_date="2025-01-15", location_name="X")
    assert ctx.date == "2025-01-15"
    assert ctx.min_temp_c == 3.0
    assert ctx.max_temp_c == 8.0
    assert ctx.weather_code == 65
    assert ctx.rainy is True


def test_open_meteo_current_invalid_date_month_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    p = ws.OpenMeteoWeatherProvider()

    def fake_forecast(lat, lon, **kwargs):
        return {
            "current": {"time": "not-a-date", "temperature_2m": 18.0, "weather_code": 0, "wind_speed_10m": 30.0},
            "daily": {"time": [], "temperature_2m_max": [], "temperature_2m_min": [], "weather_code": []},
        }

    monkeypatch.setattr(p, "_forecast_payload", fake_forecast)
    ctx = p.current(0.0, 0.0)
    assert ctx.windy is True


def test_open_meteo_forecast_builds_days(monkeypatch: pytest.MonkeyPatch) -> None:
    p = ws.OpenMeteoWeatherProvider()

    def fake_forecast_payload(lat, lon, **kwargs):
        return {
            "daily": {
                "time": ["2026-05-10", "2026-05-11"],
                "weather_code": [61, 0],
                "temperature_2m_min": [10.0, 11.0],
                "temperature_2m_max": [20.0, 21.0],
                "precipitation_probability_max": [40, 5],
            }
        }

    monkeypatch.setattr(p, "_forecast_payload", fake_forecast_payload)
    monkeypatch.setattr(
        p,
        "current",
        MagicMock(
            return_value=ws.WeatherContext(
                location_name=None,
                latitude=0.0,
                longitude=0.0,
                date="2026-05-10",
                temperature_c=15.0,
                apparent_temperature_c=None,
                min_temp_c=10.0,
                max_temp_c=20.0,
                precipitation_probability=40,
                wind_speed_kmh=None,
                weather_code=61,
                condition="Rain",
                derived_season="Spring",
                cold=False,
                hot=False,
                rainy=True,
                snowy=False,
                windy=False,
            )
        ),
    )
    bundle = p.forecast(1.234567, -4.5, start_date="2026-05-10")
    assert len(bundle["days"]) == 2
    assert bundle["days"][0]["condition"] == "Rain"
    assert bundle["days"][1]["condition"] == "Clear"
    assert bundle["context"]["rainy"] is True


def test_cached_json_reuses_within_ttl(monkeypatch: pytest.MonkeyPatch) -> None:
    p = ws.OpenMeteoWeatherProvider()
    calls = {"n": 0}

    def fake_urlopen(*a, **k):
        calls["n"] += 1
        raise AssertionError("should use cache")

    monkeypatch.setattr(ws.urllib.request, "urlopen", fake_urlopen)
    frozen = time.time()
    monkeypatch.setattr(ws.time, "time", lambda: frozen)
    payload = {"results": []}
    p._cache[("geocode", "x")] = (frozen, payload)
    assert p._cached_json(("geocode", "x"), "http://example.invalid") is payload

    monkeypatch.setattr(ws.time, "time", lambda: frozen + ws._CACHE_TTL_SECONDS + 1)

    class _Resp:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def read(self):
            return b'{"results":[]}'

    monkeypatch.setattr(ws.urllib.request, "urlopen", lambda *a, **k: _Resp())
    p._cache.clear()
    assert p._cached_json(("geocode", "y"), "http://example.invalid") == {"results": []}


def test_cached_json_network_error_wraps(monkeypatch: pytest.MonkeyPatch) -> None:
    p = ws.OpenMeteoWeatherProvider()

    def boom(*a, **k):
        raise OSError("no network")

    monkeypatch.setattr(ws.urllib.request, "urlopen", boom)
    with pytest.raises(ws.WeatherServiceError, match="unavailable"):
        p._cached_json(("forecast", "z"), "http://example.invalid")
