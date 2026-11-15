"""Shared request/response contract for the custom landing-site feature.

This module is the single source of truth for what the dashboard sends to the
processing engine and what it expects back. It depends only on pydantic, so the
FastAPI engine can import it directly::

    from custom_site.schemas import SiteRequest, SiteResult

    @router.post("/api/v1/landing-site/potential", response_model=SiteResult)
    def potential(req: SiteRequest) -> SiteResult: ...

Conventions
-----------
* Longitude is selenographic, east-positive, in degrees (-180..180).
* Latitude is in degrees, north-positive (-90..90).
* Azimuth is measured clockwise from local north, in degrees (0..360).
* Elevation is the angle above the local horizontal plane, in degrees.
* All timestamps are timezone-aware UTC.
* Terrain grids are row-major with row 0 = north edge, column 0 = west edge.

Response models ignore unknown fields, so the engine can add data without
breaking the dashboard. Bump ``SCHEMA_VERSION`` on any breaking change.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

SCHEMA_VERSION = "1.0"
MAX_SAMPLES = 20_000

DataSource = Literal["mock", "engine"]


# --------------------------------------------------------------------------- #
# Request
# --------------------------------------------------------------------------- #
class SiteRequest(BaseModel):
    """What the user asks for: a lunar surface point and a few optional knobs."""

    model_config = ConfigDict(extra="ignore")

    longitude: float = Field(..., ge=-180.0, le=180.0, description="Degrees east (-180..180).")
    latitude: float = Field(..., ge=-90.0, le=90.0, description="Degrees north (-90..90).")

    start_time_utc: Optional[datetime] = Field(
        None, description="Start of the analysis window (UTC). Engine uses 'now' if omitted."
    )
    duration_days: float = Field(
        29.53, gt=0.0, le=366.0, description="Length of the analysis window (one lunar day by default)."
    )
    step_hours: float = Field(1.0, gt=0.0, le=48.0, description="Time step between samples.")

    panel_area_m2: float = Field(10.0, gt=0.0, le=1_000_000.0, description="Solar array area.")
    panel_efficiency: float = Field(0.28, gt=0.0, le=1.0, description="Array conversion efficiency (0..1).")

    terrain_radius_km: float = Field(
        5.0, gt=0.0, le=50.0, description="Half-width of the square terrain tile centred on the site."
    )

    @field_validator("start_time_utc")
    @classmethod
    def _to_utc(cls, value: Optional[datetime]) -> Optional[datetime]:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    @model_validator(mode="after")
    def _limit_samples(self) -> "SiteRequest":
        samples = self.duration_days * 24.0 / self.step_hours
        if samples > MAX_SAMPLES:
            raise ValueError(
                f"duration_days / step_hours gives {samples:,.0f} samples; the limit is {MAX_SAMPLES:,}. "
                "Increase step_hours or shorten the window."
            )
        return self


# --------------------------------------------------------------------------- #
# Response
# --------------------------------------------------------------------------- #
class _Response(BaseModel):
    model_config = ConfigDict(extra="ignore")


class SiteInfo(_Response):
    """The 'Landing site info' card."""

    name: str
    latitude: float
    longitude: float
    near_side: bool = Field(..., description="True if the site is on the Earth-facing hemisphere.")
    terrain_class: Optional[str] = Field(None, description="e.g. 'mare' or 'highland'.")
    centre_elevation_m: Optional[float] = Field(None, description="Elevation of the site above the lunar datum.")
    notes: Optional[str] = None


class SkyTrack(_Response):
    """Apparent direction of a body as seen from the site, one value per timestamp."""

    azimuth_deg: list[float]
    elevation_deg: list[float]

    @model_validator(mode="after")
    def _same_length(self) -> "SkyTrack":
        if len(self.azimuth_deg) != len(self.elevation_deg):
            raise ValueError("azimuth_deg and elevation_deg must have the same length")
        return self


class Ephemeris(_Response):
    """Sun and Earth positions over the window (NASA Horizons in the real engine)."""

    times_utc: list[datetime]
    sun: SkyTrack
    earth: SkyTrack
    source: str = "NASA Horizons"

    @model_validator(mode="after")
    def _aligned(self) -> "Ephemeris":
        n = len(self.times_utc)
        if len(self.sun.elevation_deg) != n or len(self.earth.elevation_deg) != n:
            raise ValueError("sun/earth tracks must have one value per entry in times_utc")
        return self


class PotentialSummary(_Response):
    """Headline numbers for the power potential."""

    mean_power_w: float
    peak_power_w: float
    total_energy_kwh: float
    sunlit_fraction: float = Field(..., ge=0.0, le=1.0)
    longest_darkness_hours: float = Field(..., ge=0.0)
    earth_visible_fraction: float = Field(..., ge=0.0, le=1.0)


class PowerResult(_Response):
    summary: PotentialSummary
    power_w: list[float] = Field(..., description="Array output, aligned with ephemeris.times_utc.")


class TerrainData(_Response):
    """A square elevation tile centred on the site, used for the 2D terrain map."""

    elevation_m: list[list[float]]
    radius_km: float = Field(..., gt=0.0, description="Tile half-width; tile spans -radius..+radius km.")
    pixel_size_m: float = Field(..., gt=0.0)
    min_elevation_m: float
    max_elevation_m: float
    mean_slope_deg: float
    max_slope_deg: float
    roughness_m: float = Field(..., description="RMS height deviation from the best-fit plane.")
    source: str = "NASA LOLA / Moon Trek"

    @model_validator(mode="after")
    def _rectangular(self) -> "TerrainData":
        rows = self.elevation_m
        if len(rows) < 3 or len(rows[0]) < 3:
            raise ValueError("elevation_m must be at least 3x3")
        width = len(rows[0])
        if any(len(r) != width for r in rows):
            raise ValueError("elevation_m rows must all have the same length")
        return self


class SiteResult(_Response):
    """Everything the right-hand side of the dashboard renders."""

    schema_version: str = SCHEMA_VERSION
    data_source: DataSource
    generated_at: datetime
    request: SiteRequest
    site: SiteInfo
    ephemeris: Ephemeris
    power: PowerResult
    terrain: TerrainData
    warnings: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def _power_aligned(self) -> "SiteResult":
        if len(self.power.power_w) != len(self.ephemeris.times_utc):
            raise ValueError("power.power_w must have one value per entry in ephemeris.times_utc")
        return self
