from __future__ import annotations

from pathlib import Path
from typing import Dict, Iterable

from roles.role_metadata_extractor import extract_role_metadata
from roles.role_models import RoleMetadata


def _is_role_dir(path: Path) -> bool:
    """
    A role is considered valid if it contains meta/main.yml.
    """
    return (path / "meta" / "main.yml").is_file()


def iter_role_dirs(roles_root: Path) -> Iterable[Path]:
    for child in sorted(roles_root.iterdir()):
        if not child.is_dir():
            continue
        if child.name.startswith("."):
            continue
        if _is_role_dir(child):
            yield child


def build_roles_index(roles_root: Path) -> Dict[str, RoleMetadata]:
    """
    Returns:
      { "role-name": RoleMetadata(...) }
    """
    out: Dict[str, RoleMetadata] = {}
    for role_dir in iter_role_dirs(roles_root):
        md = extract_role_metadata(role_dir)
        out[md.role_name] = md
    return out
