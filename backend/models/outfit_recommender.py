import random
from typing import List, Dict, Optional
import itertools


class OutfitRecommender:
    """AI-powered outfit recommendation system based on color theory and style matching"""
    
    def __init__(self):
        # Color compatibility matrix (simplified color theory)
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
            "Teal": ["White", "Beige", "Brown", "Gray"]
        }
        
        # Style compatibility
        self.style_compatibility = {
            "Formal": ["Formal", "Business"],
            "Business": ["Formal", "Business", "Casual"],
            "Casual": ["Casual", "Streetwear", "Athletic"],
            "Athletic": ["Athletic", "Casual", "Streetwear"],
            "Streetwear": ["Streetwear", "Casual", "Athletic"]
        }
        
        # Occasion-based recommendations
        self.occasion_styles = {
            "work": ["Formal", "Business"],
            "casual": ["Casual", "Streetwear"],
            "gym": ["Athletic"],
            "date": ["Formal", "Casual"],
            "party": ["Formal", "Streetwear"]
        }
    
    def colors_match(self, colors1: List[str], colors2: List[str]) -> bool:
        """Check if two sets of colors are compatible"""
        for c1 in colors1:
            for c2 in colors2:
                if c1 in self.color_compatibility and c2 in self.color_compatibility[c1]:
                    return True
                if c2 in self.color_compatibility and c1 in self.color_compatibility[c2]:
                    return True
        return False
    
    def styles_match(self, style1: str, style2: str) -> bool:
        """Check if two styles are compatible"""
        if style1 in self.style_compatibility:
            return style2 in self.style_compatibility[style1]
        return style1 == style2
    
    def calculate_outfit_score(self, outfit_items: List[Dict]) -> float:
        """Calculate a score for an outfit based on color harmony and style matching"""
        score = 0.0
        
        # Check color compatibility
        for i in range(len(outfit_items)):
            for j in range(i + 1, len(outfit_items)):
                if self.colors_match(outfit_items[i]["colors"], outfit_items[j]["colors"]):
                    score += 10
        
        # Check style consistency
        styles = [item["style"] for item in outfit_items]
        for i in range(len(styles)):
            for j in range(i + 1, len(styles)):
                if self.styles_match(styles[i], styles[j]):
                    score += 5
        
        # Bonus for complete outfit (top + bottom + shoes)
        categories = [item["subcategory"] for item in outfit_items]
        if "Top" in categories and "Bottom" in categories:
            score += 15
        if "Footwear" in categories:
            score += 5
        
        return score
    
    def generate_outfits(self, items: List[Dict], 
                        occasion: Optional[str] = None, 
                        season: Optional[str] = None,
                        max_outfits: int = 5) -> List[Dict]:
        """Generate outfit recommendations"""
        
        # Filter items by season if specified
        if season:
            items = [item for item in items if item["season"] == season or item["season"] == "All-Season"]
        
        # Filter by occasion/style if specified
        if occasion and occasion.lower() in self.occasion_styles:
            preferred_styles = self.occasion_styles[occasion.lower()]
            items = [item for item in items if item["style"] in preferred_styles]
        
        # Ensure items have washed status (clean items only)
        items = [item for item in items if item.get("washed", True)]
        
        # Categorize items
        tops = [item for item in items if item["subcategory"] == "Top"]
        bottoms = [item for item in items if item["subcategory"] == "Bottom"]
        dresses = [item for item in items if item["subcategory"] == "Dress"]
        shoes = [item for item in items if item["subcategory"] == "Footwear"]
        accessories = [item for item in items if item["subcategory"] == "Accessory"]
        
        outfits = []
        
        # Generate dress-based outfits
        for dress in dresses[:5]:
            outfit_items = [dress]
            
            # Add matching shoes
            for shoe in shoes:
                if self.colors_match(dress["colors"], shoe["colors"]):
                    outfit_items.append(shoe)
                    break
            
            # Add accessory
            if accessories and random.random() > 0.5:
                outfit_items.append(random.choice(accessories))
            
            score = self.calculate_outfit_score(outfit_items)
            outfits.append({
                "items": outfit_items,
                "score": score,
                "occasion": occasion or "casual"
            })
        
        # Generate top + bottom outfits
        for top in tops[:10]:
            for bottom in bottoms[:10]:
                # Check if colors match
                if not self.colors_match(top["colors"], bottom["colors"]):
                    continue
                
                # Check if styles match
                if not self.styles_match(top["style"], bottom["style"]):
                    continue
                
                outfit_items = [top, bottom]
                
                # Add matching shoes
                for shoe in shoes:
                    if self.colors_match(top["colors"], shoe["colors"]) or \
                       self.colors_match(bottom["colors"], shoe["colors"]):
                        outfit_items.append(shoe)
                        break
                
                # Optionally add accessory
                if accessories and random.random() > 0.7:
                    outfit_items.append(random.choice(accessories))
                
                score = self.calculate_outfit_score(outfit_items)
                outfits.append({
                    "items": outfit_items,
                    "score": score,
                    "occasion": occasion or "casual"
                })
        
        # Sort by score and return top outfits
        outfits.sort(key=lambda x: x["score"], reverse=True)
        
        return outfits[:max_outfits]

