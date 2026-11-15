from __future__ import annotations

import math
import os
import sys
from datetime import datetime, timedelta, timezone

import numpy as np
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

try:
    from astroquery.jplhorizons import Horizons
except Exception:  # pragma: no cover - optional dependency during local dev
    Horizons = None

from landing_data_processing import Sites

APP_TITLE = "Lunar Landing Site Navigator API"
DEFAULT_STEP = "4hour"
SOLAR_INTENSITY = 1361.0  # W/m^2
SOLAR_PANEL_EFFICIENCY = 0.2  # 20% efficiency

app = FastAPI(title=APP_TITLE, version="1.0.0")


class SiteSummary(BaseModel):
    id: str
    lat: float
    lon: float


class PowerMetricsResponse(BaseModel):
    site: SiteSummary
    start: str
    end: str
    step: str
    instantaneous_power_per_area_W_m2: list[float] = Field(..., description="Power per unit area for each sampled timestep.")
    daily_power_generated_per_area_kWh_per_m2_day: list[float] = Field(..., description="Daily energy per unit area for each day in the requested window.")
    average_power_per_24h_W_m2: float
    average_power_sunlit_days_W_m2: float


# ==========================================
# LUNAR SITE GENERATION
# ==========================================
def get_lunar_sites_loc(location):
    return {
        "lon": float(location[1]),
        "lat": float(location[0]),
        "elevation": 0,
        "body": 301,
    }


def get_site_list() -> list[SiteSummary]:
    return [
        SiteSummary(id=f"site-{index + 1}", lat=float(location[0]), lon=float(location[1]))
        for index, location in enumerate(Sites)
    ]


def resolve_site(site_id: str) -> SiteSummary:
    try:
        index = int(str(site_id).replace("site-", "")) - 1
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=f"Site '{site_id}' not found.") from exc

    if 0 <= index < len(Sites):
        lat, lon = Sites[index]
        return SiteSummary(id=f"site-{index + 1}", lat=float(lat), lon=float(lon))

    raise HTTPException(status_code=404, detail=f"Site '{site_id}' not found.")


# ==========================================
# TIME RANGE
# ==========================================
def get_time_range():
    start_datetime = datetime.now(timezone.utc) - timedelta(days=3) - timedelta(days=15)
    end_datetime = start_datetime + timedelta(days=27) + timedelta(days=15)
    return start_datetime.strftime("%Y-%m-%d %H:%M"), end_datetime.strftime("%Y-%m-%d %H:%M")


def parse_datetime(value: str) -> datetime:
    cleaned = value.replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(cleaned)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid ISO 8601 datetime.") from exc
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def format_utc(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


# ==========================================
# HORIZONS DATA
# ==========================================
def get_horizons_data(lunar_site_loc, start_datetime_str: str, end_datetime_str: str, step: str):
    if Horizons is None:
        raise RuntimeError("astroquery is not available. Install the backend dependencies first.")

    sun = Horizons(
        id="10",
        location=lunar_site_loc,
        epochs={
            "start": start_datetime_str,
            "stop": end_datetime_str,
            "step": step,
        },
    )
    return sun.ephemerides(quantities="4,20"), None


# ==========================================
# BETA ANGLE CALCULATION
# ==========================================
def calculate_beta_angle(sun_eph):
    n = np.array([0.0, 0.0, 1.0])
    az = np.deg2rad(np.array(sun_eph["AZ"]))
    el = np.deg2rad(np.array(sun_eph["EL"]))

    sun_vector = np.column_stack(
        (
            np.cos(az) * np.cos(el),
            np.sin(az) * np.cos(el),
            np.sin(el),
        )
    )

    dot_product = sun_vector @ n
    beta = np.arccos(np.clip(dot_product, -1.0, 1.0))
    return np.rad2deg(beta)


# ==========================================
# POWER AND ENERGY CALCULATION
# ==========================================
def calculate_energy_per_day(inst_solar_power, sun_eph):
    timestamps = np.asarray(sun_eph["datetime_jd"], dtype=float)
    time_seconds = (timestamps - timestamps[0]) * 86400.0
    solar_power = np.asarray(inst_solar_power, dtype=float)

    if len(time_seconds) != len(solar_power):
        raise ValueError("Solar power and timestamps must have equal lengths.")
    if np.any(np.diff(time_seconds) <= 0):
        raise ValueError("Timestamps must be strictly increasing.")

    daily_energy_kWh = []
    number_of_days = max(1, int(time_seconds[-1] // 86400))
    for day in range(number_of_days):
        start_time = day * 86400.0
        end_time = (day + 1) * 86400.0
        mask = (time_seconds > start_time) & (time_seconds < end_time)
        sample_times = np.concatenate(([start_time], time_seconds[mask], [end_time]))
        sample_power = np.interp(sample_times, time_seconds, solar_power)
        energy_joules = np.trapezoid(sample_power, sample_times)
        daily_energy_kWh.append(float(energy_joules / 3.6e6))

    return daily_energy_kWh


# ==========================================
# API ENDPOINTS
# ==========================================
@app.get("/")
def read_root():
    return {
        "name": APP_TITLE,
        "status": "ok",
        "endpoints": ["/sites", "/sites/{site_id}/metrics", "/health"],
    }


@app.get("/health")
def health_check():
    return {"status": "ok", "message": "FastAPI backend is live."}


@app.get("/sites", response_model=list[SiteSummary])
def list_sites():
    return get_site_list()


@app.get("/sites/{site_id}/metrics", response_model=PowerMetricsResponse)
def get_site_metrics(
    site_id: str,
    start: str = Query(..., description="ISO 8601 UTC start time."),
    end: str = Query(..., description="ISO 8601 UTC end time."),
    step: str = Query(default=DEFAULT_STEP, description="Time step for the Horizons query (for example 4hour)."),
):
    site = resolve_site(site_id)
    start_dt = parse_datetime(start)
    end_dt = parse_datetime(end)

    if end_dt <= start_dt:
        raise HTTPException(status_code=400, detail="End time must be later than start time.")

    lunar_site_loc = get_lunar_sites_loc([site.lat, site.lon])
    start_str = start_dt.strftime("%Y-%m-%d %H:%M")
    end_str = end_dt.strftime("%Y-%m-%d %H:%M")

    sun_eph, _ = get_horizons_data(lunar_site_loc, start_str, end_str, step)
    beta_angle = calculate_beta_angle(sun_eph)

    power_per_area = (
        SOLAR_INTENSITY
        * SOLAR_PANEL_EFFICIENCY
        * np.maximum(0.0, np.cos(np.deg2rad(beta_angle)))
    )

    daily_power_per_area = calculate_energy_per_day(power_per_area, sun_eph)
    average_power_24h = float(np.mean(daily_power_per_area) * 1000.0 / 24.0) if daily_power_per_area else 0.0

    sunlit_days = [value for value in daily_power_per_area if value > 0]
    average_power_sunlit = float(np.mean(sunlit_days) * 1000.0 / 24.0) if sunlit_days else 0.0

    return {
        "site": site,
        "start": format_utc(start_dt),
        "end": format_utc(end_dt),
        "step": step,
        "instantaneous_power_per_area_W_m2": [float(value) for value in power_per_area],
        "daily_power_generated_per_area_kWh_per_m2_day": [float(value) for value in daily_power_per_area],
        "average_power_per_24h_W_m2": average_power_24h,
        "average_power_sunlit_days_W_m2": average_power_sunlit,
    }


# ==========================================
# MAIN EXECUTION
# ==========================================
if __name__ == "__main__":
    import uvicorn

    uvicorn.run("power_gen:app", host="0.0.0.0", port=8000, reload=True)