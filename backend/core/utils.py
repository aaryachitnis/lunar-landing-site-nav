import math
from collections.abc import Sequence
from datetime import datetime, timezone
from typing import TypeAlias

HorizonsLocation: TypeAlias = dict[str, float | int]


def get_lunar_sites_loc(location: Sequence[float]) -> HorizonsLocation:
    """Convert a latitude/longitude pair to a JPL Horizons location."""
    if len(location) != 2:
        raise ValueError("Location must contain latitude and longitude.")

    try:
        latitude, longitude = float(location[0]), float(location[1])
    except (TypeError, ValueError) as exc:
        raise ValueError("Latitude and longitude must be numeric.") from exc

    if not math.isfinite(latitude) or not -90.0 <= latitude <= 90.0:
        raise ValueError("Latitude must be finite and between -90 and 90 degrees.")
    if not math.isfinite(longitude) or not -180.0 <= longitude <= 180.0:
        raise ValueError("Longitude must be finite and between -180 and 180 degrees.")

    return {
        "lon": longitude,
        "lat": latitude,
        "elevation": 0,
        "body": 301,
    }


def parse_datetime(value: str) -> datetime:
    """Parse an ISO 8601 datetime and return it as an aware UTC datetime."""
    if not isinstance(value, str) or not value.strip():
        raise ValueError("Invalid ISO 8601 datetime.")

    cleaned = value.strip()
    if cleaned.endswith("Z"):
        cleaned = f"{cleaned[:-1]}+00:00"

    try:
        parsed = datetime.fromisoformat(cleaned)
    except ValueError as exc:
        raise ValueError("Invalid ISO 8601 datetime.") from exc

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def format_utc(value: datetime) -> str:
    """Format a datetime as second-resolution ISO 8601 UTC with a Z suffix."""
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return (
        value.astimezone(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )