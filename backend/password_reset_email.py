"""Optional SMTP delivery for password-reset links."""

from __future__ import annotations

import logging
import os
import smtplib
import ssl
from email.message import EmailMessage

from security import PRODUCTION

logger = logging.getLogger(__name__)


def smtp_configured() -> bool:
    return bool((os.getenv("SMTP_HOST") or "").strip())


def _reset_link(token: str) -> str:
    base = (os.getenv("PASSWORD_RESET_PUBLIC_URL") or "").strip().rstrip("/")
    if base:
        sep = "&" if "?" in base else "?"
        return f"{base}{sep}token={token}"
    return token


def send_password_reset_email(
    to_addr: str, *, username: str, reset_token: str
) -> bool:
    """Send reset instructions. Returns True if handed off to SMTP successfully."""

    host = (os.getenv("SMTP_HOST") or "").strip()
    if not host:
        if not PRODUCTION:
            logger.warning(
                "Password reset for %s (%s): SMTP_HOST not set — "
                "check API response (dev_reset_token) or server log.",
                username,
                to_addr,
            )
            logger.warning("RESET TOKEN (dev, %s): %s", to_addr, reset_token)
        else:
            logger.error(
                "SMTP_HOST is not set; cannot send password reset to %s", to_addr
            )
        return False

    port = int(os.getenv("SMTP_PORT", "587"))
    user = (os.getenv("SMTP_USER") or "").strip()
    password = os.getenv("SMTP_PASSWORD") or ""
    from_addr = (os.getenv("SMTP_FROM") or user or "").strip()
    if not from_addr:
        logger.error("SMTP_FROM (or SMTP_USER) required when SMTP_HOST is set")
        return False

    link_or_token = _reset_link(reset_token)
    subject = "Reset your Closet Org password"
    body = (
        f"Hi {username},\n\n"
        "We received a request to reset your Closet Org password.\n"
        "Use this link or token in the app / reset page:\n\n"
        f"{link_or_token}\n\n"
        "This link expires in about one hour. If you did not ask for this, "
        "you can ignore this email.\n"
    )

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_addr
    msg.set_content(body)

    try:
        context = ssl.create_default_context()
        with smtplib.SMTP(host, port, timeout=30) as smtp:
            smtp.starttls(context=context)
            if user:
                smtp.login(user, password)
            smtp.send_message(msg)
    except OSError as e:
        logger.exception("SMTP failure sending password reset: %s", e)
        return False
    return True
