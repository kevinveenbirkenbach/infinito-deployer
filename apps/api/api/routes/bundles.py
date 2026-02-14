from __future__ import annotations

from typing import List

from fastapi import APIRouter

from api.schemas.bundle import BundleOut
from services.role_index.bundles import load_bundle_inventories

router = APIRouter(prefix="/bundles", tags=["bundles"])


@router.get("", response_model=List[BundleOut])
def list_bundles() -> List[BundleOut]:
    bundles = load_bundle_inventories()
    return [
        BundleOut(
            id=item.id,
            slug=item.slug,
            deploy_target=item.deploy_target,
            title=item.title,
            description=item.description,
            logo_class=item.logo_class,
            tags=item.tags,
            categories=item.categories,
            role_ids=item.role_ids,
        )
        for item in bundles
    ]
