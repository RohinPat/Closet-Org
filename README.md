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

The API and the web frontend are both served at `http://localhost:8000`. The backend auto-reloads on file changes (`reload=True` in [main.py](backend/main.py)).

First run will download CLIP weights (~150 MB) and, on first classification, the rembg U²-Net model for background removal (~5 MB).

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

## Notes

- Database: `backend/closet.db` (SQLite). To reset, stop the server and delete the file — schema is re-created on next start.
- Uploaded images live in `uploads/` and are served at `/uploads/<filename>`.
- The classifier is CLIP ViT-B/32, zero-shot. Color extraction uses rembg to mask the background, then a per-pixel HSV voting scheme. See [clothing_classifier.py](backend/models/clothing_classifier.py).

## Future work

See [ROADMAP.md](ROADMAP.md).
