import unittest
from datetime import datetime, timezone

from pydantic import ValidationError

from core import (
    PowerMetricsResponse,
    SiteSummary,
    format_utc,
    get_lunar_sites_loc,
    parse_datetime,
)


class CoreModelTests(unittest.TestCase):
    def test_site_summary_validates_coordinate_ranges(self) -> None:
        site = SiteSummary(id="site-1", lat=-90, lon=180)
        self.assertEqual((site.lat, site.lon), (-90, 180))
        self.assertEqual(site.loc, (-90, 180))
        self.assertEqual(site.name, "")

        with self.assertRaises(ValidationError):
            SiteSummary(id="site-1", lat=-91, lon=0)
        with self.assertRaises(ValidationError):
            SiteSummary(id="site-1", lat=0, lon=181)

    def test_power_metrics_response_accepts_valid_payload(self) -> None:
        metrics = PowerMetricsResponse(
            site={"id": "site-1", "lat": -89.5, "lon": 12.0},
            start="2026-01-01T00:00:00Z",
            end="2026-01-02T00:00:00Z",
            step="4hour",
            instantaneous_power_per_area_W_m2=[0.0, 272.2],
            daily_power_generated_per_area_kWh_per_m2_day=[3.26],
            average_power_per_24h_W_m2=135.8,
            average_power_sunlit_days_W_m2=135.8,
        )
        self.assertEqual(metrics.site.id, "site-1")


class CoreUtilityTests(unittest.TestCase):
    def test_get_lunar_sites_loc_maps_and_validates_coordinates(self) -> None:
        self.assertEqual(
            get_lunar_sites_loc([-89.5, 12]),
            {"lat": -89.5, "lon": 12.0, "elevation": 0, "body": 301},
        )
        for location in ([1], [91, 0], [0, 181], [float("nan"), 0]):
            with self.subTest(location=location), self.assertRaises(ValueError):
                get_lunar_sites_loc(location)

    def test_parse_datetime_normalizes_z_naive_and_offset_values(self) -> None:
        self.assertEqual(
            parse_datetime("2026-01-01T00:00:00Z"),
            datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
        self.assertEqual(
            parse_datetime("2026-01-01T02:00:00+02:00"),
            datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
        self.assertEqual(
            parse_datetime("2026-01-01T00:00:00"),
            datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
        with self.assertRaisesRegex(ValueError, "Invalid ISO 8601 datetime"):
            parse_datetime("not-a-date")

    def test_format_utc_uses_z_and_discards_subseconds(self) -> None:
        value = datetime(2026, 1, 1, 2, 0, 0, 123456, tzinfo=timezone.utc)
        self.assertEqual(format_utc(value), "2026-01-01T02:00:00Z")
        self.assertEqual(
            format_utc(datetime(2026, 1, 1)),
            "2026-01-01T00:00:00Z",
        )


if __name__ == "__main__":
    unittest.main()
