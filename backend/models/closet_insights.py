"""Rule-based closet gap analysis and composition summaries."""

from collections import Counter
from datetime import datetime
from typing import Any, Dict, List, Optional

_NEUTRAL_COLORS = frozenset(
    {"Black", "White", "Gray", "Navy", "Beige", "Brown"}
)
_OUTER_CATEGORIES = frozenset({"Jacket", "Coat", "Sweater"})
_FORMAL_STYLES = frozenset({"Formal", "Business"})

def _colors(item: Dict[str, Any]) -> List[str]:
    raw = item.get("colors") or []
    return [c for c in raw if isinstance(c, str) and c.strip()]


def _style(item: Dict[str, Any]) -> str:
    return (item.get("style") or "").strip() or "Casual"


def _has_outer_layer(items: List[Dict[str, Any]]) -> bool:
    for it in items:
        if it.get("category") in _OUTER_CATEGORIES:
            return True
    return False


def _has_neutral_outer(items: List[Dict[str, Any]]) -> bool:
    for it in items:
        if it.get("category") not in _OUTER_CATEGORIES:
            continue
        cols = set(_colors(it))
        if cols and cols <= _NEUTRAL_COLORS:
            return True
    return False


def _has_dressy_shoes(items: List[Dict[str, Any]]) -> bool:
    for it in items:
        if it.get("subcategory") != "Footwear":
            continue
        if _style(it) not in _FORMAL_STYLES:
            continue
        cols = set(_colors(it))
        if cols & {"Black", "Navy", "Brown"}:
            return True
    return False


def _has_bottom(items: List[Dict[str, Any]]) -> bool:
    return any(it.get("subcategory") == "Bottom" for it in items)


def _has_dress(items: List[Dict[str, Any]]) -> bool:
    return any(it.get("subcategory") == "Dress" for it in items)


def _has_accessory(items: List[Dict[str, Any]]) -> bool:
    return any(it.get("subcategory") == "Accessory" for it in items)


def _has_color_pop(items: List[Dict[str, Any]]) -> bool:
    """True if some item has a non-neutral color — encourages variety."""
    for it in items:
        for c in _colors(it):
            if c not in _NEUTRAL_COLORS:
                return True
    return False


def _parse_ts(raw: Any) -> Optional[datetime]:
    if not raw:
        return None
    s = str(raw).strip()
    if not s:
        return None
    try:
        if s.endswith("Z"):
            s = s[:-1]
        return datetime.fromisoformat(s)
    except ValueError:
        return None


def _retirement_candidates(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Lightweight closet-cleanout hints — not financial advice."""
    now = datetime.now()
    rows: List[Dict[str, Any]] = []
    for it in items:
        rid = it.get("id")
        if rid is None:
            continue
        added = _parse_ts(it.get("date_added"))
        last = _parse_ts(it.get("last_worn"))
        tw = int(it.get("times_worn") or 0)
        days_owned = (now - added).days if added else 0
        days_since = (now - last).days if last else None
        reasons: List[str] = []

        if tw == 0 and days_owned >= 180:
            reasons.append("Never worn in 6+ months")
        if days_since is not None and days_since >= 120 and tw >= 4:
            reasons.append("Stale in rotation despite past wear")
        if tw >= 45:
            reasons.append("Very high wear — good time to audit fit and condition")

        if reasons:
            rows.append(
                {
                    "item_id": rid,
                    "category": it.get("category"),
                    "subcategory": it.get("subcategory"),
                    "thumbnail_path": it.get("thumbnail_path"),
                    "times_worn": tw,
                    "reasons": reasons,
                }
            )

    rows.sort(key=lambda r: (-len(r["reasons"]), -(r.get("times_worn") or 0)))
    return rows[:10]


def build_closet_insights(items: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Return `{ gaps, composition }` for the Stats / planning UI."""
    gaps: List[Dict[str, Any]] = []

    if not _has_outer_layer(items):
        gaps.append(
            {
                "id": "outer_layer",
                "title": "Outer layer",
                "detail": "Add a jacket, coat, or sweater for weather and layering.",
                "priority": "high",
            }
        )
    elif not _has_neutral_outer(items):
        gaps.append(
            {
                "id": "neutral_outer",
                "title": "Neutral outerwear",
                "detail": "A black, navy, gray, or beige jacket pairs with almost everything.",
                "priority": "medium",
            }
        )

    if not _has_dressy_shoes(items):
        gaps.append(
            {
                "id": "dressy_shoes",
                "title": "Dressy shoes",
                "detail": "Formal or business shoes in black, navy, or brown anchor dressier outfits.",
                "priority": "high",
            }
        )

    if not _has_bottom(items) and not _has_dress(items):
        gaps.append(
            {
                "id": "bottoms_or_dress",
                "title": "Bottoms or a dress",
                "detail": "You need pants, jeans, a skirt, shorts, or a one-piece dress to complete looks.",
                "priority": "high",
            }
        )

    if not _has_accessory(items) and len(items) >= 4:
        gaps.append(
            {
                "id": "accessories",
                "title": "Accessories",
                "detail": "Belts, scarves, or hats polish outfits without buying whole new garments.",
                "priority": "low",
            }
        )

    if len(items) >= 5 and not _has_color_pop(items):
        gaps.append(
            {
                "id": "color_variety",
                "title": "Color variety",
                "detail": "Most of your palette is neutral — one piece in green, burgundy, or blue adds life.",
                "priority": "low",
            }
        )

    _prio_rank = {"high": 0, "medium": 1, "low": 2}
    gaps.sort(key=lambda g: _prio_rank.get(g.get("priority"), 9))

    by_sub = Counter((it.get("subcategory") or "Other") for it in items)
    by_style = Counter(_style(it) for it in items)
    color_buckets = Counter(c for it in items for c in _colors(it))

    return {
        "gaps": gaps,
        "retirement_candidates": _retirement_candidates(items),
        "composition": {
            "by_subcategory": dict(by_sub.most_common()),
            "by_style": dict(by_style.most_common()),
            "color_buckets": dict(color_buckets.most_common(24)),
            "item_count": len(items),
        },
    }
