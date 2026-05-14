# Closet Org (mobile)

React Native app (Expo) for the Closet-Org FastAPI backend. Features: sign in, closet grid, upload from library or camera, outfit suggestions, stats, profile.

## Prerequisites

- Node.js 18+ and npm
- Backend running from the repo `backend/` folder (`python main.py` on port **8000** by default)
- For device builds: Expo Go, or EAS for standalone apps

## Install

```bash
cd mobile
npm install
```

## API URL

The app defaults to `http://localhost:8000`. That only works when Metro and the API run on the **same machine** and the client can reach that host.

| Client | Typical `EXPO_PUBLIC_API_URL` |
|--------|--------------------------------|
| Same machine, iOS Simulator | `http://localhost:8000` |
| Android Emulator | `http://10.0.2.2:8000` |
| Physical phone on Wi‑Fi | `http://<your-pc-lan-ip>:8000` (e.g. `http://192.168.1.50:8000`) |

Do not use a trailing slash.

**PowerShell (session only):**

```powershell
$env:EXPO_PUBLIC_API_URL = "http://10.0.2.2:8000"
npx expo start
```

**macOS/Linux:**

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.50:8000 npx expo start
```

Restart Expo after changing this variable so the bundle picks it up.

## Run

1. Start the API (from repo root):

   ```bash
   cd backend
   python main.py
   ```

2. Start Expo:

   ```bash
   cd mobile
   npx expo start
   ```

Then scan the QR code (Expo Go) or press `a` / `i` for emulator.

## Production notes

- The published API should use **HTTPS**; configure `EXPO_PUBLIC_API_URL` to that URL.
- Android debug builds allow cleartext HTTP via `app.json` for local dev only—tighten this for release builds.
- Set a strong `SECRET_KEY` on the server for JWT signing.

## Project layout

- `src/config.ts` — API origin and image URL helpers
- `src/api/` — HTTP client (JWT, closet, upload, outfits, stats)
- `src/context/AuthContext.tsx` — session state
- `src/navigation/RootNavigator.tsx` — auth vs main stack + tabs
- `src/screens/` — UI screens
