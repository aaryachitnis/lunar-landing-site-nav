"""
LOLA terrain data for the backend: download, convert, load, sample.

This is the Python version of what the frontend used to do:

    build step  (was frontend/scripts/fetch-textures.mjs)  ->  ensure_elevation_data()
    run time    (was frontend/src/data/elevation.js)       ->  ElevationGrid, load_elevation_grid()

DATA SOURCE
-----------
NASA Scientific Visualization Studio, "CGI Moon Kit" (svs.gsfc.nasa.gov/4720).
It republishes the LRO LOLA global elevation grids as uncompressed GeoTIFFs:

    ldem_4.tif   ldem_16.tif   ldem_64.tif     (4, 16 and 64 pixels/degree)

Values are floating-point KILOMETRES relative to a reference sphere of radius
1737.4 km. The map is centred on 0 degrees longitude, so column 0 is 180 W
and row 0 is 90 N. Sizes: ldem_16 is 5760 x 2880 (66 MB), ldem_64 is
23040 x 11520 (about 1 GB). The pixel size at the equator is 1.9 km for
ldem_16 and 0.47 km for ldem_64.

WHAT HAPPENS
------------
1. ensure_elevation_data(): if the converted files are missing, or were built
   at a different resolution, download the TIFF (only if it is not already in
   the cache folder) and convert it to whole-metre 16-bit integers.
2. load_elevation_grid(): open the converted file and keep it for reuse.
3. ElevationGrid.sample(lat, lon): bilinear height lookup, in metres.

FILES (all under DATA_DIR, which you can move with the LOLA_DATA_DIR
environment variable; none of it belongs in git)
    .cache/ldem_<ppd>.tif          raw download
    elevation/moon_elev_i16.bin    whole metres, little-endian int16, row-major
    elevation/moon_meta.json       grid size, resolution, dataset, min/max

Run it directly to build or rebuild the files (like `npm run textures`):
    python lola_terrain.py            # build if missing, at 16 pixels/degree
    python lola_terrain.py --ppd 64   # higher resolution
    python lola_terrain.py --force    # rebuild even if the files exist

NOT TESTED against the live NASA server (my sandbox cannot reach it). The
conversion, loading and sampling were tested on synthetic files.
"""
import argparse
import json
import os
import urllib.request
from functools import lru_cache
from pathlib import Path

import numpy as np

MOON_RADIUS_M = 1_737_400.0   # reference sphere the heights are measured from
SVS_BASE_URL = "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/"
VALID_PPD = (4, 16, 64)
DEFAULT_PPD = 16
DATA_DIR = Path(os.environ.get("LOLA_DATA_DIR",
                               Path(__file__).resolve().parent / "data"))


# ----------------------------------------------------------------------
# Build step: download and convert
# ----------------------------------------------------------------------
def _paths(data_dir, ppd):
    data_dir = Path(data_dir)
    return (data_dir / ".cache" / f"ldem_{ppd}.tif",
            data_dir / "elevation" / "moon_elev_i16.bin",
            data_dir / "elevation" / "moon_meta.json")


def _is_built(bin_path, meta_path, ppd):
    """True if the converted files exist and were built at this resolution."""
    if not (bin_path.exists() and meta_path.exists()):
        return False
    try:
        meta = json.loads(meta_path.read_text())
        return (meta.get("ppd") == ppd and
                bin_path.stat().st_size == meta["width"] * meta["height"] * 2)
    except (ValueError, KeyError, OSError):
        return False


def download_ldem(ppd, dest):
    """Download ldem_<ppd>.tif from NASA SVS to dest (atomically)."""
    url = f"{SVS_BASE_URL}ldem_{ppd}.tif"
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_name(dest.name + ".part")
    min_bytes = (360 * ppd) * (180 * ppd) * 4      # float32 pixels, no header
    print(f"Downloading {url}")
    req = urllib.request.Request(url, headers={"User-Agent": "lunar-site-backend"})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp, open(part, "wb") as out:
            total = int(resp.headers.get("Content-Length") or 0)
            done, next_report = 0, 0.1
            while True:
                chunk = resp.read(1 << 20)
                if not chunk:
                    break
                out.write(chunk)
                done += len(chunk)
                if total and done / total >= next_report:
                    print(f"  {100 * done / total:.0f}%")
                    next_report += 0.1
        if part.stat().st_size < min_bytes:
            raise IOError("file is smaller than expected (truncated download?)")
        part.replace(dest)
    except Exception as exc:
        part.unlink(missing_ok=True)
        raise RuntimeError(
            f"Could not download {url}: {exc}\n"
            f"If this machine cannot reach NASA, download the file elsewhere "
            f"and copy it to {dest}; it will be picked up on the next run."
        ) from exc


def convert_to_int16(tif_path, bin_path, meta_path, ppd):
    """Float32 kilometres -> whole metres (int16), written a few rows at a
    time so the 64 pixels/degree file does not need 2 GB of memory."""
    import tifffile

    try:
        src = tifffile.memmap(tif_path)     # uncompressed TIFF: no full load
    except Exception:
        src = tifffile.imread(tif_path)
    height, width = 180 * ppd, 360 * ppd
    if src.ndim != 2 or src.shape != (height, width) or src.dtype.kind != "f":
        raise ValueError(
            f"{tif_path} has shape {src.shape} and type {src.dtype}; expected "
            f"a float grid of {height} x {width} for {ppd} pixels/degree."
        )

    bin_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = bin_path.with_name(bin_path.name + ".part")
    lo, hi = np.inf, -np.inf
    try:
        with open(tmp, "wb") as f:
            for r0 in range(0, height, 256):
                block = np.asarray(src[r0:r0 + 256], dtype=np.float32) * 1000.0
                if not np.isfinite(block).all():
                    raise ValueError("elevation file contains missing values")
                block = np.clip(np.rint(block), -32768, 32767).astype("<i2")
                lo, hi = min(lo, int(block.min())), max(hi, int(block.max()))
                f.write(block.tobytes())
        tmp.replace(bin_path)
    except Exception:
        tmp.unlink(missing_ok=True)
        raise

    meta = {
        "dataset": f"LOLA LDEM_{ppd} (NASA SVS 4720)",
        "width": width,
        "height": height,
        "ppd": ppd,
        "resolution_m_at_equator": round(
            2 * np.pi * MOON_RADIUS_M / 360.0 / ppd, 1),
        "min_m": lo,
        "max_m": hi,
        "units": "metres above a 1737.4 km sphere",
        "layout": "row 0 = 90N, column 0 = 180W, little-endian int16",
    }
    meta_path.write_text(json.dumps(meta, indent=2))


def ensure_elevation_data(ppd=DEFAULT_PPD, data_dir=DATA_DIR, force=False):
    """Make sure the converted elevation files exist at this resolution.
    Does nothing if they do (unless force). Downloads only if the raw TIFF is
    not already cached. Returns (bin_path, meta_path)."""
    if ppd not in VALID_PPD:
        raise ValueError(f"ppd must be one of {VALID_PPD}, not {ppd}")
    tif, bin_path, meta_path = _paths(data_dir, ppd)
    if not force and _is_built(bin_path, meta_path, ppd):
        return bin_path, meta_path
    if not tif.exists():
        download_ldem(ppd, tif)
    print(f"Converting {tif.name} to whole-metre int16 ...")
    convert_to_int16(tif, bin_path, meta_path, ppd)
    print("Done.")
    return bin_path, meta_path


# ----------------------------------------------------------------------
# Run time: load and sample
# ----------------------------------------------------------------------
class ElevationGrid:
    """The converted LOLA grid, memory-mapped so only the parts that are
    touched get read from disk."""

    def __init__(self, bin_path, meta_path):
        self.meta = json.loads(Path(meta_path).read_text())
        self.width = self.meta["width"]
        self.height = self.meta["height"]
        self.ppd = self.meta["ppd"]
        self.data = np.memmap(bin_path, dtype="<i2", mode="r",
                              shape=(self.height, self.width))
        self.offset = MOON_RADIUS_M                    # reference sphere, metres
        self.pixel_km = (2 * np.pi * self.offset / 1000.0 / 360.0) / self.ppd

    def sample(self, lat_deg, lon_deg):
        """Height in metres above the reference sphere, blended from the four
        surrounding pixels (bilinear). Longitude wraps around at 180 degrees;
        latitude is held at the poles. Accepts numbers or arrays."""
        lat = np.asarray(lat_deg, dtype=float)
        lon = np.asarray(lon_deg, dtype=float)

        # Pixel centres sit half a pixel in from the pixel's edge.
        x = ((lon + 180.0) % 360.0) * self.ppd - 0.5
        y = np.clip((90.0 - lat) * self.ppd - 0.5, 0.0, self.height - 1.0)

        x0 = np.floor(x).astype(int)
        y0 = np.floor(y).astype(int)
        fx, fy = x - x0, y - y0
        x0, x1 = x0 % self.width, (x0 + 1) % self.width
        y1 = np.minimum(y0 + 1, self.height - 1)

        d = self.data
        top = d[y0, x0] * (1 - fx) + d[y0, x1] * fx
        bottom = d[y1, x0] * (1 - fx) + d[y1, x1] * fx
        return top * (1 - fy) + bottom * fy

    def radius_m(self, lat_deg, lon_deg):
        """Distance from the Moon's centre to the surface, in metres."""
        return self.offset + self.sample(lat_deg, lon_deg)


@lru_cache(maxsize=2)
def load_elevation_grid(ppd=DEFAULT_PPD, data_dir=DATA_DIR):
    """Build the files if needed, then open them. The result is kept, so every
    later call in the same process re-uses one grid with no new reads. A
    failure is not kept, so the next call tries again."""
    bin_path, meta_path = ensure_elevation_data(ppd, data_dir)
    return ElevationGrid(bin_path, meta_path)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Build the LOLA elevation files.")
    ap.add_argument("--ppd", type=int, default=DEFAULT_PPD, choices=VALID_PPD)
    ap.add_argument("--force", action="store_true",
                    help="rebuild even if the files already exist")
    args = ap.parse_args()
    b, m = ensure_elevation_data(args.ppd, DATA_DIR, args.force)
    meta = json.loads(m.read_text())
    print(f"{meta['dataset']}: {meta['width']} x {meta['height']} pixels, "
          f"{meta['resolution_m_at_equator']} m/pixel, heights "
          f"{meta['min_m']} to {meta['max_m']} m")