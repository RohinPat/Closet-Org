"""Unit tests for ``security`` helpers (uploads, passwords, normalization)."""

from __future__ import annotations

from io import BytesIO
from pathlib import Path

import pytest
from fastapi import HTTPException
from starlette.datastructures import UploadFile

from security import (
    BodyLimitMiddleware,
    _detect_image_extension,
    clip_text,
    normalize_email,
    normalize_username,
    save_uploaded_image,
    safe_uploads_url,
    validate_password,
)


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


def test_validate_password_rejects_too_long() -> None:
    with pytest.raises(HTTPException) as ei:
        validate_password("Aa1" + "x" * 300)
    assert ei.value.status_code == 400
    assert "most" in ei.value.detail.lower()


def test_validate_password_rejects_username_substring() -> None:
    with pytest.raises(HTTPException) as ei:
        validate_password("CorrectHorse99bob", username="BoB")
    assert ei.value.status_code == 400


def test_validate_password_requires_two_character_classes() -> None:
    with pytest.raises(HTTPException) as ei:
        validate_password("alllowerhere")
    assert ei.value.status_code == 400


def test_normalize_username_rejects_non_string() -> None:
    with pytest.raises(HTTPException) as ei:
        normalize_username(123)  # type: ignore[arg-type]
    assert ei.value.status_code == 400


def test_normalize_email_trims_lowercases() -> None:
    assert normalize_email("  Hello@Example.COM  ") == "hello@example.com"


def test_clip_text_none_and_empty() -> None:
    assert clip_text(None, max_len=10) is None
    assert clip_text("   ", max_len=10) is None


def test_clip_text_rejects_non_string() -> None:
    with pytest.raises(HTTPException) as ei:
        clip_text(99, max_len=3)  # type: ignore[arg-type]
    assert ei.value.status_code == 400


def test_detect_image_extension_sniffer() -> None:
    assert _detect_image_extension(b"") is None
    assert _detect_image_extension(b"\xff\xd8\xff\x00") == "jpg"
    assert _detect_image_extension(b"\x89PNG\r\n\x1a\nxxxx") == "png"
    assert _detect_image_extension(b"GIF87a000000") == "gif"
    assert _detect_image_extension(b"GIF89a000000") == "gif"
    riff_webp = b"RIFF\x01\x02\x03\x04WEBP"
    assert len(riff_webp) >= 12
    assert _detect_image_extension(riff_webp) == "webp"
    heic = b"\x00\x00\x00\x20ftypheic"
    assert _detect_image_extension(heic) == "heic"
    avif = b"\x00\x00\x00\x20ftypavif"
    assert _detect_image_extension(avif) == "avif"


def test_safe_uploads_url_only_inside_base(tmp_path: Path) -> None:
    uploads = tmp_path / "up"
    uploads.mkdir()
    good = (uploads / "a.png").resolve()
    good.touch()
    assert safe_uploads_url(good, uploads) == "/uploads/a.png"
    assert safe_uploads_url(None, uploads) is None
    outside = Path(tmp_path / "secret.txt")
    outside.touch()
    assert safe_uploads_url(outside, uploads) is None


def test_save_uploaded_image_rejects_empty(tmp_path: Path) -> None:
    upload = UploadFile(filename="e.png", file=BytesIO(b""))
    with pytest.raises(HTTPException) as ei:
        save_uploaded_image(upload, tmp_path, prefix="e", max_bytes=1024)
    assert ei.value.status_code == 400


def test_save_uploaded_image_rejects_over_max(tmp_path: Path) -> None:
    upload = UploadFile(filename="h.png", file=BytesIO(b"x" * 5000))
    with pytest.raises(HTTPException) as ei:
        save_uploaded_image(upload, tmp_path, prefix="big", max_bytes=100)
    assert ei.value.status_code == 413


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
