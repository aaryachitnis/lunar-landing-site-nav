import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from data import (
    SITES,
    DuplicateSiteError,
    SiteCatalogError,
    add_site_record,
    find_site_record,
    load_site_records,
)
from data.sites import SITE_CATALOG_PATH
from landing_data_processing import Sites


class SiteDataTests(unittest.TestCase):
    def test_catalog_preserves_original_site_order(self) -> None:
        self.assertGreaterEqual(len(SITES), 9)
        self.assertEqual(SITES[0][0], "orig1")
        self.assertEqual(SITES[0][1], "Artemis 3 (Amundsen)")
        self.assertEqual(SITES[0][2], (-84.2287, 69.44396))
        self.assertEqual(SITES[8][0], "orig9")
        self.assertEqual(SITES[8][2], (-86.77509, -23.13639))

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
                self.assertIsInstance(description, str)
                self.assertIsInstance(agency, str)
        self.assertEqual(find_site_record("orig1"), SITES[0])
        self.assertEqual(find_site_record("site-1"), SITES[0])
        self.assertIsNone(find_site_record("site-that-does-not-exist"))

    def test_catalog_is_immutable(self) -> None:
        self.assertIsInstance(SITES, tuple)

    def test_json_catalog_is_readable_and_new_sites_are_persisted(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "sites.json"
            path.write_text(SITE_CATALOG_PATH.read_text(encoding="utf-8"), encoding="utf-8")
            with patch("data.sites.SITE_CATALOG_PATH", path):
                added = add_site_record(
                    "Test crater",
                    (12.5, -42.25),
                    "Temporary test site.",
                    "Test agency",
                )

                loaded = load_site_records()
                saved_data = json.loads(path.read_text(encoding="utf-8"))
                self.assertEqual(len(loaded), len(SITES) + 1)
                self.assertEqual(loaded[-1], added)
                self.assertEqual(find_site_record(added[0]), added)
                self.assertEqual(saved_data[-1]["name"], "Test crater")
                self.assertEqual(saved_data[-1]["loc"], [12.5, -42.25])

    def test_catalog_rejects_duplicate_coordinates_and_invalid_json(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "sites.json"
            path.write_text(SITE_CATALOG_PATH.read_text(encoding="utf-8"), encoding="utf-8")
            with patch("data.sites.SITE_CATALOG_PATH", path):
                with self.assertRaises(DuplicateSiteError):
                    add_site_record("Duplicate", SITES[0][2])

                path.write_text("{", encoding="utf-8")
                with self.assertRaises(SiteCatalogError):
                    load_site_records()

    def test_legacy_catalog_matches_canonical_data(self) -> None:
        self.assertEqual(Sites, [list(site[2]) for site in SITES])


if __name__ == "__main__":
    unittest.main()
