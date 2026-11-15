"""JPL Horizons access for Earth-to-lunar-site communication analysis."""

import numpy as np

AU_KM = 149_597_870.7


class HorizonsUnavailableError(RuntimeError):
    """Raised when the JPL Horizons client dependency is unavailable."""


class HorizonsRequestError(RuntimeError):
    """Raised when a JPL Horizons request fails."""


def earth_series(lat, lon, start_dt, end_dt, step):
    """Return Julian dates, azimuths, elevations, and ranges for Earth."""
    try:
        from astroquery.jplhorizons import Horizons
    except ImportError as exc:
        raise HorizonsUnavailableError(
            "astroquery is unavailable. Install the backend requirements."
        ) from exc

    try:
        query = Horizons(
            id="399",
            location={"lon": lon, "lat": lat, "elevation": 0.0, "body": 301},
            epochs={
                "start": start_dt.strftime("%Y-%m-%d %H:%M"),
                "stop": end_dt.strftime("%Y-%m-%d %H:%M"),
                "step": step,
            },
        )
        ephemeris = query.ephemerides(quantities="4,20")
        return (
            np.asarray(ephemeris["datetime_jd"], dtype=float),
            np.asarray(ephemeris["AZ"], dtype=float),
            np.asarray(ephemeris["EL"], dtype=float),
            np.asarray(ephemeris["delta"], dtype=float) * AU_KM,
        )
    except Exception as exc:
        raise HorizonsRequestError("The JPL Horizons Earth query failed.") from exc
