from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, Iterable, List

import yaml
from fastapi import HTTPException

from services.job_runner.util import atomic_write_json, atomic_write_text, safe_mkdir, utc_iso
from services.role_index.paths import repo_roles_root

from .paths import workspace_dir, workspaces_root

WORKSPACE_META_FILENAME = "workspace.json"
VAULT_PASS_FILENAME = ".vault_pass"
INVENTORY_FILENAME = "inventory.yml"

_HIDDEN_FILES = {WORKSPACE_META_FILENAME, VAULT_PASS_FILENAME}
_ID_RE = re.compile(r"^[a-z0-9]{6,32}$")


def _now_iso() -> str:
    return utc_iso()


def _ensure_workspace_root() -> None:
    safe_mkdir(workspaces_root())


def _sanitize_workspace_id(raw: str) -> str:
    rid = (raw or "").strip().lower()
    if not rid or not _ID_RE.match(rid):
        raise HTTPException(status_code=400, detail="invalid workspace id")
    return rid


def _meta_path(root: Path) -> Path:
    return root / WORKSPACE_META_FILENAME


def _load_meta(root: Path) -> Dict[str, Any]:
    path = _meta_path(root)
    if not path.is_file():
        return {}
    try:
        import json

        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _write_meta(root: Path, data: Dict[str, Any]) -> None:
    atomic_write_json(_meta_path(root), data)


def _safe_resolve(root: Path, rel_path: str) -> Path:
    rel = (rel_path or "").strip().lstrip("/")
    if not rel:
        raise HTTPException(status_code=400, detail="path required")
    candidate = (root / rel).resolve()
    root_resolved = root.resolve()
    if candidate == root_resolved or root_resolved not in candidate.parents:
        raise HTTPException(status_code=400, detail="invalid path")
    if candidate.name in _HIDDEN_FILES:
        raise HTTPException(status_code=403, detail="access denied")
    return candidate


def _to_entry(root: Path, path: Path, is_dir: bool) -> Dict[str, Any]:
    rel = path.relative_to(root).as_posix()
    if path.name in _HIDDEN_FILES:
        return {}
    entry: Dict[str, Any] = {"path": rel, "is_dir": is_dir}
    try:
        st = path.stat()
        if not is_dir:
            entry["size"] = int(st.st_size)
        entry["modified_at"] = utc_iso(st.st_mtime)
    except Exception:
        pass
    return entry


def _sanitize_host_filename(host: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]", "_", host.strip())
    return cleaned or "host"


def _build_inventory(selected_roles: Iterable[str], alias: str) -> Dict[str, Any]:
    children: Dict[str, Any] = {}
    seen: set[str] = set()
    for role_id in selected_roles:
        if not isinstance(role_id, str):
            continue
        rid = role_id.strip()
        if not rid or rid in seen:
            continue
        seen.add(rid)
        children[rid] = {"hosts": {alias: {}}}

    return {"all": {"children": children}}


def _repo_root() -> Path:
    raw = (os.getenv("INFINITO_REPO_PATH", "") or "").strip()
    if not raw:
        raise HTTPException(status_code=500, detail="INFINITO_REPO_PATH is not set")
    root = Path(raw)
    if not root.is_dir():
        raise HTTPException(status_code=500, detail="INFINITO_REPO_PATH is invalid")
    return root


def _ip_defaults(host: str) -> tuple[str, str]:
    host = host.strip()
    ipv4 = "127.0.0.1"
    ipv6 = "::1"
    if re.match(r"^\d{1,3}(?:\.\d{1,3}){3}$", host):
        ipv4 = host
    elif ":" in host:
        ipv6 = host
    return ipv4, ipv6


def _apply_cli_host_vars_defaults(host_vars_path: Path, host: str) -> None:
    repo_root = _repo_root()
    repo_root_str = str(repo_root)
    if repo_root_str not in sys.path:
        sys.path.insert(0, repo_root_str)
    try:
        from cli.create.inventory.host_vars import ensure_host_vars_file
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"failed to load cli.create.inventory.host_vars: {exc}",
        )

    ip4, ip6 = _ip_defaults(host)
    try:
        ensure_host_vars_file(
            host_vars_file=host_vars_path,
            host=host,
            primary_domain=None,
            ssl_disabled=False,
            ip4=ip4,
            ip6=ip6,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"failed to apply host vars defaults: {exc}"
        )


class WorkspaceService:
    def __init__(self) -> None:
        _ensure_workspace_root()

    def create(self) -> Dict[str, Any]:
        import uuid

        _ensure_workspace_root()
        workspace_id = uuid.uuid4().hex[:12]
        root = workspace_dir(workspace_id)
        safe_mkdir(root)
        safe_mkdir(root / "host_vars")
        safe_mkdir(root / "group_vars")

        vault_path = root / VAULT_PASS_FILENAME
        if not vault_path.exists():
            atomic_write_text(vault_path, "")
            try:
                vault_path.chmod(0o600)
            except Exception:
                pass

        meta = {
            "workspace_id": workspace_id,
            "created_at": _now_iso(),
            "inventory_generated_at": None,
            "selected_roles": [],
            "deploy_target": None,
            "host": None,
            "user": None,
            "auth_method": None,
        }
        _write_meta(root, meta)
        return meta

    def ensure(self, workspace_id: str) -> Path:
        rid = _sanitize_workspace_id(workspace_id)
        root = workspace_dir(rid)
        if not root.is_dir():
            raise HTTPException(status_code=404, detail="workspace not found")
        return root

    def list_files(self, workspace_id: str) -> List[Dict[str, Any]]:
        root = self.ensure(workspace_id)
        entries: List[Dict[str, Any]] = []
        for dirpath, dirnames, filenames in os.walk(root):
            pdir = Path(dirpath)
            if pdir != root:
                entry = _to_entry(root, pdir, True)
                if entry:
                    entries.append(entry)
            for fname in filenames:
                if fname in _HIDDEN_FILES:
                    continue
                fpath = pdir / fname
                entry = _to_entry(root, fpath, False)
                if entry:
                    entries.append(entry)
        entries.sort(key=lambda e: (0 if e.get("is_dir") else 1, e.get("path") or ""))
        return entries

    def read_file(self, workspace_id: str, rel_path: str) -> str:
        root = self.ensure(workspace_id)
        target = _safe_resolve(root, rel_path)
        if not target.is_file():
            raise HTTPException(status_code=404, detail="file not found")
        try:
            return target.read_text(encoding="utf-8", errors="replace")
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"failed to read file: {exc}")

    def write_file(self, workspace_id: str, rel_path: str, content: str) -> None:
        root = self.ensure(workspace_id)
        target = _safe_resolve(root, rel_path)
        safe_mkdir(target.parent)
        try:
            atomic_write_text(target, content)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"failed to write file: {exc}")

    def create_dir(self, workspace_id: str, rel_path: str) -> str:
        root = self.ensure(workspace_id)
        raw = (rel_path or "").strip().lstrip("/")
        if not raw:
            raise HTTPException(status_code=400, detail="path required")
        if raw.endswith("/"):
            raw = raw.rstrip("/")
        target = _safe_resolve(root, raw)
        if target.exists():
            raise HTTPException(status_code=409, detail="target already exists")
        try:
            safe_mkdir(target)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"failed to create directory: {exc}")
        return target.relative_to(root).as_posix()

    def rename_file(self, workspace_id: str, rel_path: str, new_path: str) -> str:
        root = self.ensure(workspace_id)
        src = _safe_resolve(root, rel_path)
        if not src.exists():
            raise HTTPException(status_code=404, detail="file not found")
        raw_new = (new_path or "").strip().lstrip("/")
        if not raw_new or raw_new.endswith("/"):
            raise HTTPException(status_code=400, detail="invalid new path")

        dst = _safe_resolve(root, raw_new)
        if src.is_dir() and src in dst.parents:
            raise HTTPException(status_code=400, detail="cannot move directory into itself")
        if dst.exists():
            raise HTTPException(status_code=409, detail="target already exists")
        if not dst.parent.exists():
            raise HTTPException(status_code=400, detail="target directory missing")

        try:
            src.rename(dst)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"failed to rename file: {exc}")
        return dst.relative_to(root).as_posix()

    def delete_file(self, workspace_id: str, rel_path: str) -> None:
        root = self.ensure(workspace_id)
        target = _safe_resolve(root, rel_path)
        if not target.exists():
            raise HTTPException(status_code=404, detail="file not found")
        try:
            if target.is_dir():
                shutil.rmtree(target)
            else:
                target.unlink()
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"failed to delete file: {exc}")

    def generate_inventory(self, workspace_id: str, payload: Dict[str, Any]) -> None:
        root = self.ensure(workspace_id)
        inventory_path = root / INVENTORY_FILENAME
        if inventory_path.exists():
            raise HTTPException(status_code=409, detail="inventory already exists")
        safe_mkdir(root / "host_vars")
        safe_mkdir(root / "group_vars")

        deploy_target = (payload.get("deploy_target") or "").strip()
        alias = (payload.get("alias") or "").strip()
        host = (payload.get("host") or "").strip()
        user = (payload.get("user") or "").strip()
        auth_method = payload.get("auth_method")
        selected_roles = payload.get("selected_roles") or []

        if not deploy_target or not host or not user:
            raise HTTPException(
                status_code=400, detail="deploy_target, host, and user are required"
            )
        if not alias:
            alias = host
        if not selected_roles:
            raise HTTPException(status_code=400, detail="selected_roles is required")

        cleaned_roles: List[str] = []
        seen_roles: set[str] = set()
        for role_id in selected_roles:
            if not isinstance(role_id, str):
                continue
            rid = role_id.strip()
            if not rid or rid in seen_roles:
                continue
            seen_roles.add(rid)
            cleaned_roles.append(rid)

        inventory = _build_inventory(
            selected_roles=cleaned_roles,
            alias=alias,
        )

        inventory_yaml = yaml.safe_dump(
            inventory,
            sort_keys=False,
            default_flow_style=False,
            allow_unicode=True,
        )

        atomic_write_text(inventory_path, inventory_yaml)
        host_vars_name = _sanitize_host_filename(alias)
        atomic_write_text(
            root / "host_vars" / f"{host_vars_name}.yml",
            yaml.safe_dump(
                {
                    "ansible_host": host,
                    "ansible_user": user,
                },
                sort_keys=False,
                default_flow_style=False,
                allow_unicode=True,
            ),
        )
        _apply_cli_host_vars_defaults(
            root / "host_vars" / f"{host_vars_name}.yml", host
        )
        atomic_write_text(root / "group_vars" / "all.yml", "")

        meta = _load_meta(root)
        meta.update(
            {
                "inventory_generated_at": _now_iso(),
                "selected_roles": list(cleaned_roles),
                "deploy_target": deploy_target,
                "host": host,
                "user": user,
                "auth_method": auth_method,
                "host_vars_file": f"host_vars/{host_vars_name}.yml",
                "alias": alias,
            }
        )
        _write_meta(root, meta)

        vault_path = root / VAULT_PASS_FILENAME
        if not vault_path.exists():
            atomic_write_text(vault_path, "")
            try:
                vault_path.chmod(0o600)
            except Exception:
                pass

    def generate_credentials(
        self,
        workspace_id: str,
        vault_password: str,
        selected_roles: List[str] | None,
        allow_empty_plain: bool,
        set_values: List[str] | None,
        force: bool,
        alias: str | None,
    ) -> None:
        root = self.ensure(workspace_id)
        meta = _load_meta(root)
        roles = selected_roles or meta.get("selected_roles") or []
        if not roles:
            raise HTTPException(status_code=400, detail="no roles selected")

        vault_path = root / VAULT_PASS_FILENAME
        atomic_write_text(vault_path, vault_password)
        try:
            vault_path.chmod(0o600)
        except Exception:
            pass
        host_vars_file = None
        alias_value = (alias or meta.get("alias") or "").strip()
        if alias_value:
            host_vars_file = f"host_vars/{_sanitize_host_filename(alias_value)}.yml"
        if not host_vars_file:
            host_vars_file = meta.get("host_vars_file")
        if not host_vars_file:
            host = (meta.get("host") or "").strip()
            if not host:
                raise HTTPException(status_code=400, detail="host missing for workspace")
            host_vars_file = f"host_vars/{_sanitize_host_filename(host)}.yml"

        host_vars_path = _safe_resolve(root, host_vars_file)
        if not host_vars_path.is_file():
            raise HTTPException(status_code=400, detail="host vars file not found")

        role_root = repo_roles_root()
        repo_root = _repo_root()
        env = os.environ.copy()
        repo_root_str = str(repo_root)
        env["PYTHONPATH"] = (
            f"{repo_root_str}{os.pathsep}{env['PYTHONPATH']}"
            if env.get("PYTHONPATH")
            else repo_root_str
        )

        try:
            for role_id in roles:
                role_dir = role_root / role_id
                if not role_dir.is_dir():
                    raise HTTPException(
                        status_code=400, detail=f"role not found: {role_id}"
                    )

                cmd = [
                    sys.executable,
                    "-m",
                    "cli.create.credentials",
                    "--role-path",
                    str(role_dir),
                    "--inventory-file",
                    str(host_vars_path),
                    "--vault-password-file",
                    str(vault_path),
                ]
                if allow_empty_plain:
                    cmd.append("--allow-empty-plain")
                if force:
                    cmd.extend(["--force", "--yes"])
                for item in set_values or []:
                    if not item:
                        continue
                    cmd.extend(["--set", item])

                res = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    check=False,
                    cwd=str(repo_root),
                    env=env,
                )
                if res.returncode != 0:
                    raise HTTPException(
                        status_code=500,
                        detail=(
                            f"credential generation failed for {role_id} "
                            f"(exit {res.returncode})"
                        ),
                    )
        finally:
            try:
                atomic_write_text(vault_path, "")
            except Exception:
                pass

    def build_zip(self, workspace_id: str) -> bytes:
        import zipfile

        root = self.ensure(workspace_id)
        buf = BytesIO()
        with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for dirpath, _dirnames, filenames in os.walk(root):
                pdir = Path(dirpath)
                for fname in filenames:
                    if fname in _HIDDEN_FILES:
                        continue
                    fpath = pdir / fname
                    rel = fpath.relative_to(root).as_posix()
                    zf.write(fpath, rel)
        return buf.getvalue()

    def _refresh_meta_after_upload(self, root: Path) -> None:
        meta = _load_meta(root)
        changed = False

        inventory_path = root / INVENTORY_FILENAME
        if inventory_path.exists() and not meta.get("inventory_generated_at"):
            meta["inventory_generated_at"] = _now_iso()
            changed = True

        host_vars_file = meta.get("host_vars_file")
        if host_vars_file:
            try:
                if not _safe_resolve(root, host_vars_file).is_file():
                    host_vars_file = None
            except HTTPException:
                host_vars_file = None
        if not host_vars_file:
            host_vars_dir = root / "host_vars"
            if host_vars_dir.is_dir():
                candidates = sorted(
                    [
                        p
                        for p in host_vars_dir.iterdir()
                        if p.is_file() and p.suffix in (".yml", ".yaml")
                    ]
                )
                if candidates:
                    meta["host_vars_file"] = f"host_vars/{candidates[0].name}"
                    changed = True

        if changed:
            _write_meta(root, meta)

    def load_zip(self, workspace_id: str, data: bytes) -> None:
        import zipfile

        root = self.ensure(workspace_id)
        try:
            zf = zipfile.ZipFile(BytesIO(data))
        except Exception:
            raise HTTPException(status_code=400, detail="invalid zip")

        root_resolved = root.resolve()
        with zf:
            for info in zf.infolist():
                if info.is_dir():
                    continue
                name = (info.filename or "").replace("\\", "/")
                if not name or name.endswith("/"):
                    continue
                if name.startswith("/") or name.startswith("\\"):
                    continue
                if re.match(r"^[A-Za-z]:", name):
                    continue

                parts = [part for part in name.split("/") if part]
                if not parts or any(part == ".." for part in parts):
                    continue
                if any(part in _HIDDEN_FILES for part in parts):
                    continue

                target = root / "/".join(parts)
                resolved = target.resolve()
                if resolved == root_resolved or root_resolved not in resolved.parents:
                    continue

                safe_mkdir(resolved.parent)
                try:
                    with zf.open(info) as src, open(resolved, "wb") as dst:
                        shutil.copyfileobj(src, dst)
                except Exception as exc:
                    raise HTTPException(
                        status_code=500, detail=f"failed to extract zip: {exc}"
                    )

        self._refresh_meta_after_upload(root)
