"""Tests for generated bulk-item placeholder artwork."""

from __future__ import annotations

from pathlib import Path

import pytest

from bulk_placeholders import (
    bulk_placeholder_kind,
    bulk_placeholder_paths,
    ensure_bulk_placeholder_file,
)


def test_bulk_placeholder_kind_keywords() -> None:
    assert bulk_placeholder_kind("White crew socks", "Footwear") == "socks"
    assert bulk_placeholder_kind("Boxers", "Other") == "underwear"
    assert bulk_placeholder_kind("Undershirts pack", "Top") == "undershirt"
    assert bulk_placeholder_kind("Plain tee", "Top") == "tee"
    assert bulk_placeholder_kind("Mystery", "Footwear") == "socks"
    assert bulk_placeholder_kind("Mystery", "Accessory") == "basic"


def test_ensure_bulk_placeholder_file_idempotent(tmp_path: Path) -> None:
    p = ensure_bulk_placeholder_file(tmp_path, "underwear")
    assert p.is_file()
    size = p.stat().st_size
    ensure_bulk_placeholder_file(tmp_path, "underwear")
    assert p.stat().st_size == size


def test_bulk_placeholder_paths_match(tmp_path: Path) -> None:
    a, b = bulk_placeholder_paths(tmp_path, "socks", "Footwear")
    assert a == b
    assert Path(a).is_file()
