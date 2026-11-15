from pydantic import BaseModel, Field


class SiteSummary(BaseModel):
    id: str = Field(min_length=1)
    lat: float = Field(ge=-90.0, le=90.0)
    lon: float = Field(ge=-180.0, le=180.0)


class PowerMetricsResponse(BaseModel):
    site: SiteSummary
    start: str
    end: str
    step: str
    instantaneous_power_per_area_W_m2: list[float] = Field(
        description="Power per unit area for each sampled timestep."
    )
    daily_power_generated_per_area_kWh_per_m2_day: list[float] = Field(
        description="Daily energy per unit area for each day in the requested window."
    )
    average_power_per_24h_W_m2: float
    average_power_sunlit_days_W_m2: float