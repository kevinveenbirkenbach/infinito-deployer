from fastapi import APIRouter

from .roles import router as roles_router

router = APIRouter()
router.include_router(roles_router)
