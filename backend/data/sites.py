"""Persistent lunar landing-site catalog backed by a JSON array."""

import json
import math
import os
import re
from pathlib import Path
from threading import RLock
from uuid import uuid4

SiteCoordinates = tuple[float, float]
SiteRecord = tuple[str, str, SiteCoordinates, str, str]
SITE_CATALOG_PATH = Path(__file__).with_name("sites.json")
_LEGACY_SITE_ID_PATTERN = re.compile(r"site-([1-9]\d*)\Z")
_CATALOG_LOCK = RLock()


class SiteCatalogError(RuntimeError):
    """Raised when the persisted site catalog cannot be read or written."""


class DuplicateSiteError(ValueError):
    """Raised when a site with the same coordinates is already in the catalog."""


def _record_from_json(value: object, index: int) -> SiteRecord:
    if not isinstance(value, dict):
        raise SiteCatalogError(f"Site catalog entry {index} must be an object.")

    site_id = value.get("id")
    name = value.get("name")
    location = value.get("loc")
    description = value.get("desc", "")
    agency = value.get("agency", "")
    if not isinstance(site_id, str) or not site_id.strip():
        raise SiteCatalogError(f"Site catalog entry {index} has an invalid id.")
    if not isinstance(name, str) or not name.strip():
        raise SiteCatalogError(f"Site catalog entry {index} has an invalid name.")
    if (
        not isinstance(location, (list, tuple))
        or len(location) != 2
        or any(isinstance(value, bool) for value in location)
    ):
        raise SiteCatalogError(f"Site catalog entry {index} must have [latitude, longitude].")
    if not isinstance(description, str) or not isinstance(agency, str):
        raise SiteCatalogError(f"Site catalog entry {index} has invalid metadata.")

    try:
        latitude, longitude = float(location[0]), float(location[1])
    except (TypeError, ValueError, OverflowError) as exc:
        raise SiteCatalogError(
            f"Site catalog entry {index} coordinates must be numeric."
        ) from exc
    if (
        not math.isfinite(latitude)
        or not -90.0 <= latitude <= 90.0
        or not math.isfinite(longitude)
        or not -180.0 <= longitude <= 180.0
    ):
        raise SiteCatalogError(f"Site catalog entry {index} coordinates are out of range.")

    return (
        site_id.strip(),
        name.strip(),
        (latitude, longitude),
        description,
        agency,
    )


def load_site_records() -> tuple[SiteRecord, ...]:
    """Read and validate the catalog from disk."""
    with _CATALOG_LOCK:
        try:
            data = json.loads(SITE_CATALOG_PATH.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise SiteCatalogError(
                f"Unable to read site catalog at {SITE_CATALOG_PATH}."
            ) from exc

    if not isinstance(data, list):
        raise SiteCatalogError("Site catalog must be a JSON array.")

    records = tuple(_record_from_json(value, index) for index, value in enumerate(data))
    ids = [record[0] for record in records]
    locations = [record[2] for record in records]
    if len(set(ids)) != len(ids):
        raise SiteCatalogError("Site catalog IDs must be unique.")
    if len(set(locations)) != len(locations):
        raise SiteCatalogError("Site catalog coordinates must be unique.")
    return records


def _write_site_records(records: tuple[SiteRecord, ...]) -> None:
    serialized = [
        {
            "id": site_id,
            "name": name,
            "loc": list(location),
            "desc": description,
            "agency": agency,
        }
        for site_id, name, location, description, agency in records
    ]
    temporary_path = SITE_CATALOG_PATH.with_name(
        f"{SITE_CATALOG_PATH.name}.{uuid4().hex}.tmp"
    )
    try:
        temporary_path.write_text(
            f"{json.dumps(serialized, indent=2, ensure_ascii=False)}\n",
            encoding="utf-8",
        )
        os.replace(temporary_path, SITE_CATALOG_PATH)
    except OSError as exc:
        raise SiteCatalogError(
            f"Unable to write site catalog at {SITE_CATALOG_PATH}."
        ) from exc
    finally:
        temporary_path.unlink(missing_ok=True)


def add_site_record(
    name: str,
    location: SiteCoordinates,
    description: str = "",
    agency: str = "Custom",
) -> SiteRecord:
    """Append one validated site and atomically persist the JSON catalog."""
    if not isinstance(name, str) or not name.strip():
        raise ValueError("Site name must not be empty.")
    if not isinstance(description, str) or not isinstance(agency, str):
        raise ValueError("Site description and agency must be strings.")

    candidate = _record_from_json(
        {
            "id": f"custom-{uuid4().hex}",
            "name": name,
            "loc": location,
            "desc": description,
            "agency": agency,
        },
        0,
    )
    with _CATALOG_LOCK:
        records = load_site_records()
        if candidate[2] in {record[2] for record in records}:
            raise DuplicateSiteError("A site with these coordinates already exists.")
        updated_records = records + (candidate,)
        _write_site_records(updated_records)
    return candidate


def find_site_record(site_id: str) -> SiteRecord | None:
    """Find a site by canonical ID or its previous position-based ID."""
    sites = load_site_records()
    for site in sites:
        if site[0] == site_id:
            return site

    match = _LEGACY_SITE_ID_PATTERN.fullmatch(site_id)
    if match is None:
        return None

    index = int(match.group(1)) - 1
    return sites[index] if index < len(sites) else None


SITES = load_site_records()
