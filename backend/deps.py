"""Shared app state used by every router: DB handle, models, paths.

Tests monkeypatch attributes here (``deps.db``, ``deps.get_classifier``,
``deps.weather_provider``, ``deps.UPLOAD_DIR``), so route code always reads
them as ``deps.<name>`` at call time.
"""

from __future__ import annotations

import threading
from models.outfit_recommender import OutfitRecommender
from pathlib import Path
from database.db_manager import get_db
from models.weather_service import weather_provider  # noqa: F401 (patched in tests)


# ---- Globals -----------------------------------------------------------------



db = get_db()


outfit_recommender = OutfitRecommender()


_classifier = None


_classifier_lock = threading.Lock()


def get_classifier():
    """Lazy, thread-safe CLIP singleton (routes run in FastAPI's threadpool)."""
    global _classifier
    if _classifier is None:
        with _classifier_lock:
            if _classifier is None:
                from models.clothing_classifier import ClothingClassifier

                _classifier = ClothingClassifier()
    return _classifier


BASE_DIR = Path(__file__).resolve().parent.parent


UPLOAD_DIR = BASE_DIR / "uploads"


FRONTEND_DIR = BASE_DIR / "frontend"


UPLOAD_DIR.mkdir(exist_ok=True)
