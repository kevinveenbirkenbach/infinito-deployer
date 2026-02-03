from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class RoleLogoOut(BaseModel):
    css_class: str


class RoleOut(BaseModel):
    # Required by A/C
    id: str
    display_name: str
    status: str  # always present (pre-alpha/alpha/beta/stable/deprecated)

    # Existing
    role_name: str
    description: str

    author: Optional[str] = None
    company: Optional[str] = None
    license: Optional[str] = None
    license_url: Optional[str] = None
    repository: Optional[str] = None
    issue_tracker_url: Optional[str] = None
    documentation: Optional[str] = None
    min_ansible_version: Optional[str] = None

    galaxy_tags: List[str] = []
    dependencies: List[str] = []
    lifecycle: Optional[str] = None
    run_after: List[str] = []
    platforms: List[Dict[str, Any]] = []
    logo: Optional[RoleLogoOut] = None

    deployment_targets: List[str] = []
