from typing import Annotated, Any

from pydantic import BaseModel, Field, computed_field, model_validator

Latitude = Annotated[float, Field(ge=-90.0, le=90.0)]
Longitude = Annotated[float, Field(ge=-180.0, le=180.0)]


class SiteSummary(BaseModel):
    id: str = Field(min_length=1)
    name: str = ""
    loc: tuple[Latitude, Longitude] = Field(
        description="Latitude and longitude in planetocentric degrees."
    )
    desc: str = ""
    agency: str = ""

    @model_validator(mode="before")
    @classmethod
    def accept_legacy_coordinates(cls, value: Any) -> Any:
        if (
            isinstance(value, dict)
            and "loc" not in value
            and "lat" in value
            and "lon" in value
        ):
            value = {**value, "loc": (value["lat"], value["lon"])}
        return value

    @computed_field
    @property
    def lat(self) -> float:
        return self.loc[0]

    @computed_field
    @property
    def lon(self) -> float:
        return self.loc[1]


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


class SiteSurfaceRoughness(BaseModel):
    site_id: str
    site_name: str
    mean_slope_deg: float
    max_slope_deg: float
    rms_surface_roughness_m: float


class SurfaceRoughnessResponse(BaseModel):
    data_source: str
    source_url: str
    resolution_m_at_equator: float
    analysis_radius_km: float
    sites: list[SiteSurfaceRoughness]