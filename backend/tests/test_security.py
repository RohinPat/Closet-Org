"""Unit tests for ``security`` helpers (uploads, passwords, normalization)."""

from __future__ import annotations

from io import BytesIO
from pathlib import Path

import pytest
from fastapi import HTTPException
from starlette.datastructures import UploadFile

from security import clip_text, normalize_username, save_uploaded_image, validate_password


# 1×1 PNG (valid magic bytes + PIL-openable)
_MIN_PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082"
)


def test_validate_password_rejects_short() -> None:
    with pytest.raises(HTTPException) as ei:
        validate_password("Aa1")
    assert ei.value.status_code == 400


def test_validate_password_accepts_strong() -> None:
    validate_password("CorrectHorse99")


def test_normalize_username_lowercase() -> None:
    assert normalize_username("Test_User") == "test_user"


def test_normalize_username_rejects_reserved() -> None:
    with pytest.raises(HTTPException) as ei:
        normalize_username("admin")
    assert ei.value.status_code == 400


def test_clip_text_truncates() -> None:
    assert clip_text("  hello  ", max_len=3) == "hel"


def test_save_uploaded_image_accepts_png(tmp_path: Path) -> None:
    upload = UploadFile(
        filename="ignored.png",
        file=BytesIO(_MIN_PNG),
    )
    out = save_uploaded_image(upload, tmp_path, prefix="spec")
    assert out.exists()
    assert out.suffix == ".png"


def test_save_uploaded_image_rejects_garbage(tmp_path: Path) -> None:
    upload = UploadFile(
        filename="x.png",
        file=BytesIO(b"not an image at all"),
    )
    with pytest.raises(HTTPException) as ei:
        save_uploaded_image(upload, tmp_path, prefix="bad")
    assert ei.value.status_code == 400
