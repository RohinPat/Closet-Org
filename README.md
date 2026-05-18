# Closet-Org

A personal closet manager: upload photos of clothes, the backend classifies them with CLIP + a hue-based color extractor, and you get an outfit recommender and stats on top.

**Copyright © 2026 Rohin Patel. All rights reserved.** This project is proprietary — see [LICENSE](LICENSE). User-facing terms: [/terms](frontend/terms.html) and [/privacy](frontend/privacy.html) on your deployed host. Overview: [docs/LEGAL.md](docs/LEGAL.md).

Three surfaces share one FastAPI backend:

- a Python FastAPI + SQLite **backend**
- a static **web frontend** (vanilla JS, served by FastAPI)
- a React Native **mobile app** (Expo, iOS/Android)

---

## Running the backend

```bash
pip install -r requirements.txt
cd backend
python main.py
```

The API and the web frontend are both served at `http://localhost:8000`. In development the backend auto-reloads on file changes; set `CLOSET_ENV=production` (or `UVICORN_RELOAD=0`) to turn that off.

First run downloads CLIP weights (~150 MB) and, on first classification, the rembg U²-Net model for background removal (~5 MB).

### Configuration

Copy [`.env.example`](.env.example) to `.env`, fill in the values, and export them before launching uvicorn:

| Variable | Purpose |
|----------|---------|
| `CLOSET_ENV` | `production` enables strict mode (no /docs, HSTS, refuses to start without a secret). |
| `CLOSET_SECRET_KEY` | JWT signing key. Required in production; auto-generated in dev. |
| `ALLOWED_ORIGINS` | Comma-separated CORS allowlist. No wildcards. |
| `MAX_UPLOAD_BYTES` / `MAX_REQUEST_BYTES` | Upload + body size caps. |
| `ACCESS_TOKEN_TTL_MINUTES` | JWT lifetime. Default 7 days. |

Threat model, headers, uploads, deployment checklist → **[PROJECT.md § Security](PROJECT.md#security)**.

### Production ops (private notes)

Server-specific commands (SSH, Oracle firewall, nginx timeouts, backups) live in **`docs/ADMIN_LOCAL.md`**, which is **gitignored**. Copy **[`docs/ADMIN_LOCAL.md.example`](docs/ADMIN_LOCAL.md.example)** to `docs/ADMIN_LOCAL.md` and fill in your values. Automated VPS setup: **`scripts/provision_ubuntu_prod.sh`** and **[`docs/AWS_DEPLOYMENT.md`](docs/AWS_DEPLOYMENT.md)**. **Auto-deploy on push to `main`:** **[`docs/GITHUB_DEPLOY.md`](docs/GITHUB_DEPLOY.md)** (GitHub Actions → Oracle).

### Web frontend

Open `http://localhost:8000`, register, then upload items, outfits, stats.

<a id="mobile-app"></a>

### Mobile app (Expo)

Prerequisites: Node.js 18+, npm, backend running. This repo’s `mobile/app.json` targets API port **8001** (backend defaults to **8000** for web — use `uvicorn` on `8001` for mobile-only dev or set `EXPO_PUBLIC_API_URL` as below).

```bash
cd mobile
npm install
npx expo start
```

| Client | Typical `EXPO_PUBLIC_API_URL` |
|--------|------------------------------|
| Same machine, iOS Simulator | `http://localhost:8001` |
| Android Emulator | `http://10.0.2.2:8001` |
| Physical phone on Wi‑Fi | `http://<your-pc-lan-ip>:8001` |

No trailing slash. Restart Expo after changing the variable.

<details>
<summary>Shell examples</summary>

**PowerShell (session)**

```powershell
$env:EXPO_PUBLIC_API_URL = "http://10.0.2.2:8001"
npx expo start
```

**macOS / Linux**

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.50:8001 npx expo start
```

</details>

**Production API:** copy [`mobile/.env.example`](mobile/.env.example) to `mobile/.env` (gitignored) or rely on `app.json` `extra.closetApiOrigin` + [`mobile/eas.json`](mobile/eas.json) for store builds.

**Store release:** [`mobile/STORE_RELEASE.md`](mobile/STORE_RELEASE.md) (EAS build commands) · [`docs/STORE_LISTINGS.md`](docs/STORE_LISTINGS.md) (descriptions, Data safety, screenshots checklist) · privacy policy at `/privacy` on your API host.

Main entry points:

- `mobile/src/config.ts` — API origin and image URLs  
- `mobile/src/api/` — HTTP client  
- `mobile/src/context/AuthContext.tsx` — session  
- `mobile/src/navigation/RootNavigator.tsx` — stacks and tabs  

---

## What’s in the repo

```
backend/                FastAPI app, SQLite
  main.py               routes
  auth.py               JWT + bcrypt
  database/             manager + migrations
  models/
    clothing_classifier.py   CLIP + HSV color
    outfit_recommender.py    rule-based picker

frontend/               vanilla HTML/CSS/JS

mobile/                 Expo React Native
  src/screens/
  src/components/Glass.tsx
  src/theme.ts
  src/navigation/RootNavigator.tsx
```

---

## API surface

All `/api/*` routes need a Bearer JWT (`POST /api/auth/login`) except register/login.

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/auth/register` | create account |
| POST | `/api/auth/login` | token |
| GET | `/api/auth/me` | current user |
| PUT | `/api/auth/profile` | update profile |
| POST | `/api/upload-clothing` | upload + classify; may include `duplicate_hint` |
| GET | `/api/closet` | list; filters `category`, `status`, `q` |
| GET | `/api/closet/insights` | gaps, mix, retirement heuristics |
| POST | `/api/closet/fit-check` | temp photo → pairings |
| GET | `/api/item/{id}` | detail |
| GET | `/api/item/{id}/outfits` | suggestions including item |
| PUT | `/api/item/{id}` | metadata (`packed_for_trip`, brand, tags, …) |
| PUT | `/api/item/{id}/status` | washed / worn / favorite |
| DELETE | `/api/item/{id}` | remove |
| GET | `/api/outfits/recommend` | outfits (`occasion`, `season`, `vibe`, …) |
| GET | `/api/stats` | counts, `best_cpw` top 5 |
| GET/POST/PUT | `/api/wishlist` | wishlist CRUD |
| PUT | `/api/item/{id}/promote` | wishlist → owned |

---

## Product notes (today’s behavior)

- **Database:** `backend/closet.db`. Delete while server stopped to reset; schema is recreated on next start.
- **Files:** uploads in `uploads/`, served at `/uploads/<filename>`.
- **Classifier:** CLIP ViT-B/32 zero-shot; color uses rembg + HSV voting. See `backend/models/clothing_classifier.py`.
- **Photos:** Multiple images per item; first drives category/style/season; colors merge across photos. `image_paths` / `thumbnail_paths` hold arrays; singular paths keep backwards compatibility (front photo).
- **Mobile closet UX:** Persisted density, sort (recent / worn / neglected / CPW), grid ↔ rails; filters combine (status, category, color swatches, `storage_location`, search). Prefs → `mobile/src/preferences.ts`.
- **`physical_location` vs `storage_location`:** Laundry state (`closet` / `needs_wash` / `laundry`) cycles on wear/wash. User-visible place label is `storage_location` on detail.
- **Lending:** `lent_to`, `lent_at`, `lent_until`; lend/return endpoints; in-app overdue state; reminder push → still **todo** ([PROJECT.md](PROJECT.md#still-to-build)).
- **Signals already in backend:** insights + `retirement_candidates`, fit-check pairing, pinned item outfits, vibe + `outfit_suggestion_history` (~14d de-dupe), `packed_for_trip`, duplicate hint on upload, wishlist flows.

<a id="testing"></a>

## Testing

| Layer | Runner | CI | Gate |
|-------|--------|-----|------|
| Backend unit | pytest (`backend/tests`) | Yes | **≥63%** lines (`.coveragerc`) |
| Web E2E | Playwright (`e2e/`) | Yes | — |
| Mobile | Jest (`mobile/`) | Yes | snapshots pass; **no** coverage gate |

Branch coverage is **off** for Python. Do not commit `coverage.json` / `htmlcov/`.

### Backend (pytest)

```bash
pip install -r requirements.txt -r requirements-dev.txt
```

Set `CLOSET_SECRET_KEY` (≥32 chars): `your-local-secret-at-least-32-chars-long!!`

```bash
python -m pytest
```

`pytest.ini` scopes `backend/tests` and uses temp SQLite — not your dev `closet.db`.

Coverage (matches CI):

```bash
python -m pytest backend/tests --cov=backend --cov-config=.coveragerc --cov-report=term-missing --cov-fail-under=63
```

### End-to-end (Playwright)

```bash
pip install -r requirements-dev.txt
python -m playwright install chromium
```

Terminal A: `cd backend` → `python -m uvicorn main:app --host 127.0.0.1 --port 8000` with `CLOSET_SECRET_KEY` set.

Terminal B: `E2E_BASE_URL=http://127.0.0.1:8000 python -m pytest e2e -v` (PowerShell: `$env:E2E_BASE_URL=...`).

### Mobile (Jest)

```bash
cd mobile
npm install
npm test
```

Local coverage (`npm run test:coverage`): line coverage for `src/` is still low — use it to find gaps, not as a release metric until thresholds are set.

Update snapshots after intentional UI change: `npm test -- -u`

### Device flows (Maestro)

Flows under `mobile/e2e/maestro/` — not in CI. [Maestro](https://maestro.mobile.dev/), then e.g. `maestro test mobile/e2e/maestro/login_screen.yaml -e APP_ID=com.your.bundle.id`. TestIDs: `login-username`, `login-password`, `login-submit`.

### Store release QA

See **[mobile/STORE_RELEASE.md](mobile/STORE_RELEASE.md)** and **[docs/STORE_LISTINGS.md](docs/STORE_LISTINGS.md)**. Automated suites do **not** replace: device testing on preview/production builds, store questionnaires, screenshots, and review credentials.

---

<a id="roadmap-and-backlog"></a>

## Roadmap — still to build

Single living checklist (**open items only**): **[PROJECT.md § Still to build](PROJECT.md#still-to-build)** — includes security tooling and infra gaps that belong to the backlog.

Further security tooling (pytest, bandit, pip-audit, mobile Jest, Playwright headers) → **[PROJECT.md § Automated scanning (CI)](PROJECT.md#automated-scanning-ci)**.
