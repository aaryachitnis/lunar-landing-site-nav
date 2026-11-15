"""Broad-scale slope and RMS roughness calculations from LOLA elevation data."""

import json
import math
import sys
from pathlib import Path

import numpy as np

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from data import SITES
from services.terrain_height import (
    DEFAULT_PPD,
    SVS_BASE_URL,
    load_elevation_grid,
)

DEFAULT_RADIUS_KM = 10.0


def horn_slope_deg(elevation_m: np.ndarray, spacing_m: float) -> np.ndarray:
    """Calculate interior slopes using Horn's 3-by-3 weighted method."""
    a = elevation_m[:-2, :-2]
    b = elevation_m[:-2, 1:-1]
    c = elevation_m[:-2, 2:]
    d = elevation_m[1:-1, :-2]
    f = elevation_m[1:-1, 2:]
    g = elevation_m[2:, :-2]
    h = elevation_m[2:, 1:-1]
    i = elevation_m[2:, 2:]
    dzdx = ((c + 2 * f + i) - (a + 2 * d + g)) / (8.0 * spacing_m)
    dzdy = ((g + 2 * h + i) - (a + 2 * b + c)) / (8.0 * spacing_m)
    return np.degrees(np.arctan(np.hypot(dzdx, dzdy)))


def surface_roughness_stats(
    dem,
    lat: float,
    lon: float,
    radius_km: float = DEFAULT_RADIUS_KM,
) -> dict[str, float]:
    """Return mean slope, maximum slope, and detrended RMS roughness."""
    if not math.isfinite(lat) or not -90.0 <= lat <= 90.0:
        raise ValueError("Latitude must be between -90 and 90 degrees.")
    if not math.isfinite(lon) or not -180.0 <= lon <= 180.0:
        raise ValueError("Longitude must be between -180 and 180 degrees.")
    if not math.isfinite(radius_km) or radius_km <= 0:
        raise ValueError("Radius must be finite and positive.")

    spacing_m = dem.pixel_km * 1000.0
    n = int(np.floor(2 * radius_km * 1000.0 / spacing_m)) + 1
    n += 1 - n % 2
    if n < 5:
        raise ValueError(
            f"Radius {radius_km:g} km is too small for {dem.pixel_km:.2f} km "
            "elevation pixels."
        )

    axis = (np.arange(n) - (n - 1) / 2.0) * spacing_m
    east_m, north_m = np.meshgrid(axis, axis)
    distance_m = np.hypot(east_m, north_m)
    angular_distance = distance_m / dem.offset
    bearing = np.arctan2(east_m, north_m)
    lat_radians, lon_radians = np.radians(lat), np.radians(lon)
    sample_lat = np.arcsin(
        np.sin(lat_radians) * np.cos(angular_distance)
        + np.cos(lat_radians) * np.sin(angular_distance) * np.cos(bearing)
    )
    sample_lon = lon_radians + np.arctan2(
        np.sin(bearing) * np.sin(angular_distance) * np.cos(lat_radians),
        np.cos(angular_distance) - np.sin(lat_radians) * np.sin(sample_lat),
    )
    elevation_m = np.asarray(
        dem.sample(np.degrees(sample_lat), np.degrees(sample_lon)),
        dtype=float,
    )

    inside = distance_m <= radius_km * 1000.0
    slope = horn_slope_deg(elevation_m, spacing_m)
    local_slope = slope[inside[1:-1, 1:-1]]
    design = np.column_stack(
        (np.ones(inside.sum()), east_m[inside], north_m[inside])
    )
    coefficients, *_ = np.linalg.lstsq(design, elevation_m[inside], rcond=None)
    residuals = elevation_m[inside] - design @ coefficients

    return {
        "mean_slope_deg": round(float(local_slope.mean()), 2),
        "max_slope_deg": round(float(local_slope.max()), 2),
        "rms_surface_roughness_m": round(
            float(np.sqrt(np.mean(residuals**2))),
            1,
        ),
    }


def analyse_all_sites() -> dict:
    """Fetch the default LOLA grid and calculate the requested metrics per site."""
    dem = load_elevation_grid(DEFAULT_PPD)
    sites = []
    for site_id, name, (lat, lon), _description, _agency in SITES:
        sites.append(
            {
                "site_id": site_id,
                "site_name": name,
                **surface_roughness_stats(
                    dem,
                    lat,
                    lon,
                    DEFAULT_RADIUS_KM,
                ),
            }
        )
    return {
        "data_source": str(dem.meta["dataset"]),
        "source_url": f"{SVS_BASE_URL}ldem_{dem.ppd}.tif",
        "resolution_m_at_equator": float(
            dem.meta["resolution_m_at_equator"]
        ),
        "analysis_radius_km": DEFAULT_RADIUS_KM,
        "sites": sites,
    }


def print_report(report: dict) -> None:
    """Print source metadata followed by the per-site results as a JSON list."""
    print(f"Dataset: {report['data_source']}")
    print(f"Source: {report['source_url']}")
    print(
        f"Resolution: {report['resolution_m_at_equator']:g} m/pixel at the "
        f"equator; analysis radius: {report['analysis_radius_km']:g} km"
    )
    print("Sites:")
    print(json.dumps(report["sites"], indent=2))


if __name__ == "__main__":
    print_report(analyse_all_sites())
