import unittest
from unittest.mock import patch

import numpy as np
from requests.exceptions import Timeout

from services import (
    HorizonsRequestError,
    calculate_beta_angle,
    calculate_energy_per_day,
    calculate_instantaneous_power_per_area,
    fetch_solar_ephemeris,
)


class PowerServiceTests(unittest.TestCase):
    def test_fetch_solar_ephemeris_uses_requested_horizons_epochs(self) -> None:
        from astroquery.jplhorizons import Horizons

        with patch("astroquery.jplhorizons.Horizons") as horizons:
            result = horizons.return_value.ephemerides.return_value
            ephemeris = fetch_solar_ephemeris(
                {"lat": -89.0, "lon": 12.0, "elevation": 0, "body": 301},
                "2026-01-01 00:00",
                "2026-01-02 00:00",
                "4hour",
            )

        self.assertIs(ephemeris, result)
        horizons.assert_called_once_with(
            id="10",
            location={"lat": -89.0, "lon": 12.0, "elevation": 0, "body": 301},
            epochs={
                "start": "2026-01-01 00:00",
                "stop": "2026-01-02 00:00",
                "step": "4hour",
            },
        )
        horizons.return_value.ephemerides.assert_called_once_with(
            quantities="4,20"
        )

    def test_fetch_solar_ephemeris_wraps_network_errors(self) -> None:
        with patch(
            "astroquery.jplhorizons.Horizons",
            side_effect=Timeout("request timed out"),
        ):
            with self.assertRaises(HorizonsRequestError):
                fetch_solar_ephemeris(
                    {"lat": -89.0, "lon": 12.0, "elevation": 0, "body": 301},
                    "2026-01-01 00:00",
                    "2026-01-02 00:00",
                    "4hour",
                )

    def test_fetch_solar_ephemeris_rejects_empty_step(self) -> None:
        with self.assertRaisesRegex(ValueError, "must not be empty"):
            fetch_solar_ephemeris(
                {"lat": -89.0, "lon": 12.0, "elevation": 0, "body": 301},
                "2026-01-01 00:00",
                "2026-01-02 00:00",
                "  ",
            )

    def test_beta_angle_uses_elevation_and_returns_degrees(self) -> None:
        ephemeris = {
            "AZ": np.array([0.0, 90.0]),
            "EL": np.array([30.0, -30.0]),
        }
        np.testing.assert_allclose(
            calculate_beta_angle(ephemeris),
            np.array([60.0, 120.0]),
        )

    def test_beta_angle_rejects_mismatched_or_invalid_columns(self) -> None:
        with self.assertRaisesRegex(ValueError, "equal lengths"):
            calculate_beta_angle({"AZ": [0.0, 90.0], "EL": [30.0]})
        with self.assertRaisesRegex(ValueError, "between -90 and 90"):
            calculate_beta_angle({"AZ": [0.0], "EL": [91.0]})

    def test_instantaneous_power_is_zero_below_horizon(self) -> None:
        ephemeris = {
            "AZ": np.array([0.0, 0.0, 0.0]),
            "EL": np.array([30.0, 0.0, -30.0]),
        }
        power = calculate_instantaneous_power_per_area(ephemeris)
        self.assertAlmostEqual(float(power[0]), 136.1, places=6)
        self.assertAlmostEqual(float(power[1]), 0.0, places=10)
        self.assertEqual(float(power[2]), 0.0)

    def test_instantaneous_power_rejects_invalid_solar_intensity(self) -> None:
        ephemeris = {"AZ": [0.0], "EL": [30.0]}
        with self.assertRaisesRegex(ValueError, "Solar intensity"):
            calculate_instantaneous_power_per_area(
                ephemeris,
                solar_intensity_w_m2=-1.0,
            )

    def test_energy_integration_handles_full_and_partial_days(self) -> None:
        ephemeris = {
            "datetime_jd": 2_460_000.0 + np.array([0.0, 1.0, 1.25]),
        }
        energy = calculate_energy_per_day(
            np.array([100.0, 100.0, 100.0]),
            ephemeris,
        )
        self.assertEqual(len(energy), 2)
        self.assertAlmostEqual(energy[0], 2.4, places=6)
        self.assertAlmostEqual(energy[1], 0.6, places=6)

    def test_energy_integration_trapezoidally_interpolates_samples(self) -> None:
        ephemeris = {"datetime_jd": np.array([2_460_000.0, 2_460_001.0])}
        energy = calculate_energy_per_day([0.0, 100.0], ephemeris)
        self.assertAlmostEqual(energy[0], 1.2, places=6)

    def test_energy_integration_splits_sample_intervals_at_day_boundary(self) -> None:
        ephemeris = {
            "datetime_jd": 2_460_000.0 + np.array([0.0, 0.5, 1.5]),
        }
        energy = calculate_energy_per_day([0.0, 100.0, 100.0], ephemeris)
        self.assertEqual(len(energy), 2)
        self.assertAlmostEqual(energy[0], 1.8, places=6)
        self.assertAlmostEqual(energy[1], 1.2, places=6)

    def test_energy_rejects_mismatched_or_non_monotonic_samples(self) -> None:
        with self.assertRaisesRegex(ValueError, "equal lengths"):
            calculate_energy_per_day(
                [10.0],
                {"datetime_jd": [2_460_000.0, 2_460_001.0]},
            )
        with self.assertRaisesRegex(ValueError, "strictly increasing"):
            calculate_energy_per_day(
                [10.0, 10.0],
                {"datetime_jd": [2_460_000.0, 2_459_999.0]},
            )

    def test_energy_rejects_too_few_timestamps_and_non_finite_power(self) -> None:
        with self.assertRaisesRegex(ValueError, "At least two"):
            calculate_energy_per_day(
                [10.0],
                {"datetime_jd": [2_460_000.0]},
            )
        with self.assertRaisesRegex(ValueError, "finite"):
            calculate_energy_per_day(
                [10.0, float("nan")],
                {"datetime_jd": [2_460_000.0, 2_460_001.0]},
            )

    def test_power_service_rejects_invalid_values(self) -> None:
        with self.assertRaisesRegex(ValueError, "efficiency"):
            calculate_instantaneous_power_per_area(
                {"AZ": [0.0], "EL": [20.0]},
                panel_efficiency=1.1,
            )
        with self.assertRaisesRegex(ValueError, "finite"):
            calculate_beta_angle(
                {"AZ": [float("nan")], "EL": [20.0]}
            )


if __name__ == "__main__":
    unittest.main()