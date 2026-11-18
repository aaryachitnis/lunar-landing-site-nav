"""Earth visibility from a site over its real LOLA skyline."""
import math

import numpy as np

from core.utils import get_lunar_sites_loc
from services.power_services import fetch_earth_ephemeris

AU_KM = 149_597_870.7
EARTH_RADIUS_KM = 6371.0
MAX_ROWS = 80_000  # stays under Horizons' per-request row limit


def check_window(start_dt, end_dt, step):
    if end_dt <= start_dt:
        raise ValueError("End must be after start.")
    if not step:
        raise ValueError("Step must not be empty.")
    unit = {"m": 1 / 1440, "h": 1 / 24, "d": 1.0}.get(step[-1])
    if unit is None:
        raise ValueError("Step must end in m, h or d, e.g. '30m' or '1h'.")
    try:
        step_size = float(step[:-1])
    except ValueError as exc:
        raise ValueError("Step must begin with a positive number.") from exc
    if not math.isfinite(step_size) or step_size <= 0:
        raise ValueError("Step must begin with a positive number.")
    n_rows = (end_dt - start_dt).total_seconds() / 86400 / (step_size * unit)
    if n_rows > MAX_ROWS:
        raise ValueError(f"{int(n_rows)} Horizons rows requested; use a larger "
                         f"step or a shorter window (limit ~{MAX_ROWS}).")


def in_az_range(az_deg, lo, hi):
    """True where an azimuth is within lo..hi clockwise, including ranges across north."""
    return ((np.asarray(az_deg) - lo) % 360.0) <= ((hi - lo) % 360.0)


def terrain_skyline(dem, lat, lon, max_range_km=150.0, n_az=360):
    """Highest terrain elevation angle in each of n_az directions, allowing for the Moon's curvature.

    Returns (azimuths, skyline_deg, crest_distance_km, crest_height_m above the site)."""
    az = np.arange(n_az) * (360.0 / n_az)
    dist_km = np.arange(dem.pixel_km, max_range_km + dem.pixel_km, dem.pixel_km)
    ang = (dist_km * 1000.0) / dem.offset

    lat1, lon1 = np.radians(lat), np.radians(lon)
    A = np.radians(az)[:, None]
    T = ang[None, :]
    lat2 = np.arcsin(np.sin(lat1) * np.cos(T) + np.cos(lat1) * np.sin(T) * np.cos(A))
    lon2 = lon1 + np.arctan2(np.sin(A) * np.sin(T) * np.cos(lat1),
                             np.cos(T) - np.sin(lat1) * np.sin(lat2))
    r_point = dem.radius_m(np.degrees(lat2), np.degrees(lon2))

    r_ground = float(dem.radius_m(lat, lon))
    elevation = np.degrees(np.arctan2(r_point * np.cos(T) - r_ground,
                                      r_point * np.sin(T)))
    k = elevation.argmax(axis=1)
    rows = np.arange(n_az)
    return (az, elevation[rows, k], dist_km[k], r_point[rows, k] - r_ground)


def find_mountain_sectors(az, sky, crest_dist_km, crest_height_m, threshold_deg):
    """Group neighbouring directions whose skyline exceeds threshold_deg into sectors."""
    n = len(az)
    above = sky > threshold_deg
    if not above.any():
        return []
    # Start on a gap so a sector that crosses north stays in one piece.
    first_gap = int(np.argmin(above)) if not above.all() else 0
    order = (np.arange(n) + first_gap) % n
    a = above[order]
    padded = np.concatenate(([False], a, [False])).astype(int)
    starts = np.where(np.diff(padded) == 1)[0]
    ends = np.where(np.diff(padded) == -1)[0] - 1

    sectors = []
    for s, e in zip(starts, ends):
        idx = order[s:e + 1]
        k = idx[np.argmax(sky[idx])]
        sectors.append({
            "az_from": float(az[idx[0]]),
            "az_to": float(az[idx[-1]]),
            "all_around": bool(above.all()),
            "peak_deg": float(sky[k]),
            "peak_az": float(az[k]),
            "mean_deg": float(sky[idx].mean()),
            "crest_distance_km": float(crest_dist_km[k]),
            "crest_height_m": float(crest_height_m[k]),
        })
    return sectors


def earth_series(lat, lon, start_dt, end_dt, step):
    """Earth's Julian dates, azimuths, elevations and distances (km) seen from the site."""
    eph = fetch_earth_ephemeris(
        get_lunar_sites_loc((lat, lon)),
        start_dt.strftime("%Y-%m-%d %H:%M"),
        end_dt.strftime("%Y-%m-%d %H:%M"),
        step,
    )
    return (
        np.asarray(eph["datetime_jd"], dtype=float),
        np.asarray(eph["AZ"], dtype=float),
        np.asarray(eph["EL"], dtype=float),
        np.asarray(eph["delta"], dtype=float) * AU_KM,
    )


def refine_track(jd, az, el, dist_km, step_min):
    """Interpolate the track to step_min minutes; azimuth is unwrapped so 359° → 1° isn't a full turn."""
    t = np.arange(jd[0], jd[-1] + 1e-9, step_min / 1440.0)
    az_u = np.degrees(np.unwrap(np.radians(az)))
    return (t, np.interp(t, jd, az_u) % 360.0, np.interp(t, jd, el),
            np.interp(t, jd, dist_km))


def earth_visibility(az, el, dist_km, sky_az, sky_deg, min_elev, count_partial):
    """Returns (visible, fully_visible, visible_if_flat, skyline_at_earth) for each sample."""
    radius = np.degrees(np.arcsin(EARTH_RADIUS_KM / dist_km))  # Earth's disc is ~1.9° across
    skyline = np.interp(az, sky_az, sky_deg, period=360)
    limit = np.maximum(skyline, min_elev)
    edge = el + radius if count_partial else el - radius
    visible = edge > limit
    fully = (el - radius) > limit
    visible_if_flat = edge > min_elev
    return visible, fully, visible_if_flat, skyline


def visible_windows(t, visible):
    """(start_jd, end_jd, hours) for each unbroken visible stretch."""
    if t.size < 2:
        return []
    step = float(np.median(np.diff(t)))
    padded = np.concatenate(([False], visible, [False])).astype(int)
    starts = np.where(np.diff(padded) == 1)[0]
    ends = np.where(np.diff(padded) == -1)[0] - 1
    return [(t[s], t[e] + step, (t[e] - t[s] + step) * 24.0)
            for s, e in zip(starts, ends)]


def longest_run_hours(flags, step_h):
    longest = run = 0
    for f in flags:
        run = run + 1 if f else 0
        longest = max(longest, run)
    return longest * step_h


def analyse_site(dem, lat, lon, start_dt, end_dt, step, max_range_km,
                 threshold_deg, min_elev, count_partial, fine_step_min):
    """Full Earth-visibility report for one site, as returned by /sites/{id}/communications."""
    if not -90.0 <= lat <= 90.0:
        raise ValueError(f"Latitude {lat} is outside -90 to 90 degrees.")
    if not -180.0 <= lon <= 360.0:
        raise ValueError(f"Longitude {lon} is outside -180 to 360 degrees.")

    sky_az, sky, crest_d, crest_h = terrain_skyline(dem, lat, lon, max_range_km)
    sectors = find_mountain_sectors(sky_az, sky, crest_d, crest_h, threshold_deg)
    jd, az, el, dist = earth_series(lat, lon, start_dt, end_dt, step)
    t, az_t, el_t, dist_t = refine_track(jd, az, el, dist, fine_step_min)
    vis, full, flat_vis, _ = earth_visibility(
        az_t, el_t, dist_t, sky_az, sky, min_elev, count_partial)
    dt_h = fine_step_min / 60.0
    blocked = flat_vis & ~vis
    # Each step covers the interval to the next sample, so the last sample only marks the end.
    vis_i, full_i, flat_i, blocked_i = vis[:-1], full[:-1], flat_vis[:-1], blocked[:-1]

    for sec in sectors:
        inside = in_az_range(az_t[:-1], sec["az_from"], sec["az_to"])
        sec["earth_in_sector_h"] = float(inside.sum() * dt_h)
        sec["earth_hidden_by_sector_h"] = float((inside & blocked_i).sum() * dt_h)

    return {
        "sectors": sectors,
        "windows": visible_windows(t[:-1], vis_i),
        "mission_hours": float((t[-1] - t[0]) * 24.0),
        "visible_hours": float(vis_i.sum() * dt_h),
        "visible_hours_per_24h": float(vis_i.sum() * dt_h * 24.0
                                       / ((t[-1] - t[0]) * 24.0)),
        "fully_visible_hours": float(full_i.sum() * dt_h),
        "hidden_by_mountains_hours": float(blocked_i.sum() * dt_h),
        "below_horizon_hours": float((~flat_i).sum() * dt_h),
        "longest_outage_hours": longest_run_hours(~vis_i, dt_h),
        "earth_az_start": float(az[0]), "earth_az_end": float(az[-1]),
        "earth_el_start": float(el[0]), "earth_el_end": float(el[-1]),
        "earth_el_min": float(el_t.min()), "earth_el_max": float(el_t.max()),
        "highest_skyline_deg": float(sky.max()),
        "highest_skyline_az": float(sky_az[sky.argmax()]),
    }
