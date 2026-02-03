from __future__ import annotations

from typing import Dict, List

from .paths import categories_path


def load_categories() -> Dict[str, List[str]]:
    """
    Optional categories mapping:
      role_id -> [category, ...]

    Supports a pragmatic subset of common YAML shapes:
      1) dict: { "Category": ["role-a", "role-b"], ... }
      2) list of dicts: [{name: "...", roles: [...]}, ...]
      3) list of dicts: [{category: "...", items: [...]}, ...]
    If parsing fails -> treat as no categories (non-fatal).
    """
    path = categories_path()
    if not path or not path.is_file():
        return {}

    try:
        import yaml  # PyYAML is already in requirements

        raw = path.read_text(encoding="utf-8", errors="replace")
        data = yaml.safe_load(raw)
    except Exception:
        return {}

    mapping: Dict[str, List[str]] = {}

    # Shape (1): dict[str, list[str]]
    if isinstance(data, dict):
        for cat, roles in data.items():
            if not isinstance(cat, str) or not isinstance(roles, list):
                continue
            cat_name = cat.strip()
            if not cat_name:
                continue
            for r in roles:
                if isinstance(r, str) and r.strip():
                    mapping.setdefault(r.strip(), []).append(cat_name)
        return mapping

    # Shape (2/3): list[dict]
    if isinstance(data, list):
        for obj in data:
            if not isinstance(obj, dict):
                continue
            cat = obj.get("name") or obj.get("category") or obj.get("title")
            roles = obj.get("roles") or obj.get("items") or obj.get("role_ids")
            if not isinstance(cat, str) or not cat.strip():
                continue
            if not isinstance(roles, list):
                continue
            cat_name = cat.strip()
            for r in roles:
                if isinstance(r, str) and r.strip():
                    mapping.setdefault(r.strip(), []).append(cat_name)
        return mapping

    return {}
