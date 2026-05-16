"""Extra unit coverage for ``OutfitRecommender`` scoring helpers."""

from __future__ import annotations

import random

from models.outfit_recommender import OutfitRecommender


def test_color_match_wildcards() -> None:
    rec = OutfitRecommender()
    assert rec.color_match_strength([], []) == 3
    assert rec.color_match_strength(["Red"], []) == 3


def test_styles_match_unknown_style_fallback() -> None:
    rec = OutfitRecommender()
    assert rec.styles_match("Bohemian", "Bohemian") is True
    assert rec.styles_match("Bohemian", "Casual") is False


def test_merged_style_preferences_unknown_keys() -> None:
    rec = OutfitRecommender()
    assert rec._merged_style_preferences(None, None) is None
    assert rec._merged_style_preferences("unknown_party_theme", None) is None
    assert rec._merged_style_preferences(None, "unknown_vibe_x") is None


def test_calculate_outfit_score_season_and_weather() -> None:
    rec = OutfitRecommender()
    winter_fit = [
        {"id": 1, "category": "Coat", "subcategory": "Top", "colors": ["Black"], "style": "Casual"},
        {"id": 2, "category": "Jeans", "subcategory": "Bottom", "colors": ["Blue"], "style": "Casual"},
    ]
    s_winter = rec.calculate_outfit_score(winter_fit, season="Winter")
    assert s_winter > 0

    summer_fit = [
        {"id": 1, "category": "Shorts", "subcategory": "Bottom", "colors": ["Beige"], "style": "Casual"},
        {"id": 2, "category": "Sandals", "subcategory": "Footwear", "colors": ["Brown"], "style": "Casual"},
    ]
    s_summer = rec.calculate_outfit_score(summer_fit, season="Summer")
    assert s_summer > 0

    cold_weather = {"cold": True, "rainy": False, "hot": False, "snowy": False, "windy": False}
    assert rec.calculate_outfit_score(winter_fit, weather=cold_weather) > rec.calculate_outfit_score(
        summer_fit, weather=cold_weather
    )

    rainy = {"cold": False, "rainy": True, "hot": False, "snowy": False, "windy": False}
    rain_ready = [
        {"id": 1, "category": "Jacket", "subcategory": "Top", "colors": ["Navy"], "style": "Casual"},
        {"id": 2, "category": "Boots", "subcategory": "Footwear", "colors": ["Black"], "style": "Casual"},
    ]
    assert rec._weather_score(rain_ready, rainy) > rec._weather_score(summer_fit, rainy)


def test_weather_score_precip_branches() -> None:
    rec = OutfitRecommender()
    thin = [
        {"id": 1, "category": "T-Shirt", "subcategory": "Top", "colors": ["White"], "style": "Casual"},
    ]
    assert rec._weather_score(thin, {"precipitation_probability": "80"}) < 0

    snowy = {"cold": True, "rainy": False, "hot": False, "snowy": True, "windy": False}
    boots_outfit = [
        {"id": 1, "category": "Boots", "subcategory": "Footwear", "colors": ["Black"], "style": "Casual"},
    ]
    assert rec._weather_score(boots_outfit, snowy) > 0

    windy = {"cold": False, "rainy": False, "hot": False, "snowy": False, "windy": True}
    dress_only = [
        {"id": 1, "category": "Midi", "subcategory": "Dress", "colors": ["Red"], "style": "Formal"},
    ]
    assert rec._weather_score(dress_only, windy) < 0


def test_pick_shoe_and_accessory_helpers() -> None:
    rec = OutfitRecommender()
    base = [{"id": 1, "category": "Pants", "subcategory": "Bottom", "colors": ["Blue"], "style": "Casual"}]
    shoes = [
        {"id": 2, "category": "Sneakers", "subcategory": "Footwear", "colors": ["White"], "style": "Casual"},
        {"id": 3, "category": "Flip", "subcategory": "Footwear", "colors": ["Red"], "style": "Formal"},
    ]
    assert rec._pick_shoe(base, shoes) is not None

    rng = random.Random(0)
    accs = [{"id": 4, "category": "Belt", "subcategory": "Accessory", "colors": ["Brown"], "style": "Casual"}]
    picked = rec._maybe_accessory(rng, base + [shoes[0]], accs, threshold=1.0)
    assert picked is not None
    assert rec._outfit_contains_pins(base + [shoes[0]], {1, 2}) is True
    assert rec._pins_structurally_valid([]) is True
    bad_pins = [
        {"id": 1, "subcategory": "Top"},
        {"id": 2, "subcategory": "Top"},
    ]
    assert rec._pins_structurally_valid(bad_pins) is False
