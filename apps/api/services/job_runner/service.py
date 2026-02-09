from __future__ import annotations

import os
import shutil
import threading
import uuid
from pathlib import Path
from typing import Any, Dict, List

import yaml

from fastapi import HTTPException

from api.schemas.deployment import DeploymentRequest
from api.schemas.deployment_job import DeploymentJobOut, JobStatus
from services.inventory_preview import build_inventory_preview
from services.workspaces import WorkspaceService

from .paths import job_paths, jobs_root
from .persistence import load_json, mask_request_for_persistence, write_meta
from .runner import start_process, terminate_process_group, write_runner_script
from .config import env_bool, runner_backend
from .container_runner import build_container_command, load_container_config, stop_container
from .secrets import collect_secrets
from .util import atomic_write_json, atomic_write_text, safe_mkdir, utc_iso
from .log_hub import LogHub

_WORKSPACE_SKIP_FILES = {"workspace.json", ".vault_pass"}


class JobRunnerService:
    """
    Filesystem-based job runner.

    Layout:
      ${STATE_DIR}/jobs/<job_id>/
        job.json        (status, pid, timestamps)
        request.json    (masked request - no secrets)
        inventory.yml   (copied from workspace)
        job.log         (stdout/stderr of runner)
        run.sh          (runner script)
    """

    def __init__(self) -> None:
        safe_mkdir(jobs_root())
        self._secret_lock = threading.Lock()
        self._secret_store: Dict[str, List[str]] = {}
        self._log_hub = LogHub()

    def _copy_workspace_files(self, workspace_id: str, dest_root: Path) -> None:
        svc = WorkspaceService()
        src_root = svc.ensure(workspace_id)
        inventory_path = src_root / "inventory.yml"
        if not inventory_path.is_file():
            raise HTTPException(
                status_code=400, detail="workspace inventory.yml not found"
            )

        for dirpath, dirnames, filenames in os.walk(src_root):
            rel = Path(dirpath).relative_to(src_root)
            target_dir = dest_root / rel
            safe_mkdir(target_dir)

            # Skip hidden/system folders if they show up in the workspace root
            dirnames[:] = [d for d in dirnames if not d.startswith(".")]

            for fname in filenames:
                if fname in _WORKSPACE_SKIP_FILES:
                    continue
                src = Path(dirpath) / fname
                dst = target_dir / fname
                shutil.copy2(src, dst)

    def _roles_from_inventory(self, inventory_path: Path) -> List[str]:
        try:
            raw = inventory_path.read_text(encoding="utf-8", errors="replace")
            data = yaml.safe_load(raw) or {}
            children = (data or {}).get("all", {}).get("children", {})
            if isinstance(children, dict):
                return [str(k).strip() for k in children.keys() if str(k).strip()]
        except Exception:
            return []
        return []

    def create(self, req: DeploymentRequest) -> DeploymentJobOut:
        job_id = uuid.uuid4().hex[:12]
        p = job_paths(job_id)
        safe_mkdir(p.job_dir)

        if req.workspace_id:
            self._copy_workspace_files(req.workspace_id, p.job_dir)
        else:
            inv_yaml, _warnings = build_inventory_preview(req)
            atomic_write_text(p.inventory_path, inv_yaml)

        secrets = collect_secrets(req)
        vars_data = self._build_vars(req, p, secrets)
        roles_from_inventory: List[str] = []
        if req.workspace_id and p.inventory_path.is_file():
            roles_from_inventory = self._roles_from_inventory(p.inventory_path)
            if roles_from_inventory:
                vars_data["selected_roles"] = roles_from_inventory

        # Persist masked request + inventory (no secrets on disk)
        atomic_write_json(p.request_path, mask_request_for_persistence(req))
        atomic_write_json(p.vars_json_path, vars_data)
        atomic_write_text(
            p.vars_yaml_path,
            yaml.safe_dump(
                vars_data,
                sort_keys=False,
                default_flow_style=False,
                allow_unicode=True,
            ),
        )

        write_runner_script(p.run_path)
        self._write_infinito_shim(p.job_dir)
        self._remember_secrets(job_id, secrets)

        meta: Dict[str, Any] = {
            "job_id": job_id,
            "status": "queued",
            "created_at": utc_iso(),
            "started_at": None,
            "finished_at": None,
            "pid": None,
            "exit_code": None,
            "container_id": None,
        }
        write_meta(p.meta_path, meta)

        runner_args = None
        backend = runner_backend()
        if backend not in {"local", "container"}:
            raise HTTPException(
                status_code=500,
                detail="JOB_RUNNER_BACKEND must be 'local' or 'container'",
            )

        if not os.environ.get("RUNNER_CMD"):
            cfg = None
            inventory_arg = str(p.inventory_path)
            if backend == "container":
                cfg = load_container_config()
                inventory_arg = f"{cfg.workdir}/inventory.yml"

            cli_args = self._build_runner_args(
                req=req,
                inventory_path=p.inventory_path,
                inventory_arg=inventory_arg,
                roles_from_inventory=roles_from_inventory,
            )

            if backend == "container":
                runner_args, container_id, cfg = build_container_command(
                    job_id=job_id,
                    job_dir=p.job_dir,
                    cli_args=cli_args,
                    cfg=cfg,
                )
                meta["container_id"] = container_id
                if cfg.skip_cleanup:
                    meta["skip_cleanup"] = True
                if cfg.skip_build:
                    meta["skip_build"] = True
                write_meta(p.meta_path, meta)
            else:
                runner_args = cli_args

        try:
            proc, log_fh, reader = start_process(
                run_path=p.run_path,
                cwd=p.job_dir,
                log_path=p.log_path,
                secrets=secrets,
                on_line=lambda line: self._log_hub.publish(job_id, line),
                args=runner_args,
            )
        except Exception as exc:
            meta["status"] = "failed"
            meta["finished_at"] = utc_iso()
            meta["exit_code"] = 127
            write_meta(p.meta_path, meta)
            raise HTTPException(
                status_code=500, detail=f"failed to start runner: {exc}"
            ) from exc

        meta["status"] = "running"
        meta["started_at"] = utc_iso()
        meta["pid"] = proc.pid
        write_meta(p.meta_path, meta)

        t = threading.Thread(
            target=self._wait_and_finalize,
            args=(job_id, proc, log_fh, reader),
            daemon=True,
        )
        t.start()

        return self.get(job_id)

    def get(self, job_id: str) -> DeploymentJobOut:
        rid = (job_id or "").strip()
        if not rid:
            raise HTTPException(status_code=404, detail="job not found")

        p = job_paths(rid)
        if not p.job_dir.is_dir():
            raise HTTPException(status_code=404, detail="job not found")

        meta = load_json(p.meta_path)
        status: JobStatus = meta.get("status") or "queued"

        return DeploymentJobOut(
            job_id=rid,
            status=status,
            created_at=meta.get("created_at") or utc_iso(),
            started_at=meta.get("started_at"),
            finished_at=meta.get("finished_at"),
            pid=meta.get("pid"),
            exit_code=meta.get("exit_code"),
            container_id=meta.get("container_id"),
            workspace_dir=str(p.job_dir),
            log_path=str(p.log_path),
            inventory_path=str(p.inventory_path),
            request_path=str(p.request_path),
        )

    def cancel(self, job_id: str) -> bool:
        rid = (job_id or "").strip()
        if not rid:
            return False

        p = job_paths(rid)
        meta: Dict[str, Any] = load_json(p.meta_path)
        if not meta:
            return False

        if meta.get("status") in {"succeeded", "failed", "canceled"}:
            return True

        pid = meta.get("pid")
        terminate_process_group(pid if isinstance(pid, int) else None)

        container_id = meta.get("container_id")
        if isinstance(container_id, str) and container_id.strip():
            stop_container(container_id)

        meta["status"] = "canceled"
        meta["finished_at"] = utc_iso()
        write_meta(p.meta_path, meta)
        try:
            if p.ssh_key_path.exists():
                p.ssh_key_path.unlink()
        except Exception:
            pass
        with self._secret_lock:
            self._secret_store.pop(rid, None)
        return True

    def _wait_and_finalize(self, job_id: str, proc, log_fh, reader) -> None:
        p = job_paths(job_id)
        try:
            rc = proc.wait()
            if reader is not None:
                reader.join(timeout=2)
        finally:
            try:
                log_fh.close()
            except Exception:
                pass
            try:
                if p.ssh_key_path.exists():
                    p.ssh_key_path.unlink()
            except Exception:
                pass
            with self._secret_lock:
                self._secret_store.pop(job_id, None)

        meta: Dict[str, Any] = load_json(p.meta_path)
        status = meta.get("status")

        # If canceled while running, keep canceled
        if status == "canceled":
            meta["finished_at"] = meta.get("finished_at") or utc_iso()
            write_meta(p.meta_path, meta)
            return

        meta["finished_at"] = utc_iso()
        meta["exit_code"] = int(rc)
        meta["status"] = "succeeded" if rc == 0 else "failed"
        write_meta(p.meta_path, meta)

    def _build_vars(
        self, req: DeploymentRequest, paths, secrets: List[str]
    ) -> Dict[str, Any]:
        merged_vars: Dict[str, Any] = {
            "selected_roles": list(req.selected_roles),
        }

        if req.auth.method == "private_key" and req.auth.private_key:
            atomic_write_text(paths.ssh_key_path, req.auth.private_key)
            paths.ssh_key_path.chmod(0o600)
            merged_vars["ansible_ssh_private_key_file"] = str(paths.ssh_key_path)
        elif req.auth.method == "password":
            merged_vars["ansible_password"] = "<provided_at_runtime>"

        return merged_vars

    def _build_runner_args(
        self,
        *,
        req: DeploymentRequest,
        inventory_path: Path,
        inventory_arg: str,
        roles_from_inventory: List[str],
    ) -> List[str]:
        repo_root = (os.getenv("INFINITO_REPO_PATH") or "").strip()
        if repo_root:
            if not Path(repo_root).is_dir():
                raise HTTPException(
                    status_code=500, detail="INFINITO_REPO_PATH is invalid"
                )
        elif runner_backend() == "local":
            raise HTTPException(
                status_code=500, detail="INFINITO_REPO_PATH is not set"
            )
        if not inventory_path.is_file():
            raise HTTPException(status_code=500, detail="inventory.yml is missing")

        cmd: List[str] = [
            "infinito",
            "--no-signal",
            "deploy",
            "dedicated",
            inventory_arg,
            "-T",
            req.deploy_target,
        ]

        if req.limit:
            cmd.extend(["-l", req.limit])

        if env_bool("JOB_RUNNER_SKIP_CLEANUP", False):
            cmd.append("--skip-cleanup")
        if env_bool("JOB_RUNNER_SKIP_BUILD", False):
            cmd.append("--skip-build")

        roles = roles_from_inventory or list(req.selected_roles)
        if roles:
            cmd.append("--id")
            cmd.extend(roles)

        return cmd

    def _write_infinito_shim(self, job_dir: Path) -> None:
        shim_path = job_dir / "infinito"
        if shim_path.exists():
            return
        script = """#!/usr/bin/env bash
set -euo pipefail

if command -v python3 >/dev/null 2>&1; then
  exec python3 -m cli.__main__ "$@"
fi

exec python -m cli.__main__ "$@"
"""
        atomic_write_text(shim_path, script)
        shim_path.chmod(0o700)

    def _remember_secrets(self, job_id: str, secrets: List[str]) -> None:
        if not secrets:
            return
        with self._secret_lock:
            self._secret_store[job_id] = secrets

    def get_secrets(self, job_id: str) -> List[str]:
        with self._secret_lock:
            return list(self._secret_store.get(job_id, []))

    def subscribe_logs(self, job_id: str):
        return self._log_hub.subscribe(job_id)

    def unsubscribe_logs(self, job_id: str, q) -> None:
        self._log_hub.unsubscribe(job_id, q)
