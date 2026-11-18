import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import numpy as np

from services import terrain_sky
from services.power_services import _datetime_to_julian_date

START = datetime(2026, 1, 1, tzinfo=timezone.utc)
END = START + timedelta(days=1)


class Dem:
    meta = {"dataset": "Synthetic", "resolution_m_at_equator": 1895.2}


def ridge_skyline(*_args, **_kwargs):
    """A 10° ridge from azimuth 80° to 100°, flat everywhere else."""
    az = np.arange(360.0)
    sky = np.where((az >= 80) & (az <= 100), 10.0, 0.0)
    return az, sky, np.zeros(360), np.zeros(360)


def track(az_deg, el_deg, hours=24, step_h=1):
    jd0 = _datetime_to_julian_date(START)
    n = hours // step_h + 1
    return {
        "datetime_jd": jd0 + np.arange(n) * step_h / 24.0,
        "AZ": np.broadcast_to(az_deg, (n,)).astype(float) if np.ndim(az_deg) == 0 else np.asarray(az_deg, float),
        "EL": np.full(n, float(el_deg)),
    }


class TerrainSkyTests(unittest.TestCase):
    def setUp(self) -> None:
        patcher = patch.object(terrain_sky, "terrain_skyline", ridge_skyline)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_ridge_hides_low_sun_only_while_it_is_behind_the_ridge(self) -> None:
        sun = track(np.linspace(0.0, 360.0, 25) % 360.0, 5.0)  # one full turn, 5° up
        earth = track(180.0, -1.0)                               # always below the horizon
        result = terrain_sky.calculate_terrain_sky(Dem(), -89.0, 0.0, sun, earth, START, END)

        self.assertTrue(result.sun.visible)
        self.assertEqual(result.sun.flat_visible_fraction, 1.0)
        # Behind the 10° ridge for ~20° of a 360° turn: about 1.3 h of 24 h.
        self.assertAlmostEqual(result.sun.hidden_by_terrain_hours, 24 * 20 / 360, delta=0.4)
        self.assertAlmostEqual(result.sun.visible_fraction, 1 - 20 / 360, delta=0.02)
        self.assertEqual(len(result.sun.windows), 2)
        self.assertIsNotNone(result.sun.nearest_set_utc)
        self.assertIsNotNone(result.sun.nearest_rise_utc)
        self.assertLess(result.sun.nearest_set_utc, result.sun.nearest_rise_utc)
        self.assertEqual(len(result.horizon_profile_degrees), 360)

    def test_body_below_flat_horizon_is_not_blamed_on_terrain(self) -> None:
        sun = track(0.0, 5.0)
        earth = track(180.0, -1.0)
        result = terrain_sky.calculate_terrain_sky(Dem(), -89.0, 0.0, sun, earth, START, END)

        self.assertFalse(result.earth.visible)
        self.assertEqual(result.earth.visible_fraction, 0.0)
        self.assertEqual(result.earth.hidden_by_terrain_hours, 0.0)
        self.assertEqual(result.earth.windows, [])
        self.assertAlmostEqual(result.earth.longest_hidden_hours, 24.0, places=3)

    def test_rejects_reversed_window(self) -> None:
        with self.assertRaises(ValueError):
            terrain_sky.calculate_terrain_sky(Dem(), 0, 0, track(0, 5), track(0, 5), END, START)


if __name__ == "__main__":
    unittest.main()
