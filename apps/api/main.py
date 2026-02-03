from __future__ import annotations

import os
from typing import List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware


from api.routes import router as api_router
from services.role_catalog import RoleCatalogError, RoleCatalogService


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

    catalog = RoleCatalogService()

    app.include_router(api_router, prefix="/api")

    @app.get("/health")
    def health() -> dict:
        return {"status": "ok"}

    @app.get("/api/roles")
    def list_roles() -> dict:
        """
        Canonical role list endpoint (1.1).

        Strict:
          - If ROLE_CATALOG_LIST_JSON is missing or invalid -> HTTP 500
        """
        try:
            roles = catalog.load_roles()
        except RoleCatalogError as exc:
            raise HTTPException(status_code=500, detail=str(exc))
        return {"roles": [r.id for r in roles]}

    return app


app = create_app()
