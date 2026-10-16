"""FastAPI app + routes.



Security posture (see PROJECT.md for the long version):

- All /api/ routes outside /api/auth/{register,login,forgot-password,reset-password}
  require a valid Bearer JWT. Every route that takes an item / queue id as a path parameter checks

  ownership against the authenticated user before doing anything.

- Uploads go through ``security.save_uploaded_image``: server-generated

  filenames, magic-byte sniffing, PIL re-validation, byte cap.

- Auth endpoints are rate-limited per IP; failed logins also tick a

  per-account counter that locks the account after enough failures.

- Internal exceptions are never echoed back to clients — generic messages

  only. The actual traceback goes to the server log.

"""

from __future__ import annotations

import mimetypes
import os
import uvicorn
from security import (
    ALLOWED_ORIGINS,
    BodyLimitMiddleware,
    PRODUCTION,
    SecurityHeadersMiddleware,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from observability import init_sentry
import deps
from routers import auth, closet, items, outfits, pages, planning, social, trips, weather


# Must run before FastAPI() so Sentry's integration hooks the app.
init_sentry()


app = FastAPI(

    title="Closet-Org API",

    version="1.0.0",

    docs_url=None if PRODUCTION else "/docs",

    redoc_url=None if PRODUCTION else "/redoc",

    openapi_url=None if PRODUCTION else "/openapi.json",

)


# ---- Middleware --------------------------------------------------------------

# Order matters: outermost runs first on requests, last on responses.



app.add_middleware(SecurityHeadersMiddleware)


app.add_middleware(BodyLimitMiddleware)


_cors_common = dict(

    allow_credentials=True,

    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],

    allow_headers=["Authorization", "Content-Type", "Accept", "X-Closet-Refresh"],

    max_age=600,

)


if PRODUCTION:

    app.add_middleware(

        CORSMiddleware,

        allow_origins=ALLOWED_ORIGINS,

        **_cors_common,

    )

else:

    # LAN Expo Web (http://192.168.x.x:8084) and odd hostnames — regex covers dev-only.

    app.add_middleware(

        CORSMiddleware,

        allow_origins=ALLOWED_ORIGINS,

        allow_origin_regex=r"https?://[\w.\-]+(:\d+)?",

        **_cors_common,

    )


# Grid thumbnails are WebP. Some Python builds (Windows, minimal Linux images)
# don't map .webp, and /uploads is served with nosniff, so browsers would
# refuse to draw an application/octet-stream image.
mimetypes.add_type("image/webp", ".webp")
app.mount("/uploads", StaticFiles(directory=str(deps.UPLOAD_DIR)), name="uploads")


app.mount("/frontend", StaticFiles(directory=str(deps.FRONTEND_DIR)), name="frontend")

app.include_router(pages.router)
app.include_router(weather.router)
app.include_router(auth.router)
app.include_router(closet.router)
app.include_router(trips.router)
app.include_router(planning.router)
app.include_router(items.router)
app.include_router(outfits.router)
app.include_router(social.router)


# ---- Entry point -------------------------------------------------------------



if __name__ == "__main__":

    # Default `127.0.0.1` avoids binding all interfaces. For Expo Go on a LAN
    # device, run with `HOST=0.0.0.0`. Production should use a reverse proxy
    # and typically bind loopback.

    host = os.getenv("HOST", "127.0.0.1")

    port = int(os.getenv("PORT", "8000"))

    reload = not PRODUCTION and os.getenv("UVICORN_RELOAD", "1") == "1"

    uvicorn.run("main:app", host=host, port=port, reload=reload)
