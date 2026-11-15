import os
from dataclasses import dataclass, field
from functools import lru_cache


def _cors_origins_from_env() -> tuple[str, ...]:
    raw = os.environ.get("CORS_ORIGINS", "")
    return tuple(origin.strip() for origin in raw.split(",") if origin.strip())


@dataclass(frozen=True)
class Settings:
    app_name: str = "Lunar Landing Site Navigator API"
    app_version: str = "1.0.0"
    default_horizons_step: str = "4hour"
    solar_intensity_w_m2: float = 1361.0
    solar_panel_efficiency: float = 0.2
    cors_origins: tuple[str, ...] = field(default_factory=_cors_origins_from_env)


@lru_cache
def get_settings() -> Settings:
    return Settings()