# Closet-Org

A personal closet manager: upload photos of clothes, the backend classifies them with CLIP + a hue-based color extractor, and you get an outfit recommender and stats on top.

Three surfaces share one FastAPI backend:
- a Python FastAPI + SQLite **backend**
- a static **web frontend** (vanilla JS, served by FastAPI)
- a React Native **mobile app** (Expo, iOS/Android)

## Running the backend

```bash
pip install -r requirements.txt
cd backend
python main.py
```

The API and the web frontend are both served at `http://localhost:8000`.
In development the backend auto-reloads on file changes; flip
`CLOSET_ENV=production` (or `UVICORN_RELOAD=0`) to turn that off.

First run will download CLIP weights (~150 MB) and, on first classification, the rembg U²-Net model for background removal (~5 MB).

### Configuration

Copy [`.env.example`](.env.example) to `.env`, fill in the values, and
export them in your shell before launching uvicorn. Key variables:

| Variable | Purpose |
|----------|---------|
| `CLOSET_ENV` | `production` enables strict mode (no /docs, HSTS, refuses to start without a secret). |
| `CLOSET_SECRET_KEY` | JWT signing key. Required in production; auto-generated in dev. |
| `ALLOWED_ORIGINS` | Comma-separated CORS allowlist. No wildcards. |
| `MAX_UPLOAD_BYTES` / `MAX_REQUEST_BYTES` | Upload + body size caps. |
| `ACCESS_TOKEN_TTL_MINUTES` | JWT lifetime. Default 7 days. |

See [SECURITY.md](SECURITY.md) for the full threat model and the
deployment checklist.

### Web frontend
Open `http://localhost:8000` in a browser. Register an account, then upload items, view the closet, get outfit recommendations, and check stats.

### Mobile app
```bash
cd mobile
npm install
npx expo start
```

Scan the QR code with Expo Go (or run on an iOS/Android simulator). If your phone can't reach `localhost`, start Expo with `EXPO_PUBLIC_API_URL=http://192.168.x.x:8000` pointed at your computer's LAN IP.

## What's in here

```
backend/                FastAPI app, models, SQLite DB
  main.py               app + routes
  auth.py               JWT auth, bcrypt password hashing
  database/             SQLite manager + migrations
  models/
    clothing_classifier.py    CLIP zero-shot category/style + HSV color extraction
    outfit_recommender.py     rule-based outfit picker

frontend/               vanilla HTML/CSS/JS web client

mobile/                 Expo React Native app
  src/screens/          one file per screen
  src/components/Glass.tsx    shared liquid-glass UI primitives
  src/theme.ts          colors, radii, spacing tokens
  src/navigation/RootNavigator.tsx
```

## API surface

All routes under `/api` require a Bearer JWT (from `POST /api/auth/login`) except register/login.

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/auth/register` | create account |
| POST | `/api/auth/login` | exchange username/password for token |
| GET | `/api/auth/me` | current user |
| PUT | `/api/auth/profile` | update profile |
| POST | `/api/upload-clothing` | upload image, classify, save |
| GET | `/api/closet` | list user's items |
| GET | `/api/item/{id}` | item detail |
| PUT | `/api/item/{id}/status` | mark washed / worn / favorite |
| DELETE | `/api/item/{id}` | remove item |
| GET | `/api/outfits/recommend` | outfit suggestions |
| GET | `/api/stats` | counts and by-category breakdown |
| GET | `/api/wishlist` | list wishlist items |
| POST | `/api/wishlist` | add a wishlist entry |
| PUT | `/api/wishlist/{id}` | edit a wishlist entry |
| PUT | `/api/item/{id}/promote` | promote wishlist item to owned |

## Notes

- Database: `backend/closet.db` (SQLite). To reset, stop the server and delete the file — schema is re-created on next start.
- Uploaded images live in `uploads/` and are served at `/uploads/<filename>`.
- The classifier is CLIP ViT-B/32, zero-shot. Color extraction uses rembg to mask the background, then a per-pixel HSV voting scheme. See [clothing_classifier.py](backend/models/clothing_classifier.py).
- Items can carry multiple photos (front + back + extras). The upload endpoint accepts a `files` list; the first photo drives category/style/season classification and colors are merged across all photos so graphic backs don't get lost. Singular `image_path`/`thumbnail_path` stay populated with the front photo for backwards compatibility; full arrays live in `image_paths`/`thumbnail_paths`.
- Closet screen has persisted density (list/comfy/compact/dense), persisted sort (recent / most worn / neglected / best CPW), and a grid ↔ rails layout toggle (rails group by subcategory). Filters AND together: status chips (Clean / Wash / Favorites) + category chip row + color swatch row + storage-location chip row + free-text search over category, subcategory, style, season, brand, notes, colors. Prefs live in [preferences.ts](mobile/src/preferences.ts).
- `clothing_items.physical_location` is the laundry state machine's marker (`'closet'` / `'needs_wash'` / `'laundry'`) — it gets clobbered on every wear/wash cycle. The user-facing physical place (e.g. "front rack, left") lives in a separate `storage_location` column edited from the item detail screen.
- Lending tracker: `clothing_items.lent_to` / `lent_at` / `lent_until`. Item detail has a Lend out / Mark returned button (modal asks name + optional `YYYY-MM-DD` return date); overdue items get a red banner. Lent items are skipped by the outfit recommender and tagged with a Lent badge on the closet card; the closet has a `Lent` filter chip. Endpoints: `PUT /api/item/{id}/lend`, `PUT /api/item/{id}/return`. Reminder push notifications aren't wired yet — the overdue indicator is in-app only.
- Wishlist lives in the same `clothing_items` table — entries have `status='wishlist'` (default `'owned'`) plus `wishlist_name`, `wishlist_intent` (`want` / `gift` / `saving` / `sale_watch`), `wishlist_url`. Wishlist rows are excluded from `/api/closet`, `/api/stats`, `/api/outfits/recommend`, `/api/neglected-items`, and `/api/laundry`. The Profile tab → Wishlist screen lists, adds, promotes, and removes them; promotion flips `status` to `'owned'` and resets `date_added` so the item enters the closet fresh. Photo-less entries are allowed (image_path stores `''`); the metadata-only `POST /api/wishlist` is the current path — a "save with photo" flow can reuse `/api/upload-clothing` with a status patch later.

## Future work

See [ROADMAP.md](ROADMAP.md). Security posture is in [SECURITY.md](SECURITY.md).
