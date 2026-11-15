import json
import unittest
from contextlib import redirect_stdout
from io import StringIO
from unittest.mock import patch

import numpy as np

from services import surface_roughness
from services.surface_roughness import (
    analyse_all_sites,
    horn_slope_deg,
    print_report,
    surface_roughness_stats,
)


class FlatDem:
    pixel_km = 1.9
    offset = 1_737_400.0

    def sample(self, lat, lon):
        return np.full(np.broadcast(np.asarray(lat), np.asarray(lon)).shape, 100.0)


class SurfaceRoughnessTests(unittest.TestCase):
    def test_horn_slope_matches_a_known_planar_gradient(self) -> None:
        x, y = np.meshgrid(np.arange(5.0), np.arange(5.0))
        elevation = 3.0 * x + 4.0 * y

        slopes = horn_slope_deg(elevation, spacing_m=1.0)

        np.testing.assert_allclose(slopes, np.degrees(np.arctan(5.0)))

    def test_flat_dem_produces_zero_slope_and_rms_roughness(self) -> None:
        stats = surface_roughness_stats(FlatDem(), lat=20.0, lon=30.0)

        self.assertAlmostEqual(stats["mean_slope_deg"], 0.0)
        self.assertAlmostEqual(stats["max_slope_deg"], 0.0)
        self.assertAlmostEqual(stats["rms_surface_roughness_m"], 0.0)
        self.assertEqual(
            set(stats),
            {"mean_slope_deg", "max_slope_deg", "rms_surface_roughness_m"},
        )

    def test_rejects_invalid_coordinates_and_radius(self) -> None:
        with self.assertRaisesRegex(ValueError, "Latitude"):
            surface_roughness_stats(FlatDem(), lat=91.0, lon=30.0)
        with self.assertRaisesRegex(ValueError, "Longitude"):
            surface_roughness_stats(FlatDem(), lat=20.0, lon=181.0)
        with self.assertRaisesRegex(ValueError, "too small"):
            surface_roughness_stats(
                FlatDem(),
                lat=20.0,
                lon=30.0,
                radius_km=1.0,
            )

    def test_analysis_computes_metrics_for_every_catalog_site(self) -> None:
        class FakeDem(FlatDem):
            ppd = 16
            meta = {
                "dataset": "Synthetic LOLA grid",
                "resolution_m_at_equator": 1898.0,
            }

        with patch.object(
            surface_roughness,
            "load_elevation_grid",
            return_value=FakeDem(),
        ):
            report = analyse_all_sites()

        self.assertEqual(len(report["sites"]), 9)
        self.assertEqual(report["data_source"], "Synthetic LOLA grid")
        for site in report["sites"]:
            self.assertAlmostEqual(site["mean_slope_deg"], 0.0, places=10)
            self.assertAlmostEqual(site["max_slope_deg"], 0.0, places=10)
            self.assertAlmostEqual(
                site["rms_surface_roughness_m"],
                0.0,
                places=10,
            )

    def test_print_report_outputs_dataset_and_only_requested_site_metrics(self) -> None:
        report = {
            "data_source": "Synthetic LOLA grid",
            "source_url": "https://example.test/ldem_16.tif",
            "resolution_m_at_equator": 1898.0,
            "analysis_radius_km": 10.0,
            "sites": [
                {
                    "site_id": "orig1",
                    "site_name": "Test site",
                    "mean_slope_deg": 1.25,
                    "max_slope_deg": 3.5,
                    "rms_surface_roughness_m": 2.0,
                }
            ],
        }
        output = StringIO()
        with redirect_stdout(output):
            print_report(report)

        self.assertIn("Synthetic LOLA grid", output.getvalue())
        self.assertIn("https://example.test/ldem_16.tif", output.getvalue())
        site_list = json.loads(output.getvalue().split("Sites:\n", maxsplit=1)[1])
        self.assertEqual(len(site_list), 1)
        self.assertEqual(site_list[0]["mean_slope_deg"], 1.25)
        self.assertEqual(site_list[0]["max_slope_deg"], 3.5)
        self.assertEqual(site_list[0]["rms_surface_roughness_m"], 2.0)


if __name__ == "__main__":
    unittest.main()
