from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from app.config import Settings
from app.dependencies import get_app_settings
from core.models import (
    BodyTerrainVisibility,
    CommunicationMetricsResponse,
    CustomMetricsRequest,
    PowerMetricsResponse,
    SkyMetricsResponse,
    SiteCreateRequest,
    SiteSummary,
    SurfaceRoughnessResponse,
    TerrainSkyResponse,
    VisibilityWindow,
)
from core.utils import HorizonsLocation, format_utc, get_lunar_sites_loc, parse_datetime
from data import (
    DuplicateSiteError,
    SiteRecord,
    add_site_record,
    find_site_record,
    load_site_records,
)
from services import (
    HorizonsRequestError,
    HorizonsUnavailableError,
    calculate_energy_per_day,
    calculate_instantaneous_power_per_area,
    calculate_sky_metrics,
    fetch_earth_ephemeris,
    fetch_solar_ephemeris,
    find_nearest_sunrise_sunset,
)
from services.mountain_visibility import analyse_site, check_window
from services.power_services import _julian_date_to_utc
from services.surface_roughness import analyse_all_sites
from services.terrain_height import DEFAULT_PPD, VALID_PPD, load_elevation_grid
from services.terrain_sky import BodyVisibility, TerrainSky, calculate_terrain_sky

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
    return [_site_summary(site) for site in load_site_records()]


def resolve_site(site_id: str) -> SiteSummary:
    site = find_site_record(site_id)
    if site is None:
        raise HTTPException(status_code=404, detail=f"Site '{site_id}' not found.")
    return _site_summary(site)


def _body_response(body: BodyVisibility) -> BodyTerrainVisibility:
    return BodyTerrainVisibility(
        visible=body.visible,
        azimuth_degrees=body.azimuth_degrees,
        terrain_horizon_degrees=body.terrain_horizon_degrees,
        nearest_rise_utc=format_utc(body.nearest_rise_utc) if body.nearest_rise_utc else None,
        nearest_set_utc=format_utc(body.nearest_set_utc) if body.nearest_set_utc else None,
        visible_fraction=body.visible_fraction,
        flat_visible_fraction=body.flat_visible_fraction,
        longest_hidden_hours=body.longest_hidden_hours,
        hidden_by_terrain_hours=body.hidden_by_terrain_hours,
        windows=[
            VisibilityWindow(start=format_utc(a), end=format_utc(b), hours=h)
            for a, b, h in body.windows
        ],
    )


def _terrain_response(terrain: TerrainSky) -> TerrainSkyResponse:
    return TerrainSkyResponse(
        dataset=terrain.dataset,
        resolution_m=terrain.resolution_m,
        max_range_km=terrain.max_range_km,
        horizon_profile_degrees=terrain.horizon_profile_degrees,
        sun=_body_response(terrain.sun),
        earth=_body_response(terrain.earth),
    )


@router.get("", response_model=list[SiteSummary])
def get_sites() -> list[SiteSummary]:
    return list_sites()


@router.post("", response_model=SiteSummary, status_code=201)
def create_site(request: SiteCreateRequest) -> SiteSummary:
    try:
        site = add_site_record(
            request.name,
            (request.lat, request.lon),
            request.desc,
            request.agency,
        )
    except DuplicateSiteError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return _site_summary(site)


def _parse_metrics_window(
    start: str,
    end: str,
    step: str,
    events_from: str | None,
) -> tuple[datetime, datetime, datetime, str]:
    try:
        start_datetime = parse_datetime(start)
        end_datetime = parse_datetime(end)
        events_start_datetime = (
            parse_datetime(events_from) if events_from is not None else start_datetime
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if end_datetime <= start_datetime:
        raise HTTPException(status_code=400, detail="End time must be later than start time.")
    if not start_datetime <= events_start_datetime <= end_datetime:
        raise HTTPException(
            status_code=400,
            detail="Event search start must be within the requested range.",
        )
    step = step.strip()
    if not step:
        raise HTTPException(status_code=400, detail="Horizons step must not be empty.")
    return start_datetime, end_datetime, events_start_datetime, step


def _calculate_metrics(
    site: SiteSummary,
    location: HorizonsLocation,
    start_datetime: datetime,
    end_datetime: datetime,
    events_start_datetime: datetime,
    step: str,
    settings: Settings,
    include_sky: bool = False,
    include_terrain: bool = False,
) -> PowerMetricsResponse:
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

    earth_ephemeris = None
    sky_error = None
    if include_sky or include_terrain:
        try:
            earth_ephemeris = fetch_earth_ephemeris(
                location,
                start_horizons,
                end_horizons,
                step,
            )
        except HorizonsUnavailableError as exc:
            sky_error = str(exc)
        except HorizonsRequestError as exc:
            sky_error = str(exc)

    try:
        instantaneous_power = calculate_instantaneous_power_per_area(
            ephemeris,
            solar_intensity_w_m2=settings.solar_intensity_w_m2,
            panel_efficiency=settings.solar_panel_efficiency,
        )
        daily_energy = calculate_energy_per_day(instantaneous_power, ephemeris)
        sunrise, sunset = find_nearest_sunrise_sunset(
            ephemeris,
            events_start_datetime,
            end_datetime,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Invalid ephemeris data returned by Horizons: {exc}",
        ) from exc

    sky = None
    if earth_ephemeris is not None:
        try:
            sky = calculate_sky_metrics(
                ephemeris,
                earth_ephemeris,
                events_start_datetime,
                end_datetime,
            )
        except ValueError as exc:
            sky_error = f"Invalid ephemeris data returned by Horizons: {exc}"

    terrain = None
    terrain_error = None
    if include_terrain:
        if earth_ephemeris is None:
            terrain_error = sky_error or "Earth ephemeris is unavailable."
        else:
            try:
                terrain = _terrain_response(calculate_terrain_sky(
                    load_elevation_grid(DEFAULT_PPD),
                    site.lat,
                    site.lon,
                    ephemeris,
                    earth_ephemeris,
                    events_start_datetime,
                    end_datetime,
                ))
            except (OSError, RuntimeError) as exc:
                terrain_error = f"Terrain data is unavailable: {exc}"
            except ValueError as exc:
                terrain_error = f"Could not calculate terrain visibility: {exc}"

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
        nearest_sunrise_utc=format_utc(sunrise) if sunrise is not None else None,
        nearest_sunset_utc=format_utc(sunset) if sunset is not None else None,
        sky=(
            SkyMetricsResponse(
                sun_altitude_degrees=sky.sun_altitude_degrees,
                sun_visible=sky.sun_visible,
                earth_altitude_degrees=sky.earth_altitude_degrees,
                earth_visible=sky.earth_visible,
                nearest_earthrise_utc=(
                    format_utc(sky.nearest_earthrise_utc)
                    if sky.nearest_earthrise_utc is not None
                    else None
                ),
                nearest_earthset_utc=(
                    format_utc(sky.nearest_earthset_utc)
                    if sky.nearest_earthset_utc is not None
                    else None
                ),
                longest_darkness_hours=sky.longest_darkness_hours,
                sunlit_fraction=sky.sunlit_fraction,
                sun_azimuth_degrees=sky.sun_azimuth_degrees,
                earth_azimuth_degrees=sky.earth_azimuth_degrees,
            )
            if sky is not None
            else None
        ),
        sky_error=sky_error,
        terrain=terrain,
        terrain_error=terrain_error,
        instantaneous_power_per_area_W_m2=[
            float(value) for value in instantaneous_power
        ],
        daily_power_generated_per_area_kWh_per_m2_day=daily_energy,
        average_power_per_24h_W_m2=average_power_24h,
        average_power_sunlit_days_W_m2=average_power_sunlit,
    )


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
    events_from: Annotated[
        str | None,
        Query(description="Start time for event search and sky state; defaults to start."),
    ] = None,
    include_sky: Annotated[
        bool,
        Query(description="Include live Sun/Earth metrics and Earth rise/set times."),
    ] = False,
    include_terrain: Annotated[
        bool,
        Query(description="Include Sun/Earth visibility over the LOLA terrain horizon."),
    ] = False,
) -> PowerMetricsResponse:
    site = resolve_site(site_id)
    start_datetime, end_datetime, events_start_datetime, step = _parse_metrics_window(
        start,
        end,
        step,
        events_from,
    )
    location = get_lunar_sites_loc(site.loc)
    return _calculate_metrics(
        site,
        location,
        start_datetime,
        end_datetime,
        events_start_datetime,
        step,
        settings,
        include_sky,
        include_terrain,
    )


@router.post("/metrics", response_model=PowerMetricsResponse)
def get_custom_site_metrics(
    request: CustomMetricsRequest,
    settings: Settings = Depends(get_app_settings),
) -> PowerMetricsResponse:
    start_datetime, end_datetime, events_start_datetime, step = _parse_metrics_window(
        request.start,
        request.end,
        request.step,
        None,
    )
    site = SiteSummary(
        id="custom-location",
        name="Custom location",
        loc=(request.lat, request.lon),
        agency="Custom",
    )
    return _calculate_metrics(
        site,
        get_lunar_sites_loc(site.loc),
        start_datetime,
        end_datetime,
        events_start_datetime,
        step,
        settings,
    )


@router.get(
    "/surface-roughness",
    response_model=SurfaceRoughnessResponse,
    description=(
        "Mean slope, maximum slope, and detrended RMS surface roughness "
        "for every catalog site, including the LOLA dataset used."
    ),
)
def get_surface_roughness() -> SurfaceRoughnessResponse:
    try:
        report = analyse_all_sites()
    except (OSError, RuntimeError) as exc:
        raise HTTPException(status_code=503, detail=f"Terrain data is unavailable: {exc}") from exc
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=f"Could not calculate surface roughness: {exc}") from exc
    return SurfaceRoughnessResponse(**report)


_MAX_FINE_SAMPLES = 200_000


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
    """Full Earth-visibility report over LOLA terrain, including mountain sectors."""
    site = resolve_site(site_id)
    if terrain_ppd not in VALID_PPD:
        raise HTTPException(status_code=400, detail=f"terrain_ppd must be one of {VALID_PPD}.")
    try:
        start_datetime = parse_datetime(start)
        end_datetime = parse_datetime(end)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    step = step.strip()
    if end_datetime <= start_datetime:
        raise HTTPException(status_code=400, detail="End time must be later than start time.")
    try:
        check_window(start_datetime, end_datetime, step)
    except (ValueError, IndexError, ZeroDivisionError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if (end_datetime - start_datetime).total_seconds() / (fine_step_min * 60.0) > _MAX_FINE_SAMPLES:
        raise HTTPException(
            status_code=400,
            detail=f"The requested interval would require more than {_MAX_FINE_SAMPLES} visibility samples.",
        )

    try:
        analysis = analyse_site(
            load_elevation_grid(terrain_ppd),
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
    except HorizonsUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except HorizonsRequestError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except (OSError, RuntimeError) as exc:
        raise HTTPException(status_code=503, detail=f"Terrain data is unavailable: {exc}") from exc

    analysis["windows"] = [
        {
            "start": format_utc(_julian_date_to_utc(float(a))),
            "end": format_utc(_julian_date_to_utc(float(b))),
            "hours": float(h),
        }
        for a, b, h in analysis["windows"]
    ]
    return CommunicationMetricsResponse(
        site=site,
        start=format_utc(start_datetime),
        end=format_utc(end_datetime),
        step=step,
        analysis=analysis,
    )
