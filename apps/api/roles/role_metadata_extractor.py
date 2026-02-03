from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

import yaml

from roles.role_models import RoleGalaxyInfo, RoleLogo, RoleMetaMain, RoleMetadata


_ALLOWED_STATUSES: Set[str] = {"pre-alpha", "alpha", "beta", "stable", "deprecated"}
_TARGETS_ORDER: List[str] = ["universal", "server", "workstation"]


def _as_mapping(obj: Any) -> Dict[str, Any]:
    return obj if isinstance(obj, dict) else {}


def _as_list(obj: Any) -> List[Any]:
    return obj if isinstance(obj, list) else []


def _as_str(obj: Any) -> Optional[str]:
    if obj is None:
        return None
    if isinstance(obj, str):
        s = obj.strip()
        return s if s else None
    # Sometimes YAML "company" is a multiline literal (already str) or weird types.
    return str(obj).strip() or None


def _stable_dedup_str(items: List[str]) -> List[str]:
    seen: Set[str] = set()
    out: List[str] = []
    for x in items:
        x = x.strip()
        if not x:
            continue
        if x not in seen:
            out.append(x)
            seen.add(x)
    return out


def _normalize_status(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    v = value.strip().lower()
    # allow "prealpha" etc.
    v = v.replace("_", "-").replace(" ", "-")
    if v in _ALLOWED_STATUSES:
        return v
    return v  # keep unknown values visible, but you can clamp to None if you prefer


def _read_yaml(path: Path) -> Dict[str, Any]:
    if not path.is_file():
        return {}
    raw = path.read_text(encoding="utf-8", errors="replace")
    data = yaml.safe_load(raw) or {}
    return data if isinstance(data, dict) else {}


def _parse_logo(gi: Dict[str, Any]) -> Optional[RoleLogo]:
    logo = _as_mapping(gi.get("logo"))
    css_class = _as_str(logo.get("class"))
    return RoleLogo(css_class=css_class) if css_class else None


def parse_meta_main(role_dir: Path) -> RoleMetaMain:
    meta_path = role_dir / "meta" / "main.yml"
    doc = _read_yaml(meta_path)

    gi = _as_mapping(doc.get("galaxy_info"))
    galaxy_tags = [
        str(x).strip() for x in _as_list(gi.get("galaxy_tags")) if str(x).strip()
    ]
    run_after = [
        str(x).strip() for x in _as_list(gi.get("run_after")) if str(x).strip()
    ]
    platforms = _as_list(gi.get("platforms"))

    galaxy_info = RoleGalaxyInfo(
        author=_as_str(gi.get("author")),
        description=_as_str(gi.get("description")),
        license=_as_str(gi.get("license")),
        license_url=_as_str(gi.get("license_url")),
        company=_as_str(gi.get("company")),
        galaxy_tags=_stable_dedup_str(galaxy_tags),
        repository=_as_str(gi.get("repository")),
        issue_tracker_url=_as_str(gi.get("issue_tracker_url")),
        documentation=_as_str(gi.get("documentation")),
        min_ansible_version=_as_str(gi.get("min_ansible_version")),
        platforms=platforms if isinstance(platforms, list) else [],
        lifecycle=_as_str(gi.get("lifecycle")),
        run_after=_stable_dedup_str(run_after),
        logo=_parse_logo(gi),
    )

    deps = doc.get("dependencies", [])
    dependencies: List[str] = []
    if isinstance(deps, list):
        for x in deps:
            if isinstance(x, str):
                s = x.strip()
                if s:
                    dependencies.append(s)
            elif isinstance(x, dict):
                # Ansible meta deps can also be dicts (role + vars).
                role_name = _as_str(x.get("role")) or _as_str(x.get("name"))
                if role_name:
                    dependencies.append(role_name)

    return RoleMetaMain(
        galaxy_info=galaxy_info,
        dependencies=_stable_dedup_str(dependencies),
    )


def _extract_description_from_readme(role_dir: Path) -> Optional[str]:
    """
    README fallback:
    - Take the first non-empty paragraph after the first heading.
    - If no headings found, take first non-empty paragraph.
    """
    readme = role_dir / "README.md"
    if not readme.is_file():
        return None

    text = readme.read_text(encoding="utf-8", errors="replace")
    lines = [ln.rstrip() for ln in text.splitlines()]

    # Identify first heading line like "# Title"
    heading_idx: Optional[int] = None
    for i, ln in enumerate(lines):
        if re.match(r"^\s*#\s+\S+", ln):
            heading_idx = i
            break

    start = (heading_idx + 1) if heading_idx is not None else 0

    # Collect first paragraph (non-empty lines until blank)
    buf: List[str] = []
    in_para = False
    for ln in lines[start:]:
        if not ln.strip():
            if in_para and buf:
                break
            continue
        # skip badges and pure image lines at the top (common in READMEs)
        if not in_para and re.match(r"^\s*!\[.*\]\(.*\)\s*$", ln):
            continue
        if not in_para and re.match(r"^\s*\[!\[.*\]\(.*\)\]\(.*\)\s*$", ln):
            continue
        in_para = True
        buf.append(ln.strip())

    desc = " ".join(buf).strip()
    return desc if desc else None


def _derive_deployment_targets(
    role_name: str, platforms: List[Dict[str, Any]]
) -> List[str]:
    """
    Heuristics:
    - workstation: desk-*, util-desk-*, drv-*
    - server: web-app-*, svc-*, sys-*, util-srv-*, persona-*
    - universal: anything that clearly spans multiple OS families or does not match above,
      or if both workstation+server triggers happen.
    """
    name = role_name.strip()

    targets: Set[str] = set()

    # Prefix-based hints
    workstation_prefixes = ("desk-", "util-desk-", "drv-")
    server_prefixes = (
        "web-app-",
        "svc-",
        "sys-",
        "util-srv-",
        "persona-",
        "persona-provider-",
    )

    if name.startswith(workstation_prefixes):
        targets.add("workstation")
    if name.startswith(server_prefixes):
        targets.add("server")

    # Platform-based hints
    platform_names = []
    for p in platforms:
        pm = p if isinstance(p, dict) else {}
        n = pm.get("name")
        if isinstance(n, str) and n.strip():
            platform_names.append(n.strip().lower())

    if "docker" in platform_names:
        targets.add("server")

    # If it spans many OS families, treat as universal (common for update-* / sys-* glue roles).
    os_families = {
        "archlinux",
        "debian",
        "ubuntu",
        "fedora",
        "el",
        "genericlinux",
        "linux",
        "any",
    }
    family_hits = {x for x in platform_names if x in os_families}
    if len(family_hits) >= 3:
        targets.add("universal")

    # If none determined, default to universal.
    if not targets:
        targets.add("universal")

    # If both server and workstation are present, prefer universal as additional target.
    if "server" in targets and "workstation" in targets:
        targets.add("universal")

    # Stable ordering
    return [t for t in _TARGETS_ORDER if t in targets]


def extract_role_metadata(role_dir: Path) -> RoleMetadata:
    role_name = role_dir.name
    meta = parse_meta_main(role_dir)

    # Description: meta first, README fallback
    description = (meta.galaxy_info.description or "").strip()
    if not description:
        description = (_extract_description_from_readme(role_dir) or "").strip()
    if not description:
        description = "(no description provided)"

    deployment_targets = _derive_deployment_targets(
        role_name, meta.galaxy_info.platforms
    )
    status = _normalize_status(meta.galaxy_info.lifecycle)

    return RoleMetadata(
        role_name=role_name,
        role_path=role_dir,
        description=description,
        author=meta.galaxy_info.author,
        company=meta.galaxy_info.company,
        license=meta.galaxy_info.license,
        license_url=meta.galaxy_info.license_url,
        repository=meta.galaxy_info.repository,
        issue_tracker_url=meta.galaxy_info.issue_tracker_url,
        documentation=meta.galaxy_info.documentation,
        min_ansible_version=meta.galaxy_info.min_ansible_version,
        galaxy_tags=meta.galaxy_info.galaxy_tags,
        dependencies=meta.dependencies,
        lifecycle=meta.galaxy_info.lifecycle,
        run_after=meta.galaxy_info.run_after,
        platforms=meta.galaxy_info.platforms,
        logo=meta.galaxy_info.logo,
        deployment_targets=deployment_targets,
        status=status,
    )
