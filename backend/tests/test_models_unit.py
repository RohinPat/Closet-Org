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


def test_build_closet_insights_neutral_outer_gap_accessory_and_color() -> None:
    """Cover neutral outer gap, accessory gap (4+ items, no accessory), and color variety."""
    items = [
        {"id": 1, "category": "Jacket", "subcategory": "Top", "colors": ["Red"], "style": "Casual"},
        {"id": 2, "category": "Pants", "subcategory": "Bottom", "colors": ["Black"], "style": "Casual"},
        {"id": 3, "category": "Sneakers", "subcategory": "Footwear", "colors": ["White"], "style": "Casual"},
        {"id": 4, "category": "Tee", "subcategory": "Top", "colors": ["Blue"], "style": "Casual"},
    ]
    out = build_closet_insights(items)
    gap_ids = {g["id"] for g in out["gaps"]}
    assert "neutral_outer" in gap_ids
    assert "accessories" in gap_ids
    neutrals_only = [
        {"id": i, "category": "Shirt", "subcategory": "Top", "colors": ["Gray"], "style": "Casual"}
        for i in range(5)
    ]
    out2 = build_closet_insights(neutrals_only)
    assert any(g["id"] == "color_variety" for g in out2["gaps"])


def test_retirement_parse_ts_and_branches() -> None:
    from models.closet_insights import _parse_ts, _retirement_candidates

    assert _parse_ts(None) is None
    assert _parse_ts("bad") is None
    assert _parse_ts("2020-01-01T00:00:00Z") is not None

    now_items = [
        {
            "id": 1,
            "date_added": "2010-01-01T00:00:00",
            "last_worn": "2020-01-01T00:00:00",
            "times_worn": 50,
            "condition_score": "nope",
        },
        {
            "id": 2,
            "date_added": "2020-01-01T00:00:00",
            "last_worn": None,
            "times_worn": 0,
            "purchase_price": 100,
        },
    ]
    rows = _retirement_candidates(now_items)
    assert any(50 == r.get("times_worn", 0) for r in rows)


def test_rank_pairing_skips_same_item_id() -> None:
    rec = OutfitRecommender()
    candidate = {"id": 1, "category": "Shirt", "subcategory": "Top", "colors": ["Blue"], "style": "Casual"}
    assert rank_closet_pairings(candidate, [dict(candidate)], rec, limit=5) == []


def test_build_closet_insights_color_pop_and_parse_ts() -> None:
    from models.closet_insights import _has_color_pop, _parse_ts

    assert _parse_ts("   ") is None
    assert _has_color_pop([{"colors": ["Green"]}]) is True
    greens = [
        {"id": 1, "category": "Shirt", "subcategory": "Top", "colors": ["Green"], "style": "Casual"},
        {"id": 2, "category": "Pants", "subcategory": "Bottom", "colors": ["Gray"], "style": "Casual"},
        {"id": 3, "category": "Shoes", "subcategory": "Footwear", "colors": ["Black"], "style": "Casual"},
        {"id": 4, "category": "Coat", "subcategory": "Top", "colors": ["Black"], "style": "Casual"},
    ]
    out = build_closet_insights(greens)
    assert not any(g["id"] == "color_variety" for g in out["gaps"])


def test_retirement_skips_rows_without_id() -> None:
    from models.closet_insights import _retirement_candidates

    assert _retirement_candidates([{"category": "X", "times_worn": 99}]) == []


def test_rank_pairing_role_bonus_hints() -> None:
    rec = OutfitRecommender()
    top = {"id": 1, "category": "Shirt", "subcategory": "Top", "colors": ["Blue"], "style": "Casual"}
    bottom = {"id": 2, "category": "Jeans", "subcategory": "Bottom", "colors": ["White"], "style": "Casual"}
    shoe = {"id": 3, "category": "Loafers", "subcategory": "Footwear", "colors": ["White"], "style": "Casual"}
    belt = {"id": 4, "category": "Belt", "subcategory": "Accessory", "colors": ["White"], "style": "Casual"}
    dress = {"id": 5, "category": "Dress", "subcategory": "Dress", "colors": ["Red"], "style": "Formal"}
    dress_shoe = {"id": 6, "category": "Heels", "subcategory": "Footwear", "colors": ["Black"], "style": "Formal"}

    tb = rank_closet_pairings(top, [bottom], rec, limit=5)
    assert any("Core" in h for r in tb for h in r["hints"])
    tf = rank_closet_pairings(top, [shoe], rec, limit=5)
    assert any("silhouette" in h.lower() for r in tf for h in r["hints"])
    ta = rank_closet_pairings(top, [belt], rec, limit=5)
    assert ta and ta[0]["score"] >= 5
    df = rank_closet_pairings(dress, [dress_shoe], rec, limit=5)
    assert df and any("Core" in h for r in df for h in r["hints"])
