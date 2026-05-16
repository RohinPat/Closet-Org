"""Pytest fixtures: isolated DB per test, patched ``get_db``, cleared rate limits."""

from __future__ import annotations

import os

# JWT secret must exist before ``auth`` / ``main`` are imported (auth reads at import time).
os.environ.setdefault(
    "CLOSET_SECRET_KEY",
    "pytest-jwt-signing-secret-do-not-use-in-production-min-32",
)

import pytest

from closet_org_pytest_helpers import FakeClassifier, FakeWeatherProvider

from database import db_manager as dm


@pytest.fixture(autouse=True)
def _clear_rate_limits() -> None:
    """Rate limiter state is process-global; reset between tests."""
    import security

    security.rate_limiter._buckets.clear()
    yield
    security.rate_limiter._buckets.clear()


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch, tmp_path):
    """FastAPI TestClient with isolated DB + deterministic weather / classifier."""
    db_path = str(tmp_path / "closet_test.sqlite")
    fresh = dm.DatabaseManager(db_path)
    monkeypatch.setattr(dm, "get_db", lambda: fresh)

    import auth as auth_mod

    # ``auth`` binds ``get_db`` at import time — patch its reference too, not only ``database.db_manager``.
    monkeypatch.setattr(auth_mod, "get_db", lambda: fresh)

    import models.clothing_classifier as clothing_classifier

    monkeypatch.setattr(clothing_classifier, "generate_cutout_thumbnail", lambda *a, **k: False)

    import main as main_module

    monkeypatch.setattr(main_module, "db", fresh)
    monkeypatch.setattr(main_module, "weather_provider", FakeWeatherProvider())
    _fc = FakeClassifier()
    monkeypatch.setattr(main_module, "get_classifier", lambda: _fc)

    from fastapi.testclient import TestClient

    return TestClient(main_module.app)


@pytest.fixture
def strong_password() -> str:
    """Meets ``validate_password`` (length + character-class rules)."""
    return "Abcd5678ef"

