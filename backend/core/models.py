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
    instantaneous_power_per_area_W_m2: list[float] = Field(
        description="Power per unit area for each sampled timestep."
    )
    daily_power_generated_per_area_kWh_per_m2_day: list[float] = Field(
        description="Daily energy per unit area for each day in the requested window."
    )
    average_power_per_24h_W_m2: float
    average_power_sunlit_days_W_m2: float