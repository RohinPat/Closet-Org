"""Registration, login, password reset, account settings and deletion."""

from __future__ import annotations

import hashlib
import secrets
import time
from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Request,
    UploadFile,
)
from datetime import timedelta
from typing import Dict
from security import (
    PRODUCTION,
    clip_text,
    normalize_email,
    normalize_username,
    rate_limit,
    safe_uploads_url,
    save_uploaded_image,
    validate_password,
)
from auth import (
    ACCESS_TOKEN_TTL_MINUTES,
    LEGACY_ACCESS_TOKEN_TTL_MINUTES,
    REFRESH_CLIENT_HEADER,
    REFRESH_TOKEN_TTL_DAYS,
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)
from password_reset_email import send_password_reset_email, smtp_configured
import deps
from schemas import (
    AccountDelete,
    PasswordChange,
    PasswordForgot,
    PasswordResetConfirm,
    RefreshRequest,
    UserLogin,
    UserProfile,
    UserRegister,
    UserSettingsUpdate,
)
from route_helpers import (
    _RESET_TTL_SECONDS,
    _VALID_APP_MODES,
    _VALID_DEFAULT_TABS,
    _VALID_THEMES,
    _dummy_hash,
    _public_user,
    _remove_user_upload_files,
    logger,
)

router = APIRouter()


def _issue_tokens(request: Request, *, user_id: int, username: str, token_version: int) -> Dict:
    """Access token (+ refresh token for clients that support refresh)."""
    if request.headers.get(REFRESH_CLIENT_HEADER) != "1":
        return {
            "access_token": create_access_token(
                user_id=user_id,
                username=username,
                token_version=token_version,
                expires_delta=timedelta(minutes=LEGACY_ACCESS_TOKEN_TTL_MINUTES),
            ),
            "token_type": "bearer",
        }
    return {
        "access_token": create_access_token(
            user_id=user_id, username=username, token_version=token_version
        ),
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_TTL_MINUTES * 60,
        "refresh_token": deps.db.create_refresh_token(
            user_id, ttl_seconds=REFRESH_TOKEN_TTL_DAYS * 86400
        ),
    }


@router.post("/api/auth/register")

def register(user_data: UserRegister, request: Request):

    """Register a new user. Email is normalized to lowercase and must be unique
    ignoring case (same address cannot exist twice).
    """

    # Tight per-IP cap. Doesn't stop a botnet but stops 1-IP signup floods.

    rate_limit(request, "auth.register", limit=5, window=300)



    username = normalize_username(user_data.username)

    email = normalize_email(user_data.email)

    validate_password(user_data.password, username=username)



    if deps.db.get_user_by_username(username):

        raise HTTPException(status_code=400, detail="Username already exists")

    if deps.db.get_user_by_email(email):

        raise HTTPException(status_code=400, detail="Email already exists")



    full_name = clip_text(user_data.full_name, max_len=120)

    password_hash = hash_password(user_data.password)

    user_id = deps.db.create_user(

        username=username,

        email=email,

        password_hash=password_hash,

        full_name=full_name,

    )

    if user_id is None:

        # Race: two requests can pass the pre-checks but collide on INSERT.
        if deps.db.get_user_by_email(email):

            raise HTTPException(status_code=400, detail="Email already exists")

        if deps.db.get_user_by_username(username):

            raise HTTPException(status_code=400, detail="Username already exists")

        raise HTTPException(status_code=500, detail="Failed to create user")



    return {
        "success": True,
        **_issue_tokens(request, user_id=user_id, username=username, token_version=0),

        "user": {

            "id": user_id,

            "username": username,

            "email": email,

            "full_name": full_name,

        },

    }


@router.post("/api/auth/login")

def login(credentials: UserLogin, request: Request):

    """Exchange username/password for an access token."""

    # Per-IP throttle. Account-level lockout below adds a second layer.

    rate_limit(request, "auth.login", limit=10, window=300)



    raw_identifier = (credentials.username or "").strip()

    if not raw_identifier:

        # Still pay the bcrypt cost so an empty username doesn't return

        # noticeably faster than a real one with the wrong password.

        verify_password(credentials.password, _dummy_hash())

        raise HTTPException(status_code=401, detail="Invalid username or password")



    # Accept username or email in the same field (web/mobile often use email).
    user = deps.db.get_user_by_username(raw_identifier)
    if user is None and "@" in raw_identifier:
        user = deps.db.get_user_by_email(normalize_email(raw_identifier))



    # Always run a bcrypt compare against *something* — against the real hash

    # if the user exists, against a stable dummy hash if not. Without this,

    # the response time leaks whether the username exists.

    expected_hash = user["password_hash"] if user else _dummy_hash()

    password_ok = verify_password(credentials.password, expected_hash)



    if user is None or not password_ok:

        if user is not None:

            deps.db.record_login_failure(user["id"])

        raise HTTPException(status_code=401, detail="Invalid username or password")



    lockout = deps.db.get_login_lockout(user["id"])

    if lockout:

        # Even with the right password we refuse during lockout — otherwise

        # the lockout offers no defence against an attacker who eventually

        # guesses correctly.

        raise HTTPException(

            status_code=429,

            detail="Account temporarily locked due to repeated failed logins",

        )



    deps.db.clear_login_failures(user["id"])

    deps.db.update_last_login(user["id"])



    token_version = int(user.get("token_version") or 0)

    return {
        "success": True,
        **_issue_tokens(
            request,
            user_id=user["id"],
            username=user["username"],
            token_version=token_version,
        ),

        "user": _public_user(user),

    }


@router.post("/api/auth/forgot-password")

def forgot_password(body: PasswordForgot, request: Request):

    """Request a password reset email (or dev token when SMTP is not configured).



    Always returns the same shape so callers cannot enumerate registered emails.

    """

    rate_limit(request, "auth.forgot_password", limit=5, window=3600)



    email = normalize_email(str(body.email))

    generic_message = (

        "If an account exists for that email, you will receive reset instructions shortly."

    )

    payload: Dict[str, object] = {

        "success": True,

        "message": generic_message,

    }



    user = deps.db.get_user_by_email(email)

    if not user:

        return payload



    raw = secrets.token_urlsafe(32)

    token_hash = hashlib.sha256(raw.encode("utf-8")).hexdigest()

    deps.db.issue_password_reset_token(

        int(user["id"]), token_hash, int(time.time()) + _RESET_TTL_SECONDS

    )



    send_password_reset_email(

        user["email"], username=str(user["username"]), reset_token=raw

    )



    if not PRODUCTION and not smtp_configured():

        payload["dev_reset_token"] = raw

        payload["message"] = (

            "Development mode: SMTP is not configured. Use dev_reset_token on the "

            "reset screen (also logged on the server)."

        )



    return payload


@router.post("/api/auth/reset-password")

def reset_password(body: PasswordResetConfirm, request: Request):

    """Consume a one-time reset token from email (forgot-password flow)."""

    rate_limit(request, "auth.reset_password", limit=15, window=600)



    token_hash = hashlib.sha256(body.token.strip().encode("utf-8")).hexdigest()

    user_id = deps.db.consume_password_reset_token(token_hash)

    if user_id is None:

        raise HTTPException(

            status_code=400,

            detail="Invalid or expired reset link",

        )



    user = deps.db.get_user_by_id(user_id)

    if not user:

        raise HTTPException(status_code=400, detail="Invalid or expired reset link")



    validate_password(body.new_password, username=str(user["username"]))

    deps.db.update_password(int(user["id"]), hash_password(body.new_password))

    deps.db.bump_token_version(int(user["id"]))



    return {

        "success": True,

        "message": "Password updated. You can sign in now.",

    }


@router.post("/api/auth/logout-all")

def logout_all(current_user: dict = Depends(get_current_user)):

    """Invalidate every outstanding token for the calling user.



    The next request from any device will get a 401 and need to log in

    again. Useful after a suspected token leak or shared-device cleanup.

    """

    deps.db.bump_token_version(current_user["user_id"])

    return {"success": True}


@router.post("/api/auth/change-password")

def change_password(

    body: PasswordChange,

    request: Request,

    current_user: dict = Depends(get_current_user),

):

    """Verify the current password, set a new one, and revoke all old tokens."""

    rate_limit(request, "auth.change_password", limit=5, window=300)



    user = deps.db.get_user_by_id(current_user["user_id"])

    if not user:

        raise HTTPException(status_code=404, detail="User not found")

    if not verify_password(body.current_password, user["password_hash"]):

        raise HTTPException(status_code=401, detail="Current password is incorrect")

    validate_password(body.new_password, username=user["username"])



    new_hash = hash_password(body.new_password)

    deps.db.update_password(user_id=user["id"], password_hash=new_hash)

    deps.db.bump_token_version(user["id"])



    # Re-issue tokens so the caller doesn't have to redo the login flow.
    new_version = deps.db.get_user_token_version(user["id"]) or 0
    return {
        "success": True,
        **_issue_tokens(
            request, user_id=user["id"], username=user["username"], token_version=new_version
        ),
    }


@router.post("/api/auth/refresh")
def refresh_session(body: RefreshRequest, request: Request):
    """Trade a refresh token for a new access token and a new refresh token.

    The presented refresh token is consumed. Re-using a consumed token
    revokes the whole login (every token in its family).
    """
    rate_limit(request, "auth.refresh", limit=30, window=300)
    status, user_id, new_refresh = deps.db.rotate_refresh_token(
        body.refresh_token, ttl_seconds=REFRESH_TOKEN_TTL_DAYS * 86400
    )
    if status == "conflict":
        raise HTTPException(status_code=409, detail="Refresh token was just used; retry")
    if status == "reused":
        logger.warning("Refresh token reuse for user %s; session family revoked", user_id)
    if status != "ok":
        raise HTTPException(status_code=401, detail="Session expired, please sign in again")
    user = deps.db.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="Session expired, please sign in again")
    return {
        "success": True,
        "access_token": create_access_token(
            user_id=user["id"],
            username=user["username"],
            token_version=int(user.get("token_version") or 0),
        ),
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_TTL_MINUTES * 60,
        "refresh_token": new_refresh,
    }


@router.post("/api/auth/logout")
def logout(body: RefreshRequest, request: Request):
    """Sign this device out: revoke its refresh token's family.

    Possession of the refresh token is the proof, so no access token is
    needed (it may already be expired). Always succeeds.
    """
    rate_limit(request, "auth.logout", limit=30, window=300)
    deps.db.revoke_refresh_family(body.refresh_token)
    return {"success": True}


@router.post("/api/auth/delete-account")
def delete_account(
    body: AccountDelete,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Permanently delete the caller's account, closet, posts and photos.

    Requires the current password. Required by App Store (5.1.1(v)) and
    Google Play account-deletion policies.
    """
    rate_limit(request, "auth.delete_account", limit=5, window=300)
    user = deps.db.get_user_by_id(current_user["user_id"])
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Password is incorrect")
    files = deps.db.delete_user_account(user["id"])
    if files is None:
        raise HTTPException(status_code=404, detail="User not found")
    _remove_user_upload_files(files)
    logger.info("Account %s deleted", user["id"])
    return {"success": True}


@router.get("/api/auth/me")

def get_me(current_user: dict = Depends(get_current_user)):

    user = deps.db.get_user_by_id(current_user["user_id"])

    if not user:

        raise HTTPException(status_code=404, detail="User not found")

    return _public_user(user)


@router.put("/api/auth/profile")

def update_profile(

    profile_data: UserProfile,

    current_user: dict = Depends(get_current_user),

):

    theme = profile_data.theme_preference

    if theme is not None and theme not in _VALID_THEMES:

        raise HTTPException(status_code=400, detail="Invalid theme")

    email = normalize_email(str(profile_data.email)) if profile_data.email else None

    if email is not None:

        existing = deps.db.get_user_by_email(email)

        if existing and int(existing["id"]) != int(current_user["user_id"]):

            raise HTTPException(status_code=400, detail="Email already exists")

    success = deps.db.update_user_profile(

        user_id=current_user["user_id"],

        full_name=clip_text(profile_data.full_name, max_len=120),

        bio=clip_text(profile_data.bio, max_len=500),

        theme_preference=theme,

        email=email,

    )

    if not success:

        raise HTTPException(status_code=500, detail="Failed to update profile")

    return {"success": True}


@router.get("/api/settings")

def get_settings(current_user: dict = Depends(get_current_user)):

    settings = deps.db.get_user_settings(current_user["user_id"])

    if settings is None:

        raise HTTPException(status_code=404, detail="User not found")

    return settings


@router.put("/api/settings")

def update_settings(

    settings: UserSettingsUpdate,

    current_user: dict = Depends(get_current_user),

):

    patch = settings.dict(exclude_unset=True)

    if not patch:

        return deps.db.get_user_settings(current_user["user_id"])

    if settings.theme_preference is not None and settings.theme_preference not in _VALID_THEMES:

        raise HTTPException(status_code=400, detail="Invalid theme")

    if settings.app_mode is not None and settings.app_mode not in _VALID_APP_MODES:

        raise HTTPException(status_code=400, detail="Invalid app mode")

    if settings.default_tab is not None and settings.default_tab not in _VALID_DEFAULT_TABS:

        raise HTTPException(status_code=400, detail="Invalid default tab")

    ok = deps.db.update_user_settings(

        current_user["user_id"],

        social_enabled=settings.social_enabled,

        app_mode=settings.app_mode,

        default_tab=settings.default_tab,

        default_closet_location_id=settings.default_closet_location_id,

        theme_preference=settings.theme_preference,

    )

    if not ok:

        raise HTTPException(status_code=400, detail="Could not update settings")

    return deps.db.get_user_settings(current_user["user_id"])


# ---- Social: avatar / search / friends / posts -------------------------------



@router.post("/api/auth/avatar")

def upload_avatar(

    request: Request,

    file: UploadFile = File(...),

    current_user: dict = Depends(get_current_user),

):

    """Upload a profile picture. Stored under /uploads/ like clothing photos."""

    rate_limit(request, "upload.avatar", limit=20, window=600)

    saved = save_uploaded_image(

        file, deps.UPLOAD_DIR, prefix=f"avatar_{current_user['user_id']}"

    )

    avatar_url = safe_uploads_url(saved, deps.UPLOAD_DIR)

    deps.db.set_user_avatar(current_user["user_id"], avatar_url)

    return {"success": True, "avatar_url": avatar_url}
