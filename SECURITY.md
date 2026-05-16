# Security

How this project handles the boring-but-load-bearing parts of running a
multi-user app. Read this before you change anything in `backend/auth.py`,
`backend/security.py`, or any route that takes a path-parameter id.

## Reporting

If you find a security issue, email patel.rohin@northeastern.edu with
"closet-org security" in the subject. Please don't open a public issue
until a fix lands.

## Threat model (what we defend against)

This is a small multi-tenant web + mobile app with one shared database.
The defences below are aimed at:

- A logged-in user trying to read or modify another user's data via id
  enumeration or by tampering with path parameters.
- A drive-by browser visiting the web frontend while logged in (XSS,
  clickjacking, mixed-content downgrade).
- A network attacker on the same Wi-Fi as a mobile user (TLS posture is
  the deployer's responsibility — we just don't transmit secrets in URLs).
- An anonymous attacker brute-forcing the login endpoint, the registration
  endpoint, or uploading hostile files.

Out of scope: full account takeover via a compromised user device, server
compromise, social engineering, and any defence that requires a third-
party WAF or DDoS scrubber.

## Authentication

- **Passwords** are bcrypt-hashed with a generated salt
  ([`hash_password`](backend/auth.py)). Plaintext is never logged or stored.
  Policy: minimum 10 chars, at least two character classes, can't contain
  the username, capped at 256 chars (so long inputs don't fool users into
  thinking length past bcrypt's 72-byte window helps).
- **Login throttling** lives in two layers:
  - Per-IP sliding window in
    [`security.InMemoryRateLimiter`](backend/security.py) — 10 attempts
    per 5 minutes for `/api/auth/login`.
  - Per-account counter on the `users` row — 8 wrong passwords locks the
    account for 15 minutes. Mitigates the distributed-IP brute-force case.
- **Timing-safe lookups**: a missing username still runs a dummy bcrypt
  compare so response time doesn't betray which accounts exist
  ([`main._dummy_hash`](backend/main.py)).
- **JWTs** are HS256, timezone-aware UTC, with required claims
  (`exp`, `iat`, `iss`, `user_id`, `tv`). The signing secret comes from
  `CLOSET_SECRET_KEY`; in production the app refuses to start without one.
- **Revocation**: every JWT carries a `tv` (token version) claim that's
  validated against `users.token_version` on every request. Bumping the
  column invalidates every outstanding token for that user. Used by
  password change and `POST /api/auth/logout-all`.

## Authorization

Every route that takes an item id, queue id, or post id as a path
parameter calls an ownership helper before doing any work:

- [`db.item_belongs_to`](backend/database/db_manager.py) gates routes that
  read or mutate `clothing_items`.
- [`db.laundry_entry_belongs_to`](backend/database/db_manager.py) gates the
  laundry-queue state machine.
- Friendship / post visibility is checked inside the db layer via
  `are_friends`.

Failure mode is **404, not 403** — leaking "this id exists but isn't
yours" is enough to enumerate the user base.

## Input handling

- Pydantic models on every route bound string lengths, integer ranges,
  and emit 422s for malformed input.
- Free-text fields go through `security.clip_text` so trailing whitespace
  and oversize strings can't sneak past Pydantic validation.
- Username and email are lowercased and validated at the API boundary;
  the database uses `COLLATE NOCASE` so legacy mixed-case rows still match.
- Path-parameter ids are typed `int` — FastAPI rejects non-numeric input.

## File uploads

`security.save_uploaded_image` is the only sanctioned way to land a file
on disk from a request. It enforces:

1. A streaming byte cap (`MAX_UPLOAD_BYTES`, default 15 MB) — we never
   read an unbounded body into memory.
2. Server-generated filename from `secrets.token_urlsafe` — the client's
   filename is discarded, which kills the path-traversal class outright.
3. Magic-byte sniffing — we identify the format from the file content,
   not the `Content-Type` header.
4. PIL re-validation — catches truncated images and decompression bombs
   (`Image.MAX_IMAGE_PIXELS = 64M`).
5. Saved extension is bound to the detected type so a renamed `.html`
   can't survive as something the browser will execute.

Served files at `/uploads/` get their own ultra-strict CSP and
`X-Content-Type-Options: nosniff` so even a successful sneak-past can't
be rendered as a script.

## Transport / headers

- [`SecurityHeadersMiddleware`](backend/security.py) sets:
  - `Strict-Transport-Security` (production only)
  - `Content-Security-Policy` (separate strict policy for `/uploads/`)
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy` denying geolocation/camera/microphone/payment
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Resource-Policy: same-site`
- CORS is pinned to `ALLOWED_ORIGINS` — wildcards are not supported and
  `allow_credentials` is on, so the combination is sound.
- `BodyLimitMiddleware` rejects requests larger than `MAX_REQUEST_BYTES`
  (default 25 MB) before they enter route handlers.

## Frontend XSS

The vanilla-JS web frontend interpolates user data into `innerHTML` in
several places. Every such interpolation now wraps the value in
`escapeHtml`, and every `src=`/`href=` runs through `safeUrl` to filter
out `javascript:` / `data:` schemes. The CSP would already block inline
script execution, but escaping defends against layout-injection too.

## Database

- `PRAGMA foreign_keys = ON` and `PRAGMA journal_mode = WAL` on every
  connection. Without `foreign_keys=ON`, `ON DELETE CASCADE` is silently
  ignored — a real foot-gun in SQLite.
- All queries use parameterised SQL. The only `f"..."`-built SQL is for
  whitelisted column names (`_EDITABLE_DETAIL_FIELDS`,
  `_EDITABLE_WISHLIST_FIELDS`) — never with user-supplied values.

## What's still on the roadmap

These are tracked in [ROADMAP.md](ROADMAP.md) — they're known gaps, not
oversights:

- Refresh tokens (we're currently long-lived single-token).
- Server-side audit log of authentication events.
- Per-route MFA / TOTP enrolment.
- S3/R2 object storage for uploads with short-lived signed URLs.

## Automated scanning (CI)

GitHub Actions runs:

- **`pytest`** on `backend/tests` (API, auth, security helpers).
- **`bandit`** on `backend/` (configuration in `pyproject.toml`).
- **`pip-audit`** on `requirements.txt` (informational; does not fail the job).
- **Jest** in `mobile/` (unit + snapshot tests).
- **Playwright** in `e2e/` against a live `uvicorn` server (`/healthz`, `/login`, security headers).

Local E2E: install dev deps (`requirements-dev.txt`), `python -m playwright install chromium`, start the API, then  
`E2E_BASE_URL=http://127.0.0.1:8000 python -m pytest e2e -v`.  
A bare `pytest` run uses `pytest.ini` and only executes `backend/tests`.

## Deployment checklist

Before pointing real users at a deployment:

1. `CLOSET_ENV=production` is set.
2. `CLOSET_SECRET_KEY` is set to 48+ bytes of CSPRNG output and stored
   somewhere the application server can read but no human checks into a
   wiki.
3. `ALLOWED_ORIGINS` lists only your real frontends — no wildcards.
4. Terminate TLS at a reverse proxy (nginx, Caddy, Cloudflare). Set
   `TRUST_PROXY_HEADERS=1` *only* if you've configured the proxy to
   sanitise `X-Forwarded-For`.
5. Mount `backend/closet.db` on encrypted storage and back it up.
6. Rotate `CLOSET_SECRET_KEY` on suspected leak — every user will have to
   log in again, which is the point.
