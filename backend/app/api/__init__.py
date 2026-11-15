from fastapi import APIRouter

from .routes import health_router, sites_router

router = APIRouter()
router.include_router(health_router)
router.include_router(sites_router)

__all__ = ["router"]