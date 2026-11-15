from fastapi import APIRouter

router = APIRouter(tags=["status"])


@router.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok", "message": "FastAPI backend is live."}