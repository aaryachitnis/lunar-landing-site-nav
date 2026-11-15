"""Small numpy helpers for elevation grids (DEM tiles).

They work on any grid that follows the ``TerrainData`` convention (row 0 =
north, column 0 = west), so they apply equally to mock data and to real
LOLA / Moon Trek tiles coming back from the engine.
"""

from __future__ import annotations

import numpy as np


def _as_grid(elevation_m) -> np.ndarray:
    grid = np.asarray(elevation_m, dtype=float)
    if grid.ndim != 2 or min(grid.shape) < 3:
        raise ValueError("elevation grid must be 2-D and at least 3x3")
    return grid


def gradients(elevation_m, pixel_size_m: float) -> tuple[np.ndarray, np.ndarray]:
    """Return (dz/dx eastward, dz/dy northward) in metres per metre."""
    grid = _as_grid(elevation_m)
    dz_drow, dz_dcol = np.gradient(grid, pixel_size_m)
    return dz_dcol, -dz_drow  # rows run north -> south, so flip the sign for "north"


def slope_map_deg(elevation_m, pixel_size_m: float) -> np.ndarray:
    dx, dy = gradients(elevation_m, pixel_size_m)
    return np.degrees(np.arctan(np.hypot(dx, dy)))


def roughness_m(elevation_m) -> float:
    """RMS deviation from the best-fit plane (removes regional tilt)."""
    grid = _as_grid(elevation_m)
    rows, cols = np.mgrid[0 : grid.shape[0], 0 : grid.shape[1]]
    design = np.column_stack([cols.ravel(), rows.ravel(), np.ones(grid.size)])
    coef, *_ = np.linalg.lstsq(design, grid.ravel(), rcond=None)
    residual = grid.ravel() - design @ coef
    return float(np.sqrt(np.mean(residual**2)))


def terrain_stats(elevation_m, pixel_size_m: float) -> dict[str, float]:
    grid = _as_grid(elevation_m)
    slope = slope_map_deg(grid, pixel_size_m)
    return {
        "min_elevation_m": float(grid.min()),
        "max_elevation_m": float(grid.max()),
        "mean_slope_deg": float(slope.mean()),
        "max_slope_deg": float(slope.max()),
        "roughness_m": roughness_m(grid),
    }


def hillshade(
    elevation_m,
    pixel_size_m: float,
    *,
    sun_azimuth_deg: float = 315.0,
    sun_elevation_deg: float = 35.0,
    vertical_exaggeration: float = 2.0,
) -> np.ndarray:
    """Shaded-relief image in 0..1, lit from the given azimuth/elevation."""
    dx, dy = gradients(elevation_m, pixel_size_m)
    dx, dy = dx * vertical_exaggeration, dy * vertical_exaggeration
    normal = np.stack([-dx, -dy, np.ones_like(dx)])
    normal /= np.linalg.norm(normal, axis=0)
    az, el = np.radians(sun_azimuth_deg), np.radians(sun_elevation_deg)
    sun = np.array([np.cos(el) * np.sin(az), np.cos(el) * np.cos(az), np.sin(el)])
    return np.clip(np.tensordot(sun, normal, axes=1), 0.0, 1.0)
