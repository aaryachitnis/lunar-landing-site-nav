from datetime import datetime, timezone

from astropy.time import Time
from fastapi import APIRouter, Depends, HTTPException, Query

from app.config import Settings
from app.dependencies import get_app_settings
from core.communication_models import CommunicationMetricsResponse
from core.models import (
    PowerMetricsResponse,
    SiteSummary,
    SurfaceRoughnessResponse,
)
from core.utils import format_utc, get_lunar_sites_loc, parse_datetime
from data import SITES, SiteRecord, find_site_record
from services.horizon import HorizonsRequestError as EarthHorizonsRequestError
from services.horizon import HorizonsUnavailableError as EarthHorizonsUnavailableError
from services.mountain_visibility import analyse_site, check_window
from services.surface_roughness import analyse_all_sites
from services.terrain_height import (
    DEFAULT_PPD,
    VALID_PPD,
    load_elevation_grid,
)
from services import (
    HorizonsRequestError,
    HorizonsUnavailableError,
    calculate_energy_per_day,
    calculate_instantaneous_power_per_area,
    fetch_solar_ephemeris,
)

router = APIRouter(prefix="/sites", tags=["sites"])
_DEFAULT_HORIZONS_STEP = get_app_settings().default_horizons_step
_MAX_FINE_SAMPLES = 1_000_000


def _site_summary(site: SiteRecord) -> SiteSummary:
    site_id, name, location, description, agency = site
    return SiteSummary(
        id=site_id,
        name=name,
        loc=location,
        desc=description,
        agency=agency,
    )


def list_sites() -> list[SiteSummary]:
    return [_site_summary(site) for site in SITES]


def resolve_site(site_id: str) -> SiteSummary:
    site = find_site_record(site_id)
    if site is None:
        raise HTTPException(status_code=404, detail=f"Site '{site_id}' not found.")
    return _site_summary(site)


@router.get("", response_model=list[SiteSummary])
def get_sites() -> list[SiteSummary]:
    return list_sites()


@router.get(
    "/surface-roughness",
    response_model=SurfaceRoughnessResponse,
    description=(
        "Return mean slope, maximum slope, and detrended RMS surface roughness "
        "for every catalog site, including the LOLA dataset used."
    ),
)
def get_surface_roughness() -> SurfaceRoughnessResponse:
    try:
        report = analyse_all_sites()
    except (OSError, RuntimeError) as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Terrain data is unavailable: {exc}",
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Could not calculate surface roughness: {exc}",
        ) from exc
    return SurfaceRoughnessResponse(**report)


@router.get("/{site_id}/metrics", response_model=PowerMetricsResponse)
def get_site_metrics(
    site_id: str,
    start: str = Query(..., description="ISO 8601 start time."),
    end: str = Query(..., description="ISO 8601 end time."),
    step: str = Query(
        default=_DEFAULT_HORIZONS_STEP,
        min_length=1,
        max_length=32,
        description="Time step for the Horizons query (for example 4hour).",
    ),
    settings: Settings = Depends(get_app_settings),
) -> PowerMetricsResponse:
    site = resolve_site(site_id)
    try:
        start_datetime = parse_datetime(start)
        end_datetime = parse_datetime(end)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if end_datetime <= start_datetime:
        raise HTTPException(status_code=400, detail="End time must be later than start time.")
    step = step.strip()
    if not step:
        raise HTTPException(status_code=400, detail="Horizons step must not be empty.")

    location = get_lunar_sites_loc(site.loc)
    start_horizons = start_datetime.strftime("%Y-%m-%d %H:%M")
    end_horizons = end_datetime.strftime("%Y-%m-%d %H:%M")
    try:
        ephemeris = fetch_solar_ephemeris(
            location,
            start_horizons,
            end_horizons,
            step,
        )
    except HorizonsUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except HorizonsRequestError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    try:
        instantaneous_power = calculate_instantaneous_power_per_area(
            ephemeris,
            solar_intensity_w_m2=settings.solar_intensity_w_m2,
            panel_efficiency=settings.solar_panel_efficiency,
        )
        daily_energy = calculate_energy_per_day(instantaneous_power, ephemeris)
    except ValueError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Invalid ephemeris data returned by Horizons: {exc}",
        ) from exc

    duration_hours = (end_datetime - start_datetime).total_seconds() / 3600.0
    average_power_24h = (
        sum(daily_energy) * 1000.0 / duration_hours if duration_hours > 0 else 0.0
    )
    sunlit_days = [energy for energy in daily_energy if energy > 0]
    average_power_sunlit = (
        sum(sunlit_days) * 1000.0 / (24.0 * len(sunlit_days))
        if sunlit_days
        else 0.0
    )

    return PowerMetricsResponse(
        site=site,
        start=format_utc(start_datetime),
        end=format_utc(end_datetime),
        step=step,
        instantaneous_power_per_area_W_m2=[
            float(value) for value in instantaneous_power
        ],
        daily_power_generated_per_area_kWh_per_m2_day=daily_energy,
        average_power_per_24h_W_m2=average_power_24h,
        average_power_sunlit_days_W_m2=average_power_sunlit,
    )


def _window_to_iso(julian_day: float) -> str:
    value = Time(julian_day, format="jd", scale="utc").to_datetime(
        timezone=timezone.utc
    )
    return value.isoformat().replace("+00:00", "Z")


def _check_request_window(start: datetime, end: datetime, step: str) -> None:
    if end <= start:
        raise HTTPException(status_code=400, detail="End time must be later than start time.")
    try:
        check_window(start, end, step)
    except (ValueError, IndexError, ZeroDivisionError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/{site_id}/communications", response_model=CommunicationMetricsResponse)
def get_site_communications(
    site_id: str,
    start: str = Query(..., description="ISO 8601 start time in UTC."),
    end: str = Query(..., description="ISO 8601 end time in UTC."),
    step: str = Query("1h", min_length=2, max_length=16),
    terrain_ppd: int = Query(DEFAULT_PPD),
    max_range_km: float = Query(150.0, gt=0, le=1000),
    mountain_threshold_deg: float = Query(1.0, ge=0),
    min_elevation_deg: float = Query(0.0, ge=-90, le=90),
    count_partial: bool = Query(True),
    fine_step_min: float = Query(1.0, ge=0.1, le=60),
) -> CommunicationMetricsResponse:
    site = resolve_site(site_id)
    if terrain_ppd not in VALID_PPD:
        raise HTTPException(
            status_code=400,
            detail=f"terrain_ppd must be one of {VALID_PPD}.",
        )
    try:
        start_datetime = parse_datetime(start)
        end_datetime = parse_datetime(end)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    step = step.strip()
    if not step:
        raise HTTPException(status_code=400, detail="Horizons step must not be empty.")
    _check_request_window(start_datetime, end_datetime, step)
    sample_count = (
        (end_datetime - start_datetime).total_seconds()
        / (fine_step_min * 60.0)
    )
    if sample_count > _MAX_FINE_SAMPLES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"The requested interval would require more than "
                f"{_MAX_FINE_SAMPLES} visibility samples."
            ),
        )

    try:
        dem = load_elevation_grid(terrain_ppd)
        analysis = analyse_site(
            dem,
            site.lat,
            site.lon,
            start_datetime,
            end_datetime,
            step,
            max_range_km,
            mountain_threshold_deg,
            min_elevation_deg,
            count_partial,
            fine_step_min,
        )
    except EarthHorizonsUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except EarthHorizonsRequestError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except (OSError, RuntimeError) as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Terrain data is unavailable: {exc}",
        ) from exc

    analysis["windows"] = [
        {
            "start": _window_to_iso(float(window_start)),
            "end": _window_to_iso(float(window_end)),
            "hours": float(hours),
        }
        for window_start, window_end, hours in analysis["windows"]
    ]
    return CommunicationMetricsResponse(
        site=site,
        start=format_utc(start_datetime),
        end=format_utc(end_datetime),
        step=step,
        analysis=analysis,
    )
