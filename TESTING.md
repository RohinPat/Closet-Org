# Testing

Quick reference:

| Layer | Runner | Enforced in CI | Coverage gate |
| ----- | ------ | -------------- | ------------- |
| Backend unit | pytest (`backend/tests`) | Yes | **≥ 63%** lines on counted modules (`.coveragerc`) |
| Web E2E | Playwright (`e2e/`) | Yes | — |
| Mobile unit | Jest (`mobile/`) | Yes (tests only) | **None** — snapshot-focused suite |

Branch coverage is **off** for Python (`branch = false` in `.coveragerc`). Raise `--cov-fail-under` only after adding tests so CI stays honest.

---

## Backend (pytest)

From the repo root (app deps + dev deps):

```bash
pip install -r requirements.txt -r requirements-dev.txt
```

Set `CLOSET_SECRET_KEY` to any string **≥ 32 characters** (required by the app):

| Shell | Command |
| ----- | ------- |
| Windows CMD | `set CLOSET_SECRET_KEY=your-local-secret-at-least-32-chars-long!!` |
| PowerShell | `$env:CLOSET_SECRET_KEY="your-local-secret-at-least-32-chars-long!!"` |
| macOS / Linux | `export CLOSET_SECRET_KEY=your-local-secret-at-least-32-chars-long!!` |

```bash
python -m pytest
```

`pytest.ini` limits discovery to `backend/tests/` and sets `pythonpath = backend`. Tests patch `get_db()` and use a **temporary SQLite file** — they do not use your dev `closet.db`.

### Coverage (matches CI)

Omissions are listed in `.coveragerc` (notably `backend/models/clothing_classifier.py`, replaced by a fake in tests).

```bash
python -m pytest backend/tests --cov=backend --cov-config=.coveragerc --cov-report=term-missing --cov-fail-under=63
```

Expect **roughly 65%** line coverage on counted modules. Most gaps are in `database/db_manager.py` (large surface). Reaching **~90%+** means many more DB-focused tests or a narrower coverage scope.

Do **not** commit root-level `coverage.json` or `htmlcov/` — they are gitignored and easy to misread if produced without `.coveragerc` omits.

---

## End-to-end (Playwright, FastAPI web UI)

Exercises served routes such as `/login`, `/healthz`, etc.

```bash
pip install -r requirements-dev.txt
python -m playwright install chromium
```

Terminal A:

```bash
cd backend
set CLOSET_SECRET_KEY=your-local-secret-at-least-32-chars-long!!
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Terminal B:

```bash
set E2E_BASE_URL=http://127.0.0.1:8000
python -m pytest e2e -v
```

(PowerShell: `$env:E2E_BASE_URL="http://127.0.0.1:8000"`.)

---

## Mobile (Expo / Jest)

Native-heavy modules are mocked in `mobile/jest.setup.js` (`expo-blur`, `expo-linear-gradient`, `expo-secure-store`, etc.) so snapshots stay stable in CI.

```bash
cd mobile
npm install
npm test
```

CI runs the same with `jest --ci`.

### Coverage (local only)

```bash
npm run test:coverage
```

With `collectCoverageFrom` spanning all of `src/`, reported **line coverage is currently very low** (~low single digits): only a handful of components and utilities have tests. The gate is **“tests pass”**, not minimum coverage. Treat `test:coverage` as a map for where to add tests next, not as a release metric until thresholds are introduced deliberately.

**Snapshots are not PNG screenshots.** Trees live under `mobile/src/__tests__/__snapshots__/*.snap`. For pixel-level regressions, use Maestro or a visual regression service — not `toMatchSnapshot()` alone.

Update snapshots only after an intentional UI change:

```bash
npm test -- -u
```

---

## Device E2E (Maestro)

Flows live under `mobile/e2e/maestro/`. Not run in CI — execute locally before a store candidate build.

Install [Maestro](https://maestro.mobile.dev/), launch or install your build, then:

```bash
maestro test mobile/e2e/maestro/login_screen.yaml -e APP_ID=com.your.bundle.id
```

`LoginScreen` exposes `testID`s: `login-username`, `login-password`, `login-submit`.

---

## Pre-release QA (stores)

Automated tests above do **not** replace store checklist items: production API URL (HTTPS), bundle IDs / signing (EAS or native build pipeline), privacy policy and store questionnaires (data safety, nutrition labels), turning off dev-only networking flags (`usesCleartextTraffic`, local ATS exceptions), screenshots and review credentials.
