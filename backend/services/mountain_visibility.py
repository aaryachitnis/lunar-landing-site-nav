"""
How many hours is the Earth visible from a landing site, given the real
mountains around it?

WHAT IT DOES
------------
1. TERRAIN (LRO LOLA, through lola_terrain.py)
   Looks out from the landing site in 360 compass directions and finds, for
   each direction, how high the ground appears to rise above the horizon.
   That angle is the "inclination" that blocks the view. Directions where it
   is high enough are grouped into mountain sectors, and for each sector the
   program reports its compass range, its steepest angle, and the height and
   distance of the crest.
2. THE EARTH (JPL Horizons, through astroquery)
   Asks where the Earth is in the site's sky across the mission window: its
   height above the horizon (elevation) and its compass direction (azimuth).
3. THE COMPARISON
   At every minute it looks up the mountain angle in the direction the Earth
   is currently in, and the Earth is visible if it is higher than that.
   Minutes of visibility are added up into hours and visible windows.

NEEDS: lola_terrain.py (saved under that name, in the same folder).
       pip install numpy tifffile astropy astroquery

STATUS: draft. The terrain scan, sector finding and visibility counting were
tested on synthetic terrain and a made-up Earth track with known answers.
The Horizons query and the NASA terrain download have NOT been tested here
(my sandbox cannot reach them), so check them on your first run.
"""
import json
import math
from datetime import datetime

import numpy as np
from astropy.time import Time

from services.horizon import earth_series as fetch_earth_series
from services.terrain_height import DEFAULT_PPD, load_elevation_grid

EARTH_RADIUS_KM = 6371.0
MAX_ROWS = 80_000          # stay safely under Horizons' per-request row limit

# ----------------------------------------------------------------------
# USER INPUTS (placeholders: replace with your own)
# ----------------------------------------------------------------------
# 2D list of [latitude, longitude] in degrees (east-positive longitude)
SITES = [
    [-85.0, 31.0],
    [20.19, 30.77],
]
START = "01/01/2027 00:00"   # dd/mm/yyyy or dd/mm/yyyy HH:MM, UTC
END = "01/02/2027 00:00"
STEP = "1h"                  # how often Horizons is asked (e.g. "30m", "1h")

ELEV_PPD = DEFAULT_PPD       # terrain detail: 16 (1.9 km/pixel) or 64 (0.47 km)
MAX_RANGE_KM = 150.0         # how far from the site to look for mountains
MOUNTAIN_THRESHOLD_DEG = 1.0 # ground rising above this angle counts as a mountain
MIN_ELEVATION_DEG = 0.0      # Earth must be at least this high in any direction
COUNT_PARTIAL_AS_VISIBLE = True   # the Earth is a disc about 1.9 deg wide
FINE_STEP_MIN = 1.0          # minutes between checks (window edges are this exact)

# The antenna is assumed to sit at ground level. A mast can only help by
# looking over low nearby bumps; it makes little difference against a mountain.


# ----------------------------------------------------------------------
# Dates
# ----------------------------------------------------------------------
def parse_datetime(text):
    """'01/01/2027' or '01/01/2027 14:30' (day first, UTC) -> datetime."""
    for fmt in ("%d/%m/%Y %H:%M", "%d/%m/%Y"):
        try:
            return datetime.strptime(text.strip(), fmt)
        except ValueError:
            pass
    raise ValueError(f"'{text}' is not dd/mm/yyyy or dd/mm/yyyy HH:MM.")


def check_window(start_dt, end_dt, step):
    if end_dt <= start_dt:
        raise ValueError("END must be after START.")
    if not step:
        raise ValueError("STEP must not be empty.")
    unit = {"m": 1 / 1440, "h": 1 / 24, "d": 1.0}.get(step[-1])
    if unit is None:
        raise ValueError("STEP must end in m, h or d, e.g. '30m' or '1h'.")
    try:
        step_size = float(step[:-1])
    except ValueError as exc:
        raise ValueError("STEP must begin with a positive number.") from exc
    if not math.isfinite(step_size) or step_size <= 0:
        raise ValueError("STEP must begin with a positive number.")
    n_rows = (end_dt - start_dt).total_seconds() / 86400 / (step_size * unit)
    if n_rows > MAX_ROWS:
        raise ValueError(f"{int(n_rows)} Horizons rows requested; use a larger "
                         f"STEP or a shorter window (limit ~{MAX_ROWS}).")


def jd_to_text(jd):
    return Time(jd, format="jd", scale="utc").strftime("%d/%m/%Y %H:%M")


def in_az_range(az_deg, lo, hi):
    """True where a compass direction lies within lo..hi (clockwise),
    including ranges that cross north such as 350..20."""
    return ((np.asarray(az_deg) - lo) % 360.0) <= ((hi - lo) % 360.0)


# ----------------------------------------------------------------------
# Part 1: the mountains, from LOLA terrain
# ----------------------------------------------------------------------
def terrain_skyline(dem, lat, lon, max_range_km=150.0, n_az=360):
    """For each compass direction, how high does the ground appear to rise
    above the flat horizon, seen from the site?

    Method: walk outward along each direction, read the terrain height at
    each step, and work out the angle at which the site sees it, allowing for
    the Moon's curved surface (distant ground is partly hidden behind the
    curve). The skyline angle in each direction is the largest angle found,
    i.e. the top of the mountain in that direction.

    Returns (azimuths, skyline_deg, crest_distance_km, crest_height_m), one
    value per compass direction; crest height is relative to the site's own
    ground level."""
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
    """Group neighbouring compass directions whose skyline is above the
    threshold into mountain sectors. Handles a sector that crosses north."""
    n = len(az)
    above = sky > threshold_deg
    if not above.any():
        return []
    # Rotate so we start on a direction below the threshold; a sector that
    # crosses north then stays in one piece.
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


# ----------------------------------------------------------------------
# Part 2: the Earth, from JPL Horizons
# ----------------------------------------------------------------------
def earth_series(lat, lon, start_dt, end_dt, step):
    """Earth's compass direction, height above the flat horizon and distance,
    as seen from the site, at regular steps through the mission."""
    return fetch_earth_series(lat, lon, start_dt, end_dt, step)


def refine_track(jd, az, el, dist_km, step_min):
    """Fill in the Earth's smooth path between Horizons' samples so window
    edges come out to the minute. Compass directions are unwrapped first so
    359 -> 1 degrees isn't read as a 358-degree swing."""
    t = np.arange(jd[0], jd[-1] + 1e-9, step_min / 1440.0)
    az_u = np.degrees(np.unwrap(np.radians(az)))
    return (t, np.interp(t, jd, az_u) % 360.0, np.interp(t, jd, el),
            np.interp(t, jd, dist_km))


# ----------------------------------------------------------------------
# Part 3: compare the Earth with the mountains
# ----------------------------------------------------------------------
def earth_visibility(az, el, dist_km, sky_az, sky_deg, min_elev, count_partial):
    """At each time: is the Earth higher than the mountain angle in the
    direction it is currently in?

    Returns (visible, fully_visible, visible_if_flat, skyline_at_earth)."""
    radius = np.degrees(np.arcsin(EARTH_RADIUS_KM / dist_km))   # ~0.95 deg
    skyline = np.interp(az, sky_az, sky_deg, period=360)        # mountain angle
    limit = np.maximum(skyline, min_elev)                       # in Earth's direction
    edge = el + radius if count_partial else el - radius
    visible = edge > limit
    fully = (el - radius) > limit
    visible_if_flat = edge > min_elev                           # ignoring mountains
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
    """Everything for one site. Returns a dictionary of results."""
    if not -90.0 <= lat <= 90.0:
        raise ValueError(f"Latitude {lat} is outside -90 to 90 degrees.")
    if not -180.0 <= lon <= 360.0:
        raise ValueError(f"Longitude {lon} is outside -180 to 360 degrees.")

    # 1) mountains
    sky_az, sky, crest_d, crest_h = terrain_skyline(dem, lat, lon, max_range_km)
    sectors = find_mountain_sectors(sky_az, sky, crest_d, crest_h, threshold_deg)

    # 2) Earth
    jd, az, el, dist = earth_series(lat, lon, start_dt, end_dt, step)
    t, az_t, el_t, dist_t = refine_track(jd, az, el, dist, fine_step_min)

    # 3) compare
    vis, full, flat_vis, skyline_t = earth_visibility(
        az_t, el_t, dist_t, sky_az, sky, min_elev, count_partial)
    dt_h = fine_step_min / 60.0
    blocked = flat_vis & ~vis
    # Each minute-step runs from one sample to the next, so the final sample
    # (the mission end) only marks the end and is left out of the totals.
    vis_i, full_i, flat_i, blocked_i = vis[:-1], full[:-1], flat_vis[:-1], blocked[:-1]

    for sec in sectors:   # how much each mountain sector mattered
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


if __name__ == "__main__":
    start_dt, end_dt = parse_datetime(START), parse_datetime(END)
    check_window(start_dt, end_dt, STEP)
    dem = load_elevation_grid(ELEV_PPD)   # downloads/converts on first run only
    print(f"Terrain: {dem.meta['dataset']}, {dem.pixel_km * 1000:.0f} m per "
          f"pixel at the equator")

    results = []
    for i, (lat, lon) in enumerate(SITES):
        row = {"site": i, "lat": lat, "lon": lon}
        try:
            res = analyse_site(dem, lat, lon, start_dt, end_dt, STEP,
                               MAX_RANGE_KM, MOUNTAIN_THRESHOLD_DEG,
                               MIN_ELEVATION_DEG, COUNT_PARTIAL_AS_VISIBLE,
                               FINE_STEP_MIN)
        except Exception as exc:   # one bad site never stops the rest
            row["error"] = str(exc)
        else:
            row.update(res)
            row["windows"] = [
                {
                    "start_utc": jd_to_text(start_jd),
                    "end_utc": jd_to_text(end_jd),
                    "hours": float(hours),
                }
                for start_jd, end_jd, hours in res["windows"]
            ]
        results.append(row)
    print(json.dumps(results, indent=2))