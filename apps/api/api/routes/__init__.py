from fastapi import APIRouter

from .deployments import router as deployments_router
from .inventories import router as inventories_router
from .roles import router as roles_router
from .workspaces import router as workspaces_router

router = APIRouter()
router.include_router(roles_router)
router.include_router(inventories_router)
router.include_router(deployments_router)
router.include_router(workspaces_router)
