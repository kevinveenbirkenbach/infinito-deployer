from __future__ import annotations

import os
from pathlib import Path
from typing import Optional


def repo_roles_root() -> Path:
    root = os.getenv("INFINITO_REPO_PATH", "/repo/infinito-nexus")
    return Path(root) / "roles"


def categories_path() -> Optional[Path]:
    raw = (os.getenv("ROLE_CATALOG_CATEGORIES_YML", "") or "").strip()
    if not raw:
        return None
    return Path(raw)


def list_json_path() -> Optional[Path]:
    raw = (os.getenv("ROLE_CATALOG_LIST_JSON", "") or "").strip()
    if not raw:
        return None
    return Path(raw)


def file_mtime(path: Optional[Path]) -> int:
    if not path:
        return 0
    try:
        return int(path.stat().st_mtime)
    except Exception:
        return 0


def is_role_dir(path: Path) -> bool:
    return (path / "meta" / "main.yml").is_file()
