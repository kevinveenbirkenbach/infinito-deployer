from __future__ import annotations

import os
from pathlib import Path
from typing import List

from fastapi import APIRouter

from api.schemas.role import RoleOut, RoleLogoOut
from roles.roles_indexer import build_roles_index

router = APIRouter(prefix="/roles", tags=["roles"])


def _repo_roles_root() -> Path:
    """
    Uses INFINITO_REPO_PATH (mounted into the API container) and returns <repo>/roles.
    """
    root = os.getenv("INFINITO_REPO_PATH", "/repo/infinito-nexus")
    return Path(root) / "roles"


@router.get("/metadata", response_model=List[RoleOut])
def list_roles_metadata() -> List[RoleOut]:
    idx = build_roles_index(_repo_roles_root())

    out: List[RoleOut] = []
    for name in sorted(idx.keys()):
        md = idx[name]
        out.append(
            RoleOut(
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
                status=md.status,
                run_after=md.run_after,
                platforms=md.platforms,
                logo=(RoleLogoOut(css_class=md.logo.css_class) if md.logo else None),
                deployment_targets=md.deployment_targets,
            )
        )
    return out
