import unittest

from data import SITES
from landing_data_processing import Sites


class SiteDataTests(unittest.TestCase):
    def test_catalog_preserves_site_order_and_count(self) -> None:
        self.assertEqual(len(SITES), 9)
        self.assertEqual(SITES[0], (-84.2287, 69.44396))
        self.assertEqual(SITES[-1], (-86.77509, -23.13639))

    def test_coordinates_are_valid_and_unique(self) -> None:
        self.assertEqual(len(set(SITES)), len(SITES))
        for latitude, longitude in SITES:
            with self.subTest(latitude=latitude, longitude=longitude):
                self.assertTrue(-90.0 <= latitude <= 90.0)
                self.assertTrue(-180.0 <= longitude <= 180.0)

    def test_catalog_is_immutable(self) -> None:
        self.assertIsInstance(SITES, tuple)

    def test_legacy_catalog_matches_canonical_data(self) -> None:
        self.assertEqual(Sites, [list(coordinates) for coordinates in SITES])


if __name__ == "__main__":
    unittest.main()
