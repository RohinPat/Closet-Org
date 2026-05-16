"""Score how well closet items pair with a hypothetical garment (from a photo)."""

from typing import Any, Dict, List

from models.outfit_recommender import OutfitRecommender


def _subcategories_compatible(a: str, b: str) -> bool:
    if a == b:
        if a in ("Top", "Bottom", "Dress", "Footwear"):
            return False
        return True
    pair = {a, b}
    if "Dress" in pair and ("Top" in pair or "Bottom" in pair):
        return False
    if a == "Accessory" and b == "Accessory":
        return False
    return True


def _role_bonus(c_sub: str, o_sub: str) -> float:
    pair = {c_sub, o_sub}
    if pair == {"Top", "Bottom"}:
        return 14.0
    if "Dress" in pair and "Footwear" in pair:
        return 12.0
    if "Top" in pair and "Footwear" in pair:
        return 8.0
    if "Bottom" in pair and "Footwear" in pair:
        return 8.0
    if "Accessory" in pair:
        return 5.0
    return 0.0


def _colors_list(item: Dict[str, Any]) -> List[str]:
    raw = item.get("colors") or []
    return [c for c in raw if isinstance(c, str) and c.strip()]


def rank_closet_pairings(
    candidate: Dict[str, Any],
    closet_items: List[Dict[str, Any]],
    recommender: OutfitRecommender,
    *,
    limit: int = 30,
) -> List[Dict[str, Any]]:
    """Return closet items that could outfit-build with `candidate`, highest score first.

    `candidate` uses the same shape as DB rows (category, subcategory, colors, style).
    """
    c_sub = candidate.get("subcategory") or "Other"
    c_colors = _colors_list(candidate)
    c_style = candidate.get("style")

    ranked: List[Dict[str, Any]] = []
    for it in closet_items:
        if it.get("id") == candidate.get("id"):
            continue
        o_sub = it.get("subcategory") or "Other"
        if not _subcategories_compatible(c_sub, o_sub):
            continue

        strength = recommender.color_match_strength(
            c_colors,
            _colors_list(it),
        )
        if strength == 0:
            continue

        hints: List[str] = []
        hints.append("Colors work together")
        score = float(strength)

        if recommender.styles_match(c_style, it.get("style")):
            score += 6.0
            hints.append("Styles align")

        rb = _role_bonus(c_sub, o_sub)
        if rb:
            score += rb
            if rb >= 12:
                hints.append("Core outfit pairing")
            elif rb >= 8:
                hints.append("Completes a silhouette")

        ranked.append(
            {
                "score": round(score, 1),
                "hints": hints[:4],
                "item": it,
            }
        )

    ranked.sort(key=lambda r: r["score"], reverse=True)
    return ranked[:limit]
