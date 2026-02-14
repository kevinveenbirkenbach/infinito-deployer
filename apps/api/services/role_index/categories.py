from __future__ import annotations

from typing import Dict, Iterable, List

from .paths import categories_path


def _dedupe(values: Iterable[str]) -> List[str]:
    out: List[str] = []
    seen: set[str] = set()
    for value in values:
        key = value.strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(value.strip())
    return out


def _load_explicit_mapping(data: object) -> Dict[str, List[str]]:
    mapping: Dict[str, List[str]] = {}
    if not isinstance(data, dict):
        return mapping
    for cat, roles in data.items():
        if not isinstance(cat, str) or not isinstance(roles, list):
            continue
        cat_name = cat.strip()
        if not cat_name:
            continue
        for role_id in roles:
            if isinstance(role_id, str) and role_id.strip():
                mapping.setdefault(role_id.strip(), []).append(cat_name)
    return {key: _dedupe(values) for key, values in mapping.items()}


def _load_list_mapping(data: object) -> Dict[str, List[str]]:
    mapping: Dict[str, List[str]] = {}
    if not isinstance(data, list):
        return mapping
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
        for role_id in roles:
            if isinstance(role_id, str) and role_id.strip():
                mapping.setdefault(role_id.strip(), []).append(cat_name)
    return {key: _dedupe(values) for key, values in mapping.items()}


def _load_prefix_tree_mapping(
    data: object, role_ids: Iterable[str] | None
) -> Dict[str, List[str]]:
    if not role_ids:
        return {}

    root = data
    if isinstance(data, dict) and isinstance(data.get("roles"), dict):
        root = data.get("roles")
    if not isinstance(root, dict):
        return {}

    mapping: Dict[str, List[str]] = {}
    for role_id in role_ids:
        rid = str(role_id or "").strip()
        if not rid:
            continue
        parts = [part.strip() for part in rid.split("-") if part.strip()]
        if not parts:
            continue

        node: object = root
        titles: List[str] = []
        for part in parts:
            if not isinstance(node, dict):
                break
            child = node.get(part)
            if not isinstance(child, dict):
                break
            title = child.get("title")
            if isinstance(title, str) and title.strip():
                titles.append(title.strip())
            node = child

        if titles:
            mapping[rid] = _dedupe(titles)

    return mapping


def load_categories(role_ids: Iterable[str] | None = None) -> Dict[str, List[str]]:
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

    explicit = _load_explicit_mapping(data)
    if explicit:
        return explicit

    list_mapping = _load_list_mapping(data)
    if list_mapping:
        return list_mapping

    return _load_prefix_tree_mapping(data, role_ids)
