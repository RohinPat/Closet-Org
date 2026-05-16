"""Shared bytes + test doubles for API integration tests (unique module name — avoids ``pip tests`` collision)."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from models.weather_service import WeatherContext

# Minimal valid PNG (1×1) — reused by upload routes.
MIN_PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082"
)


def sample_weather_context() -> WeatherContext:
    return WeatherContext(
        location_name=None,
        latitude=42.3601,
        longitude=-71.0589,
        date="2026-05-16",
        temperature_c=18.0,
        apparent_temperature_c=17.0,
        min_temp_c=12.0,
        max_temp_c=22.0,
        precipitation_probability=10,
        wind_speed_kmh=15.0,
        weather_code=1,
        condition="Partly cloudy",
        derived_season="Spring",
        cold=False,
        hot=False,
        rainy=False,
        snowy=False,
        windy=False,
    )


class FakeWeatherProvider:
    def geocode(self, query: str) -> List[Dict[str, Any]]:
        return [
            {"name": "Boston", "latitude": 42.3601, "longitude": -71.0589},
        ]

    def current(
        self,
        lat: float,
        lon: float,
        *,
        weather_date: Optional[str] = None,
        location_name: Optional[str] = None,
    ) -> WeatherContext:
        return sample_weather_context()

    def forecast(
        self,
        latitude: float,
        longitude: float,
        *,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        location_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        ctx = sample_weather_context()
        return {
            "location_name": location_name,
            "latitude": latitude,
            "longitude": longitude,
            "days": [],
            "context": ctx.to_dict(),
        }


class FakeClassifier:
    """CLIP-free double — keeps uploads / fit-check / embeddings deterministic."""

    dim = 512

    def classify(self, image_path: str) -> Dict[str, Any]:
        return {
            "category": "T-Shirt",
            "subcategory": "Top",
            "confidence": 95.0,
            "colors": ["Blue", "Black"],
            "season": "All-Season",
            "style": "Casual",
        }

    def encode_image_embedding(self, image_path: str) -> Optional[List[float]]:
        return [0.01] * self.dim


def register_account(
    client,
    *,
    username: str = "apitest",
    email: str = "apitest@example.com",
    password: str,
    full_name: str = "API Test",
) -> Dict[str, Any]:
    r = client.post(
        "/api/auth/register",
        json={
            "username": username,
            "email": email,
            "password": password,
            "full_name": full_name,
        },
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("access_token")
    return data


def auth_header(token: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {token}"}
