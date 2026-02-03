from fastapi import APIRouter

from .inventories import router as inventories_router
from .roles import router as roles_router

router = APIRouter()
router.include_router(roles_router)
router.include_router(inventories_router)
