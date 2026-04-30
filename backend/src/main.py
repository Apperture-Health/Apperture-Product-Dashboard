from __future__ import annotations

import logging
import os

from fastapi import FastAPI
from starlette.middleware.sessions import SessionMiddleware

from api.routes import api_router
from utils.preloader import start_background_preload
from utils.runtime import runtime


def create_app() -> FastAPI:
    app = FastAPI(title="CTIP FastAPI Backend", version="1.0.0")
    app.add_middleware(
        SessionMiddleware,
        secret_key=runtime.secrets.get("app", {}).get("session_secret", "ctip-dev-secret"),
        same_site="lax",
        https_only=os.getenv("HTTPS_ONLY", "false").lower() == "true",
    )
    app.include_router(api_router)

    @app.on_event("startup")
    async def _startup() -> None:
        logging.basicConfig(level=logging.INFO)
        start_background_preload()

    return app


app = create_app()
