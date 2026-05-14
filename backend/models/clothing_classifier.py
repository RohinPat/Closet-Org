import torch
import open_clip
import colorsys
from PIL import Image
import numpy as np
from typing import Dict, List, Tuple, Optional
import warnings
warnings.filterwarnings('ignore')

_rembg_session = None

def _get_rembg_session():
    """Lazy-load the background-removal model. Returns None if rembg unavailable."""
    global _rembg_session
    if _rembg_session is False:
        return None
    if _rembg_session is None:
        try:
            from rembg import new_session
            _rembg_session = new_session("u2netp")  # small/fast variant
        except Exception as e:
            print(f"rembg unavailable, falling back to center crop: {e}")
            _rembg_session = False
            return None
    return _rembg_session


def generate_cutout_thumbnail(
    input_path: str, output_path: str, max_size: int = 1024
) -> bool:
    """Write a background-removed PNG thumbnail at output_path.

    Returns True on success, False if rembg isn't available or the cutout fails
    — callers should fall back to the original image.
    """
    session = _get_rembg_session()
    if session is None:
        return False
    try:
        from rembg import remove
        img = Image.open(input_path).convert("RGB")
        img.thumbnail((max_size, max_size))
        cutout = remove(img, session=session)
        cutout.save(output_path, "PNG")
        return True
    except Exception as e:
        print(f"Thumbnail generation failed for {input_path}: {e}")
        return False


class ClothingClassifier:
    """CLIP zero-shot clothing classifier.

    Uses OpenAI's CLIP ViT-B-32 to match images against text prompts for each
    category/style. No training required — works out of the box on CPU.

    === SWAP HERE for a custom-trained model ===
    To use your own fine-tuned model later, replace `_load_model()` with a loader
    that returns a model exposing `encode_image(tensor) -> features` and either:
      - matching text features (same encode_text path), or
      - a direct logits head over `self.categories` (drop the text-encoding
        block in __init__ and update classify() accordingly).
    """

    CATEGORIES = [
        "T-Shirt", "Shirt", "Sweater", "Jacket", "Coat",
        "Pants", "Jeans", "Shorts", "Skirt", "Dress",
        "Shoes", "Sneakers", "Boots", "Sandals",
        "Accessories", "Hat", "Scarf", "Belt",
    ]

    STYLES = ["Casual", "Formal", "Athletic", "Streetwear", "Business"]

    COLOR_MAP = {
        "Black": (10, 10, 10),
        "White": (245, 245, 245),
        "Gray": (128, 128, 128),
        "Red": (200, 30, 30),
        "Blue": (40, 70, 200),
        "Green": (40, 140, 60),
        "Yellow": (240, 220, 60),
        "Orange": (230, 140, 40),
        "Purple": (120, 50, 150),
        "Pink": (235, 160, 180),
        "Brown": (120, 75, 40),
        "Beige": (220, 200, 170),
        "Navy": (20, 30, 80),
        "Teal": (30, 130, 130),
    }

    def __init__(self):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model, self.preprocess = self._load_model()
        self.tokenizer = open_clip.get_tokenizer("ViT-B-32")
        self.model.to(self.device).eval()

        category_prompts = [
            f"a photo of a {c.lower().replace('-', ' ')}, a clothing item"
            for c in self.CATEGORIES
        ]
        style_prompts = [f"a {s.lower()} style clothing item" for s in self.STYLES]

        with torch.no_grad():
            self.cat_features = self._encode_text(category_prompts)
            self.style_features = self._encode_text(style_prompts)

    def _load_model(self) -> Tuple[torch.nn.Module, callable]:
        model, _, preprocess = open_clip.create_model_and_transforms(
            "ViT-B-32", pretrained="openai"
        )
        return model, preprocess

    def _encode_text(self, prompts: List[str]) -> torch.Tensor:
        tokens = self.tokenizer(prompts).to(self.device)
        feats = self.model.encode_text(tokens)
        feats = feats / feats.norm(dim=-1, keepdim=True)
        return feats

    def classify(self, image_path: str) -> Dict:
        try:
            image = Image.open(image_path).convert("RGB")
            img_tensor = self.preprocess(image).unsqueeze(0).to(self.device)

            with torch.no_grad():
                img_features = self.model.encode_image(img_tensor)
                img_features = img_features / img_features.norm(dim=-1, keepdim=True)
                cat_logits = (100.0 * img_features @ self.cat_features.T).softmax(dim=-1)[0]
                style_logits = (100.0 * img_features @ self.style_features.T).softmax(dim=-1)[0]

            cat_idx = int(cat_logits.argmax().item())
            style_idx = int(style_logits.argmax().item())
            category = self.CATEGORIES[cat_idx]
            confidence = float(cat_logits[cat_idx].item())
            style = self.STYLES[style_idx]

            return {
                "category": category,
                "subcategory": self._get_subcategory(category),
                "confidence": round(confidence * 100, 2),
                "colors": self.extract_colors(image),
                "season": self._determine_season(category),
                "style": style,
            }
        except Exception as e:
            print(f"Classification error: {e}")
            return {
                "category": "T-Shirt",
                "subcategory": "Top",
                "confidence": 0.0,
                "colors": ["Gray"],
                "season": "All-Season",
                "style": "Casual",
            }

    def extract_colors(self, image: Image.Image, num_colors: int = 2) -> List[str]:
        """Extract dominant garment colors, ignoring background pixels.

        Uses rembg (U²-Net) to mask out the background, then votes a color
        name per pixel and returns the most common labels. K-means centroids
        wash out shaded garments — averaging green pixels at varying
        brightness can produce a desaturated centroid that buckets as "Gray".
        Voting per pixel and aggregating labels is robust to that.
        """
        try:
            pixels = self._garment_pixels(image)
            if pixels is None or len(pixels) < 50:
                return ["Gray"]

            rng = np.random.default_rng(0)
            if len(pixels) > 4000:
                pixels = pixels[rng.choice(len(pixels), 4000, replace=False)]

            votes: Dict[str, int] = {}
            for p in pixels:
                name = self._closest_color(p)
                votes[name] = votes.get(name, 0) + 1

            total = sum(votes.values())
            ordered = sorted(votes.items(), key=lambda kv: -kv[1])

            picked: List[str] = []
            for name, count in ordered:
                if count / total < 0.08 and picked:
                    break
                picked.append(name)
                if len(picked) >= num_colors:
                    break

            return picked or ["Gray"]
        except Exception as e:
            print(f"Color extraction error: {e}")
            return ["Gray"]

    def _garment_pixels(self, image: Image.Image) -> Optional[np.ndarray]:
        """Return the flat (N,3) array of pixels belonging to the garment.

        Tries background removal first; falls back to a center crop if that
        fails. Pixels are downsampled to ~96px on the long side for speed.
        """
        thumb = image.copy()
        thumb.thumbnail((256, 256))

        session = _get_rembg_session()
        if session is not None:
            try:
                from rembg import remove
                cutout = remove(thumb, session=session)  # RGBA
                arr = np.array(cutout)
                rgb = arr[..., :3]
                alpha = arr[..., 3]
                mask = alpha > 200  # solidly-foreground pixels only
                if mask.sum() > 200:
                    return rgb[mask].astype(np.float32)
            except Exception as e:
                print(f"rembg failed, falling back: {e}")

        # Fallback: center crop (skip typical studio borders)
        w, h = thumb.size
        cx, cy = w // 2, h // 2
        half = int(0.30 * min(w, h))
        cropped = thumb.crop((cx - half, cy - half, cx + half, cy + half))
        return np.array(cropped).reshape(-1, 3).astype(np.float32)

    def _closest_color(self, rgb: np.ndarray) -> str:
        """Classify a pixel/cluster centroid into a named color via HSV.

        RGB-distance against a tiny palette fails on muted clothing tones
        (olive, sage, dusty pink, navy) because they sit closer to "Gray" than
        to any saturated reference. Bucketing by hue first — with separate
        achromatic/dark/light rules — matches human perception better.
        """
        r, g, b = float(rgb[0]) / 255.0, float(rgb[1]) / 255.0, float(rgb[2]) / 255.0
        h, s, v = colorsys.rgb_to_hsv(r, g, b)
        h_deg = h * 360.0

        if v < 0.18:
            return "Black"
        if s < 0.07:
            if v > 0.85:
                return "White"
            if v < 0.45:
                return "Black"
            return "Gray"
        if s < 0.22 and v > 0.75 and 25 <= h_deg <= 65:
            return "Beige"

        if h_deg < 15 or h_deg >= 345:
            return "Red"
        if h_deg < 35:
            if v < 0.55 and s < 0.85:
                return "Brown"
            return "Orange"
        if h_deg < 50:
            if v < 0.55 and s < 0.45:
                return "Brown"
            if v < 0.55:
                return "Green"
            if s < 0.35 and v > 0.7:
                return "Beige"
            return "Orange"
        if h_deg < 70:
            if v < 0.55 and s < 0.55:
                return "Brown"
            if v < 0.55:
                return "Green"
            return "Yellow"
        if h_deg < 170:
            return "Green"
        if h_deg < 200:
            return "Teal"
        if h_deg < 255:
            if v < 0.35:
                return "Navy"
            return "Blue"
        if h_deg < 295:
            return "Purple"
        return "Pink"

    def _get_subcategory(self, category: str) -> str:
        tops = {"T-Shirt", "Shirt", "Sweater", "Jacket", "Coat"}
        bottoms = {"Pants", "Jeans", "Shorts", "Skirt"}
        dresses = {"Dress"}
        shoes = {"Shoes", "Sneakers", "Boots", "Sandals"}
        accessories = {"Accessories", "Hat", "Scarf", "Belt"}
        if category in tops: return "Top"
        if category in bottoms: return "Bottom"
        if category in dresses: return "Dress"
        if category in shoes: return "Footwear"
        if category in accessories: return "Accessory"
        return "Other"

    def _determine_season(self, category: str) -> str:
        warm = {"Coat", "Sweater", "Jacket", "Boots", "Scarf"}
        cool = {"Shorts", "T-Shirt", "Sandals", "Skirt"}
        if category in warm: return "Winter"
        if category in cool: return "Summer"
        return "All-Season"
