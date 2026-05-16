# Closet-Org — backlog & security

This is the single supplement to **[README.md](README.md)**. Use the README for setup, stack layout, API table, and how to run tests. **Here:** what remains to build (checklist below) plus security posture for anyone touching auth, uploads, or route ownership.

---

## Do now

Near-term order meant for “what should we touch next?” — not a promise of roadmapping rigor. Reorder as your constraints change; the full backlog stays under **Still to build** below.

1. **Before wide deployment** — short-lived access tokens + rotated refresh tokens, then image storage off local disk (S3/R2 + signed URLs) if the API leaves a single machine.
2. **Optional** — richer **device-calendar** cues for outfits (beyond planned-outfit pinning by date on the Outfits tab).

Defer **capsule optimizer**, **push notifications**, **fine-tuned classifier**, and **Larger ideas** until the above are stable or you have a dedicated spike.

---

## Still to build

Grouped for the current FastAPI + SQLite + Expo + CLIP codebase. Toggle items off in your own branch workflow; nothing here is framed as finished.

### Travel & packing

- [ ] **Capsule optimizer** — pick N items to maximize outfit combinations beyond coverage-style packing.

### Notifications & reminders

- [ ] **Push / scheduled reminders** — lends due, planned outfits (today: in-app only).

### Recommendations

- [ ] **Device calendar bias** — use on-device calendar (or richer signals) so recommendations account for real same-day commitments, beyond pinned planned-outfit dates.

### Insights

- [ ] **Retirement model** — fuse CPW, neglect, condition, corrections.
- [ ] **Charts polish** — richer visuals for composition / duplicates.

### Classification quality

- [ ] **Fine-tuned model vs CLIP** — swap point in `backend/models/clothing_classifier.py` when enough correction data exists.
- [ ] **Accent vs dominant colors** — secondary accent buckets for busy patterns.
- [ ] **Train export** — bulk corrections export for offline training.

### UX / UI polish

- [ ] **Illustrated empty states** — closet, outfits, and other sparse screens.

### Backend / infra

- [ ] **Image storage** — S3/R2 + signed URLs beyond single-machine disk.
- [ ] **Background jobs** — classification off the upload critical path.
- [ ] **Refresh tokens** — short access + rotated refresh.
- [ ] **Audit log** — auth events persisted.
- [ ] **TOTP / MFA** — optional per user.
- [ ] **Distributed rate limiting** — Redis vs. in-process (`backend/security.py`).

### Larger ideas (later)

- [ ] Batch / shelf photo import, receipt OCR for purchase metadata, voice add, daily fit pic + closet match, social/moderation, year-in-review.

---

## Security

How this project handles auth, tenancy, uploads, and headers. Read before changing **`backend/auth.py`**, **`backend/security.py`**, or any route that takes a path-parameter id.

### Reporting

If you find a security issue, email patel.rohin@northeastern.edu with `"closet-org security"` in the subject. Prefer not to open a public issue until there is a fix.

### Threat model (what we defend against)

Small multi-tenant web + mobile app with one shared SQLite database. Intended coverage:

- A logged-in user reading or modifying another user’s data via id enumeration or path-parameter tampering.
- A logged-in browser on the web app (XSS, clickjacking, mixed-content issues).
- A network attacker on the same Wi-Fi as a mobile user (TLS is the deployer’s responsibility; secrets must not ride in URLs).
- Anonymous brute force on login/registration and hostile uploads.

**Out of scope:** full takeover via compromised device, server compromise, social engineering, commodity WAF/DDoS.

### Authentication

- **Passwords** — bcrypt + salt (`hash_password` in `backend/auth.py`). Policy: minimum 10 chars, two character classes, no username substring, max 256 chars (bcrypt ~72-byte limit).
- **Login throttling** — per-IP sliding window (`InMemoryRateLimiter` in `backend/security.py`): 10 tries / 5 min on `/api/auth/login`; plus per-account lockout after 8 failures (15 minutes).
- **Timing-safe lookups** — missing username still runs a dummy bcrypt compare (`main._dummy_hash`).
- **JWTs** — HS256, UTC-aware, claims `exp`, `iat`, `iss`, `user_id`, `tv`; signing secret `CLOSET_SECRET_KEY` (mandatory in production).
- **Revocation** — `tv` validated against `users.token_version`; password change / `POST /api/auth/logout-all` bumps version.

### Authorization

Routes that accept item id, queue id, or similar gate on ownership first (`db.item_belongs_to`, `db.laundry_entry_belongs_to`, friend checks inside the db layer).

**Prefer 404 over 403** when the resource exists but belongs to someone else — avoid id-leak enumeration.

### Input handling

- Pydantic models bound lengths/ranges (`422` on bad input).
- Free text via `security.clip_text`; usernames/emails normalized at the API boundary (`COLLATE NOCASE` in DB).
- Path ids typed `int`; FastAPI rejects non-numeric.

### File uploads

Only **`security.save_uploaded_image`**: streaming byte cap (`MAX_UPLOAD_BYTES`), server filenames (`secrets.token_urlsafe`), magic-byte sniff, PIL re-validation (`Image.MAX_IMAGE_PIXELS`), extension bound to detected type. `/uploads/` served with tight CSP + `nosniff`.

### Transport / headers

`SecurityHeadersMiddleware` (`backend/security.py`): HSTS in production; CSP (stricter on `/uploads/`); frame deny; referrer policy; permissions policy; COOP/CORP; CORS from `ALLOWED_ORIGINS` (no wildcard with credentials).

`BodyLimitMiddleware` honors `MAX_REQUEST_BYTES` before routes run.

### Frontend XSS defense

Vanilla frontend: interpolate with `escapeUrl` / filtering for `href`/`src` where applicable; CSP as backstop.

### Database

SQLite: `foreign_keys=ON`, WAL, parameterised queries; dynamic column lists use whitelisted names only (`_EDITABLE_DETAIL_FIELDS`, etc.), never concatenated user input.

### Automated scanning (CI)

GitHub Actions runs:

- **`pytest`** on `backend/tests`
- **`bandit`** on `backend/` (`pyproject.toml`)
- **`pip-audit`** on `requirements.txt` (informational; does not fail the job by default)
- **Jest** in `mobile/`
- **Playwright** in `e2e/` against live uvicorn (`/healthz`, `/login`, headers)

Local E2E: dev deps (`requirements-dev.txt`), `python -m playwright install chromium`, start API, then  
`E2E_BASE_URL=http://127.0.0.1:8000 python -m pytest e2e -v`.  
Bare `pytest` uses `pytest.ini` and runs `backend/tests` only.

### Deployment checklist

1. Set `CLOSET_ENV=production`.
2. Set `CLOSET_SECRET_KEY` to ≥48 bytes CSPRNG, stored securely (never in wiki).
3. Set `ALLOWED_ORIGINS` to real frontends only — no wildcard.
4. Terminate TLS at a reverse proxy; set `TRUST_PROXY_HEADERS=1` only when the proxy sanitizes `X-Forwarded-*`.
5. Keep `closet.db` on encrypted storage with backups.
6. Rotate signing key on suspected leak — expect forced re-login everywhere.
