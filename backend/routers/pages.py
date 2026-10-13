"""HTML pages and health check."""

from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import FileResponse, RedirectResponse
import deps

router = APIRouter()


# ---- Static pages ------------------------------------------------------------



@router.get("/")

def root():

    return FileResponse(str(deps.FRONTEND_DIR / "landing.html"))


@router.get("/app")

def app_page():

    return FileResponse(str(deps.FRONTEND_DIR / "index.html"))


@router.get("/login")

def login_page():

    return FileResponse(str(deps.FRONTEND_DIR / "login.html"))


@router.get("/register")

def register_page():

    return FileResponse(str(deps.FRONTEND_DIR / "register.html"))


@router.get("/privacy")

def privacy_page():

    return FileResponse(str(deps.FRONTEND_DIR / "privacy.html"))


@router.get("/delete-account")
def delete_account_page():
    """Public account-deletion instructions (Google Play 'delete account' URL)."""
    return RedirectResponse(url="/privacy#delete-account", status_code=302)


@router.get("/terms")

def terms_page():

    return FileResponse(str(deps.FRONTEND_DIR / "terms.html"))


@router.get("/healthz")

def healthz():

    """Liveness probe. Doesn't touch the database — just confirms the

    process is serving. Use /readyz for a deeper check once you add one.

    """

    return {"status": "ok"}
