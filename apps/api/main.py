from __future__ import annotations

import os
from typing import List

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import router as api_router


def _parse_origins(raw: str) -> List[str]:
    # Accept comma-separated list. Ignore empties.
    return [o.strip() for o in (raw or "").split(",") if o.strip()]


def create_app() -> FastAPI:
    app = FastAPI(title="Infinito Deployer API", version="0.1.0")

    origins = _parse_origins(os.getenv("CORS_ALLOW_ORIGINS", ""))
    if origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    app.include_router(api_router, prefix="/api")

    @app.get("/health")
    def health() -> dict:
        return {"status": "ok"}

    return app


app = create_app()
