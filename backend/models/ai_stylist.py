from __future__ import annotations



import json

import os

import random

import re

import urllib.error

import urllib.request

from datetime import date

from typing import Any, Dict, List, Optional, Set



from models.outfit_recommender import OutfitRecommender



_OCCASION_KEYWORDS = {

    "work": "work",

    "office": "work",

    "meeting": "work",

    "casual": "casual",

    "errands": "casual",

    "gym": "gym",

    "workout": "gym",

    "date": "date",

    "dinner": "date",

    "party": "party",

    "going out": "party",

}



_SEASON_KEYWORDS = {

    "spring": "Spring",

    "summer": "Summer",

    "fall": "Fall",

    "autumn": "Fall",

    "winter": "Winter",

    "cold": "Winter",

    "hot": "Summer",

}



_VIBE_KEYWORDS = {

    "prep": "clean_prep",

    "clean": "clean_prep",

    "polished": "clean_prep",

    "street": "streetwear",

    "streetwear": "streetwear",

    "cozy": "cozy",

    "comfortable": "cozy",
    "minimal": "minimal",
    "simple": "minimal",
    "bold": "bold",
    "statement": "bold",
    "athleisure": "athleisure",
    "sporty": "athleisure",

}



_CATEGORY_WORDS = {

    "jacket",

    "coat",

    "sweater",

    "shirt",

    "tee",

    "top",

    "jeans",

    "pants",

    "shorts",

    "skirt",

    "dress",

    "sneakers",

    "shoes",

    "boots",

    "sandals",

    "hat",

    "bag",

}





def interpret_message(

    message: str,

    items: List[Dict[str, Any]],

    *,

    explicit_pin_item_ids: Optional[List[int]] = None,

    planned_outfits: Optional[List[Dict[str, Any]]] = None,

) -> Dict[str, Any]:

    text = message.lower()

    occasion = _first_keyword(text, _OCCASION_KEYWORDS)

    season = _first_keyword(text, _SEASON_KEYWORDS)

    vibe = _first_keyword(text, _VIBE_KEYWORDS)

    novelty = any(word in text for word in ("bored", "usual", "different", "rotate", "rotation"))

    planning = _planning_context(text, planned_outfits or [])

    if not occasion:

        occasion = planning.get("suggested_occasion")

    pin_ids = _clean_pin_ids(explicit_pin_item_ids) or _infer_pin_ids(text, items)



    return {

        "occasion": occasion,

        "season": season,

        "vibe": vibe,

        "novelty": novelty,

        "pin_item_ids": pin_ids,

        "planning": planning,

    }





def build_ai_stylist_response(

    *,

    message: str,

    items: List[Dict[str, Any]],

    recommender: OutfitRecommender,

    weather: Optional[Dict[str, Any]],

    rng: random.Random,

    recent_signatures: Optional[Set[str]] = None,

    explicit_pin_item_ids: Optional[List[int]] = None,

    planned_outfits: Optional[List[Dict[str, Any]]] = None,

    feedback: Optional[Dict[str, Any]] = None,

) -> Dict[str, Any]:

    interpreted = interpret_message(

        message,

        items,

        explicit_pin_item_ids=explicit_pin_item_ids,

        planned_outfits=planned_outfits,

    )

    candidate_items = _novelty_biased_items(items) if interpreted["novelty"] else items

    reserved_item_ids = _reserved_upcoming_item_ids(interpreted.get("planning") or {})

    pinned_item_ids = set(interpreted.get("pin_item_ids") or [])

    if reserved_item_ids:

        candidate_items = [

            item

            for item in candidate_items

            if int(item.get("id") or 0) not in reserved_item_ids

            or int(item.get("id") or 0) in pinned_item_ids

        ]

    outfits = recommender.generate_outfits(

        candidate_items,

        occasion=interpreted["occasion"],

        season=interpreted["season"],

        vibe=interpreted["vibe"],

        rng=rng,

        pin_item_ids=interpreted["pin_item_ids"] or None,

        max_outfits=10,

        weather=weather,

    )

    planned = _planned_outfits_for_prompt(

        interpreted.get("planning") or {},

        items,

        recommender,

        interpreted,

        weather,

    )

    if planned:

        outfits = planned + [

            outfit

            for outfit in outfits

            if _outfit_signature(outfit.get("items") or [])

            not in {_outfit_signature(p.get("items") or []) for p in planned}

        ]



    if recent_signatures:

        fresh = [

            outfit

            for outfit in outfits

            if _outfit_signature(outfit.get("items") or []) not in recent_signatures

        ]

        if len(fresh) >= 2:

            outfits = fresh



    outfits = _apply_feedback(outfits, feedback)



    suggestions = [

        {

            "title": _suggestion_title(index, outfit),

            "outfit": outfit,

            "rationale": _local_rationale(outfit, interpreted, weather),

            "signature": _outfit_signature(outfit.get("items") or []),

        }

        for index, outfit in enumerate(outfits[:3])

    ]



    local_intro = _local_intro(message, suggestions, interpreted, weather)

    enhanced = _try_claude_copy(message, interpreted, weather, suggestions)

    if enhanced:

        for index, rationale in enumerate(enhanced.get("rationales") or []):

            if index < len(suggestions) and isinstance(rationale, str) and rationale.strip():

                suggestions[index]["rationale"] = rationale.strip()[:360]

        return {

            "message": enhanced.get("message") or local_intro,

            "source": "claude",

            "interpreted": interpreted,

            "suggestions": suggestions,

        }



    return {

        "message": local_intro,

        "source": "local",

        "interpreted": interpreted,

        "suggestions": suggestions,

    }





def _first_keyword(text: str, mapping: Dict[str, str]) -> Optional[str]:

    for needle, value in mapping.items():

        if needle in text:

            return value

    return None





def _clean_pin_ids(raw: Optional[List[int]]) -> List[int]:

    seen: Set[int] = set()

    out: List[int] = []

    for value in raw or []:

        try:

            item_id = int(value)

        except (TypeError, ValueError):

            continue

        if item_id <= 0 or item_id in seen:

            continue

        seen.add(item_id)

        out.append(item_id)

    return out[:8]





def _planning_context(

    text: str, planned_outfits: List[Dict[str, Any]]

) -> Dict[str, Any]:

    today = date.today().isoformat()

    today_plans: List[Dict[str, Any]] = []

    upcoming_plans: List[Dict[str, Any]] = []

    for plan in planned_outfits:

        planned_for = str(plan.get("planned_for") or "")

        if not planned_for:

            continue

        compact = {

            "id": plan.get("id"),

            "title": plan.get("title"),

            "planned_for": planned_for,

            "occasion": plan.get("occasion"),

            "status": plan.get("status"),

            "item_ids": [

                int(item_id)

                for item_id in plan.get("item_ids") or []

                if isinstance(item_id, int) or str(item_id).isdigit()

            ],

        }

        if planned_for == today:

            today_plans.append(compact)

        elif planned_for > today:

            upcoming_plans.append(compact)



    asks_today = any(

        phrase in text

        for phrase in ("today", "tonight", "this morning", "this afternoon", "this evening")

    )

    source_plan = today_plans[0] if asks_today and today_plans else None

    if source_plan is None and not asks_today and upcoming_plans:

        source_plan = upcoming_plans[0]



    return {

        "asks_today": asks_today,

        "today_plans": today_plans[:3],

        "upcoming_plans": upcoming_plans[:5],

        "suggested_occasion": source_plan.get("occasion") if source_plan else None,

    }





def _planned_outfits_for_prompt(

    planning: Dict[str, Any],

    items: List[Dict[str, Any]],

    recommender: OutfitRecommender,

    interpreted: Dict[str, Any],

    weather: Optional[Dict[str, Any]],

) -> List[Dict[str, Any]]:

    if not planning.get("asks_today"):

        return []

    item_by_id = {int(item["id"]): item for item in items if item.get("id") is not None}

    out: List[Dict[str, Any]] = []

    for plan in planning.get("today_plans") or []:

        plan_items = [

            item_by_id[item_id]

            for item_id in plan.get("item_ids") or []

            if item_id in item_by_id

        ]

        if not plan_items:

            continue

        out.append(

            {

                "items": plan_items,

                "score": recommender.calculate_outfit_score(

                    plan_items,

                    occasion=interpreted.get("occasion"),

                    season=interpreted.get("season"),

                    vibe=interpreted.get("vibe"),

                    weather=weather,

                )

                + 18.0,

                "occasion": plan.get("occasion") or interpreted.get("occasion") or "planned",

                "planned_outfit": {

                    "id": plan.get("id"),

                    "title": plan.get("title"),

                    "planned_for": plan.get("planned_for"),

                },

            }

        )

    return out





def _reserved_upcoming_item_ids(planning: Dict[str, Any]) -> Set[int]:

    if not planning.get("asks_today"):

        return set()

    reserved: Set[int] = set()

    for plan in planning.get("upcoming_plans") or []:

        if plan.get("status") != "confirmed":

            continue

        for item_id in plan.get("item_ids") or []:

            try:

                reserved.add(int(item_id))

            except (TypeError, ValueError):

                continue

    return reserved





def _infer_pin_ids(text: str, items: List[Dict[str, Any]]) -> List[int]:

    mentioned_colors = {

        color.lower()

        for item in items

        for color in item.get("colors") or []

        if isinstance(color, str) and color.lower() in text

    }

    mentioned_categories = {word for word in _CATEGORY_WORDS if word in text}

    if not mentioned_colors and not mentioned_categories:

        return []



    scored: List[tuple[int, int, Dict[str, Any]]] = []

    for item in items:

        haystack = " ".join(

            str(part or "").lower()

            for part in (

                item.get("category"),

                item.get("subcategory"),

                item.get("brand"),

                item.get("notes"),

            )

        )

        color_hit = any(

            isinstance(color, str) and color.lower() in mentioned_colors

            for color in item.get("colors") or []

        )

        category_hit = any(word in haystack for word in mentioned_categories)

        if color_hit or category_hit:

            score = (2 if color_hit else 0) + (2 if category_hit else 0)

            score += int(item.get("times_worn") or 0)

            scored.append((score, int(item.get("id") or 0), item))



    if not scored:

        return []

    scored.sort(key=lambda entry: (-entry[0], entry[1]))

    return [int(scored[0][2]["id"])]





def _novelty_biased_items(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:

    def key(item: Dict[str, Any]) -> tuple[int, str]:

        return (int(item.get("times_worn") or 0), str(item.get("last_worn") or ""))



    return sorted(items, key=key)





def _outfit_signature(outfit_items: List[Dict[str, Any]]) -> str:

    return ",".join(str(item["id"]) for item in sorted(outfit_items, key=lambda x: int(x["id"])))





def _apply_feedback(

    outfits: List[Dict[str, Any]], feedback: Optional[Dict[str, Any]]

) -> List[Dict[str, Any]]:

    if not feedback:

        return outfits

    liked_signatures = set(feedback.get("liked_signatures") or [])

    disliked_signatures = set(feedback.get("disliked_signatures") or [])

    liked_item_ids = {

        int(item_id)

        for item_id in feedback.get("liked_item_ids") or []

        if str(item_id).isdigit()

    }

    disliked_item_ids = {

        int(item_id)

        for item_id in feedback.get("disliked_item_ids") or []

        if str(item_id).isdigit()

    }



    ranked: List[Dict[str, Any]] = []

    for outfit in outfits:

        copied = dict(outfit)

        items = copied.get("items") or []

        signature = _outfit_signature(items)

        item_ids = {int(item["id"]) for item in items if item.get("id") is not None}

        adjustment = 0.0

        if signature in liked_signatures:

            adjustment += 10.0

        if signature in disliked_signatures:

            adjustment -= 18.0

        adjustment += 2.0 * len(item_ids & liked_item_ids)

        adjustment -= 3.0 * len(item_ids & disliked_item_ids)

        copied["score"] = float(copied.get("score") or 0) + adjustment

        ranked.append(copied)



    ranked.sort(

        key=lambda outfit: (

            1 if outfit.get("planned_outfit") else 0,

            float(outfit.get("score") or 0),

        ),

        reverse=True,

    )

    return ranked





def _suggestion_title(index: int, outfit: Dict[str, Any]) -> str:

    planned = outfit.get("planned_outfit")

    if isinstance(planned, dict) and planned.get("title"):

        return f"Planned: {planned['title']}"

    items = outfit.get("items") or []

    if not items:

        return f"Look {index + 1}"

    colors = [

        color

        for item in items

        for color in item.get("colors") or []

        if isinstance(color, str) and color.strip()

    ]

    if colors:

        return f"{colors[0]}-led look"

    occasion = outfit.get("occasion") or "casual"

    return f"{str(occasion).title()} look"





def _local_intro(

    message: str,

    suggestions: List[Dict[str, Any]],

    interpreted: Dict[str, Any],

    weather: Optional[Dict[str, Any]],

) -> str:

    if not suggestions:

        return "I could not find a complete outfit from the clean items that match that prompt. Try a broader ask or mark a few more items clean."

    planning = interpreted.get("planning") or {}

    today_plans = planning.get("today_plans") or []

    if planning.get("asks_today") and today_plans:

        first = today_plans[0]

        title = first.get("title") or "your planned outfit"

        return f"You already have {title} planned for today, so I put that context first and added closet-ready alternatives."

    parts = ["I found a few closet-ready options"]

    if interpreted.get("occasion"):

        parts.append(f"for {interpreted['occasion']}")

    if interpreted.get("vibe"):

        parts.append(f"with a {str(interpreted['vibe']).replace('_', ' ')} feel")

    if weather:

        parts.append(f"that account for {weather.get('condition', 'today')}")

    return " ".join(parts) + "."





def _local_rationale(

    outfit: Dict[str, Any],

    interpreted: Dict[str, Any],

    weather: Optional[Dict[str, Any]],

) -> str:

    items = outfit.get("items") or []

    labels = [f"{item.get('colors', [''])[0] if item.get('colors') else ''} {item.get('category') or item.get('subcategory')}".strip() for item in items]

    planned = outfit.get("planned_outfit")

    if isinstance(planned, dict):

        return f"Starts from your planned outfit for {planned.get('planned_for', 'today')} and checks the pieces against the current closet state."

    reason = f"Pairs {', '.join(label for label in labels if label)}"

    if interpreted.get("pin_item_ids"):

        reason += " around the item you selected or mentioned"

    if interpreted.get("novelty"):

        reason += " while pulling in lower-rotation pieces"

    if weather and (weather.get("cold") or weather.get("rainy") or weather.get("hot")):

        reason += f" and fits the {weather.get('condition', 'weather')}"

    return reason + "."





def _try_claude_copy(

    message: str,

    interpreted: Dict[str, Any],

    weather: Optional[Dict[str, Any]],

    suggestions: List[Dict[str, Any]],

) -> Optional[Dict[str, Any]]:

    api_key = os.getenv("ANTHROPIC_API_KEY")

    if not api_key or not suggestions:

        return None



    payload = {

        "model": os.getenv("ANTHROPIC_MODEL", "claude-3-5-haiku-latest"),

        "max_tokens": 500,

        "temperature": 0.5,

        "system": (

            "You are a concise personal stylist. Use only the provided closet "

            "metadata. Return strict JSON with keys message and rationales."

        ),

        "messages": [

            {

                "role": "user",

                "content": json.dumps(

                    {

                        "user_message": message[:500],

                        "interpreted": interpreted,

                        "weather": weather,

                        "planning": interpreted.get("planning") or {},

                        "suggestions": [

                            {

                                "title": s["title"],

                                "items": [_compact_item(item) for item in s["outfit"].get("items", [])],

                            }

                            for s in suggestions

                        ],

                    },

                    separators=(",", ":"),

                ),

            }

        ],

    }

    req = urllib.request.Request(

        "https://api.anthropic.com/v1/messages",

        data=json.dumps(payload).encode("utf-8"),

        headers={

            "content-type": "application/json",

            "x-api-key": api_key,

            "anthropic-version": "2023-06-01",

        },

        method="POST",

    )

    try:

        # URL is always https://api.anthropic.com/… (no user-controlled scheme).
        with urllib.request.urlopen(req, timeout=8) as res:  # nosec B310

            raw = json.loads(res.read().decode("utf-8"))

    except (urllib.error.URLError, TimeoutError, ValueError, OSError):

        return None



    text = "".join(

        block.get("text", "")

        for block in raw.get("content", [])

        if isinstance(block, dict) and block.get("type") == "text"

    )

    try:

        parsed = json.loads(_extract_json_object(text))

    except (TypeError, ValueError):

        return None

    if not isinstance(parsed, dict):

        return None

    message_out = parsed.get("message")

    rationales = parsed.get("rationales")

    if not isinstance(message_out, str) or not isinstance(rationales, list):

        return None

    return {

        "message": message_out.strip()[:500],

        "rationales": [r for r in rationales if isinstance(r, str)],

    }





def _compact_item(item: Dict[str, Any]) -> Dict[str, Any]:

    return {

        "id": item.get("id"),

        "category": item.get("category"),

        "subcategory": item.get("subcategory"),

        "colors": item.get("colors") or [],

        "style": item.get("style"),

        "season": item.get("season"),

        "times_worn": item.get("times_worn"),

        "last_worn": item.get("last_worn"),

    }





def _extract_json_object(text: str) -> str:

    match = re.search(r"\{.*\}", text, flags=re.S)

    if not match:

        raise ValueError("No JSON object")

    return match.group(0)

