from __future__ import annotations

from typing import Any, Dict, List, Tuple

import yaml
from fastapi import HTTPException

from api.schemas.deployment import DeploymentRequest
from services.workspaces import WorkspaceService


def _mask_secret(_: str) -> str:
    # Never return secrets; keep it explicit that it was provided.
    return "********"


def build_inventory_preview(req: DeploymentRequest) -> Tuple[str, List[str]]:
    """
    Build an Ansible-style inventory YAML preview.

    Important:
      - Secrets are NOT included (password/private_key are masked).
      - When workspace_id is set, the preview returns workspace inventory.yml.
      - The output should match what deployment will use conceptually.
    """
    warnings: List[str] = []

    # Heuristic warnings / unsafe defaults
    if req.host.lower() in {"localhost", "127.0.0.1"}:
        warnings.append(
            "Host is localhost/127.0.0.1. Ensure the deployment is intended to run locally."
        )

    if req.auth.method == "private_key":
        warnings.append(
            "Private key is not shown in preview. During deployment it must be written to a temporary file (chmod 600) and referenced via ansible_ssh_private_key_file."
        )
        if req.auth.passphrase:
            warnings.append(
                "Private key passphrase is provided and will be supplied at runtime."
            )

    # Build vars (system vars only)
    merged_vars: Dict[str, Any] = {}

    # Selected roles are part of the request and should be visible in preview
    # (This is the "contract" between UI and runner.)
    merged_vars["selected_roles"] = list(req.selected_roles)

    # Auth placeholders (do not leak secrets)
    if req.auth.method == "password":
        merged_vars["ansible_password"] = _mask_secret(req.auth.password or "")
    else:
        # The actual deployment runner should write the provided key into a file and set:
        #   ansible_ssh_private_key_file: /state/jobs/<job_id>/id_rsa
        merged_vars["ansible_ssh_private_key_file"] = "<provided_at_runtime>"
        if req.auth.passphrase:
            merged_vars["ansible_ssh_pass"] = _mask_secret(req.auth.passphrase)

    if req.workspace_id:
        root = WorkspaceService().ensure(req.workspace_id)
        inv_path = root / "inventory.yml"
        if not inv_path.is_file():
            raise HTTPException(
                status_code=400, detail="workspace inventory.yml not found"
            )
        inv_yaml = inv_path.read_text(encoding="utf-8", errors="replace")
        return inv_yaml, warnings

    inventory: Dict[str, Any] = {
        "all": {
            "hosts": {
                "target": {
                    "ansible_host": req.host,
                    "ansible_user": req.user,
                }
            },
            "vars": merged_vars,
        }
    }
    if req.port:
        inventory["all"]["hosts"]["target"]["ansible_port"] = req.port

    inv_yaml = yaml.safe_dump(
        inventory,
        sort_keys=False,
        default_flow_style=False,
        allow_unicode=True,
    )

    return inv_yaml, warnings
