from app.config import Settings, get_settings as load_settings


def get_app_settings() -> Settings:
    """Provide cached application settings for FastAPI dependency injection."""
    return load_settings()