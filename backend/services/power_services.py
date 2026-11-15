from datetime import datetime, timedelta, timezone
from typing import Protocol

import numpy as np
from numpy.typing import ArrayLike, NDArray
from requests.exceptions import RequestException

from core.utils import HorizonsLocation

DEFAULT_SOLAR_INTENSITY_W_M2 = 1361.0
DEFAULT_PANEL_EFFICIENCY = 0.2
SECONDS_PER_DAY = 86_400.0
JOULES_PER_KILOWATT_HOUR = 3_600_000.0
JULIAN_DATE_UNIX_EPOCH = 2_440_587.5
JULIAN_DATE_COMPARISON_TOLERANCE = 1e-9


class EphemerisData(Protocol):
    def __getitem__(self, column: str, /) -> ArrayLike: ...


class HorizonsUnavailableError(RuntimeError):
    """Raised when the JPL Horizons client dependency is unavailable."""


class HorizonsRequestError(RuntimeError):
    """Raised when a request to JPL Horizons fails."""


def find_nearest_sunrise_sunset(
    ephemeris: EphemerisData,
    start: datetime,
    end: datetime,
) -> tuple[datetime | None, datetime | None]:
    """Find the next horizon crossings within the requested interval, in UTC.

    Sunrise and sunset are estimated by linearly interpolating the solar
    elevation between adjacent Horizons samples.
    """
    elevations = _column_as_floats(ephemeris, "EL")
    timestamps_jd = _column_as_floats(ephemeris, "datetime_jd")
    if len(elevations) != len(timestamps_jd):
        raise ValueError("Solar elevations and timestamps must have equal lengths.")
    if len(timestamps_jd) < 2:
        raise ValueError("At least two timestamped solar elevations are required.")
    if np.any(np.diff(timestamps_jd) <= 0):
        raise ValueError("Timestamps must be strictly increasing.")
    if np.any((elevations < -90.0) | (elevations > 90.0)):
        raise ValueError("Sun elevation values must be between -90 and 90 degrees.")

    start_utc = (
        start.replace(tzinfo=timezone.utc)
        if start.tzinfo is None
        else start.astimezone(timezone.utc)
    )
    end_utc = (
        end.replace(tzinfo=timezone.utc)
        if end.tzinfo is None
        else end.astimezone(timezone.utc)
    )
    if end_utc <= start_utc:
        raise ValueError("End time must be later than start time.")
    start_jd = (
        start_utc.timestamp() / SECONDS_PER_DAY + JULIAN_DATE_UNIX_EPOCH
    )
    end_jd = end_utc.timestamp() / SECONDS_PER_DAY + JULIAN_DATE_UNIX_EPOCH
    sunrise_jd: float | None = None
    sunset_jd: float | None = None

    for index in range(1, len(elevations)):
        previous_elevation = elevations[index - 1]
        current_elevation = elevations[index]
        if previous_elevation <= 0.0 < current_elevation:
            crossing_jd = _interpolate_horizon_crossing(
                timestamps_jd[index - 1],
                timestamps_jd[index],
                previous_elevation,
                current_elevation,
            )
            if (
                start_jd - JULIAN_DATE_COMPARISON_TOLERANCE
                <= crossing_jd
                <= end_jd + JULIAN_DATE_COMPARISON_TOLERANCE
            ) and (
                sunrise_jd is None or crossing_jd < sunrise_jd
            ):
                sunrise_jd = crossing_jd
        elif previous_elevation >= 0.0 > current_elevation:
            crossing_jd = _interpolate_horizon_crossing(
                timestamps_jd[index - 1],
                timestamps_jd[index],
                previous_elevation,
                current_elevation,
            )
            if (
                start_jd - JULIAN_DATE_COMPARISON_TOLERANCE
                <= crossing_jd
                <= end_jd + JULIAN_DATE_COMPARISON_TOLERANCE
            ) and (
                sunset_jd is None or crossing_jd < sunset_jd
            ):
                sunset_jd = crossing_jd

    return (
        _julian_date_to_utc(sunrise_jd) if sunrise_jd is not None else None,
        _julian_date_to_utc(sunset_jd) if sunset_jd is not None else None,
    )


def _interpolate_horizon_crossing(
    start_jd: float,
    end_jd: float,
    start_elevation: float,
    end_elevation: float,
) -> float:
    fraction = -start_elevation / (end_elevation - start_elevation)
    return start_jd + fraction * (end_jd - start_jd)


def _julian_date_to_utc(julian_date: float) -> datetime:
    seconds_since_unix_epoch = (
        julian_date - JULIAN_DATE_UNIX_EPOCH
    ) * SECONDS_PER_DAY
    return datetime(1970, 1, 1, tzinfo=timezone.utc) + timedelta(
        seconds=seconds_since_unix_epoch
    )


def fetch_solar_ephemeris(
    location: HorizonsLocation,
    start: str,
    end: str,
    step: str,
) -> EphemerisData:
    """Fetch solar ephemeris samples from JPL Horizons for a lunar location."""
    if not start or not end:
        raise ValueError("Start and end times are required.")
    if not step or not step.strip():
        raise ValueError("Horizons step must not be empty.")

    try:
        from astroquery.jplhorizons import Horizons
    except ImportError as exc:
        raise HorizonsUnavailableError(
            "astroquery is unavailable. Install the backend requirements."
        ) from exc

    try:
        sun = Horizons(
            id="10",
            location=location,
            epochs={"start": start, "stop": end, "step": step},
        )
        return sun.ephemerides(quantities="4,20")
    except RequestException as exc:
        raise HorizonsRequestError("The JPL Horizons request failed.") from exc


def _column_as_floats(ephemeris: EphemerisData, column: str) -> NDArray[np.float64]:
    try:
        values = np.asarray(ephemeris[column], dtype=np.float64)
    except (KeyError, OverflowError, TypeError, ValueError) as exc:
        raise ValueError(f"Ephemeris column {column!r} must contain numeric values.") from exc

    if values.ndim != 1:
        raise ValueError(f"Ephemeris column {column!r} must be one-dimensional.")
    if not np.all(np.isfinite(values)):
        raise ValueError(f"Ephemeris column {column!r} must contain only finite values.")
    return values


def calculate_beta_angle(ephemeris: EphemerisData) -> NDArray[np.float64]:
    """Return the angle, in degrees, between the Sun direction and local vertical."""
    azimuth = _column_as_floats(ephemeris, "AZ")
    elevation = _column_as_floats(ephemeris, "EL")
    if azimuth.shape != elevation.shape:
        raise ValueError("Sun azimuth and elevation columns must have equal lengths.")
    if np.any((elevation < -90.0) | (elevation > 90.0)):
        raise ValueError("Sun elevation values must be between -90 and 90 degrees.")

    azimuth_radians = np.deg2rad(azimuth)
    elevation_radians = np.deg2rad(elevation)
    sun_vector = np.column_stack(
        (
            np.cos(azimuth_radians) * np.cos(elevation_radians),
            np.sin(azimuth_radians) * np.cos(elevation_radians),
            np.sin(elevation_radians),
        )
    )
    vertical_component = sun_vector[:, 2]
    return np.rad2deg(np.arccos(np.clip(vertical_component, -1.0, 1.0)))


def calculate_instantaneous_power_per_area(
    ephemeris: EphemerisData,
    solar_intensity_w_m2: float = DEFAULT_SOLAR_INTENSITY_W_M2,
    panel_efficiency: float = DEFAULT_PANEL_EFFICIENCY,
) -> NDArray[np.float64]:
    """Estimate instantaneous solar power per square metre for a horizontal panel."""
    if not np.isfinite(solar_intensity_w_m2) or solar_intensity_w_m2 < 0:
        raise ValueError("Solar intensity must be finite and non-negative.")
    if not np.isfinite(panel_efficiency) or not 0.0 <= panel_efficiency <= 1.0:
        raise ValueError("Panel efficiency must be between 0 and 1.")

    beta_angle = calculate_beta_angle(ephemeris)
    return (
        solar_intensity_w_m2
        * panel_efficiency
        * np.maximum(0.0, np.cos(np.deg2rad(beta_angle)))
    )


def calculate_energy_per_day(
    instantaneous_power_w_m2: ArrayLike,
    ephemeris: EphemerisData,
) -> list[float]:
    """Integrate sampled power into consecutive 24-hour bins, in kWh/m².

    The first bin starts at the first sample. A final partial day is integrated
    only over its observed duration rather than extrapolated to a full day.
    """
    timestamps_jd = _column_as_floats(ephemeris, "datetime_jd")
    power = np.asarray(instantaneous_power_w_m2, dtype=np.float64)

    if power.ndim != 1:
        raise ValueError("Solar power samples must be one-dimensional.")
    if not np.all(np.isfinite(power)):
        raise ValueError("Solar power samples must contain only finite values.")
    if len(timestamps_jd) != len(power):
        raise ValueError("Solar power and timestamps must have equal lengths.")
    if len(timestamps_jd) < 2:
        raise ValueError("At least two timestamped power samples are required.")

    elapsed_seconds = (timestamps_jd - timestamps_jd[0]) * SECONDS_PER_DAY
    if np.any(np.diff(elapsed_seconds) <= 0):
        raise ValueError("Timestamps must be strictly increasing.")

    duration_seconds = elapsed_seconds[-1]
    number_of_days = int(np.ceil(duration_seconds / SECONDS_PER_DAY))
    daily_energy_kwh: list[float] = []

    for day in range(number_of_days):
        start_time = day * SECONDS_PER_DAY
        end_time = min((day + 1) * SECONDS_PER_DAY, duration_seconds)
        inside_day = (elapsed_seconds > start_time) & (elapsed_seconds < end_time)
        sample_times = np.concatenate(
            ([start_time], elapsed_seconds[inside_day], [end_time])
        )
        sample_power = np.interp(sample_times, elapsed_seconds, power)
        energy_joules = np.trapezoid(sample_power, sample_times)
        daily_energy_kwh.append(
            float(energy_joules / JOULES_PER_KILOWATT_HOUR)
        )

    return daily_energy_kwh