"""Sun and Earth visibility over the LOLA skyline, judged by the body's centre like the flat metrics."""
from dataclasses import dataclass
from datetime import datetime

import numpy as np

from services.mountain_visibility import terrain_skyline, visible_windows
from services.power_services import (
    EphemerisData,
    _as_utc,
    _column_as_floats,
    _darkness_durations,
    _datetime_to_julian_date,
    _julian_date_to_utc,
    find_nearest_horizon_crossings,
)

MAX_RANGE_KM = 150.0
REFINE_MINUTES = 10.0


@dataclass(frozen=True)
class BodyVisibility:
    visible: bool
    azimuth_degrees: float
    terrain_horizon_degrees: float
    nearest_rise_utc: datetime | None
    nearest_set_utc: datetime | None
    visible_fraction: float
    flat_visible_fraction: float
    longest_hidden_hours: float
    hidden_by_terrain_hours: float
    windows: list[tuple[datetime, datetime, float]]


@dataclass(frozen=True)
class TerrainSky:
    dataset: str
    resolution_m: float
    max_range_km: float
    horizon_profile_degrees: list[float]
    sun: BodyVisibility
    earth: BodyVisibility


def _track(ephemeris: EphemerisData, start_jd: float, end_jd: float):
    """Elevation and azimuth on a fine grid; azimuth is unwrapped so 359° → 1° isn't a full turn."""
    jd = _column_as_floats(ephemeris, "datetime_jd")
    az = _column_as_floats(ephemeris, "AZ")
    el = _column_as_floats(ephemeris, "EL")
    t = np.arange(start_jd, end_jd + 1e-9, REFINE_MINUTES / 1440.0)
    if t[-1] < end_jd:
        t = np.append(t, end_jd)
    az_t = np.interp(t, jd, np.degrees(np.unwrap(np.radians(az)))) % 360.0
    return t, az_t, np.interp(t, jd, el)


def _body(ephemeris, sky_az, sky_deg, start_jd, end_jd) -> BodyVisibility:
    t, az, el = _track(ephemeris, start_jd, end_jd)
    horizon = np.interp(az, sky_az, sky_deg, period=360)
    # Reuse the flat-horizon crossing/darkness code by feeding it "height above terrain".
    margin = {"datetime_jd": t, "EL": np.clip(el - horizon, -90.0, 90.0)}
    start, end = _julian_date_to_utc(start_jd), _julian_date_to_utc(end_jd)
    rise, set_ = find_nearest_horizon_crossings(margin, start, end)
    longest_s, total_hidden_s = _darkness_durations(t, margin["EL"], start_jd, end_jd)
    window_s = (end_jd - start_jd) * 86_400.0

    visible = el > horizon
    step_h = REFINE_MINUTES / 60.0
    hidden_by_terrain = (el > 0.0) & ~visible
    return BodyVisibility(
        visible=bool(visible[0]),
        azimuth_degrees=float(az[0]),
        terrain_horizon_degrees=float(horizon[0]),
        nearest_rise_utc=rise,
        nearest_set_utc=set_,
        visible_fraction=float(min(1.0, max(0.0, 1.0 - total_hidden_s / window_s))) if window_s > 0 else float(visible[0]),
        flat_visible_fraction=float((el[:-1] > 0.0).mean()) if len(el) > 1 else float(el[0] > 0.0),
        longest_hidden_hours=longest_s / 3600.0,
        hidden_by_terrain_hours=float(hidden_by_terrain[:-1].sum() * step_h),
        windows=[
            (_julian_date_to_utc(a), _julian_date_to_utc(min(b, end_jd)), float(h))
            for a, b, h in visible_windows(t[:-1], visible[:-1])
        ],
    )


def calculate_terrain_sky(
    dem,
    lat: float,
    lon: float,
    sun_ephemeris: EphemerisData,
    earth_ephemeris: EphemerisData,
    start: datetime,
    end: datetime,
) -> TerrainSky:
    """Terrain-aware Sun and Earth visibility from `start` to `end` (UTC)."""
    start_jd = _datetime_to_julian_date(_as_utc(start))
    end_jd = _datetime_to_julian_date(_as_utc(end))
    if end_jd <= start_jd:
        raise ValueError("End time must be later than start time.")
    sky_az, sky_deg, _, _ = terrain_skyline(dem, lat, lon, MAX_RANGE_KM)
    return TerrainSky(
        dataset=str(dem.meta["dataset"]),
        resolution_m=float(dem.meta["resolution_m_at_equator"]),
        max_range_km=MAX_RANGE_KM,
        horizon_profile_degrees=[round(float(v), 2) for v in sky_deg],
        sun=_body(sun_ephemeris, sky_az, sky_deg, start_jd, end_jd),
        earth=_body(earth_ephemeris, sky_az, sky_deg, start_jd, end_jd),
    )
