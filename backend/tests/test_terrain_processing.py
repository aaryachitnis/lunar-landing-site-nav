import json
import tempfile
import unittest
from pathlib import Path

import numpy as np
import tifffile

from services.terrain_height import (
    MOON_RADIUS_M,
    ElevationGrid,
    convert_to_int16,
    terrain_stats,
)


class TerrainProcessingTests(unittest.TestCase):
    def test_conversion_and_elevation_sampling_include_dateline_wrap(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / "synthetic.tif"
            binary = root / "elevation.bin"
            metadata = root / "metadata.json"
            pixels = np.full((720, 1440), 1.234, dtype=np.float32)
            pixels[0, 0] = 2.5
            pixels[0, -1] = 5.0
            tifffile.imwrite(source, pixels)

            convert_to_int16(source, binary, metadata, ppd=4)
            grid = ElevationGrid(binary, metadata)

            self.assertEqual(grid.sample(89.875, -179.875), 2500.0)
            self.assertEqual(grid.sample(89.875, 180.0), 3750.0)
            self.assertEqual(grid.meta["min_m"], 1234)
            self.assertEqual(grid.meta["max_m"], 5000)
            self.assertEqual(json.loads(metadata.read_text())["ppd"], 4)
            grid.data._mmap.close()

    def test_terrain_stats_reports_local_extrema_and_site_height(self) -> None:
        class Grid:
            width = 360
            height = 180
            ppd = 1
            offset = MOON_RADIUS_M
            data = np.zeros((height, width), dtype=np.int16)

            def sample(self, lat, lon):
                return 40.0

        grid = Grid()
        grid.data[89, 179] = 100
        grid.data[89, 180] = 150
        grid.data[90, 179] = -30
        grid.data[90, 180] = 20

        result = terrain_stats(grid, [[0.0, 0.0]], radius_km=30.0)[0]

        self.assertEqual(result["site_height_m"], 40.0)
        self.assertEqual(result["max_height_m"], 150.0)
        self.assertEqual(result["min_height_m"], -30.0)
        self.assertEqual(result["max_above_site_m"], 110.0)
        self.assertEqual(result["min_below_site_m"], -70.0)
        self.assertEqual(result["relief_m"], 180.0)
        self.assertEqual(result["pixels_used"], 4)

    def test_terrain_stats_returns_row_error_for_invalid_site_coordinates(self) -> None:
        class Grid:
            width = 360
            height = 180
            ppd = 1
            offset = MOON_RADIUS_M
            data = np.zeros((height, width), dtype=np.int16)

            def sample(self, lat, lon):
                return 0.0

        result = terrain_stats(Grid(), [[91.0, 0.0]])[0]
        self.assertIn("Latitude 91.0", result["error"])


if __name__ == "__main__":
    unittest.main()
