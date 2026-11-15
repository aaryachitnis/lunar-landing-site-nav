"""Command-line check of the feature, without any UI.

    python -m custom_site --lat 0.67 --lon 23.47          # human summary
    python -m custom_site --lat 0.67 --lon 23.47 --json   # full SiteResult JSON
    python -m custom_site --schema                        # JSON Schema of the contract
    python -m custom_site --lat 0.67 --lon 23.47 --backend http   # hit the real engine
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import replace
from typing import Optional

from .client import get_client
from .config import load_settings
from .errors import CustomSiteError
from .schemas import SiteRequest, SiteResult
from .service import calculate_site_potential


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m custom_site", description=__doc__.splitlines()[0])
    parser.add_argument("--lat", type=float, help="latitude, degrees north")
    parser.add_argument("--lon", type=float, help="longitude, degrees east")
    parser.add_argument("--backend", choices=["mock", "http"], help="override LUNAR_ENGINE_BACKEND")
    parser.add_argument("--json", action="store_true", help="print the full SiteResult as JSON")
    parser.add_argument("--schema", action="store_true", help="print the request/response JSON Schema and exit")
    args = parser.parse_args(argv)

    if args.schema:
        schema = {"request": SiteRequest.model_json_schema(), "response": SiteResult.model_json_schema()}
        print(json.dumps(schema, indent=2))
        return 0

    if args.lat is None or args.lon is None:
        parser.error("--lat and --lon are required (or use --schema)")

    settings = load_settings()
    if args.backend:
        settings = replace(settings, backend=args.backend)

    try:
        result = calculate_site_potential(args.lon, args.lat, client=get_client(settings))
    except CustomSiteError as exc:
        print(f"{type(exc).__name__}: {exc}", file=sys.stderr)
        return 1

    if args.json:
        print(result.model_dump_json(indent=2))
        return 0

    s, t = result.power.summary, result.terrain
    print(result.site.name, f"[{result.data_source}]")
    for warning in result.warnings:
        print(f"  ! {warning}")
    print(f"  mean power      {s.mean_power_w:10.1f} W    peak {s.peak_power_w:.1f} W")
    print(f"  energy          {s.total_energy_kwh:10.1f} kWh over {result.request.duration_days:g} days")
    print(f"  sunlit          {s.sunlit_fraction:10.1%}    longest dark {s.longest_darkness_hours:.0f} h")
    print(f"  Earth visible   {s.earth_visible_fraction:10.1%}")
    print(f"  terrain         {t.min_elevation_m:.0f} to {t.max_elevation_m:.0f} m, mean slope {t.mean_slope_deg:.1f} deg")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
