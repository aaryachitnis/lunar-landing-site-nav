import unittest

from data import SITES, find_site_record
from landing_data_processing import Sites


class SiteDataTests(unittest.TestCase):
    def test_catalog_preserves_site_order_and_count(self) -> None:
        self.assertEqual(len(SITES), 9)
        self.assertEqual(SITES[0][0], "orig1")
        self.assertEqual(SITES[0][1], "Artemis 3 (Amundsen)")
        self.assertEqual(SITES[0][2], (-84.2287, 69.44396))
        self.assertEqual(SITES[-1][0], "orig9")
        self.assertEqual(SITES[-1][2], (-86.77509, -23.13639))

    def test_coordinates_are_valid_and_unique(self) -> None:
        coordinates = [site[2] for site in SITES]
        self.assertEqual(len(set(coordinates)), len(coordinates))
        for latitude, longitude in coordinates:
            with self.subTest(latitude=latitude, longitude=longitude):
                self.assertTrue(-90.0 <= latitude <= 90.0)
                self.assertTrue(-180.0 <= longitude <= 180.0)

    def test_site_metadata_and_ids_are_unique(self) -> None:
        ids = [site[0] for site in SITES]
        self.assertEqual(len(set(ids)), len(ids))
        for site_id, name, _, description, agency in SITES:
            with self.subTest(site_id=site_id):
                self.assertTrue(name)
                self.assertTrue(description)
                self.assertTrue(agency)
        self.assertEqual(find_site_record("orig1"), SITES[0])
        self.assertEqual(find_site_record("site-1"), SITES[0])
        self.assertIsNone(find_site_record("site-10"))

    def test_catalog_is_immutable(self) -> None:
        self.assertIsInstance(SITES, tuple)

    def test_legacy_catalog_matches_canonical_data(self) -> None:
        self.assertEqual(Sites, [list(site[2]) for site in SITES])


if __name__ == "__main__":
    unittest.main()
