"""Upload pipeline speedups: vectorized colors, cutout reuse, shared CLIP features.

The real CLIP / U2-Net models aren't loaded; the classifier is built without
__init__ and given small stand-ins where a model would run.
"""

from __future__ import annotations

import numpy as np
import torch
from PIL import Image

import models.clothing_classifier as cc


def _bare_classifier() -> cc.ClothingClassifier:
    return object.__new__(cc.ClothingClassifier)


def test_single_pixel_helper_matches_vectorized() -> None:
    clf = _bare_classifier()
    pixels = np.random.default_rng(7).integers(0, 256, size=(500, 3)).astype(np.float32)
    assert [clf._closest_color(p) for p in pixels] == clf._closest_colors(pixels).tolist()


def test_colors_come_from_the_existing_cutout_mask(tmp_path, monkeypatch) -> None:
    clf = _bare_classifier()
    # If background removal ran, this would blow up.
    monkeypatch.setattr(cc, "_get_rembg_session", lambda: (_ for _ in ()).throw(AssertionError("rembg ran")))

    photo = Image.new("RGB", (400, 400), (250, 250, 250))  # white studio backdrop
    cut = Image.new("RGBA", (400, 400), (0, 0, 0, 0))
    cut.paste((200, 30, 30, 255), (100, 100, 300, 300))  # red garment
    cut_path = tmp_path / "x.thumb.png"
    cut.save(cut_path)

    assert clf.extract_colors(photo, cutout_path=str(cut_path)) == ["Red"]


def test_missing_cutout_falls_back_to_center_crop(tmp_path, monkeypatch) -> None:
    clf = _bare_classifier()
    monkeypatch.setattr(cc, "_get_rembg_session", lambda: None)
    photo = Image.new("RGB", (300, 300), (30, 136, 229))  # clearly "Blue"
    assert clf.extract_colors(photo, cutout_path=str(tmp_path / "nope.png")) == ["Blue"]


class _CountingModel:
    def __init__(self) -> None:
        self.calls = 0

    def encode_image(self, tensor):
        self.calls += 1
        return torch.ones(1, 4)


def test_classify_and_embedding_share_one_clip_pass(tmp_path) -> None:
    clf = _bare_classifier()
    clf.device = torch.device("cpu")
    clf.model = _CountingModel()
    clf.preprocess = lambda im: torch.zeros(3, 8, 8)
    path = tmp_path / "item.jpg"
    Image.new("RGB", (32, 32), (90, 90, 90)).save(path)

    first = clf._image_features(str(path))
    emb = clf.encode_image_embedding(str(path))
    assert clf.model.calls == 1
    assert torch.allclose(first, torch.ones(1, 4) / 2)
    assert emb == [0.5, 0.5, 0.5, 0.5]

    # A changed file is a new cache entry.
    Image.new("RGB", (32, 32), (10, 10, 10)).save(path)
    import os
    st = path.stat()
    os.utime(path, ns=(st.st_atime_ns, st.st_mtime_ns + 1_000_000))
    clf._image_features(str(path))
    assert clf.model.calls == 2
