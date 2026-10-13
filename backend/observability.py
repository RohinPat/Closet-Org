"""Optional error reporting (Sentry). A no-op unless ``SENTRY_DSN`` is set.

Privacy: no request bodies (passwords, free text) and no default PII are sent;
events are tagged with the numeric user id only.
"""

from __future__ import annotations

import os

_enabled = False


def init_sentry() -> bool:
    global _enabled
    dsn = os.getenv("SENTRY_DSN", "").strip()
    if not dsn:
        return False
    import sentry_sdk

    sentry_sdk.init(
        dsn=dsn,
        environment=os.getenv("CLOSET_ENV", "development"),
        send_default_pii=False,
        max_request_body_size="never",
        traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0") or 0),
    )
    _enabled = True
    return True


def set_user_id(user_id: int) -> None:
    if _enabled:
        import sentry_sdk

        sentry_sdk.set_user({"id": str(user_id)})
