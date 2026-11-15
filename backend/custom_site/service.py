"""The one function the UI calls: validate the inputs, call the engine, return a result.

    result = calculate_site_potential(23.47, 0.67)

Input checking lives here (not in the UI and not in the engine client) so the
dashboard, the CLI and any tests all behave identically, whichever backend is
active.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any, Optional

from pydantic import ValidationError

from .client import PotentialEngineClient, get_client
from .errors import InvalidSiteRequest
from .schemas import SiteRequest, SiteResult

_OPTIONAL_PARAMS = frozenset(SiteRequest.model_fields) - {"longitude", "latitude"}


def normalize_longitude(longitude: float) -> float:
    """Wrap any longitude into -180..180 (e.g. 350 -> -10)."""
    return (longitude + 180.0) % 360.0 - 180.0


def _finite(name: str, value: Any) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise InvalidSiteRequest(f"{name} must be a number, got {value!r}.") from None
    if not math.isfinite(number):
        raise InvalidSiteRequest(f"{name} must be a finite number.")
    return number


def _friendly(exc: ValidationError) -> str:
    parts = []
    for err in exc.errors():
        where = ".".join(str(p) for p in err["loc"])
        message = err["msg"].removeprefix("Value error, ")
        parts.append(f"{where}: {message}" if where else message)
    return "; ".join(parts)


def build_request(longitude: Any, latitude: Any, **params: Any) -> tuple[SiteRequest, list[str]]:
    """Validate raw user input and return ``(request, notes)``.

    ``notes`` are human-readable adjustments that were made (e.g. a longitude
    that was wrapped), to be shown alongside the result. Parameters passed as
    ``None`` fall back to their defaults.
    """
    unknown = sorted(set(params) - _OPTIONAL_PARAMS)
    if unknown:
        raise InvalidSiteRequest(f"Unknown parameter(s): {', '.join(unknown)}.")

    lon = _finite("Longitude", longitude)
    lat = _finite("Latitude", latitude)
    if not -90.0 <= lat <= 90.0:
        raise InvalidSiteRequest("Latitude must be between -90° and 90°.")
    if abs(lon) > 360.0:
        raise InvalidSiteRequest("Longitude must be between -180° and 180° (or 0° to 360°).")

    notes: list[str] = []
    if not -180.0 <= lon <= 180.0:
        wrapped = normalize_longitude(lon)
        notes.append(f"Longitude {lon:g}° was wrapped to {wrapped:g}° (east-positive, -180 to 180).")
        lon = wrapped

    if params.get("start_time_utc") is None:
        params["start_time_utc"] = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    params = {key: value for key, value in params.items() if value is not None}

    try:
        return SiteRequest(longitude=lon, latitude=lat, **params), notes
    except ValidationError as exc:
        raise InvalidSiteRequest(_friendly(exc)) from exc


def calculate_site_potential(
    longitude: Any,
    latitude: Any,
    *,
    client: Optional[PotentialEngineClient] = None,
    **params: Any,
) -> SiteResult:
    """Validate, call the engine and return the result.

    ``client`` defaults to the backend selected by environment variables
    (mock unless ``LUNAR_ENGINE_BACKEND=http``). Raises a ``CustomSiteError``
    subclass on any failure.
    """
    request, notes = build_request(longitude, latitude, **params)
    result = (client or get_client()).calculate_potential(request)
    if notes:
        result = result.model_copy(update={"warnings": [*notes, *result.warnings]})
    return result
