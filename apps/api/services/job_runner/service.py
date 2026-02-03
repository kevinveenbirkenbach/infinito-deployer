from __future__ import annotations

import threading
import uuid
from typing import Any, Dict, List

import yaml

from fastapi import HTTPException

from api.schemas.deployment import DeploymentRequest
from api.schemas.deployment_job import DeploymentJobOut, JobStatus
from services.inventory_preview import build_inventory_preview

from .paths import job_paths, jobs_root
from .persistence import load_json, mask_request_for_persistence, write_meta
from .runner import start_process, terminate_process_group, write_runner_script
from .secrets import collect_secrets
from .util import atomic_write_json, atomic_write_text, safe_mkdir, utc_iso


class JobRunnerService:
    """
    Filesystem-based job runner.

    Layout:
      ${STATE_DIR}/jobs/<job_id>/
        job.json        (status, pid, timestamps)
        request.json    (masked request - no secrets)
        inventory.yml   (placeholders for secrets)
        job.log         (stdout/stderr of runner)
        run.sh          (runner script)
    """

    def __init__(self) -> None:
        safe_mkdir(jobs_root())
        self._secret_lock = threading.Lock()
        self._secret_store: Dict[str, List[str]] = {}

    def create(self, req: DeploymentRequest) -> DeploymentJobOut:
        job_id = uuid.uuid4().hex[:12]
        p = job_paths(job_id)
        safe_mkdir(p.job_dir)

        inv_yaml, _warnings = build_inventory_preview(req)
        vars_data = self._build_vars(req, p)

        # Persist masked request + inventory (no secrets on disk)
        atomic_write_json(p.request_path, mask_request_for_persistence(req))
        atomic_write_text(p.inventory_path, inv_yaml)
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
        self._remember_secrets(job_id, req)

        meta: Dict[str, Any] = {
            "job_id": job_id,
            "status": "queued",
            "created_at": utc_iso(),
            "started_at": None,
            "finished_at": None,
            "pid": None,
            "exit_code": None,
        }
        write_meta(p.meta_path, meta)

        try:
            proc, log_fh = start_process(
                run_path=p.run_path, cwd=p.job_dir, log_path=p.log_path
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
            args=(job_id, proc, log_fh),
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

        meta["status"] = "canceled"
        meta["finished_at"] = utc_iso()
        write_meta(p.meta_path, meta)
        return True

    def _wait_and_finalize(self, job_id: str, proc, log_fh) -> None:
        p = job_paths(job_id)
        try:
            rc = proc.wait()
        finally:
            try:
                log_fh.close()
            except Exception:
                pass

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

    def _build_vars(self, req: DeploymentRequest, paths) -> Dict[str, Any]:
        merged_vars: Dict[str, Any] = dict(req.inventory_vars or {})
        merged_vars["selected_roles"] = list(req.selected_roles)

        if req.auth.method == "private_key" and req.auth.private_key:
            atomic_write_text(paths.ssh_key_path, req.auth.private_key)
            paths.ssh_key_path.chmod(0o600)
            merged_vars["ansible_ssh_private_key_file"] = str(
                paths.ssh_key_path
            )
        elif req.auth.method == "password":
            merged_vars["ansible_password"] = "<provided_at_runtime>"

        return merged_vars

    def _remember_secrets(self, job_id: str, req: DeploymentRequest) -> None:
        secrets = collect_secrets(req)
        if not secrets:
            return
        with self._secret_lock:
            self._secret_store[job_id] = secrets

    def get_secrets(self, job_id: str) -> List[str]:
        with self._secret_lock:
            return list(self._secret_store.get(job_id, []))
