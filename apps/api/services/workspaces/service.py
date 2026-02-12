from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
import tempfile
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

import yaml
from fastapi import HTTPException

from services.job_runner.util import (
    atomic_write_json,
    atomic_write_text,
    safe_mkdir,
    utc_iso,
)
from services.role_index.paths import repo_roles_root

from .paths import workspace_dir, workspaces_root
from .vault import (
    _ensure_secrets_dirs,
    _generate_passphrase,
    _kdbx_path,
    _keys_dir,
    _open_kdbx,
    _read_kdbx_entry,
    _upsert_kdbx_entry,
    _vault_alias,
    _vault_entry_title,
    _vault_password_from_kdbx,
)

WORKSPACE_META_FILENAME = "workspace.json"
INVENTORY_FILENAME = "inventory.yml"

_HIDDEN_FILES = {WORKSPACE_META_FILENAME}
_ID_RE = re.compile(r"^[a-z0-9]{6,32}$")
_VAULT_BLOCK_START_RE = re.compile(r"^([ \t]*).*!vault\s*\|.*$")


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
        _ensure_secrets_dirs(root)

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

    def read_file_bytes(self, workspace_id: str, rel_path: str) -> bytes:
        root = self.ensure(workspace_id)
        target = _safe_resolve(root, rel_path)
        if not target.is_file():
            raise HTTPException(status_code=404, detail="file not found")
        try:
            return target.read_bytes()
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
            raise HTTPException(
                status_code=500, detail=f"failed to create directory: {exc}"
            )
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
            raise HTTPException(
                status_code=400, detail="cannot move directory into itself"
            )
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
        port = payload.get("port")
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
        if port is not None:
            try:
                port = int(port)
            except Exception as exc:
                raise HTTPException(
                    status_code=400, detail=f"invalid port: {exc}"
                ) from exc
            if port < 1 or port > 65535:
                raise HTTPException(status_code=400, detail="port out of range")

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
                    **({"ansible_port": port} if port else {}),
                },
                sort_keys=False,
                default_flow_style=False,
                allow_unicode=True,
            ),
        )
        _apply_cli_host_vars_defaults(
            root / "host_vars" / f"{host_vars_name}.yml", host
        )
        if port:
            host_vars_path = root / "host_vars" / f"{host_vars_name}.yml"
            try:
                host_vars_data = (
                    yaml.safe_load(
                        host_vars_path.read_text(encoding="utf-8", errors="replace")
                    )
                    or {}
                )
            except Exception:
                host_vars_data = {}
            host_vars_data["ansible_port"] = port
            atomic_write_text(
                host_vars_path,
                yaml.safe_dump(
                    host_vars_data,
                    sort_keys=False,
                    default_flow_style=False,
                    allow_unicode=True,
                ),
            )
        atomic_write_text(root / "group_vars" / "all.yml", "")

        meta = _load_meta(root)
        meta.update(
            {
                "inventory_generated_at": _now_iso(),
                "selected_roles": list(cleaned_roles),
                "deploy_target": deploy_target,
                "host": host,
                "port": port,
                "user": user,
                "auth_method": auth_method,
                "host_vars_file": f"host_vars/{host_vars_name}.yml",
                "alias": alias,
            }
        )
        _write_meta(root, meta)

        _ensure_secrets_dirs(root)

    def generate_credentials(
        self,
        workspace_id: str,
        master_password: str,
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

        vault_password = _vault_password_from_kdbx(
            root,
            master_password,
            create_if_missing=True,
            provision_if_missing=True,
        )
        with tempfile.NamedTemporaryFile(
            mode="w", prefix="vault-pass-", delete=False
        ) as tmp:
            tmp.write(vault_password)
            tmp.flush()
            vault_path = Path(tmp.name)
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
                raise HTTPException(
                    status_code=400, detail="host missing for workspace"
                )
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
                vault_path.unlink(missing_ok=True)
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

    @staticmethod
    def _iter_yaml_files(root: Path) -> Iterable[Path]:
        for dirpath, _dirnames, filenames in os.walk(root):
            pdir = Path(dirpath)
            for fname in filenames:
                if fname in _HIDDEN_FILES:
                    continue
                fpath = pdir / fname
                if fpath.suffix.lower() not in {".yml", ".yaml"}:
                    continue
                yield fpath

    @staticmethod
    def _rotate_vault_blocks_for_file(
        path: Path, old_vault: Any, new_vault: Any
    ) -> tuple[str, int]:
        source = path.read_text(encoding="utf-8", errors="replace")
        had_trailing_newline = source.endswith("\n")
        lines = source.splitlines()
        output: List[str] = []
        replaced_blocks = 0
        index = 0

        while index < len(lines):
            line = lines[index]
            match = _VAULT_BLOCK_START_RE.match(line)
            if not match:
                output.append(line)
                index += 1
                continue

            base_indent = len(match.group(1))
            cursor = index + 1
            block_indent: Optional[int] = None
            while cursor < len(lines):
                candidate = lines[cursor]
                if not candidate.strip():
                    if block_indent is None:
                        cursor += 1
                        continue
                    cursor += 1
                    continue
                candidate_indent = len(candidate) - len(candidate.lstrip(" "))
                if candidate_indent <= base_indent:
                    break
                if block_indent is None:
                    block_indent = candidate_indent
                elif candidate_indent < block_indent:
                    break
                cursor += 1

            if block_indent is None:
                output.append(line)
                index += 1
                continue

            block_lines = lines[index + 1 : cursor]
            normalized_lines: List[str] = []
            for block_line in block_lines:
                if not block_line.strip():
                    normalized_lines.append("")
                    continue
                if len(block_line) >= block_indent:
                    normalized_lines.append(block_line[block_indent:])
                else:
                    normalized_lines.append(block_line.lstrip())

            vault_text = "\n".join(normalized_lines).strip()
            if not vault_text.startswith("$ANSIBLE_VAULT;"):
                output.append(line)
                output.extend(block_lines)
                index = cursor
                continue

            try:
                plaintext = old_vault.decrypt(vault_text.encode("utf-8")).decode(
                    "utf-8", errors="replace"
                )
            except Exception as exc:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"failed to decrypt vault block in "
                        f"{path.as_posix()}:{index + 1}: {exc}"
                    ),
                ) from exc
            try:
                rotated = new_vault.encrypt(plaintext.encode("utf-8")).decode(
                    "utf-8", errors="replace"
                )
            except Exception as exc:
                raise HTTPException(
                    status_code=500,
                    detail=(
                        f"failed to encrypt vault block in "
                        f"{path.as_posix()}:{index + 1}: {exc}"
                    ),
                ) from exc

            output.append(line)
            for encrypted_line in rotated.strip().splitlines():
                output.append((" " * block_indent) + encrypted_line)
            replaced_blocks += 1
            index = cursor

        updated = "\n".join(output)
        if had_trailing_newline:
            updated += "\n"
        return updated, replaced_blocks

    def set_vault_entries(
        self,
        workspace_id: str,
        *,
        master_password: str,
        master_password_confirm: Optional[str],
        create_if_missing: bool,
        alias: Optional[str],
        server_password: Optional[str],
        vault_password: Optional[str],
        key_passphrase: Optional[str],
    ) -> bool:
        root = self.ensure(workspace_id)
        kp = _open_kdbx(
            root,
            master_password,
            create_if_missing=create_if_missing,
            master_password_confirm=master_password_confirm,
        )
        if server_password is not None:
            _upsert_kdbx_entry(
                kp, _vault_entry_title("server_password", alias), server_password
            )
        if vault_password is not None:
            _upsert_kdbx_entry(kp, _vault_entry_title("vault_password"), vault_password)
        if key_passphrase is not None:
            _upsert_kdbx_entry(
                kp, _vault_entry_title("key_passphrase", alias), key_passphrase
            )
        kp.save()
        return True

    def set_or_reset_vault_master_password(
        self,
        workspace_id: str,
        *,
        current_master_password: Optional[str],
        new_master_password: str,
        new_master_password_confirm: str,
    ) -> None:
        root = self.ensure(workspace_id)
        if new_master_password != new_master_password_confirm:
            raise HTTPException(
                status_code=400, detail="new master password confirmation mismatch"
            )
        if not new_master_password.strip():
            raise HTTPException(
                status_code=400, detail="new master password is required"
            )

        vault_path = _kdbx_path(root)
        if not vault_path.is_file():
            _open_kdbx(
                root,
                new_master_password,
                create_if_missing=True,
                master_password_confirm=new_master_password,
            )
            return

        if not (current_master_password or "").strip():
            raise HTTPException(
                status_code=400,
                detail="current master password is required",
            )

        kp = _open_kdbx(
            root,
            current_master_password,
            create_if_missing=False,
            master_password_confirm=None,
        )
        kp.change_password(new_master_password)
        kp.save()

    def change_vault_master_password(
        self,
        workspace_id: str,
        *,
        master_password: str,
        new_master_password: str,
        new_master_password_confirm: str,
    ) -> None:
        self.set_or_reset_vault_master_password(
            workspace_id=workspace_id,
            current_master_password=master_password,
            new_master_password=new_master_password,
            new_master_password_confirm=new_master_password_confirm,
        )

    def reset_vault_password(
        self,
        workspace_id: str,
        *,
        master_password: str,
        new_vault_password: Optional[str] = None,
    ) -> Dict[str, int]:
        root = self.ensure(workspace_id)
        kp = _open_kdbx(
            root,
            master_password,
            create_if_missing=False,
            master_password_confirm=None,
        )
        current_vault_password = _read_kdbx_entry(
            kp, _vault_entry_title("vault_password")
        )
        if not current_vault_password:
            raise HTTPException(status_code=400, detail="vault password not set")

        next_vault_password = (new_vault_password or "").strip() or _generate_passphrase()
        if next_vault_password == current_vault_password:
            raise HTTPException(
                status_code=400, detail="new vault password must differ"
            )

        try:
            from ansible.parsing.vault import VaultLib, VaultSecret
        except Exception as exc:
            raise HTTPException(
                status_code=500, detail=f"ansible vault unavailable: {exc}"
            ) from exc

        old_vault = VaultLib(
            secrets=[("default", VaultSecret(current_vault_password.encode()))]
        )
        new_vault = VaultLib(
            secrets=[("default", VaultSecret(next_vault_password.encode()))]
        )

        updated_files = 0
        updated_values = 0
        for file_path in self._iter_yaml_files(root):
            updated_content, replaced_blocks = self._rotate_vault_blocks_for_file(
                file_path, old_vault, new_vault
            )
            if replaced_blocks <= 0:
                continue
            atomic_write_text(file_path, updated_content)
            updated_files += 1
            updated_values += replaced_blocks

        _upsert_kdbx_entry(
            kp, _vault_entry_title("vault_password"), next_vault_password
        )
        kp.save()
        return {
            "updated_files": updated_files,
            "updated_values": updated_values,
        }

    def generate_ssh_keypair(
        self,
        workspace_id: str,
        *,
        alias: str,
        algorithm: str,
        with_passphrase: bool,
        master_password: Optional[str] = None,
        master_password_confirm: Optional[str] = None,
        return_passphrase: bool = False,
    ) -> Dict[str, Any]:
        root = self.ensure(workspace_id)
        _ensure_secrets_dirs(root)

        safe_alias = _vault_alias(alias)
        key_dir = _keys_dir(root)
        key_private = key_dir / safe_alias
        key_public = key_dir / f"{safe_alias}.pub"

        if key_private.exists():
            try:
                key_private.unlink()
            except Exception:
                pass
        if key_public.exists():
            try:
                key_public.unlink()
            except Exception:
                pass

        algo = (algorithm or "ed25519").lower().strip()
        if algo not in {"ed25519", "rsa", "ecdsa"}:
            raise HTTPException(status_code=400, detail="unsupported ssh algorithm")

        passphrase = ""
        if with_passphrase:
            if not master_password:
                raise HTTPException(
                    status_code=400, detail="master_password is required"
                )
            passphrase = _generate_passphrase()

        cmd = [
            "ssh-keygen",
            "-t",
            algo,
            "-f",
            str(key_private),
            "-N",
            passphrase,
            "-q",
        ]
        if algo == "rsa":
            cmd.extend(["-b", "4096"])
        comment = (alias or "").strip()
        if comment:
            cmd.extend(["-C", comment])

        res = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=False,
        )
        if res.returncode != 0 or not key_private.exists():
            raise HTTPException(
                status_code=500,
                detail="ssh-keygen failed",
            )

        try:
            key_private.chmod(0o600)
        except Exception:
            pass

        private_key = key_private.read_text(encoding="utf-8", errors="replace")
        public_key = key_public.read_text(encoding="utf-8", errors="replace")

        if with_passphrase:
            kp = _open_kdbx(
                root,
                master_password or "",
                create_if_missing=True,
                master_password_confirm=master_password_confirm,
            )
            _upsert_kdbx_entry(
                kp, _vault_entry_title("key_passphrase", alias), passphrase
            )
            kp.save()

        response: Dict[str, Any] = {
            "private_key": private_key,
            "public_key": public_key,
            "key_path": key_private.relative_to(root).as_posix(),
            "public_key_path": key_public.relative_to(root).as_posix(),
        }
        if with_passphrase and return_passphrase:
            response["passphrase"] = passphrase
        return response

    def change_key_passphrase(
        self,
        workspace_id: str,
        *,
        alias: str,
        master_password: str,
        new_passphrase: str,
        new_passphrase_confirm: str,
    ) -> None:
        if new_passphrase != new_passphrase_confirm:
            raise HTTPException(
                status_code=400, detail="new passphrase confirmation mismatch"
            )
        root = self.ensure(workspace_id)
        key_private = _keys_dir(root) / _vault_alias(alias)
        if not key_private.is_file():
            raise HTTPException(status_code=404, detail="private key not found")

        kp = _open_kdbx(
            root, master_password, create_if_missing=False, master_password_confirm=None
        )
        old_passphrase = _read_kdbx_entry(
            kp, _vault_entry_title("key_passphrase", alias)
        )
        cmd = [
            "ssh-keygen",
            "-p",
            "-f",
            str(key_private),
            "-P",
            old_passphrase or "",
            "-N",
            new_passphrase,
        ]
        res = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=False,
        )
        if res.returncode != 0:
            raise HTTPException(status_code=500, detail="failed to update passphrase")

        _upsert_kdbx_entry(
            kp, _vault_entry_title("key_passphrase", alias), new_passphrase
        )
        kp.save()

    def vault_decrypt(
        self, workspace_id: str, *, master_password: str, vault_text: str
    ) -> str:
        root = self.ensure(workspace_id)
        vault_password = _vault_password_from_kdbx(root, master_password)
        raw = (vault_text or "").strip()
        if not raw:
            raise HTTPException(status_code=400, detail="vault_text is required")
        try:
            from ansible.parsing.vault import VaultLib, VaultSecret
        except Exception as exc:
            raise HTTPException(
                status_code=500, detail=f"ansible vault unavailable: {exc}"
            )
        vault = VaultLib(secrets=[("default", VaultSecret(vault_password.encode()))])
        try:
            decrypted = vault.decrypt(raw.encode("utf-8"))
        except Exception:
            raise HTTPException(status_code=400, detail="vault decryption failed")
        return decrypted.decode("utf-8", errors="replace")

    def vault_encrypt(
        self, workspace_id: str, *, master_password: str, plaintext: str
    ) -> str:
        root = self.ensure(workspace_id)
        vault_password = _vault_password_from_kdbx(root, master_password)
        if plaintext is None:
            raise HTTPException(status_code=400, detail="plaintext is required")
        try:
            from ansible.parsing.vault import VaultLib, VaultSecret
        except Exception as exc:
            raise HTTPException(
                status_code=500, detail=f"ansible vault unavailable: {exc}"
            )
        vault = VaultLib(secrets=[("default", VaultSecret(vault_password.encode()))])
        try:
            encrypted = vault.encrypt(plaintext.encode("utf-8"))
        except Exception:
            raise HTTPException(status_code=400, detail="vault encryption failed")
        return encrypted.decode("utf-8", errors="replace")

    def test_connection(
        self,
        *,
        host: str,
        port: Optional[int],
        user: str,
        auth_method: str,
        password: Optional[str],
        private_key: Optional[str],
        key_passphrase: Optional[str],
        timeout: int = 6,
    ) -> Dict[str, Any]:
        ping_ok = False
        ping_error: Optional[str] = None
        ssh_ok = False
        ssh_error: Optional[str] = None

        if host:
            try:
                res = subprocess.run(
                    ["ping", "-c", "1", "-W", "2", host],
                    capture_output=True,
                    text=True,
                    check=False,
                )
                ping_ok = res.returncode == 0
                if not ping_ok:
                    ping_error = (res.stderr or res.stdout or "ping failed").strip()
            except Exception as exc:
                ping_ok = False
                ping_error = str(exc)

        try:
            import paramiko
            from io import StringIO
        except Exception as exc:
            ssh_error = f"paramiko unavailable: {exc}"
            return {
                "ping_ok": ping_ok,
                "ping_error": ping_error,
                "ssh_ok": False,
                "ssh_error": ssh_error,
            }

        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        try:
            connect_kwargs = {
                "hostname": host,
                "username": user,
                "timeout": timeout,
                "allow_agent": False,
                "look_for_keys": False,
            }
            if port:
                connect_kwargs["port"] = port
            if auth_method == "password":
                client.connect(
                    **connect_kwargs,
                    password=password or "",
                )
            else:
                if not private_key:
                    raise HTTPException(
                        status_code=400, detail="private key is required"
                    )
                key_obj = None
                key_buf = StringIO(private_key)
                key_classes = [
                    paramiko.Ed25519Key,
                    paramiko.RSAKey,
                    paramiko.ECDSAKey,
                    paramiko.DSSKey,
                ]
                for cls in key_classes:
                    key_buf.seek(0)
                    try:
                        key_obj = cls.from_private_key(key_buf, password=key_passphrase)
                        break
                    except Exception:
                        continue
                if key_obj is None:
                    raise HTTPException(
                        status_code=400, detail="failed to load private key"
                    )
                client.connect(
                    **connect_kwargs,
                    pkey=key_obj,
                )
            ssh_ok = True
        except HTTPException as exc:
            ssh_error = str(exc.detail)
        except Exception as exc:
            ssh_error = str(exc)
        finally:
            try:
                client.close()
            except Exception:
                pass

        return {
            "ping_ok": ping_ok,
            "ping_error": ping_error,
            "ssh_ok": ssh_ok,
            "ssh_error": ssh_error,
        }
