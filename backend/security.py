"""Cross-cutting security primitives.

Anything that's a defense-in-depth control (rate limiting, header hardening,
upload validation, password policy) lives here so the route layer stays
focused on business logic.

Single-instance assumptions: the rate limiter is in-process. If this app ever
fans out to multiple uvicorn workers behind a load balancer, swap it for a
Redis-backed limiter — otherwise each worker enforces its own window.
"""
from __future__ import annotations

import os
import re
import secrets
import time
from collections import defaultdict, deque
from pathlib import Path
from threading import Lock
from typing import Deque, Dict, Optional

from fastapi import HTTPException, Request, UploadFile
from PIL import Image, UnidentifiedImageError
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response


# ---- Environment / settings --------------------------------------------------

PRODUCTION = os.getenv("CLOSET_ENV", "development").lower() == "production"

# Max bytes any single HTTP request may carry. Generous default for
# multi-photo uploads; tighten in production if you have a reverse proxy
# enforcing its own cap.
MAX_REQUEST_BYTES = int(os.getenv("MAX_REQUEST_BYTES", str(25 * 1024 * 1024)))

# Max bytes per uploaded image file inside that request.
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(15 * 1024 * 1024)))

_default_origins = "http://localhost:8000,http://127.0.0.1:8000"
if not PRODUCTION:
    # Expo / Metro dev ports (8084 etc.) + legacy Expo defaults.
    _dev_ports = (8081, 8082, 8083, 8084, 8085, 8086, 19000, 19006)
    _pairs = []
    for _p in _dev_ports:
        _pairs.extend(
            [f"http://localhost:{_p}", f"http://127.0.0.1:{_p}"]
        )
    _default_origins += "," + ",".join(_pairs)
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv("ALLOWED_ORIGINS", _default_origins).split(",")
    if o.strip()
]


# ---- Security headers --------------------------------------------------------

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Set conservative defaults on every response.

    CSP is tuned for the FastAPI-served vanilla-JS frontend, which uses
    inline style attributes (color swatches, progress bars) but no inline
    scripts. The mobile app doesn't go through CSP.

    /uploads/ gets its own ultra-strict CSP — anything served from there
    must be treated as untrusted media, never as code.
    """

    # Inter is self-hosted under /frontend/fonts/ — no fonts.googleapis.com needed.
    # Do not add script-src 'unsafe-eval'; nothing in our frontend uses eval().
    _APP_CSP = (
        "default-src 'self'; "
        "img-src 'self' data: blob:; "
        "style-src 'self' 'unsafe-inline'; "
        "style-src-elem 'self'; "
        "script-src 'self'; "
        "connect-src 'self'; "
        "font-src 'self' data:; "
        "object-src 'none'; "
        "base-uri 'self'; "
        "frame-ancestors 'none'; "
        "form-action 'self'"
    )

    _UPLOAD_CSP = (
        "default-src 'none'; "
        "img-src 'self' data:; "
        "style-src 'none'; "
        "script-src 'none'; "
        "sandbox"
    )

    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        h = response.headers
        h.setdefault("X-Content-Type-Options", "nosniff")
        h.setdefault("X-Frame-Options", "DENY")
        h.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        h.setdefault(
            "Permissions-Policy",
            "geolocation=(), microphone=(), camera=(), payment=()",
        )
        h.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        h.setdefault("Cross-Origin-Resource-Policy", "same-site")
        if PRODUCTION:
            h.setdefault(
                "Strict-Transport-Security",
                "max-age=63072000; includeSubDomains; preload",
            )
        if request.url.path.startswith("/uploads/"):
            h["Content-Security-Policy"] = self._UPLOAD_CSP
            h["Content-Disposition"] = "inline"
        else:
            h.setdefault("Content-Security-Policy", self._APP_CSP)
        return response


# ---- Body-size cap -----------------------------------------------------------

class BodyLimitMiddleware(BaseHTTPMiddleware):
    """Reject oversized requests cheaply, before they fan out into routes."""

    def __init__(self, app, max_bytes: int = MAX_REQUEST_BYTES):
        super().__init__(app)
        self.max_bytes = max_bytes

    async def dispatch(self, request: Request, call_next):
        cl = request.headers.get("content-length")
        if cl is not None:
            try:
                if int(cl) > self.max_bytes:
                    raise HTTPException(
                        status_code=413, detail="Request body too large"
                    )
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid Content-Length")
        return await call_next(request)


# ---- Rate limiter (sliding window, in-process) -------------------------------

class _Bucket:
    __slots__ = ("times",)

    def __init__(self) -> None:
        self.times: Deque[float] = deque()


class InMemoryRateLimiter:
    """Sliding-window counter. Single-process only — see module docstring."""

    def __init__(self) -> None:
        self._buckets: Dict[str, _Bucket] = defaultdict(_Bucket)
        self._lock = Lock()

    def check(self, key: str, limit: int, window_seconds: float) -> None:
        now = time.monotonic()
        cutoff = now - window_seconds
        with self._lock:
            b = self._buckets[key]
            while b.times and b.times[0] < cutoff:
                b.times.popleft()
            if len(b.times) >= limit:
                retry_in = max(1, int(b.times[0] + window_seconds - now))
                raise HTTPException(
                    status_code=429,
                    detail="Too many requests",
                    headers={"Retry-After": str(retry_in)},
                )
            b.times.append(now)


rate_limiter = InMemoryRateLimiter()


def client_ip(request: Request) -> str:
    """Best-effort caller IP. Only honour X-Forwarded-For when explicitly
    opted in — otherwise a client can spoof it directly against uvicorn.
    """
    if os.getenv("TRUST_PROXY_HEADERS") == "1":
        fwd = request.headers.get("x-forwarded-for")
        if fwd:
            return fwd.split(",")[0].strip()
    return request.client.host if request.client else "anonymous"


def rate_limit(request: Request, route: str, *, limit: int, window: float) -> None:
    """Apply a route-scoped rate limit keyed by caller IP."""
    if os.getenv("CLOSET_E2E") == "1":
        return
    rate_limiter.check(
        f"{client_ip(request)}::{route}", limit=limit, window_seconds=window
    )


# ---- Image upload validation -------------------------------------------------

def _detect_image_extension(blob: bytes) -> Optional[str]:
    """Magic-byte sniffer. We don't trust client-supplied Content-Type."""
    if not blob:
        return None
    if blob[:3] == b"\xff\xd8\xff":
        return "jpg"
    if blob[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if blob[:6] in (b"GIF87a", b"GIF89a"):
        return "gif"
    if len(blob) >= 12 and blob[:4] == b"RIFF" and blob[8:12] == b"WEBP":
        return "webp"
    if len(blob) >= 12 and blob[4:8] == b"ftyp":
        brand = blob[8:12]
        if brand in (b"heic", b"heix", b"mif1", b"heis", b"hevc", b"hevx", b"avif"):
            return "heic" if brand != b"avif" else "avif"
    return None


def save_uploaded_image(
    upload: UploadFile,
    dest_dir: Path,
    *,
    prefix: str = "img",
    max_bytes: int = MAX_UPLOAD_BYTES,
) -> Path:
    """Validate an uploaded image and write it to disk under a server-chosen
    filename. Returns the saved Path.

    Defenses:
      * size cap enforced while streaming (no unbounded `read()`)
      * filename comes from a CSPRNG token — client name is discarded, which
        kills the path-traversal class entirely
      * content type identified by magic bytes, never trust client MIME
      * PIL re-validation catches truncation and decompression bombs
      * the saved extension is bound to the detected type so a renamed .html
        can't survive as something the browser will execute

    Raises HTTPException on any rejection — call sites just bubble up.
    """
    dest_dir.mkdir(parents=True, exist_ok=True)

    token = secrets.token_urlsafe(24)
    tmp_path = dest_dir / f".{prefix}_{token}.tmp"
    total = 0
    try:
        with tmp_path.open("wb") as out:
            while True:
                chunk = upload.file.read(64 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > max_bytes:
                    raise HTTPException(status_code=413, detail="Image too large")
                out.write(chunk)

        if total == 0:
            raise HTTPException(status_code=400, detail="Empty file")

        with tmp_path.open("rb") as fh:
            head = fh.read(32)
        ext = _detect_image_extension(head)
        if ext is None:
            raise HTTPException(status_code=400, detail="Unsupported image format")

        try:
            # Pillow will raise on malformed or truncated images. We cap the
            # decoded pixel count to defuse decompression bombs.
            Image.MAX_IMAGE_PIXELS = 64_000_000  # ~64 megapixels
            with Image.open(tmp_path) as im:
                im.verify()
        except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
            raise HTTPException(status_code=400, detail="Invalid image data") from exc

        final_path = dest_dir / f"{prefix}_{token}.{ext}"
        tmp_path.replace(final_path)
        return final_path
    except HTTPException:
        tmp_path.unlink(missing_ok=True)
        raise
    except Exception:
        tmp_path.unlink(missing_ok=True)
        raise
    finally:
        try:
            upload.file.close()
        except Exception:
            pass


def safe_uploads_url(saved_path: Optional[object], uploads_dir: Path) -> Optional[str]:
    """Map a server-side path to a /uploads/<name> URL, *after* confirming
    the path is actually inside uploads_dir. Defence against ever serving a
    file outside the configured uploads directory.
    """
    if not saved_path:
        return None
    p = Path(str(saved_path)).resolve()
    try:
        p.relative_to(uploads_dir.resolve())
    except ValueError:
        return None
    return f"/uploads/{p.name}"


# ---- Password policy ---------------------------------------------------------

MIN_PASSWORD_LEN = 10
MAX_PASSWORD_LEN = 256


def validate_password(password: str, *, username: Optional[str] = None) -> None:
    """Reject obviously weak passwords. Catches the bottom decile without
    layering on so many rules that users pick `Password1!` to comply.
    """
    if not isinstance(password, str):
        raise HTTPException(status_code=400, detail="Password must be text")
    if len(password) < MIN_PASSWORD_LEN:
        raise HTTPException(
            status_code=400,
            detail=f"Password must be at least {MIN_PASSWORD_LEN} characters",
        )
    if len(password) > MAX_PASSWORD_LEN:
        # bcrypt silently ignores bytes past offset 72; cap aggressively so
        # users aren't fooled into thinking a 500-char passphrase helps.
        raise HTTPException(
            status_code=400,
            detail=f"Password must be at most {MAX_PASSWORD_LEN} characters",
        )
    classes = sum(
        [
            any(c.islower() for c in password),
            any(c.isupper() for c in password),
            any(c.isdigit() for c in password),
            any(not c.isalnum() for c in password),
        ]
    )
    if classes < 2:
        raise HTTPException(
            status_code=400,
            detail="Password must mix at least two of: lowercase, uppercase, digits, symbols",
        )
    if username and username.lower() in password.lower():
        raise HTTPException(
            status_code=400, detail="Password must not contain your username"
        )


# ---- Username / email normalization ------------------------------------------

_USERNAME_RE = re.compile(r"^[a-zA-Z0-9_.\-]{3,30}$")
_RESERVED_USERNAMES = {
    "admin", "administrator", "root", "system", "support", "help",
    "moderator", "mod", "api", "null", "undefined", "anonymous",
}


def normalize_username(raw: str) -> str:
    """Trim, lowercase, validate. We lowercase before storing/lookup so a
    user can't register both `Bob` and `bob`."""
    if not isinstance(raw, str):
        raise HTTPException(status_code=400, detail="Username must be text")
    u = raw.strip()
    if not _USERNAME_RE.match(u):
        raise HTTPException(
            status_code=400,
            detail="Username must be 3-30 chars: letters, digits, underscore, hyphen, dot",
        )
    lower = u.lower()
    if lower in _RESERVED_USERNAMES:
        raise HTTPException(status_code=400, detail="That username is reserved")
    return lower


def normalize_email(raw: str) -> str:
    return raw.strip().lower()


# ---- Bounded string sanitation ----------------------------------------------

def clip_text(value: Optional[str], *, max_len: int) -> Optional[str]:
    """Trim and truncate free-text input. Returns None for empty/whitespace.

    We don't HTML-escape here — that's a *rendering* concern, not a storage
    one. The frontend is responsible for not interpolating raw user input
    into innerHTML.
    """
    if value is None:
        return None
    if not isinstance(value, str):
        raise HTTPException(status_code=400, detail="Expected text")
    s = value.strip()
    if not s:
        return None
    if len(s) > max_len:
        s = s[:max_len]
    return s
