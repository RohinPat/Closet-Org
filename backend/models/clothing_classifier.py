import torch
import open_clip
from PIL import Image
import numpy as np
from typing import Dict, List, Tuple, Optional
import threading
import warnings
from collections import OrderedDict
from pathlib import Path
warnings.filterwarnings('ignore')

# Routes run in FastAPI's threadpool, so several requests can reach the models
# at once. Model *inference* is serialized: torch already uses every core for
# one forward pass, and running several in parallel on the small prod VM only
# multiplies peak memory. Non-model requests are unaffected.
_inference_lock = threading.Lock()
_rembg_init_lock = threading.Lock()
_rembg_session = None

def _get_rembg_session():
    """Lazy-load the background-removal model. Returns None if rembg unavailable."""
    global _rembg_session
    if _rembg_session is None:
        with _rembg_init_lock:
            if _rembg_session is None:
                try:
                    from rembg import new_session
                    _rembg_session = new_session("u2netp")  # small/fast variant
                except Exception as e:
                    print(f"rembg unavailable, falling back to center crop: {e}")
                    _rembg_session = False
    if _rembg_session is False:
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
        with _inference_lock:
            cutout = remove(img, session=session)
        cutout.save(output_path, "PNG")
        return True
    except Exception as e:
        print(f"Thumbnail generation failed for {input_path}: {e}")
        return False


# ---- Color naming -------------------------------------------------------------
# Reference swatches for each app color (several per name: light, dark and
# muted variants). Taken from the Material Design palette and common fashion
# references rather than fitted to the test colors.
_COLOR_SWATCHES = {
    "Red": ["#e53935", "#c62828", "#b71c1c", "#ff3b30", "#7f1d1d"],
    "Pink": ["#f8bbd0", "#f48fb1", "#f06292", "#e91e63", "#ff80ab", "#c2185b", "#e8a0a8"],
    "Purple": ["#9c27b0", "#6a1b9a", "#4a148c", "#ce93d8", "#7e57c2", "#5e3a6e", "#b39ddb"],
    "Blue": ["#1e88e5", "#1565c0", "#64b5f6", "#90caf9", "#3f51b5", "#5c7fa8", "#0d47a1"],
    "Navy": ["#1a237e", "#0d1b3e", "#1f2d4d", "#14143c", "#283655", "#0a1a7a"],
    "Teal": ["#00897b", "#004d40", "#4db6ac", "#00acc1", "#26c6da", "#006064"],
    "Green": ["#43a047", "#1b5e20", "#81c784", "#689f38", "#556b2f", "#827717", "#7d8471", "#2e4d32"],
    "Yellow": ["#fdd835", "#ffeb3b", "#fff176", "#f9a825", "#fbc02d", "#f0e68c"],
    "Orange": ["#fb8c00", "#ef6c00", "#ffb74d", "#f4511e", "#e65100", "#ffa000"],
    "Brown": ["#6d4c41", "#4e342e", "#3e2723", "#8d6e63", "#a1887f", "#8b5a2b", "#a0522d", "#5d4037"],
    "Beige": ["#f5f0e1", "#efe6d2", "#e8dcc4", "#d6c7a1", "#ddd0b4"],
}
_LIGHTNESS_WEIGHT = 0.5   # lightness matters less than hue for naming
_NEUTRAL_CHROMA = 9.0     # below this a color reads as black/gray/white
_BLACK_L = 24.0
_WHITE_L = 90.0
_ALWAYS_BLACK_L = 10.0    # too dark to name a hue


def _rgb_to_lab(rgb: np.ndarray) -> np.ndarray:
    """sRGB (0-255, shape (N, 3)) -> CIELAB (D65)."""
    c = rgb / 255.0
    lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    m = np.array([[0.4124564, 0.3575761, 0.1804375],
                  [0.2126729, 0.7151522, 0.0721750],
                  [0.0193339, 0.1191920, 0.9503041]])
    xyz = lin @ m.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 216 / 24389, np.cbrt(xyz), (24389 / 27 * xyz + 16) / 116)
    return np.stack([116 * f[:, 1] - 16, 500 * (f[:, 0] - f[:, 1]), 200 * (f[:, 1] - f[:, 2])], axis=1)


def _hex_rgb(h: str):
    return [int(h[i:i + 2], 16) for i in (1, 3, 5)]


_PROTO_NAMES = np.array([n for n, hexes in _COLOR_SWATCHES.items() for _ in hexes])
_PROTO_LAB = _rgb_to_lab(np.array([_hex_rgb(h) for hexes in _COLOR_SWATCHES.values() for h in hexes], dtype=np.float64))


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

    _FEATURE_CACHE_SIZE = 16

    def _image_features(self, image_path: str, image: Optional[Image.Image] = None) -> torch.Tensor:
        """L2-normalized CLIP image features, cached per file version.

        Uploads call classify() and then encode_image_embedding() on the same
        photo; caching means one CLIP forward pass instead of two.
        """
        path = Path(image_path)
        key = (str(path.resolve()), path.stat().st_mtime_ns)
        cache = self.__dict__.setdefault("_feature_cache", OrderedDict())
        lock = self.__dict__.setdefault("_feature_cache_lock", threading.Lock())
        with lock:
            hit = cache.get(key)
            if hit is not None:
                cache.move_to_end(key)
                return hit
        if image is None:
            image = Image.open(path).convert("RGB")
        img_tensor = self.preprocess(image).unsqueeze(0).to(self.device)
        with _inference_lock, torch.no_grad():
            feats = self.model.encode_image(img_tensor)
            feats = feats / feats.norm(dim=-1, keepdim=True)
        with lock:
            cache[key] = feats
            while len(cache) > self._FEATURE_CACHE_SIZE:
                cache.popitem(last=False)
        return feats

    def classify(self, image_path: str, cutout_path: Optional[str] = None) -> Dict:
        """Category/style via CLIP, colors from the garment pixels.

        Pass ``cutout_path`` (the background-removed PNG made at upload) to
        reuse its mask for color extraction instead of running U2-Net again.
        """
        try:
            image = Image.open(image_path).convert("RGB")
            img_features = self._image_features(image_path, image)
            with torch.no_grad():
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
                "colors": self.extract_colors(image, cutout_path=cutout_path),
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

    def extract_colors(
        self, image: Image.Image, num_colors: int = 2, cutout_path: Optional[str] = None
    ) -> List[str]:
        """Extract dominant garment colors, ignoring background pixels.

        Uses rembg (U²-Net) to mask out the background, then votes a color
        name per pixel and returns the most common labels. K-means centroids
        wash out shaded garments — averaging green pixels at varying
        brightness can produce a desaturated centroid that buckets as "Gray".
        Voting per pixel and aggregating labels is robust to that.
        """
        try:
            pixels = self._garment_pixels(image, cutout_path=cutout_path)
            if pixels is None or len(pixels) < 50:
                return ["Gray"]

            rng = np.random.default_rng(0)
            if len(pixels) > 4000:
                pixels = pixels[rng.choice(len(pixels), 4000, replace=False)]

            names, counts = np.unique(self._closest_colors(pixels), return_counts=True)
            total = int(counts.sum())
            # Most votes first; ties broken by name so the result is stable.
            ordered = sorted(zip(names.tolist(), counts.tolist()), key=lambda kv: (-kv[1], kv[0]))

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

    def _garment_pixels(
        self, image: Image.Image, cutout_path: Optional[str] = None
    ) -> Optional[np.ndarray]:
        """Return the flat (N,3) array of pixels belonging to the garment.

        Uses the upload's existing cutout when given; otherwise runs
        background removal; falls back to a center crop if both fail.
        Works on a 256px copy for speed.
        """
        if cutout_path and Path(cutout_path).exists():
            try:
                with Image.open(cutout_path) as cut:
                    cut = cut.convert("RGBA")
                    cut.thumbnail((256, 256))
                    arr = np.array(cut)
                mask = arr[..., 3] > 200
                if mask.sum() > 200:
                    return arr[..., :3][mask].astype(np.float32)
            except Exception as e:
                print(f"Cutout reuse failed, recomputing mask: {e}")

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

    def _closest_colors(self, pixels: np.ndarray) -> np.ndarray:
        """Name each (N, 3) RGB pixel with one of the app's 14 colors.

        Pixels are converted to CIELAB, where distances track how people see
        color. Low-chroma pixels are named by lightness (Black / Gray /
        White); the rest take the name of the nearest reference swatch, with
        lightness down-weighted so a shadowed or sunlit fold of the same
        fabric keeps its name.
        """
        lab = _rgb_to_lab(np.asarray(pixels, dtype=np.float64))
        L, a, b = lab[:, 0], lab[:, 1], lab[:, 2]
        chroma = np.hypot(a, b)

        d = (
            ((L[:, None] - _PROTO_LAB[None, :, 0]) * _LIGHTNESS_WEIGHT) ** 2
            + (a[:, None] - _PROTO_LAB[None, :, 1]) ** 2
            + (b[:, None] - _PROTO_LAB[None, :, 2]) ** 2
        )
        names = _PROTO_NAMES[np.argmin(d, axis=1)]

        neutral = np.where(L < _BLACK_L, "Black", np.where(L > _WHITE_L, "White", "Gray"))
        is_neutral = (chroma < _NEUTRAL_CHROMA) | (L < _ALWAYS_BLACK_L)
        return np.where(is_neutral, neutral, names)

    def _closest_color(self, rgb: np.ndarray) -> str:
        """Single-pixel convenience wrapper around ``_closest_colors``."""
        return str(self._closest_colors(np.asarray(rgb, dtype=np.float64).reshape(1, 3))[0])

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

    def encode_image_embedding(self, image_path: str) -> Optional[List[float]]:
        """L2-normalized CLIP image vector for visual similarity search."""
        try:
            feats = self._image_features(image_path)
            return [float(x) for x in feats.cpu().numpy().flatten()]
        except Exception as e:
            print(f"CLIP embedding error: {e}")
            return None
