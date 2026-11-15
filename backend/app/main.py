from fastapi import FastAPI

from app.api import router as api_router
from app.config import get_settings

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Solar power estimates for lunar landing sites using JPL Horizons data.",
)

app.include_router(api_router)


@app.get("/", tags=["status"])
def root():
    return {
        "name": settings.app_name,
        "status": "ok",
        "docs": "/docs",
    }