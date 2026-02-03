from __future__ import annotations

from fastapi import APIRouter

from api.schemas.deployment import DeploymentRequest, InventoryPreviewOut
from services.inventory_preview import build_inventory_preview

router = APIRouter(prefix="/inventories", tags=["inventories"])


@router.post("/preview", response_model=InventoryPreviewOut)
def preview_inventory(req: DeploymentRequest) -> InventoryPreviewOut:
    """
    Generate an inventory YAML preview for a deployment request.

    Security:
      - Secrets are never returned (password/private key are masked or replaced by placeholders).
      - Do not log request bodies.
    """
    inv_yaml, warnings = build_inventory_preview(req)
    return InventoryPreviewOut(inventory_yaml=inv_yaml, warnings=warnings)
