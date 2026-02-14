from __future__ import annotations

from fastapi import APIRouter, Request

from api.auth import ensure_workspace_access
from api.schemas.deployment import DeploymentRequest, InventoryPreviewOut
from services.inventory_preview import build_inventory_preview
from services.workspaces import WorkspaceService

router = APIRouter(prefix="/inventories", tags=["inventories"])

_workspaces = WorkspaceService()


@router.post("/preview", response_model=InventoryPreviewOut)
def preview_inventory(req: DeploymentRequest, request: Request) -> InventoryPreviewOut:
    """
    Generate an inventory YAML preview for a deployment request.

    Security:
      - Secrets are never returned (password/private key are masked or replaced by placeholders).
      - Do not log request bodies.
    """
    ensure_workspace_access(request, req.workspace_id, _workspaces)
    inv_yaml, warnings = build_inventory_preview(req)
    return InventoryPreviewOut(inventory_yaml=inv_yaml, warnings=warnings)
