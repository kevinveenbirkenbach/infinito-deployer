from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional


@dataclass(frozen=True)
class RoleLogo:
    """
    Role logo/icon metadata as found in meta/main.yml.

    Example:
      logo:
        class: fa fa-clipboard
    """

    css_class: str


@dataclass(frozen=True)
class RoleGalaxyInfo:
    author: Optional[str] = None
    description: Optional[str] = None
    license: Optional[str] = None
    license_url: Optional[str] = None
    company: Optional[str] = None
    galaxy_tags: List[str] = field(default_factory=list)
    repository: Optional[str] = None
    issue_tracker_url: Optional[str] = None
    documentation: Optional[str] = None
    min_ansible_version: Optional[str] = None
    platforms: List[Dict[str, Any]] = field(default_factory=list)

    # Raw lifecycle as found in meta/main.yml (may be None or arbitrary)
    lifecycle: Optional[str] = None

    run_after: List[str] = field(default_factory=list)
    logo: Optional[RoleLogo] = None


@dataclass(frozen=True)
class RoleMetaMain:
    """
    Parsed data from roles/<role_name>/meta/main.yml
    """

    galaxy_info: RoleGalaxyInfo
    dependencies: List[str] = field(default_factory=list)


@dataclass(frozen=True)
class RoleMetadata:
    """
    Final extracted metadata (meta/main.yml + README fallback).
    """

    # Canonical identifier (for API/UI)
    id: str

    # Human friendly name for UI tiles
    display_name: str

    # Directory name in repo (Infinito.Nexus role name)
    role_name: str
    role_path: Path

    # Core
    description: str

    # From meta/main.yml
    author: Optional[str]
    company: Optional[str]
    license: Optional[str]
    license_url: Optional[str]
    repository: Optional[str]
    issue_tracker_url: Optional[str]
    documentation: Optional[str]
    min_ansible_version: Optional[str]
    galaxy_tags: List[str]
    dependencies: List[str]

    # Raw lifecycle value from meta (kept for debugging/UI)
    lifecycle: Optional[str]

    run_after: List[str]
    platforms: List[Dict[str, Any]]
    logo: Optional[RoleLogo]

    # Derived
    deployment_targets: List[str]  # ["universal"|"server"|"workstation"]

    # Normalized status (always present)
    status: str  # "pre-alpha"|"alpha"|"beta"|"stable"|"deprecated"
