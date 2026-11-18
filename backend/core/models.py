from typing import Annotated, Any

from pydantic import BaseModel, Field, computed_field, field_validator, model_validator

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


class SiteCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    lat: Latitude
    lon: Longitude
    desc: str = Field(default="", max_length=1000)
    agency: str = Field(default="Custom", max_length=120)

    @field_validator("name")
    @classmethod
    def trim_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Site name must not be empty.")
        return value


class CustomMetricsRequest(BaseModel):
    lat: Latitude
    lon: Longitude
    start: str = Field(min_length=1)
    end: str = Field(min_length=1)
    step: str = Field(default="4hour", min_length=1, max_length=32)


class SkyMetricsResponse(BaseModel):
    sun_altitude_degrees: float = Field(
        description="Sun apparent elevation above the astronomical horizon at events_from."
    )
    sun_visible: bool = Field(
        description="Whether the Sun's apparent elevation is above the astronomical horizon."
    )
    earth_altitude_degrees: float = Field(
        description="Earth apparent elevation above the astronomical horizon at events_from."
    )
    earth_visible: bool = Field(
        description="Whether Earth's apparent elevation is above the astronomical horizon."
    )
    nearest_earthrise_utc: str | None = Field(
        default=None,
        description="Next estimated Earthrise at or after events_from, in UTC ISO 8601.",
    )
    nearest_earthset_utc: str | None = Field(
        default=None,
        description="Next estimated Earthset at or after events_from, in UTC ISO 8601.",
    )
    longest_darkness_hours: float = Field(
        ge=0.0,
        description="Longest continuous period with the Sun below the astronomical horizon in the requested future interval.",
    )
    sunlit_fraction: float = Field(
        ge=0.0,
        le=1.0,
        description="Fraction of the requested future interval with the Sun above the astronomical horizon.",
    )
    sun_azimuth_degrees: float | None = Field(
        default=None, description="Sun azimuth at events_from, degrees clockwise from north."
    )
    earth_azimuth_degrees: float | None = Field(
        default=None, description="Earth azimuth at events_from, degrees clockwise from north."
    )


class VisibilityWindow(BaseModel):
    start: str
    end: str
    hours: float


class BodyTerrainVisibility(BaseModel):
    visible: bool = Field(description="Body centre is above the LOLA terrain horizon at events_from.")
    azimuth_degrees: float
    terrain_horizon_degrees: float = Field(
        description="Elevation of the terrain horizon in the body's direction at events_from."
    )
    nearest_rise_utc: str | None = None
    nearest_set_utc: str | None = None
    visible_fraction: float = Field(ge=0.0, le=1.0)
    flat_visible_fraction: float = Field(ge=0.0, le=1.0, description="Same, ignoring terrain.")
    longest_hidden_hours: float = Field(ge=0.0)
    hidden_by_terrain_hours: float = Field(
        ge=0.0, description="Hours above the flat horizon but hidden behind terrain."
    )
    windows: list[VisibilityWindow] = Field(description="Unbroken visible stretches, events_from to end.")


class TerrainSkyResponse(BaseModel):
    dataset: str
    resolution_m: float
    max_range_km: float
    horizon_profile_degrees: list[float] = Field(
        description="Terrain horizon elevation for azimuths 0, 1, … 359 degrees."
    )
    sun: BodyTerrainVisibility
    earth: BodyTerrainVisibility


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


class CommunicationMetricsResponse(BaseModel):
    site: SiteSummary
    start: str
    end: str
    step: str
    analysis: dict[str, Any]


class PowerMetricsResponse(BaseModel):
    site: SiteSummary
    start: str
    end: str
    step: str
    nearest_sunrise_utc: str | None = Field(
        default=None,
        description="Next estimated sunrise at or after events_from (or start), in UTC ISO 8601.",
    )
    nearest_sunset_utc: str | None = Field(
        default=None,
        description="Next estimated sunset at or after events_from (or start), in UTC ISO 8601.",
    )
    sky: SkyMetricsResponse | None = Field(
        default=None,
        description="Live Sun/Earth metrics, included when include_sky=true.",
    )
    sky_error: str | None = Field(
        default=None,
        description="Reason live sky metrics could not be calculated when include_sky=true.",
    )
    terrain: TerrainSkyResponse | None = Field(
        default=None,
        description="Sun/Earth visibility over the LOLA terrain horizon, when include_terrain=true.",
    )
    terrain_error: str | None = Field(
        default=None,
        description="Reason terrain-aware metrics could not be calculated when include_terrain=true.",
    )
    instantaneous_power_per_area_W_m2: list[float] = Field(
        description="Power per unit area for each sampled timestep."
    )
    daily_power_generated_per_area_kWh_per_m2_day: list[float] = Field(
        description="Daily energy per unit area for each day in the requested window."
    )
    average_power_per_24h_W_m2: float
    average_power_sunlit_days_W_m2: float