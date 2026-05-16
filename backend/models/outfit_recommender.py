import random
from typing import Dict, List, Optional, Set, Tuple

# Fine-grained clothing `category` from the classifier (not subcategory).
_WARM_LAYER_CATEGORIES = frozenset({"Jacket", "Coat", "Sweater"})
_SUMMERISH_CATEGORIES = frozenset({"Shorts", "Sandals"})
_RAIN_READY_CATEGORIES = frozenset({"Jacket", "Coat", "Boots", "Sneakers"})
_HEAVY_CATEGORIES = frozenset({"Coat", "Sweater", "Boots"})


class OutfitRecommender:
    """Rule-based outfit suggestions from color theory, style, and season hints."""

    def __init__(self):
        self.color_compatibility = {
            "Black": ["White", "Gray", "Red", "Blue", "Yellow", "Pink", "Purple", "Beige"],
            "White": ["Black", "Blue", "Navy", "Red", "Green", "Purple", "Pink", "Brown"],
            "Gray": ["Black", "White", "Blue", "Pink", "Yellow", "Purple", "Navy"],
            "Navy": ["White", "Beige", "Gray", "Yellow", "Red", "Pink"],
            "Blue": ["White", "Beige", "Brown", "Gray", "Orange", "Yellow"],
            "Red": ["Black", "White", "Navy", "Gray", "Beige"],
            "Green": ["White", "Beige", "Brown", "Yellow", "Navy"],
            "Yellow": ["Navy", "Gray", "Blue", "Purple", "White"],
            "Brown": ["Beige", "White", "Blue", "Green", "Orange"],
            "Beige": ["Navy", "Brown", "White", "Blue", "Green"],
            "Pink": ["Gray", "Navy", "White", "Black", "Beige"],
            "Purple": ["Gray", "Yellow", "White", "Black"],
            "Orange": ["Blue", "Brown", "Beige", "White"],
            "Teal": ["White", "Beige", "Brown", "Gray"],
        }

        self.style_compatibility = {
            "Formal": ["Formal", "Business"],
            "Business": ["Formal", "Business", "Casual"],
            "Casual": ["Casual", "Streetwear", "Athletic"],
            "Athletic": ["Athletic", "Casual", "Streetwear"],
            "Streetwear": ["Streetwear", "Casual", "Athletic"],
        }

        self.occasion_styles = {
            "work": ["Formal", "Business"],
            "casual": ["Casual", "Streetwear"],
            "gym": ["Athletic"],
            "date": ["Formal", "Casual"],
            "party": ["Formal", "Streetwear"],
        }

        # Roadmap "vibe profiles" — merged with occasion preferences when set.
        self.vibe_styles = {
            "clean_prep": frozenset({"Formal", "Business"}),
            "streetwear": frozenset({"Streetwear", "Athletic"}),
            "cozy": frozenset({"Casual"}),
            "minimal": frozenset({"Casual", "Business"}),
            "bold": frozenset({"Streetwear", "Formal"}),
            "athleisure": frozenset({"Athletic", "Casual"}),
        }

    @staticmethod
    def _norm_style(style: Optional[str]) -> str:
        return (style or "Casual").strip()

    @staticmethod
    def _item_colors(item: Dict) -> List[str]:
        raw = item.get("colors")
        if not raw:
            return []
        return [c for c in raw if isinstance(c, str) and c.strip()]

    def _is_color_wildcard(self, colors: List[str]) -> bool:
        """Sparse color metadata — allow pairing, with a lower harmony score."""
        return len(colors) == 0

    def color_match_strength(self, colors1: List[str], colors2: List[str]) -> int:
        """0 = clash, 3 = weak / unknown palette, 10 = clear matrix match."""
        w1 = self._is_color_wildcard(colors1)
        w2 = self._is_color_wildcard(colors2)
        if w1 and w2:
            return 3
        if w1 or w2:
            return 3

        for c1 in colors1:
            for c2 in colors2:
                if c1 in self.color_compatibility and c2 in self.color_compatibility[c1]:
                    return 10
                if c2 in self.color_compatibility and c1 in self.color_compatibility[c2]:
                    return 10
        return 0

    def colors_match(self, colors1: List[str], colors2: List[str]) -> bool:
        return self.color_match_strength(colors1, colors2) > 0

    def styles_match(self, style1: Optional[str], style2: Optional[str]) -> bool:
        s1 = self._norm_style(style1)
        s2 = self._norm_style(style2)
        if s1 in self.style_compatibility:
            return s2 in self.style_compatibility[s1]
        return s1 == s2

    def _occasion_preferred_styles(self, occasion: Optional[str]) -> Optional[Set[str]]:
        if not occasion:
            return None
        key = occasion.lower().strip()
        styles = self.occasion_styles.get(key)
        if not styles:
            return None
        return set(styles)

    def _vibe_preferred_styles(self, vibe: Optional[str]) -> Optional[Set[str]]:
        if not vibe:
            return None
        key = vibe.lower().strip()
        vs = self.vibe_styles.get(key)
        return set(vs) if vs else None

    def _merged_style_preferences(
        self, occasion: Optional[str], vibe: Optional[str]
    ) -> Optional[Set[str]]:
        acc: Set[str] = set()
        o = self._occasion_preferred_styles(occasion)
        if o:
            acc |= o
        v = self._vibe_preferred_styles(vibe)
        if v:
            acc |= v
        return acc if acc else None

    def calculate_outfit_score(
        self,
        outfit_items: List[Dict],
        *,
        occasion: Optional[str] = None,
        season: Optional[str] = None,
        vibe: Optional[str] = None,
        weather: Optional[Dict] = None,
    ) -> float:
        score = 0.0
        preferred = self._merged_style_preferences(occasion, vibe)

        for i in range(len(outfit_items)):
            for j in range(i + 1, len(outfit_items)):
                ic = self._item_colors(outfit_items[i])
                jc = self._item_colors(outfit_items[j])
                score += float(self.color_match_strength(ic, jc))

        styles = [self._norm_style(item.get("style")) for item in outfit_items]
        for i in range(len(styles)):
            for j in range(i + 1, len(styles)):
                if self.styles_match(styles[i], styles[j]):
                    score += 5.0

        categories = [item["subcategory"] for item in outfit_items]
        if "Top" in categories and "Bottom" in categories:
            score += 15.0
        if "Footwear" in categories:
            score += 5.0

        if preferred:
            for item in outfit_items:
                st = self._norm_style(item.get("style"))
                if st in preferred:
                    score += 12.0
                else:
                    score -= 6.0

        if season and season.lower() == "winter":
            if any(item.get("category") in _WARM_LAYER_CATEGORIES for item in outfit_items):
                score += 8.0
            if any(item.get("category") in _SUMMERISH_CATEGORIES for item in outfit_items):
                score -= 12.0
        elif season and season.lower() == "summer":
            if any(item.get("category") in _SUMMERISH_CATEGORIES for item in outfit_items):
                score += 4.0

        score += self._weather_score(outfit_items, weather)
        return score

    def _weather_score(self, outfit_items: List[Dict], weather: Optional[Dict]) -> float:
        if not weather:
            return 0.0

        cats = {item.get("category") for item in outfit_items}
        subs = {item.get("subcategory") for item in outfit_items}
        score = 0.0

        if weather.get("cold"):
            if cats & _WARM_LAYER_CATEGORIES:
                score += 12.0
            else:
                score -= 10.0
            if "Accessory" in subs:
                score += 2.0

        if weather.get("hot"):
            if cats & _SUMMERISH_CATEGORIES:
                score += 8.0
            if cats & _HEAVY_CATEGORIES:
                score -= 14.0

        if weather.get("rainy") or weather.get("snowy"):
            if cats & _RAIN_READY_CATEGORIES:
                score += 10.0
            if "Sandals" in cats:
                score -= 16.0
            if weather.get("snowy") and "Boots" in cats:
                score += 8.0

        if weather.get("windy"):
            if cats & _WARM_LAYER_CATEGORIES:
                score += 4.0
            if "Dress" in subs and not (cats & _WARM_LAYER_CATEGORIES):
                score -= 3.0

        precip = weather.get("precipitation_probability")
        try:
            precip_i = int(precip) if precip is not None else 0
        except (TypeError, ValueError):
            precip_i = 0
        if precip_i >= 70 and not (cats & _RAIN_READY_CATEGORIES):
            score -= 6.0

        return score

    def _pick_shoe(self, base_items: List[Dict], shoes: List[Dict]) -> Optional[Dict]:
        for shoe in shoes:
            if not all(
                self.colors_match(self._item_colors(shoe), self._item_colors(b))
                for b in base_items
            ):
                continue
            if all(self.styles_match(shoe.get("style"), b.get("style")) for b in base_items):
                return shoe
        for shoe in shoes:
            if all(
                self.colors_match(self._item_colors(shoe), self._item_colors(b))
                for b in base_items
            ):
                return shoe
        return None

    def _maybe_accessory(
        self,
        rng: random.Random,
        outfit_items: List[Dict],
        accessories: List[Dict],
        threshold: float,
    ) -> Optional[Dict]:
        if not accessories or rng.random() >= threshold:
            return None
        candidates = []
        for acc in accessories:
            acol = self._item_colors(acc)
            if any(self.colors_match(acol, self._item_colors(o)) for o in outfit_items):
                candidates.append(acc)
        if not candidates:
            return None
        return rng.choice(candidates)

    def _outfit_contains_pins(self, outfit: List[Dict], pinned_ids: Set[int]) -> bool:
        present = {i["id"] for i in outfit}
        return pinned_ids <= present

    def _pins_structurally_valid(self, pinned: List[Dict]) -> bool:
        if not pinned:
            return True
        subs = [p["subcategory"] for p in pinned]
        if subs.count("Top") > 1 or subs.count("Bottom") > 1 or subs.count("Dress") > 1:
            return False
        if subs.count("Accessory") > 1:
            return False
        if "Dress" in subs and ("Top" in subs or "Bottom" in subs):
            return False
        return True

    def _mutual_pin_compatibility(self, pinned: List[Dict]) -> bool:
        for i in range(len(pinned)):
            for j in range(i + 1, len(pinned)):
                if self.color_match_strength(
                    self._item_colors(pinned[i]),
                    self._item_colors(pinned[j]),
                ) == 0:
                    return False
                if not self.styles_match(pinned[i].get("style"), pinned[j].get("style")):
                    return False
        return True

    def _apply_pin_list_filter(
        self,
        pool: List[Dict],
        pinned: List[Dict],
        subcategory: str,
    ) -> List[Dict]:
        pinned_of = [p for p in pinned if p["subcategory"] == subcategory]
        if not pinned_of:
            return pool
        want = pinned_of[0]
        return [want] if want in pool else []

    def _attach_pinned_accessories(
        self,
        outfit_items: List[Dict],
        pinned: List[Dict],
    ) -> Optional[List[Dict]]:
        out = list(outfit_items)
        present = {i["id"] for i in out}
        for p in pinned:
            if p["subcategory"] != "Accessory":
                continue
            if p["id"] in present:
                continue
            if all(
                self.colors_match(self._item_colors(p), self._item_colors(o))
                for o in out
            ):
                out.append(p)
                present.add(p["id"])
            else:
                return None
        return out

    def _bias_candidates(
        self,
        rng: random.Random,
        items_list: List[Dict],
        preferred: Optional[Set[str]],
    ) -> None:
        if not preferred:
            rng.shuffle(items_list)
            return

        def sort_key(entry: Dict) -> Tuple[int, float]:
            st = self._norm_style(entry.get("style"))
            tier = 0 if st in preferred else 1
            return (tier, rng.random())

        items_list.sort(key=sort_key)

    def generate_outfits(
        self,
        items: List[Dict],
        occasion: Optional[str] = None,
        season: Optional[str] = None,
        max_outfits: int = 5,
        *,
        rng: Optional[random.Random] = None,
        exclude_item_ids: Optional[Set[int]] = None,
        pin_item_ids: Optional[List[int]] = None,
        max_pair_evaluations: int = 3000,
        max_dress_candidates: int = 24,
        max_top_candidates: int = 36,
        max_bottom_candidates: int = 36,
        vibe: Optional[str] = None,
        weather: Optional[Dict] = None,
    ) -> List[Dict]:
        rng = rng or random.Random()

        exclude_item_ids = exclude_item_ids or set()
        items = [i for i in items if i["id"] not in exclude_item_ids]

        if season:
            items = [
                item
                for item in items
                if item.get("season") == season or item.get("season") == "All-Season"
            ]

        items = [item for item in items if item.get("washed", True)]
        items = [
            i
            for i in items
            if (not bool(i.get("is_bulk"))) or ((i.get("clean_count") or 0) > 0)
        ]

        id_map = {i["id"]: i for i in items}
        raw_pins = pin_item_ids or []
        pinned = [id_map[pid] for pid in raw_pins if pid in id_map]

        if not self._pins_structurally_valid(pinned) or not self._mutual_pin_compatibility(pinned):
            return []

        pinned_ids = {p["id"] for p in pinned}

        tops = [item for item in items if item["subcategory"] == "Top"]
        bottoms = [item for item in items if item["subcategory"] == "Bottom"]
        dresses = [item for item in items if item["subcategory"] == "Dress"]
        shoes = [item for item in items if item["subcategory"] == "Footwear"]
        accessories = [item for item in items if item["subcategory"] == "Accessory"]

        tops = self._apply_pin_list_filter(tops, pinned, "Top")
        bottoms = self._apply_pin_list_filter(bottoms, pinned, "Bottom")
        dresses = self._apply_pin_list_filter(dresses, pinned, "Dress")
        shoes = self._apply_pin_list_filter(shoes, pinned, "Footwear")

        preferred = self._merged_style_preferences(occasion, vibe)

        tops_s = tops[:]
        bottoms_s = bottoms[:]
        dresses_s = dresses[:]
        shoes_s = shoes[:]
        acc_s = accessories[:]
        self._bias_candidates(rng, tops_s, preferred)
        self._bias_candidates(rng, bottoms_s, preferred)
        self._bias_candidates(rng, dresses_s, preferred)
        self._bias_candidates(rng, shoes_s, preferred)
        rng.shuffle(acc_s)

        dresses_s = dresses_s[:max_dress_candidates]
        tops_s = tops_s[:max_top_candidates]
        bottoms_s = bottoms_s[:max_bottom_candidates]

        outfits: List[Dict] = []

        pinned_has_accessory = any(p["subcategory"] == "Accessory" for p in pinned)

        for dress in dresses_s:
            outfit_items = [dress]
            shoe = self._pick_shoe([dress], shoes_s)
            if shoe:
                outfit_items.append(shoe)
            if not pinned_has_accessory:
                acc = self._maybe_accessory(rng, outfit_items, acc_s, 0.55)
                if acc:
                    outfit_items.append(acc)
            outfit_items = self._attach_pinned_accessories(outfit_items, pinned)
            if outfit_items is None:
                continue
            if pinned_ids and not self._outfit_contains_pins(outfit_items, pinned_ids):
                continue
            outfits.append(
                {
                    "items": outfit_items,
                    "score": self.calculate_outfit_score(
                        outfit_items,
                        occasion=occasion,
                        season=season,
                        vibe=vibe,
                        weather=weather,
                    ),
                    "occasion": occasion or "casual",
                }
            )

        eval_count = 0
        for top in tops_s:
            for bottom in bottoms_s:
                eval_count += 1
                if eval_count > max_pair_evaluations:
                    break

                if self.color_match_strength(
                    self._item_colors(top),
                    self._item_colors(bottom),
                ) == 0:
                    continue
                if not self.styles_match(top.get("style"), bottom.get("style")):
                    continue

                outfit_items = [top, bottom]
                shoe = self._pick_shoe([top, bottom], shoes_s)
                if shoe:
                    outfit_items.append(shoe)
                if not pinned_has_accessory:
                    acc = self._maybe_accessory(rng, outfit_items, acc_s, 0.72)
                    if acc:
                        outfit_items.append(acc)
                outfit_items = self._attach_pinned_accessories(outfit_items, pinned)
                if outfit_items is None:
                    continue
                if pinned_ids and not self._outfit_contains_pins(outfit_items, pinned_ids):
                    continue
                outfits.append(
                    {
                        "items": outfit_items,
                        "score": self.calculate_outfit_score(
                            outfit_items,
                            occasion=occasion,
                            season=season,
                            vibe=vibe,
                            weather=weather,
                        ),
                        "occasion": occasion or "casual",
                    }
                )
            if eval_count > max_pair_evaluations:
                break

        best_by_items: Dict[Tuple[int, ...], Dict] = {}
        for o in outfits:
            key = tuple(sorted(i["id"] for i in o["items"]))
            prev = best_by_items.get(key)
            if prev is None or o["score"] > prev["score"]:
                best_by_items[key] = o

        deduped = list(best_by_items.values())
        deduped.sort(key=lambda x: x["score"], reverse=True)
        return deduped[:max_outfits]
