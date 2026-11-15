from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import router as api_router
from app.config import get_settings

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "Solar power and Earth-communication visibility estimates for lunar "
        "landing sites using JPL Horizons and LOLA terrain data."
    ),
)

if settings.cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_methods=["GET"],
        allow_headers=["*"],
    )

app.include_router(api_router)


@app.get("/", tags=["status"])
def root():
    return {
        "name": settings.app_name,
        "status": "ok",
        "docs": "/docs",
    }