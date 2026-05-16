"""Direct unit coverage for small ``models`` modules (no HTTP)."""

from __future__ import annotations

import random

from models.closet_insights import build_closet_insights
from models.closet_pairing import rank_closet_pairings
from models.outfit_recommender import OutfitRecommender
from models import weather_service as ws


def test_weather_code_labels_and_season() -> None:
    assert ws._weather_code_label(None) == "Unknown"
    assert ws._weather_code_label(0) == "Clear"
    assert ws._weather_code_label(95) == "Thunderstorm"
    assert ws._weather_code_label(99) == "Thunderstorm"
    assert ws._derived_season(5.0, 6) == "Winter"
    assert ws._derived_season(25.0, 6) == "Summer"
    assert ws._derived_season(None, 4) == "Spring"


def test_safe_float_and_round_coord() -> None:
    assert ws._safe_float("3.5") == 3.5
    assert ws._safe_float(None) is None
    assert ws._round_coord(1.234567) == 1.2346


def test_build_closet_insights_empty() -> None:
    out = build_closet_insights([])
    assert isinstance(out, dict)
    assert "summary" in out or "gaps" in out


def test_rank_closet_pairings_empty() -> None:
    rec = OutfitRecommender()
    assert rank_closet_pairings(
        {"category": "T-Shirt", "subcategory": "Top", "colors": ["Blue"], "style": "Casual", "season": "All-Season"},
        [],
        rec,
        limit=5,
    ) == []


def test_outfit_recommender_generates() -> None:
    rec = OutfitRecommender()
    rng = random.Random(0)
    items = [
        {
            "id": 1,
            "category": "Shirt",
            "subcategory": "Top",
            "colors": ["Blue"],
            "style": "Casual",
            "season": "All-Season",
            "washed": True,
            "is_bulk": False,
        },
        {
            "id": 2,
            "category": "Jeans",
            "subcategory": "Bottom",
            "colors": ["Black"],
            "style": "Casual",
            "season": "All-Season",
            "washed": True,
            "is_bulk": False,
        },
        {
            "id": 3,
            "category": "Sneakers",
            "subcategory": "Footwear",
            "colors": ["White"],
            "style": "Casual",
            "season": "All-Season",
            "washed": True,
            "is_bulk": False,
        },
    ]
    outfits = rec.generate_outfits(items, occasion="casual", season=None, max_outfits=3, rng=rng)
    assert isinstance(outfits, list)


def test_rank_closet_pairings_nonempty() -> None:
    rec = OutfitRecommender()
    candidate = {
        "id": 99,
        "category": "Shirt",
        "subcategory": "Top",
        "colors": ["Blue"],
        "style": "Casual",
    }
    closet = [
        {
            "id": 1,
            "category": "Pants",
            "subcategory": "Bottom",
            "colors": ["Blue"],
            "style": "Casual",
        },
        {
            "id": 2,
            "category": "Shoes",
            "subcategory": "Footwear",
            "colors": ["Black"],
            "style": "Casual",
        },
    ]
    out = rank_closet_pairings(candidate, closet, rec, limit=10)
    assert isinstance(out, list)
    assert len(out) >= 1


def test_build_closet_insights_populated() -> None:
    items = [
        {
            "id": 1,
            "category": "Jacket",
            "subcategory": "Top",
            "colors": ["Black"],
            "style": "Casual",
            "date_added": "2020-01-01T00:00:00",
            "last_worn": None,
            "times_worn": 0,
        },
        {
            "id": 2,
            "category": "Dress",
            "subcategory": "Dress",
            "colors": ["Red"],
            "style": "Formal",
            "date_added": "2025-01-01T00:00:00",
            "last_worn": "2025-04-01T00:00:00",
            "times_worn": 10,
        },
        {
            "id": 3,
            "category": "Loafers",
            "subcategory": "Footwear",
            "colors": ["Black"],
            "style": "Business",
            "date_added": "2025-02-01T00:00:00",
            "last_worn": "2025-04-02T00:00:00",
            "times_worn": 5,
        },
        {
            "id": 4,
            "category": "Belt",
            "subcategory": "Accessory",
            "colors": ["Brown"],
            "style": "Casual",
            "date_added": "2025-03-01T00:00:00",
            "last_worn": None,
            "times_worn": 0,
            "purchase_price": 80,
            "condition_score": 0.4,
        },
    ]
    out = build_closet_insights(items)
    assert isinstance(out, dict)
    assert "composition" in out
    assert out.get("retirement_candidates")  # jacket triggers never-worn hint
