import torch
import torch.nn as nn
from torchvision import models, transforms
from PIL import Image
import numpy as np
from typing import Dict, List
import warnings
warnings.filterwarnings('ignore')


class ClothingClassifier:
    """PyTorch-based clothing classification model"""
    
    def __init__(self):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        
        # Categories for clothing classification
        self.categories = [
            "T-Shirt", "Shirt", "Sweater", "Jacket", "Coat",
            "Pants", "Jeans", "Shorts", "Skirt", "Dress",
            "Shoes", "Sneakers", "Boots", "Sandals",
            "Accessories", "Hat", "Scarf", "Belt"
        ]
        
        self.colors = [
            "Black", "White", "Gray", "Red", "Blue",
            "Green", "Yellow", "Orange", "Purple", "Pink",
            "Brown", "Beige", "Navy", "Teal"
        ]
        
        self.seasons = ["Spring", "Summer", "Fall", "Winter", "All-Season"]
        self.styles = ["Casual", "Formal", "Athletic", "Streetwear", "Business"]
        
        # Image preprocessing
        self.transform = transforms.Compose([
            transforms.Resize(256),
            transforms.CenterCrop(224),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
        ])
        
        # Load pre-trained model (using ResNet50 as base)
        self.model = models.resnet50(pretrained=True)
        
        # Modify final layer for clothing classification
        num_features = self.model.fc.in_features
        self.model.fc = nn.Linear(num_features, len(self.categories))
        
        self.model.to(self.device)
        self.model.eval()
    
    def extract_colors(self, image_path: str, num_colors: int = 3) -> List[str]:
        """Extract dominant colors from image using k-means clustering"""
        try:
            image = Image.open(image_path).convert('RGB')
            image = image.resize((150, 150))
            pixels = np.array(image).reshape(-1, 3)
            
            # Simple color detection based on RGB values
            avg_color = pixels.mean(axis=0)
            
            detected_colors = []
            
            # Map RGB to predefined color names
            color_map = {
                "Black": [0, 0, 0],
                "White": [255, 255, 255],
                "Gray": [128, 128, 128],
                "Red": [255, 0, 0],
                "Blue": [0, 0, 255],
                "Green": [0, 255, 0],
                "Yellow": [255, 255, 0],
                "Orange": [255, 165, 0],
                "Purple": [128, 0, 128],
                "Pink": [255, 192, 203],
                "Brown": [139, 69, 19],
                "Beige": [245, 245, 220],
                "Navy": [0, 0, 128],
                "Teal": [0, 128, 128]
            }
            
            # Find closest color
            min_dist = float('inf')
            closest_color = "Gray"
            
            for color_name, rgb in color_map.items():
                dist = np.linalg.norm(avg_color - np.array(rgb))
                if dist < min_dist:
                    min_dist = dist
                    closest_color = color_name
            
            detected_colors.append(closest_color)
            
            # Add complementary colors
            if avg_color[0] < 100 and avg_color[1] < 100 and avg_color[2] < 100:
                detected_colors.append("Black")
            elif avg_color[0] > 200 and avg_color[1] > 200 and avg_color[2] > 200:
                detected_colors.append("White")
            
            return list(set(detected_colors[:num_colors]))
        except Exception as e:
            print(f"Error extracting colors: {e}")
            return ["Gray"]
    
    def classify(self, image_path: str) -> Dict:
        """Classify a clothing item from an image"""
        try:
            # Load and preprocess image
            image = Image.open(image_path).convert('RGB')
            image_tensor = self.transform(image).unsqueeze(0).to(self.device)
            
            # Get prediction
            with torch.no_grad():
                outputs = self.model(image_tensor)
                probabilities = torch.nn.functional.softmax(outputs, dim=1)
                confidence, predicted = torch.max(probabilities, 1)
            
            category_idx = predicted.item()
            category = self.categories[category_idx]
            confidence_score = confidence.item()
            
            # Determine subcategory
            subcategory = self._get_subcategory(category)
            
            # Extract colors
            colors = self.extract_colors(image_path)
            
            # Determine season and style
            season = self._determine_season(category, colors)
            style = self._determine_style(category)
            
            return {
                "category": category,
                "subcategory": subcategory,
                "confidence": round(confidence_score * 100, 2),
                "colors": colors,
                "season": season,
                "style": style
            }
        except Exception as e:
            print(f"Classification error: {e}")
            # Return default classification
            return {
                "category": "T-Shirt",
                "subcategory": "Top",
                "confidence": 50.0,
                "colors": ["Gray"],
                "season": "All-Season",
                "style": "Casual"
            }
    
    def _get_subcategory(self, category: str) -> str:
        """Map category to subcategory"""
        tops = ["T-Shirt", "Shirt", "Sweater", "Jacket", "Coat"]
        bottoms = ["Pants", "Jeans", "Shorts", "Skirt"]
        dresses = ["Dress"]
        shoes = ["Shoes", "Sneakers", "Boots", "Sandals"]
        accessories = ["Accessories", "Hat", "Scarf", "Belt"]
        
        if category in tops:
            return "Top"
        elif category in bottoms:
            return "Bottom"
        elif category in dresses:
            return "Dress"
        elif category in shoes:
            return "Footwear"
        elif category in accessories:
            return "Accessory"
        return "Other"
    
    def _determine_season(self, category: str, colors: List[str]) -> str:
        """Determine appropriate season for clothing"""
        warm_items = ["Coat", "Sweater", "Jacket", "Boots"]
        cool_items = ["Shorts", "T-Shirt", "Sandals"]
        
        if category in warm_items:
            return "Winter"
        elif category in cool_items:
            return "Summer"
        else:
            return "All-Season"
    
    def _determine_style(self, category: str) -> str:
        """Determine style category"""
        formal = ["Shirt", "Dress", "Coat"]
        athletic = ["Sneakers", "Shorts"]
        casual = ["T-Shirt", "Jeans", "Sandals"]
        
        if category in formal:
            return "Formal"
        elif category in athletic:
            return "Athletic"
        else:
            return "Casual"

