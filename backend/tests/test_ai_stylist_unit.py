"""Unit tests for ai_stylist helpers and response builder (no HTTP to Anthropic)."""

from __future__ import annotations

import random
from datetime import date

import pytest

from models.ai_stylist import (
    _apply_feedback,
    _clean_pin_ids,
    _compact_item,
    _extract_json_object,
    _infer_pin_ids,
    _local_intro,
    _local_rationale,
    _novelty_biased_items,
    _outfit_signature,
    _planning_context,
    _reserved_upcoming_item_ids,
    _suggestion_title,
    _try_claude_copy,
    build_ai_stylist_response,
    interpret_message,
)
from models.outfit_recommender import OutfitRecommender


def test_interpret_message_keywords_and_planning_occasion() -> None:
    items: list = []
    today = date.today().isoformat()
    planned = [
        {
            "id": 1,
            "title": "Meeting fit",
            "planned_for": today,
            "occasion": "work",
            "status": "confirmed",
            "item_ids": [1],
        }
    ]
    out = interpret_message("need something for today", items, planned_outfits=planned)
    assert out["occasion"] == "work"
    assert out["planning"]["asks_today"] is True
    assert out["season"] is None


def test_interpret_message_infer_pin_and_novelty() -> None:
    items = [
        {"id": 10, "category": "Jacket", "subcategory": "Top", "colors": ["navy"], "times_worn": 0},
    ]
    out = interpret_message("wear my navy jacket", items)
    assert out["pin_item_ids"] == [10]
    out2 = interpret_message("something different please", items)
    assert out2["novelty"] is True


def test_clean_pin_ids_dedupes_and_caps() -> None:
    assert _clean_pin_ids([3, 3, -1, 0, "7", "x", 2]) == [3, 7, 2]
    assert _clean_pin_ids([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) == [1, 2, 3, 4, 5, 6, 7, 8]


def test_planning_context_upcoming_when_not_asks_today() -> None:
    future = "2099-12-31"
    planned = [
        {"id": 1, "planned_for": future, "occasion": "party", "item_ids": [1]},
    ]
    ctx = _planning_context("help me dress", planned)
    assert ctx["asks_today"] is False
    assert ctx["suggested_occasion"] == "party"


def test_reserved_upcoming_item_ids_confirmed_only() -> None:
    planning = {
        "asks_today": True,
        "upcoming_plans": [
            {"status": "confirmed", "item_ids": [1, 2]},
            {"status": "draft", "item_ids": [99]},
        ],
    }
    assert _reserved_upcoming_item_ids(planning) == {1, 2}
    assert _reserved_upcoming_item_ids({"asks_today": False, "upcoming_plans": []}) == set()


def test_infer_pin_ids_category_word() -> None:
    items = [
        {"id": 20, "category": "Sneakers", "subcategory": "Footwear", "colors": [], "times_worn": 1},
        {"id": 21, "category": "Boot", "subcategory": "Footwear", "colors": [], "times_worn": 5},
    ]
    assert _infer_pin_ids("I love sneakers", items) == [20]


def test_novelty_biased_items_sorts() -> None:
    items = [
        {"id": 1, "times_worn": 5, "last_worn": "2024-01-01"},
        {"id": 2, "times_worn": 0, "last_worn": ""},
    ]
    ordered = _novelty_biased_items(items)
    assert [i["id"] for i in ordered] == [2, 1]


def test_outfit_signature_stable() -> None:
    items = [{"id": 3}, {"id": 1}]
    assert _outfit_signature(items) == "1,3"


def test_apply_feedback_reorders() -> None:
    outfits = [
        {"items": [{"id": 1}], "score": 10.0},
        {"items": [{"id": 2}], "score": 12.0, "planned_outfit": {"id": 1}},
    ]
    fb = {"liked_signatures": {"2"}, "disliked_signatures": set()}
    out = _apply_feedback(outfits, fb)
    assert out[0].get("planned_outfit")
    assert float(out[1]["score"]) > float(out[0]["score"]) or out[0].get("planned_outfit")


def test_suggestion_title_variants() -> None:
    assert (
        _suggestion_title(
            0,
            {"planned_outfit": {"title": "Brunch"}, "items": [{"id": 1}]},
        )
        == "Planned: Brunch"
    )
    assert _suggestion_title(0, {"items": []}) == "Look 1"
    assert (
        _suggestion_title(
            0,
            {"items": [{"id": 1, "colors": ["red"]}], "occasion": "casual"},
        )
        == "red-led look"
    )
    assert _suggestion_title(1, {"items": [{"id": 1, "colors": []}], "occasion": "gym"}) == "Gym look"


def test_local_intro_and_rationale() -> None:
    interpreted = {"planning": {}, "occasion": "work", "vibe": "clean_prep"}
    weather = {"condition": "Rain", "cold": True}
    intro = _local_intro("x", [{"title": "a"}], interpreted, weather)
    assert "work" in intro and "clean prep" in intro
    outfit = {"items": [{"category": "Shirt", "colors": ["Blue"]}], "occasion": "casual"}
    r = _local_rationale(
        outfit,
        {"pin_item_ids": [1], "novelty": True},
        weather,
    )
    assert "Blue" in r and "selected" in r


def test_local_rationale_planned_branch() -> None:
    outfit = {
        "items": [],
        "planned_outfit": {"planned_for": "2026-05-01"},
    }
    r = _local_rationale(outfit, {}, None)
    assert "planned" in r.lower()


def test_compact_item() -> None:
    row = {
        "id": 1,
        "category": "X",
        "subcategory": "Y",
        "style": "Casual",
        "season": "Summer",
        "times_worn": 3,
    }
    assert _compact_item(row)["colors"] == []


def test_extract_json_object() -> None:
    assert _extract_json_object('foo {"a": 1} bar') == '{"a": 1}'


def test_try_claude_copy_no_api_key() -> None:
    assert _try_claude_copy("hi", {}, None, []) is None


def test_build_ai_stylist_response_local_source(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
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
    rec = OutfitRecommender()
    rng = random.Random(0)
    resp = build_ai_stylist_response(
        message="casual outfit",
        items=items,
        recommender=rec,
        weather=None,
        rng=rng,
    )
    assert resp["source"] == "local"
    assert resp["suggestions"]
