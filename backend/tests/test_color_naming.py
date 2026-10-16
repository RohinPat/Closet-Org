"""Color naming accuracy on labeled fashion colors (tests/fashion_colors.py).

Floors sit a little under measured accuracy so real regressions fail without
making the test brittle. Before the CIELAB model the old hue rules scored
70% / 62% / 67% on the same three checks.
"""

from __future__ import annotations

import numpy as np
import pytest

import models.clothing_classifier as cc
from fashion_colors import FASHION_COLORS, hex_to_rgb

CLF = object.__new__(cc.ClothingClassifier)
RGB = np.array([hex_to_rgb(h) for _, h, _ in FASHION_COLORS], dtype=np.float32)
WANT = [w for _, _, w in FASHION_COLORS]


def _accuracy(pixels: np.ndarray) -> float:
    got = CLF._closest_colors(pixels).tolist()
    return sum(g == w for g, w in zip(got, WANT)) / len(WANT)


@pytest.mark.parametrize(
    "label,pixels,floor",
    [
        ("as listed", RGB, 0.88),
        ("in shadow", RGB * 0.8, 0.72),
        ("in highlight", np.clip(RGB * 0.8 + 51, 0, 255), 0.75),
    ],
)
def test_accuracy_floor(label: str, pixels: np.ndarray, floor: float) -> None:
    assert _accuracy(pixels) >= floor, label


@pytest.mark.parametrize(
    "hex_color,expected",
    [
        ("#708238", "Green"),   # olive (was Brown)
        ("#ffc0cb", "Pink"),    # pink (was Red)
        ("#c19a6b", "Brown"),   # camel (was Orange)
        ("#36454f", "Gray"),    # charcoal (was Navy)
        ("#e1ad01", "Yellow"),  # mustard (was Orange)
        ("#800080", "Purple"),  # purple (was Pink)
        ("#1f2a44", "Navy"),    # navy fabric
        ("#c3b091", "Beige"),   # khaki
        ("#fffff0", "White"),   # ivory
    ],
)
def test_names_people_would_notice(hex_color: str, expected: str) -> None:
    assert CLF._closest_color(np.array(hex_to_rgb(hex_color))) == expected


def test_output_stays_in_the_app_vocabulary() -> None:
    vocab = {"Black", "White", "Gray", "Red", "Blue", "Green", "Yellow", "Orange",
             "Purple", "Pink", "Brown", "Beige", "Navy", "Teal"}
    pixels = np.random.default_rng(1).integers(0, 256, size=(5000, 3)).astype(np.float32)
    assert set(CLF._closest_colors(pixels).tolist()) <= vocab
