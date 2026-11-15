from dataclasses import dataclass
from functools import lru_cache


@dataclass(frozen=True)
class Settings:
    app_name: str = "Lunar Landing Site Navigator API"
    app_version: str = "1.0.0"
    default_horizons_step: str = "4hour"
    solar_intensity_w_m2: float = 1361.0
    solar_panel_efficiency: float = 0.2


@lru_cache
def get_settings() -> Settings:
    return Settings()