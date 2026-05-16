# Testing

## Backend (pytest)

From the repo root (requires app deps + dev deps):

```bash
pip install -r requirements.txt -r requirements-dev.txt
# Windows CMD:
set CLOSET_SECRET_KEY=your-local-secret-at-least-32-chars-long!!
# PowerShell:
# $env:CLOSET_SECRET_KEY="your-local-secret-at-least-32-chars-long!!"
# macOS/Linux:
# export CLOSET_SECRET_KEY=your-local-secret-at-least-32-chars-long!!
python -m pytest
```

This runs everything under `backend/tests/` (see `pytest.ini`). Tests use a temporary SQLite file via patched `get_db()` — they do not touch your dev `closet.db`.

Coverage (same scope as CI — config in `.coveragerc`; `models/clothing_classifier.py` is omitted because tests use a fake classifier):

```bash
python -m pytest backend/tests --cov=backend --cov-config=.coveragerc --cov-report=term-missing --cov-fail-under=63
```

Expect **roughly 65%** total line coverage on counted modules: most uncovered lines live in `database/db_manager.py` (very large surface). Pushing toward **~90%+** needs either many more DB-focused tests or a smaller coverage scope.

## End-to-end (Playwright, served web UI)

Uses the FastAPI-served pages under `/login`, `/healthz`, etc.

```bash
pip install -r requirements-dev.txt
python -m playwright install chromium
cd backend
set CLOSET_SECRET_KEY=your-local-secret-at-least-32-chars-long!!
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

In another shell:

```bash
set E2E_BASE_URL=http://127.0.0.1:8000
python -m pytest e2e -v
```

## Mobile (Expo / Jest)

```bash
cd mobile
npm install
npm test
```

Snapshots live in `mobile/src/__tests__/__snapshots__/`. Update intentionally with `npm test -- -u`.

## Device E2E (Maestro)

Flows for the native app live under `mobile/e2e/maestro/`. Install [Maestro](https://maestro.mobile.dev/), build or launch your app, then pass your application id, for example:

```bash
maestro test mobile/e2e/maestro/login_screen.yaml -e APP_ID=com.your.bundle.id
```

The login screen exposes `testID`s (`login-username`, `login-password`, `login-submit`) for stable selectors.
