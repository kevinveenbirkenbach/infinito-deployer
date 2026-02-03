from __future__ import annotations

import os
from pathlib import Path
from typing import List

from fastapi import APIRouter

from api.schemas.role import RoleOut, RoleLogoOut
from roles.roles_indexer import build_roles_index
from services.logo_resolver import SimpleIconsResolver

router = APIRouter(prefix="/roles", tags=["roles"])

_logo_resolver = SimpleIconsResolver()


def _repo_roles_root() -> Path:
    root = os.getenv("INFINITO_REPO_PATH", "/repo/infinito-nexus")
    return Path(root) / "roles"


@router.get("/metadata", response_model=List[RoleOut])
def list_roles_metadata() -> List[RoleOut]:
    idx = build_roles_index(_repo_roles_root())

    out: List[RoleOut] = []
    for name in sorted(idx.keys()):
        md = idx[name]

        # Primary: use meta/main.yml logo class (e.g. FontAwesome class)
        if md.logo and md.logo.css_class:
            logo = RoleLogoOut(source="meta", css_class=md.logo.css_class)
        else:
            # Fallback: SimpleIcons -> cached, validated; final fallback is data-url SVG
            resolved = _logo_resolver.resolve_logo_url(
                md.id,
                display_hint=md.display_name,
            )
            logo = RoleLogoOut(source=resolved.source, url=resolved.url)

        out.append(
            RoleOut(
                id=md.id,
                display_name=md.display_name,
                status=md.status,
                role_name=md.role_name,
                description=md.description,
                author=md.author,
                company=md.company,
                license=md.license,
                license_url=md.license_url,
                repository=md.repository,
                issue_tracker_url=md.issue_tracker_url,
                documentation=md.documentation,
                min_ansible_version=md.min_ansible_version,
                galaxy_tags=md.galaxy_tags,
                dependencies=md.dependencies,
                lifecycle=md.lifecycle,
                run_after=md.run_after,
                platforms=md.platforms,
                logo=logo,
                deployment_targets=md.deployment_targets,
            )
        )

    return out
