from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
import tempfile
from io import BytesIO
from pathlib import Path
from typing import Any

import yaml
from fastapi import HTTPException

from services.job_runner.util import atomic_write_text, safe_mkdir
from services.role_index.paths import repo_roles_root
from .workspace_context import (
    INVENTORY_FILENAME,
    WORKSPACE_META_FILENAME,
    _load_meta,
    _now_iso,
    _repo_root,
    _safe_resolve,
    _sanitize_host_filename,
    _write_meta,
)
from .vault import _vault_password_from_kdbx


class WorkspaceServiceArtifactsMixin:
    def generate_credentials(
        self,
        workspace_id: str,
        master_password: str,
        selected_roles: list[str] | None,
        allow_empty_plain: bool,
        set_values: list[str] | None,
        force: bool,
        alias: str | None,
    ) -> None:
        root = self.ensure(workspace_id)
        meta = _load_meta(root)
        role_ids = selected_roles or meta.get("selected_roles") or []
        if not role_ids:
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
            vault_password_file = Path(tmp.name)
        try:
            vault_password_file.chmod(0o600)
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
            host_vars_data: dict[str, Any] = {}
            host = str(meta.get("host") or "").strip()
            user = str(meta.get("user") or "").strip()
            if host:
                host_vars_data["ansible_host"] = host
            if user:
                host_vars_data["ansible_user"] = user
            try:
                raw_port = meta.get("port")
                if raw_port is not None:
                    port = int(raw_port)
                    if 1 <= port <= 65535:
                        host_vars_data["ansible_port"] = port
            except Exception:
                pass

            try:
                safe_mkdir(host_vars_path.parent)
                atomic_write_text(
                    host_vars_path,
                    yaml.safe_dump(
                        host_vars_data,
                        sort_keys=False,
                        default_flow_style=False,
                        allow_unicode=True,
                    ),
                )
            except Exception as exc:
                raise HTTPException(
                    status_code=500, detail=f"failed to create host vars file: {exc}"
                ) from exc

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
            for role_id in role_ids:
                role_dir = role_root / role_id
                if not role_dir.is_dir():
                    raise HTTPException(
                        status_code=400, detail=f"role not found: {role_id}"
                    )

                command = [
                    sys.executable,
                    "-m",
                    "cli.create.credentials",
                    "--role-path",
                    str(role_dir),
                    "--inventory-file",
                    str(host_vars_path),
                    "--vault-password-file",
                    str(vault_password_file),
                ]
                if allow_empty_plain:
                    command.append("--allow-empty-plain")
                if force:
                    command.extend(["--force", "--yes"])
                for item in set_values or []:
                    if item:
                        command.extend(["--set", item])

                result = subprocess.run(
                    command,
                    capture_output=True,
                    text=True,
                    check=False,
                    cwd=str(repo_root),
                    env=env,
                )
                if result.returncode != 0:
                    raise HTTPException(
                        status_code=500,
                        detail=(
                            f"credential generation failed for {role_id} "
                            f"(exit {result.returncode})"
                        ),
                    )
        finally:
            try:
                vault_password_file.unlink(missing_ok=True)
            except Exception:
                pass

    def build_zip(self, workspace_id: str) -> bytes:
        import zipfile

        root = self.ensure(workspace_id)
        buffer = BytesIO()
        with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for dirpath, _dirnames, filenames in os.walk(root):
                current_dir = Path(dirpath)
                for filename in filenames:
                    if filename == WORKSPACE_META_FILENAME:
                        continue
                    file_path = current_dir / filename
                    archive.write(file_path, file_path.relative_to(root).as_posix())
        return buffer.getvalue()

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
                        path
                        for path in host_vars_dir.iterdir()
                        if path.is_file() and path.suffix in (".yml", ".yaml")
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
            archive = zipfile.ZipFile(BytesIO(data))
        except Exception as exc:
            raise HTTPException(status_code=400, detail="invalid zip") from exc

        root_resolved = root.resolve()
        with archive:
            for info in archive.infolist():
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
                if any(part == WORKSPACE_META_FILENAME for part in parts):
                    continue

                target = root / "/".join(parts)
                resolved = target.resolve()
                if resolved == root_resolved or root_resolved not in resolved.parents:
                    continue

                safe_mkdir(resolved.parent)
                try:
                    with (
                        archive.open(info) as source,
                        open(resolved, "wb") as destination,
                    ):
                        shutil.copyfileobj(source, destination)
                except Exception as exc:
                    raise HTTPException(
                        status_code=500, detail=f"failed to extract zip: {exc}"
                    ) from exc

        self._refresh_meta_after_upload(root)
