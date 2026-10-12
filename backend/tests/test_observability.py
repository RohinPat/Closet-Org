"""Sentry stays off without a DSN and never sends bodies/PII when on."""

from __future__ import annotations

import observability


def test_sentry_disabled_without_dsn(monkeypatch) -> None:
    monkeypatch.delenv("SENTRY_DSN", raising=False)
    monkeypatch.setattr(observability, "_enabled", False)
    assert observability.init_sentry() is False
    observability.set_user_id(1)  # no-op, must not raise


def test_sentry_init_privacy_options(monkeypatch) -> None:
    import sentry_sdk

    captured = {}
    monkeypatch.setenv("SENTRY_DSN", "https://public@example.ingest.sentry.io/1")
    monkeypatch.setattr(sentry_sdk, "init", lambda **kw: captured.update(kw))
    monkeypatch.setattr(observability, "_enabled", False)

    assert observability.init_sentry() is True
    assert captured["send_default_pii"] is False
    assert captured["max_request_body_size"] == "never"
    assert captured["traces_sample_rate"] == 0
