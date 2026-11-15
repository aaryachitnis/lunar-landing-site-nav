import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import numpy as np

from services import horizon
from services import mountain_visibility as visibility


class FlatDem:
    offset = 1_737_400.0
    pixel_km = 1.0

    def radius_m(self, lat, lon):
        lat_values, lon_values = np.broadcast_arrays(
            np.asarray(lat, dtype=float),
            np.asarray(lon, dtype=float),
        )
        return np.full(lat_values.shape, self.offset, dtype=float)


class HorizonServiceTests(unittest.TestCase):
    def test_earth_series_queries_jpl_and_converts_distance_to_km(self) -> None:
        ephemeris = {
            "datetime_jd": [2_460_000.0, 2_460_001.0],
            "AZ": [10.0, 20.0],
            "EL": [30.0, 40.0],
            "delta": [0.002, 0.003],
        }
        start = datetime(2026, 1, 1, tzinfo=timezone.utc)
        end = datetime(2026, 1, 2, tzinfo=timezone.utc)

        with patch("astroquery.jplhorizons.Horizons") as horizons_client:
            horizons_client.return_value.ephemerides.return_value = ephemeris
            jd, az, el, dist_km = horizon.earth_series(
                -84.0, 69.0, start, end, "1h"
            )

        horizons_client.assert_called_once_with(
            id="399",
            location={"lon": 69.0, "lat": -84.0, "elevation": 0.0, "body": 301},
            epochs={
                "start": "2026-01-01 00:00",
                "stop": "2026-01-02 00:00",
                "step": "1h",
            },
        )
        horizons_client.return_value.ephemerides.assert_called_once_with(
            quantities="4,20"
        )
        np.testing.assert_array_equal(jd, [2_460_000.0, 2_460_001.0])
        np.testing.assert_array_equal(az, [10.0, 20.0])
        np.testing.assert_array_equal(el, [30.0, 40.0])
        np.testing.assert_allclose(
            dist_km,
            np.array([0.002, 0.003]) * horizon.AU_KM,
        )

    def test_earth_series_wraps_horizons_errors(self) -> None:
        start = datetime(2026, 1, 1, tzinfo=timezone.utc)
        end = start + timedelta(hours=1)
        with patch(
            "astroquery.jplhorizons.Horizons",
            side_effect=TimeoutError("network unavailable"),
        ):
            with self.assertRaises(horizon.HorizonsRequestError):
                horizon.earth_series(-84.0, 69.0, start, end, "1h")


class VisibilityProcessingTests(unittest.TestCase):
    def test_check_window_rejects_bad_steps_and_excessive_horizons_rows(self) -> None:
        start = datetime(2026, 1, 1)
        end = start + timedelta(days=2)
        with self.assertRaisesRegex(ValueError, "positive number"):
            visibility.check_window(start, end, "0h")
        with self.assertRaisesRegex(ValueError, "end in m, h or d"):
            visibility.check_window(start, end, "1hour")

        too_long = start + timedelta(days=visibility.MAX_ROWS + 1)
        with self.assertRaisesRegex(ValueError, "Horizons rows requested"):
            visibility.check_window(start, too_long, "1d")

    def test_refine_track_interpolates_azimuth_across_north(self) -> None:
        jd, az, el, distance = visibility.refine_track(
            np.array([2_460_000.0, 2_460_001.0]),
            np.array([359.0, 1.0]),
            np.array([10.0, 20.0]),
            np.array([384_400.0, 384_400.0]),
            720.0,
        )

        self.assertEqual(len(jd), 3)
        self.assertAlmostEqual(az[1], 0.0)
        self.assertAlmostEqual(el[1], 15.0)
        self.assertAlmostEqual(distance[1], 384_400.0)

    def test_mountain_sectors_join_across_north(self) -> None:
        az = np.arange(8) * 45.0
        sectors = visibility.find_mountain_sectors(
            az,
            np.array([5.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 6.0]),
            np.arange(8, dtype=float),
            np.arange(8, dtype=float) * 10,
            threshold_deg=1.0,
        )

        self.assertEqual(len(sectors), 1)
        self.assertEqual(sectors[0]["az_from"], 315.0)
        self.assertEqual(sectors[0]["az_to"], 0.0)
        self.assertEqual(sectors[0]["peak_az"], 315.0)

    def test_earth_disc_visibility_distinguishes_partial_and_full(self) -> None:
        args = (
            np.array([0.0]),
            np.array([0.5]),
            np.array([384_400.0]),
            np.array([0.0]),
            np.array([0.0]),
            0.0,
        )
        partial, full, flat, _ = visibility.earth_visibility(
            *args, count_partial=True
        )
        self.assertTrue(partial[0])
        self.assertFalse(full[0])
        self.assertTrue(flat[0])

        whole_disc, _, _, _ = visibility.earth_visibility(
            *args, count_partial=False
        )
        self.assertFalse(whole_disc[0])

    def test_analyse_site_processes_terrain_and_visibility_track(self) -> None:
        start = datetime(2026, 1, 1, tzinfo=timezone.utc)
        end = start + timedelta(hours=1)
        jd = np.array([2_460_000.0, 2_460_000.0 + 1.0 / 24.0])
        track = (
            jd,
            np.array([0.0, 90.0]),
            np.array([15.0, 15.0]),
            np.array([384_400.0, 384_400.0]),
        )

        with patch.object(visibility, "earth_series", return_value=track):
            result = visibility.analyse_site(
                FlatDem(),
                lat=-84.0,
                lon=69.0,
                start_dt=start,
                end_dt=end,
                step="1h",
                max_range_km=2.0,
                threshold_deg=1.0,
                min_elev=0.0,
                count_partial=True,
                fine_step_min=30.0,
            )

        self.assertAlmostEqual(result["mission_hours"], 1.0, places=4)
        self.assertAlmostEqual(result["visible_hours"], 1.0, places=4)
        self.assertAlmostEqual(result["fully_visible_hours"], 1.0, places=4)
        self.assertEqual(result["sectors"], [])
        self.assertEqual(len(result["windows"]), 1)
        self.assertAlmostEqual(result["windows"][0][2], 1.0, places=4)


if __name__ == "__main__":
    unittest.main()
