from dataclasses import dataclass
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
EARTH_HORIZONS_ID = "399"
SUN_HORIZONS_ID = "10"


class EphemerisData(Protocol):
    def __getitem__(self, column: str, /) -> ArrayLike: ...


class HorizonsUnavailableError(RuntimeError):
    """Raised when the JPL Horizons client dependency is unavailable."""


class HorizonsRequestError(RuntimeError):
    """Raised when a request to JPL Horizons fails."""


@dataclass(frozen=True)
class SkyMetrics:
    sun_altitude_degrees: float
    sun_visible: bool
    earth_altitude_degrees: float
    earth_visible: bool
    nearest_earthrise_utc: datetime | None
    nearest_earthset_utc: datetime | None
    longest_darkness_hours: float
    sunlit_fraction: float
    sun_azimuth_degrees: float | None = None
    earth_azimuth_degrees: float | None = None


def find_nearest_sunrise_sunset(
    ephemeris: EphemerisData,
    start: datetime,
    end: datetime,
) -> tuple[datetime | None, datetime | None]:
    """Find the next sunrise and sunset within the requested interval, in UTC."""
    return find_nearest_horizon_crossings(ephemeris, start, end, "Solar")


def find_nearest_horizon_crossings(
    ephemeris: EphemerisData,
    start: datetime,
    end: datetime,
    body_name: str = "Body",
) -> tuple[datetime | None, datetime | None]:
    """Find the next horizon crossings within the requested interval, in UTC.

    Rise and set are estimated by linearly interpolating elevation between
    adjacent Horizons samples.
    """
    elevations, timestamps_jd = _horizon_samples(ephemeris, body_name)

    start_utc = _as_utc(start)
    end_utc = _as_utc(end)
    if end_utc < start_utc:
        raise ValueError("End time must be later than start time.")
    if end_utc == start_utc:
        return None, None
    start_jd = _datetime_to_julian_date(start_utc)
    end_jd = _datetime_to_julian_date(end_utc)
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


def calculate_sky_metrics(
    sun_ephemeris: EphemerisData,
    earth_ephemeris: EphemerisData,
    start: datetime,
    end: datetime,
) -> SkyMetrics:
    """Calculate live apparent sky state and darkness over a UTC interval."""
    start_utc = _as_utc(start)
    end_utc = _as_utc(end)
    if end_utc < start_utc:
        raise ValueError("End time must not be earlier than start time.")

    sun_elevations, sun_timestamps_jd = _horizon_samples(sun_ephemeris, "Solar")
    earth_elevations, earth_timestamps_jd = _horizon_samples(earth_ephemeris, "Earth")
    start_jd = _datetime_to_julian_date(start_utc)
    end_jd = _datetime_to_julian_date(end_utc)
    _interpolate_elevation(earth_timestamps_jd, earth_elevations, end_jd, "Earth")
    sun_altitude = _interpolate_elevation(
        sun_timestamps_jd, sun_elevations, start_jd, "Solar"
    )
    earth_altitude = _interpolate_elevation(
        earth_timestamps_jd, earth_elevations, start_jd, "Earth"
    )
    earthrise, earthset = find_nearest_horizon_crossings(
        earth_ephemeris, start_utc, end_utc, "Earth"
    )
    longest_darkness_seconds, total_darkness_seconds = _darkness_durations(
        sun_timestamps_jd, sun_elevations, start_jd, end_jd
    )
    window_seconds = (end_jd - start_jd) * SECONDS_PER_DAY
    sunlit_fraction = (
        1.0 - total_darkness_seconds / window_seconds
        if window_seconds > 0
        else float(sun_altitude > 0.0)
    )

    return SkyMetrics(
        sun_altitude_degrees=sun_altitude,
        sun_visible=sun_altitude > 0.0,
        earth_altitude_degrees=earth_altitude,
        earth_visible=earth_altitude > 0.0,
        nearest_earthrise_utc=earthrise,
        nearest_earthset_utc=earthset,
        longest_darkness_hours=longest_darkness_seconds / 3600.0,
        sunlit_fraction=min(1.0, max(0.0, sunlit_fraction)),
        sun_azimuth_degrees=_azimuth_at(sun_ephemeris, sun_timestamps_jd, start_jd),
        earth_azimuth_degrees=_azimuth_at(earth_ephemeris, earth_timestamps_jd, start_jd),
    )


def _azimuth_at(
    ephemeris: EphemerisData, timestamps_jd: NDArray[np.float64], timestamp_jd: float
) -> float | None:
    """Azimuth interpolated across north correctly; None if the ephemeris has no AZ column."""
    try:
        azimuth = _column_as_floats(ephemeris, "AZ")
    except ValueError:
        return None
    if azimuth.shape != timestamps_jd.shape:
        return None
    unwrapped = np.degrees(np.unwrap(np.radians(azimuth)))
    return float(np.interp(timestamp_jd, timestamps_jd, unwrapped) % 360.0)


def _horizon_samples(
    ephemeris: EphemerisData,
    body_name: str,
) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
    elevations = _column_as_floats(ephemeris, "EL")
    timestamps_jd = _column_as_floats(ephemeris, "datetime_jd")
    if len(elevations) != len(timestamps_jd):
        raise ValueError(f"{body_name} elevations and timestamps must have equal lengths.")
    if len(timestamps_jd) < 2:
        raise ValueError(
            f"At least two timestamped {body_name.lower()} elevations are required."
        )
    if np.any(np.diff(timestamps_jd) <= 0):
        raise ValueError("Timestamps must be strictly increasing.")
    if np.any((elevations < -90.0) | (elevations > 90.0)):
        raise ValueError(f"{body_name} elevation values must be between -90 and 90 degrees.")
    return elevations, timestamps_jd


def _interpolate_elevation(
    timestamps_jd: NDArray[np.float64],
    elevations: NDArray[np.float64],
    timestamp_jd: float,
    body_name: str,
) -> float:
    if (
        timestamp_jd < timestamps_jd[0] - JULIAN_DATE_COMPARISON_TOLERANCE
        or timestamp_jd > timestamps_jd[-1] + JULIAN_DATE_COMPARISON_TOLERANCE
    ):
        raise ValueError(f"{body_name} ephemeris does not cover the requested time range.")
    return float(np.interp(timestamp_jd, timestamps_jd, elevations))


def _darkness_durations(
    timestamps_jd: NDArray[np.float64],
    elevations: NDArray[np.float64],
    start_jd: float,
    end_jd: float,
) -> tuple[float, float]:
    if end_jd <= start_jd:
        return 0.0, 0.0
    _interpolate_elevation(timestamps_jd, elevations, start_jd, "Solar")
    _interpolate_elevation(timestamps_jd, elevations, end_jd, "Solar")
    internal_timestamps = timestamps_jd[
        (timestamps_jd > start_jd) & (timestamps_jd < end_jd)
    ]
    times = np.concatenate(([start_jd], internal_timestamps, [end_jd]))
    values = np.interp(times, timestamps_jd, elevations)
    dark_intervals: list[tuple[float, float]] = []

    for index in range(1, len(times)):
        left_time, right_time = times[index - 1], times[index]
        left_elevation, right_elevation = values[index - 1], values[index]
        if left_elevation <= 0.0 and right_elevation <= 0.0:
            interval = (left_time, right_time)
        elif left_elevation <= 0.0 < right_elevation:
            crossing = _interpolate_horizon_crossing(
                left_time, right_time, left_elevation, right_elevation
            )
            interval = (left_time, crossing)
        elif left_elevation > 0.0 >= right_elevation:
            crossing = _interpolate_horizon_crossing(
                left_time, right_time, left_elevation, right_elevation
            )
            interval = (crossing, right_time)
        else:
            continue

        if (
            dark_intervals
            and interval[0]
            <= dark_intervals[-1][1] + JULIAN_DATE_COMPARISON_TOLERANCE
        ):
            dark_intervals[-1] = (dark_intervals[-1][0], interval[1])
        else:
            dark_intervals.append(interval)

    durations = [
        (interval_end - interval_start) * SECONDS_PER_DAY
        for interval_start, interval_end in dark_intervals
    ]
    return max(durations, default=0.0), sum(durations)


def _interpolate_horizon_crossing(
    start_jd: float,
    end_jd: float,
    start_elevation: float,
    end_elevation: float,
) -> float:
    fraction = -start_elevation / (end_elevation - start_elevation)
    return start_jd + fraction * (end_jd - start_jd)


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _datetime_to_julian_date(value: datetime) -> float:
    return value.timestamp() / SECONDS_PER_DAY + JULIAN_DATE_UNIX_EPOCH


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
    return _fetch_body_ephemeris(SUN_HORIZONS_ID, location, start, end, step)


def fetch_earth_ephemeris(
    location: HorizonsLocation,
    start: str,
    end: str,
    step: str,
) -> EphemerisData:
    """Fetch Earth ephemeris samples from JPL Horizons for a lunar location."""
    return _fetch_body_ephemeris(EARTH_HORIZONS_ID, location, start, end, step)


def _fetch_body_ephemeris(
    target_id: str,
    location: HorizonsLocation,
    start: str,
    end: str,
    step: str,
) -> EphemerisData:
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
        target = Horizons(
            id=target_id,
            location=location,
            epochs={"start": start, "stop": end, "step": step},
        )
        return target.ephemerides(quantities="4,20")
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