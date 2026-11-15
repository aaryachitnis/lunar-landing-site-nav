"""Deterministic mock of the processing engine.

Produces a full ``SiteResult`` for any lunar coordinate so the dashboard UI can
be built and tested before the real FastAPI engine exists. It has the same
interface as ``HttpEngineClient`` (``calculate_potential(request) -> SiteResult``),
so swapping it out is a configuration change (see ``config.py``).

What is real and what is not
----------------------------
* Sun / Earth azimuth and elevation use correct spherical geometry, but the
  sub-solar and sub-Earth points come from a simplified model (mean synodic
  month, small sinusoidal libration), NOT from NASA Horizons.
* Power is ``area * efficiency * 1361 W/m^2 * max(0, sin(sun_elevation))`` for a
  horizontal array, with no terrain horizon masking, tilt or tracking.
* Terrain is procedural (fractal noise plus craters) seeded from the
  coordinates, so the same site always gives the same tile. It is NOT LOLA data.

Every result is flagged with ``data_source="mock"`` and a warning so nobody
mistakes it for real output.
"""

from __future__ import annotations

import math
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

import numpy as np

from .schemas import (
    Ephemeris,
    PotentialSummary,
    PowerResult,
    SiteInfo,
    SiteRequest,
    SiteResult,
    SkyTrack,
    TerrainData,
)
from .terrain import terrain_stats

GRID_SIZE = 128
SOLAR_CONSTANT_W_M2 = 1361.0
SYNODIC_DAYS = 29.530588861
# Mean new moon: the sub-solar point is on the far side (longitude 180) at this instant.
_NEW_MOON_REF = datetime(2000, 1, 6, 18, 14, tzinfo=timezone.utc)

MOCK_WARNING = (
    "Mock data: values are synthetic (simplified lunar geometry and procedural terrain) "
    "and do not come from NASA Horizons, LOLA or the power engine."
)


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def format_coords(latitude: float, longitude: float) -> str:
    ns = "N" if latitude >= 0 else "S"
    ew = "E" if longitude >= 0 else "W"
    return f"{abs(latitude):.4f}°{ns}, {abs(longitude):.4f}°{ew}"


def _rng(latitude: float, longitude: float) -> np.random.Generator:
    seed = [int(round((latitude + 90.0) * 10_000)), int(round((longitude + 180.0) * 10_000))]
    return np.random.default_rng(np.random.SeedSequence(seed))


def _wrap_lon(degrees):
    return (degrees + 180.0) % 360.0 - 180.0


def _sky(lat_deg: float, lon_deg: float, target_lat_deg, target_lon_deg):
    """Azimuth, elevation (deg) and sin(elevation) of a distant body whose
    sub-point is (target_lat, target_lon), seen from a site on the sphere."""
    phi = math.radians(lat_deg)
    tphi = np.radians(target_lat_deg)
    dlon = np.radians(np.asarray(target_lon_deg) - lon_deg)
    sin_el = np.clip(math.sin(phi) * np.sin(tphi) + math.cos(phi) * np.cos(tphi) * np.cos(dlon), -1.0, 1.0)
    azimuth = np.degrees(
        np.arctan2(
            np.sin(dlon) * np.cos(tphi),
            math.cos(phi) * np.sin(tphi) - math.sin(phi) * np.cos(tphi) * np.cos(dlon),
        )
    )
    return azimuth % 360.0, np.degrees(np.arcsin(sin_el)), sin_el


def _longest_run(mask: np.ndarray) -> int:
    best = current = 0
    for value in mask:
        current = current + 1 if value else 0
        best = max(best, current)
    return best


def _fractal_surface(n: int, rng: np.random.Generator, beta: float = 2.2) -> np.ndarray:
    """Zero-mean, unit-variance 1/f^beta noise (spectral synthesis)."""
    kx = np.fft.fftfreq(n)[:, None]
    ky = np.fft.fftfreq(n)[None, :]
    k = np.hypot(kx, ky)
    k[0, 0] = 1.0
    amplitude = k ** (-beta / 2.0)
    amplitude[0, 0] = 0.0
    surface = np.fft.ifft2(np.fft.fft2(rng.standard_normal((n, n))) * amplitude).real
    return (surface - surface.mean()) / surface.std()


# --------------------------------------------------------------------------- #
# generators
# --------------------------------------------------------------------------- #
def _mock_terrain(req: SiteRequest, rng: np.random.Generator, mare: bool, base_elevation_m: float) -> TerrainData:
    n = GRID_SIZE
    radius_m = req.terrain_radius_km * 1000.0
    pixel_m = 2.0 * radius_m / (n - 1)
    x = np.linspace(-radius_m, radius_m, n)
    y = np.linspace(radius_m, -radius_m, n)  # row 0 = north
    X, Y = np.meshgrid(x, y)

    relief_rms = 3.0 if mare else 20.0
    z = _fractal_surface(n, rng) * relief_rms

    tilt = math.tan(math.radians(rng.uniform(0.2, 0.8)))
    heading = rng.uniform(0.0, 2.0 * math.pi)
    z += tilt * (X * math.cos(heading) + Y * math.sin(heading))

    craters = 4 if mare else 10
    median_radius = radius_m * (0.04 if mare else 0.07)
    for _ in range(craters):
        cx, cy = rng.uniform(-0.9 * radius_m, 0.9 * radius_m, size=2)
        r = float(np.clip(rng.lognormal(math.log(median_radius), 0.6), 3.0 * pixel_m, 0.3 * radius_m))
        d = np.hypot(X - cx, Y - cy) / r
        bowl = -0.4 * r * (1.0 - d**2) * (d < 1.0)
        rim = 0.08 * r * np.exp(-(((d - 1.0) / 0.2) ** 2))
        z += bowl + rim

    z = np.round(z + base_elevation_m, 2)
    stats = terrain_stats(z, pixel_m)
    return TerrainData(
        elevation_m=z.tolist(),
        radius_km=req.terrain_radius_km,
        pixel_size_m=pixel_m,
        source="mock (procedural terrain)",
        **stats,
    )


def _mock_ephemeris(req: SiteRequest, n: int) -> tuple[Ephemeris, np.ndarray, np.ndarray]:
    start = req.start_time_utc
    days = (start - _NEW_MOON_REF).total_seconds() / 86400.0 + np.arange(n) * req.step_hours / 24.0

    sun_lon = _wrap_lon(180.0 - 360.0 * days / SYNODIC_DAYS)  # sub-solar point drifts west
    sun_lat = 1.54 * np.sin(2.0 * np.pi * days / 346.62)  # Moon's axial tilt to the ecliptic
    earth_lon = 7.9 * np.sin(2.0 * np.pi * days / 27.5546)  # libration in longitude
    earth_lat = 6.7 * np.sin(2.0 * np.pi * days / 27.2122 + 1.0)  # libration in latitude

    sun_az, sun_el, sun_sin = _sky(req.latitude, req.longitude, sun_lat, sun_lon)
    earth_az, earth_el, _ = _sky(req.latitude, req.longitude, earth_lat, earth_lon)

    times = [start + timedelta(hours=i * req.step_hours) for i in range(n)]
    ephemeris = Ephemeris(
        times_utc=times,
        sun=SkyTrack(azimuth_deg=np.round(sun_az, 3).tolist(), elevation_deg=np.round(sun_el, 3).tolist()),
        earth=SkyTrack(azimuth_deg=np.round(earth_az, 3).tolist(), elevation_deg=np.round(earth_el, 3).tolist()),
        source="mock (simplified geometry)",
    )
    return ephemeris, sun_sin, earth_el


def _mock_power(req: SiteRequest, sun_sin: np.ndarray, earth_el: np.ndarray, sun_el: list[float]) -> PowerResult:
    power = req.panel_area_m2 * req.panel_efficiency * SOLAR_CONSTANT_W_M2 * np.clip(sun_sin, 0.0, None)
    sunlit = np.asarray(sun_el) > 0.0
    summary = PotentialSummary(
        mean_power_w=float(power.mean()),
        peak_power_w=float(power.max()),
        total_energy_kwh=float(power.sum() * req.step_hours / 1000.0),
        sunlit_fraction=float(sunlit.mean()),
        longest_darkness_hours=float(_longest_run(~sunlit) * req.step_hours),
        earth_visible_fraction=float((earth_el > 0.0).mean()),
    )
    return PowerResult(summary=summary, power_w=np.round(power, 3).tolist())


# --------------------------------------------------------------------------- #
# client
# --------------------------------------------------------------------------- #
class MockEngineClient:
    """Drop-in replacement for ``HttpEngineClient`` that computes everything locally.

    ``latency_s`` simulates a slow engine (handy for testing spinners);
    ``fail`` makes every call raise the given exception (handy for testing the
    UI's error handling).
    """

    def __init__(self, *, latency_s: float = 0.0, fail: Optional[Exception] = None) -> None:
        self._latency_s = latency_s
        self._fail = fail

    def calculate_potential(self, request: SiteRequest) -> SiteResult:
        if self._latency_s > 0:
            time.sleep(self._latency_s)
        if self._fail is not None:
            raise self._fail

        if request.start_time_utc is None:
            now = datetime.now(timezone.utc)
            request = request.model_copy(update={"start_time_utc": now.replace(minute=0, second=0, microsecond=0)})

        lat, lon = request.latitude, request.longitude
        rng = _rng(lat, lon)
        near_side = abs(lon) < 90.0
        mare = bool(near_side and abs(lat) < 55.0 and rng.random() < 0.55)
        base_elevation = float(rng.uniform(-3000.0, -500.0) if mare else rng.uniform(-500.0, 3500.0))

        n = int(round(request.duration_days * 24.0 / request.step_hours)) + 1
        ephemeris, sun_sin, earth_el = _mock_ephemeris(request, n)
        power = _mock_power(request, sun_sin, np.asarray(ephemeris.earth.elevation_deg), ephemeris.sun.elevation_deg)
        terrain = _mock_terrain(request, rng, mare, base_elevation)

        return SiteResult(
            data_source="mock",
            generated_at=datetime.now(timezone.utc),
            request=request,
            site=SiteInfo(
                name=f"Custom site ({format_coords(lat, lon)})",
                latitude=lat,
                longitude=lon,
                near_side=near_side,
                terrain_class="mare" if mare else "highland",
                centre_elevation_m=round(base_elevation, 1),
                notes="Mock site description.",
            ),
            ephemeris=ephemeris,
            power=power,
            terrain=terrain,
            warnings=[MOCK_WARNING],
        )
