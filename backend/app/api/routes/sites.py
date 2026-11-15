from fastapi import APIRouter, Depends, HTTPException, Query

from app.config import Settings
from app.dependencies import get_app_settings
from core.models import PowerMetricsResponse, SiteSummary
from core.utils import format_utc, get_lunar_sites_loc, parse_datetime
from data import SITES, SiteRecord, find_site_record
from services import (
    HorizonsRequestError,
    HorizonsUnavailableError,
    calculate_energy_per_day,
    calculate_instantaneous_power_per_area,
    fetch_solar_ephemeris,
)

router = APIRouter(prefix="/sites", tags=["sites"])
_DEFAULT_HORIZONS_STEP = get_app_settings().default_horizons_step


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
