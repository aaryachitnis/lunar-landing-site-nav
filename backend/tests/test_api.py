import unittest
from unittest.mock import patch

import numpy as np
from fastapi import HTTPException

from app.api.routes import health, sites
from app.config import get_settings
from app.main import app
from services import HorizonsRequestError, HorizonsUnavailableError


class ApiRouteTests(unittest.TestCase):
    def test_application_registers_expected_routes(self) -> None:
        paths = app.openapi()["paths"]
        self.assertIn("/health", paths)
        self.assertIn("/sites", paths)
        self.assertIn("/sites/{site_id}/metrics", paths)
        metrics_parameters = paths["/sites/{site_id}/metrics"]["get"]["parameters"]
        self.assertIn("events_from", {parameter["name"] for parameter in metrics_parameters})

    def test_health_route_returns_status(self) -> None:
        self.assertEqual(
            health.health_check(),
            {"status": "ok", "message": "FastAPI backend is live."},
        )

    def test_site_list_returns_catalog_metadata_and_coordinates(self) -> None:
        results = sites.get_sites()
        self.assertEqual(len(results), 9)
        self.assertEqual(results[0].id, "orig1")
        self.assertEqual(results[0].name, "Artemis 3 (Amundsen)")
        self.assertEqual(results[0].loc, (-84.2287, 69.44396))
        self.assertTrue(results[0].desc)
        self.assertEqual(results[0].agency, "NASA")
        self.assertEqual(results[0].lat, -84.2287)
        self.assertEqual(results[-1].id, "orig9")
        serialized = results[0].model_dump(mode="json")
        self.assertEqual(serialized["loc"], [-84.2287, 69.44396])
        self.assertEqual(serialized["lat"], -84.2287)
        self.assertEqual(serialized["lon"], 69.44396)

    def test_unknown_site_and_invalid_ranges_return_http_errors(self) -> None:
        with self.assertRaises(HTTPException) as unknown_site:
            sites.get_site_metrics(
                "site-10",
                "2026-01-01T00:00:00Z",
                "2026-01-02T00:00:00Z",
                "4hour",
                get_settings(),
            )
        self.assertEqual(unknown_site.exception.status_code, 404)

        with self.assertRaises(HTTPException) as invalid_date:
            sites.get_site_metrics(
                "site-1",
                "not-a-date",
                "2026-01-02T00:00:00Z",
                "4hour",
                get_settings(),
            )
        self.assertEqual(invalid_date.exception.status_code, 400)

        with self.assertRaises(HTTPException) as reversed_range:
            sites.get_site_metrics(
                "site-1",
                "2026-01-02T00:00:00Z",
                "2026-01-01T00:00:00Z",
                "4hour",
                get_settings(),
            )
        self.assertEqual(reversed_range.exception.status_code, 400)

        with self.assertRaises(HTTPException) as empty_step:
            sites.get_site_metrics(
                "site-1",
                "2026-01-01T00:00:00Z",
                "2026-01-02T00:00:00Z",
                "  ",
                get_settings(),
            )
        self.assertEqual(empty_step.exception.status_code, 400)

    def test_metrics_route_uses_shared_service_and_response_model(self) -> None:
        ephemeris = {
            "AZ": np.array([0.0, 0.0, 0.0, 0.0]),
            "EL": np.array([-10.0, 10.0, 10.0, -10.0]),
            "datetime_jd": np.array(
                [2_461_041.5, 2_461_041.75, 2_461_042.25, 2_461_042.5]
            ),
        }
        with patch.object(
            sites,
            "fetch_solar_ephemeris",
            return_value=ephemeris,
        ) as fetch_ephemeris:
            result = sites.get_site_metrics(
                "site-1",
                "2026-01-01T00:00:00Z",
                "2026-01-02T00:00:00Z",
                "4hour",
                get_settings(),
            )

        self.assertEqual(result.site.id, "orig1")
        self.assertEqual(result.site.name, "Artemis 3 (Amundsen)")
        self.assertEqual(
            result.model_dump(mode="json")["site"]["agency"],
            "NASA",
        )
        self.assertEqual(result.start, "2026-01-01T00:00:00Z")
        self.assertEqual(result.end, "2026-01-02T00:00:00Z")
        self.assertEqual(result.nearest_sunrise_utc, "2026-01-01T03:00:00Z")
        self.assertEqual(result.nearest_sunset_utc, "2026-01-01T21:00:00Z")
        self.assertEqual(len(result.instantaneous_power_per_area_W_m2), 4)
        self.assertGreater(result.average_power_per_24h_W_m2, 0.0)
        fetch_ephemeris.assert_called_once_with(
            {"lat": -84.2287, "lon": 69.44396, "elevation": 0, "body": 301},
            "2026-01-01 00:00",
            "2026-01-02 00:00",
            "4hour",
        )

    def test_metrics_route_excludes_sun_events_after_requested_end(self) -> None:
        ephemeris = {
            "AZ": np.array([0.0, 0.0, 0.0, 0.0]),
            "EL": np.array([-10.0, 10.0, 10.0, -10.0]),
            "datetime_jd": np.array(
                [2_461_041.5, 2_461_041.75, 2_461_042.25, 2_461_042.5]
            ),
        }
        with patch.object(sites, "fetch_solar_ephemeris", return_value=ephemeris):
            result = sites.get_site_metrics(
                "site-1",
                "2026-01-01T00:00:00Z",
                "2026-01-01T20:00:00Z",
                "4hour",
                get_settings(),
            )

        self.assertEqual(result.nearest_sunrise_utc, "2026-01-01T03:00:00Z")
        self.assertIsNone(result.nearest_sunset_utc)

    def test_metrics_route_can_search_sun_events_from_selected_time(self) -> None:
        ephemeris = {
            "AZ": np.array([0.0, 0.0, 0.0, 0.0]),
            "EL": np.array([-10.0, 10.0, 10.0, -10.0]),
            "datetime_jd": np.array(
                [2_461_041.5, 2_461_041.75, 2_461_042.25, 2_461_042.5]
            ),
        }
        with patch.object(sites, "fetch_solar_ephemeris", return_value=ephemeris):
            result = sites.get_site_metrics(
                "site-1",
                "2026-01-01T00:00:00Z",
                "2026-01-02T00:00:00Z",
                "4hour",
                get_settings(),
                events_from="2026-01-01T04:00:00Z",
            )

        self.assertIsNone(result.nearest_sunrise_utc)
        self.assertEqual(result.nearest_sunset_utc, "2026-01-01T21:00:00Z")

    def test_metrics_route_rejects_sun_event_start_outside_range(self) -> None:
        with self.assertRaises(HTTPException) as outside_range:
            sites.get_site_metrics(
                "site-1",
                "2026-01-01T00:00:00Z",
                "2026-01-02T00:00:00Z",
                "4hour",
                get_settings(),
                events_from="2025-12-31T23:59:59Z",
            )

        self.assertEqual(outside_range.exception.status_code, 400)

    def test_metrics_route_accepts_legacy_site_id_alias(self) -> None:
        result = sites.resolve_site("site-1")
        self.assertEqual(result.id, "orig1")
        self.assertEqual(result.name, "Artemis 3 (Amundsen)")

    def test_metrics_route_maps_service_and_ephemeris_errors(self) -> None:
        request = (
            "site-1",
            "2026-01-01T00:00:00Z",
            "2026-01-02T00:00:00Z",
            "4hour",
            get_settings(),
        )
        with patch.object(
            sites,
            "fetch_solar_ephemeris",
            side_effect=HorizonsUnavailableError("Horizons unavailable"),
        ):
            with self.assertRaises(HTTPException) as unavailable:
                sites.get_site_metrics(*request)
        self.assertEqual(unavailable.exception.status_code, 503)

        with patch.object(
            sites,
            "fetch_solar_ephemeris",
            side_effect=HorizonsRequestError("request failed"),
        ):
            with self.assertRaises(HTTPException) as request_failed:
                sites.get_site_metrics(*request)
        self.assertEqual(request_failed.exception.status_code, 502)

        malformed_ephemeris = {
            "AZ": [0.0, 90.0],
            "EL": [45.0],
            "datetime_jd": [2_460_000.0, 2_460_001.0],
        }
        with patch.object(
            sites,
            "fetch_solar_ephemeris",
            return_value=malformed_ephemeris,
        ):
            with self.assertRaises(HTTPException) as invalid_data:
                sites.get_site_metrics(*request)
        self.assertEqual(invalid_data.exception.status_code, 502)


if __name__ == "__main__":
    unittest.main()
