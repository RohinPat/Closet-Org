"""Recommendation quality: color harmony, variety, freshness, determinism."""

from __future__ import annotations

import random
from collections import Counter
from datetime import datetime, timedelta, timezone

import pytest

from models.outfit_recommender import OutfitRecommender

rec = OutfitRecommender()


def _item(i, sub, cat, color, style="Casual", **extra):
    return {"id": i, "subcategory": sub, "category": cat, "colors": [color], "style": style,
            "season": "All-Season", "washed": True, **extra}


CLOSET = [
    _item(1, "Top", "T-Shirt", "White"), _item(2, "Top", "T-Shirt", "Black"),
    _item(3, "Top", "T-Shirt", "Gray"), _item(4, "Top", "Shirt", "Navy"),
    _item(5, "Top", "Shirt", "Blue"), _item(6, "Top", "Sweater", "Beige"),
    _item(7, "Top", "Sweater", "Green"), _item(8, "Top", "T-Shirt", "Red"),
    _item(20, "Bottom", "Jeans", "Blue"), _item(21, "Bottom", "Jeans", "Black"),
    _item(22, "Bottom", "Pants", "Beige"), _item(24, "Bottom", "Shorts", "Gray"),
    _item(30, "Footwear", "Sneakers", "White"), _item(31, "Footwear", "Boots", "Brown"),
    _item(32, "Footwear", "Sneakers", "Black"),
]


@pytest.mark.parametrize(
    "a,b",
    [
        ("Black", "Black"),   # all-black
        ("White", "White"),
        ("Navy", "Navy"),     # tonal
        ("Navy", "Black"),
        ("Gray", "Beige"),
        ("Green", "Black"),   # any color + neutral
        ("Red", "Blue"),      # red tee + jeans
    ],
)
def test_everyday_combinations_are_not_clashes(a: str, b: str) -> None:
    assert rec.color_match_strength([a], [b]) > 0


@pytest.mark.parametrize("a,b", [("Red", "Green"), ("Orange", "Pink"), ("Purple", "Green")])
def test_bold_clashes_are_still_rejected(a: str, b: str) -> None:
    assert rec.color_match_strength([a], [b]) == 0


def test_curated_complements_rank_above_plain_neutral_pairings() -> None:
    assert rec.color_match_strength(["Navy"], ["Beige"]) > rec.color_match_strength(["Navy"], ["Brown"])
    assert rec.color_match_strength(["Red"], ["Red"]) < rec.color_match_strength(["Red"], ["Black"])


def test_unknown_palette_keeps_its_contract() -> None:
    assert rec.color_match_strength([], ["Red"]) == 3


@pytest.mark.parametrize("seed", range(5))
def test_five_suggestions_vary_their_pieces(seed: int) -> None:
    outs = rec.generate_outfits(CLOSET, rng=random.Random(seed), max_outfits=5)
    assert len(outs) == 5
    uses = Counter(i["id"] for o in outs for i in o["items"])
    assert len(uses) >= 11, uses
    assert max(uses.values()) <= 2, "one piece dominates the suggestions"


def test_same_seed_same_suggestions() -> None:
    a = rec.generate_outfits(CLOSET, rng=random.Random(42), max_outfits=5)
    b = rec.generate_outfits(CLOSET, rng=random.Random(42), max_outfits=5)
    assert [[i["id"] for i in o["items"]] for o in a] == [[i["id"] for i in o["items"]] for o in b]


def test_pieces_not_worn_lately_score_higher() -> None:
    now = datetime.now(timezone.utc)
    yesterday = (now - timedelta(days=1)).strftime("%Y-%m-%d %H:%M:%S")
    month_ago = (now - timedelta(days=40)).strftime("%Y-%m-%d %H:%M:%S")
    worn = [_item(1, "Top", "T-Shirt", "White", last_worn=yesterday),
            _item(2, "Bottom", "Jeans", "Blue", last_worn=yesterday)]
    rested = [_item(3, "Top", "T-Shirt", "White", last_worn=month_ago),
              _item(4, "Bottom", "Jeans", "Blue", last_worn=None)]
    assert rec.calculate_outfit_score(rested) > rec.calculate_outfit_score(worn)


def test_freshness_ignores_unparseable_dates() -> None:
    odd = [_item(1, "Top", "T-Shirt", "White", last_worn="not a date"),
           _item(2, "Bottom", "Jeans", "Blue")]
    assert rec.calculate_outfit_score(odd) > 0


def test_shoe_pick_without_rng_is_deterministic_best_fit() -> None:
    base = [_item(1, "Top", "Shirt", "White", "Business"), _item(2, "Bottom", "Pants", "Navy", "Business")]
    shoes = [_item(30, "Footwear", "Sneakers", "White", "Athletic"),
             _item(33, "Footwear", "Shoes", "Black", "Business")]
    assert rec._pick_shoe(base, shoes)["id"] == 33
