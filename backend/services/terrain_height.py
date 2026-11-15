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

From the backend directory, run it as a module to build or rebuild the files:
    python -m services.terrain_height            # build at 16 pixels/degree
    python -m services.terrain_height --ppd 64   # higher resolution
    python -m services.terrain_height --force    # rebuild existing files

NOT TESTED against the live NASA server (my sandbox cannot reach it). The
conversion, loading and sampling were tested on synthetic files.
"""
import argparse
import csv
import json
import os
import sys
import urllib.request
from functools import lru_cache
from pathlib import Path
 
import numpy as np

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
 
MOON_RADIUS_M = 1_737_400.0   # reference sphere the heights are measured from
SVS_BASE_URL = "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/"
VALID_PPD = (4, 16, 64)
DEFAULT_PPD = 16
DATA_DIR = Path(
    os.environ.get("LOLA_DATA_DIR", Path(__file__).resolve().parents[1] / "data" / "terrain")
)
 
# ----------------------------------------------------------------------
# USER INPUTS for the terrain table (used when this file is run directly)
# ----------------------------------------------------------------------
# 2D list of [latitude, longitude] in degrees (east-positive longitude).
# Approximate placeholder coordinates: replace with your own sites.
from data.sites import SITES
TERRAIN_RADIUS_KM = 10.0   # how far around each site to look
 
 
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
 
 
def _central_angle_km(lat1, lon1, lat2, lon2, radius_km):
    """Surface distance between points (haversine; degrees in, km out)."""
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dl = np.radians(lon2 - lon1)
    a = (np.sin((p2 - p1) / 2) ** 2 +
         np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2)
    return 2 * radius_km * np.arcsin(np.sqrt(np.clip(a, 0.0, 1.0)))
 
 
def terrain_stats(grid, sites, radius_km=TERRAIN_RADIUS_KM):
    """Highest and lowest ground within radius_km of each landing site.
 
    sites: 2D list of [latitude, longitude] pairs.
    Returns one dict per site:
        site_height_m     ground height at the site itself
        max_height_m      highest ground in the circle
        min_height_m      lowest ground in the circle
        max_above_site_m  how far the highest ground is above the site
        min_below_site_m  how far the lowest ground is below the site (<= 0)
        relief_m          highest minus lowest
    All absolute heights are metres above the 1737.4 km reference sphere.
 
    Method: find the block of grid pixels that could lie in the circle
    (allowing for longitude wrap-around and for circles that contain a pole),
    measure each pixel's distance from the site, and keep those inside the
    circle. The site's own interpolated height is included, so the highest
    and lowest are never above/below the site's own value by accident."""
    if radius_km <= 0:
        raise ValueError("radius_km must be positive.")
    body_km = grid.offset / 1000.0
    theta = radius_km / body_km                         # radians
    ppd = grid.ppd
 
    results = []
    for i, (lat, lon) in enumerate(sites):
        row = {"site": i, "lat": lat, "lon": lon}
        try:
            if not -90.0 <= lat <= 90.0:
                raise ValueError(f"Latitude {lat} is outside -90 to 90 degrees.")
            if not -180.0 <= lon <= 360.0:
                raise ValueError(f"Longitude {lon} is outside -180 to 360 degrees.")
 
            site_h = float(grid.sample(lat, lon))
            dth = np.degrees(theta)
 
            # Rows that could be inside the circle (one spare on each side)
            top = min(lat + dth, 90.0)
            bottom = max(lat - dth, -90.0)
            r0 = max(int(np.floor((90.0 - top) * ppd)) - 1, 0)
            r1 = min(int(np.floor((90.0 - bottom) * ppd)) + 1, grid.height - 1)
            rows = np.arange(r0, r1 + 1)
 
            # Columns that could be inside (all of them if a pole is inside)
            if np.sin(theta) >= np.cos(np.radians(lat)) or lat + dth >= 90 \
                    or lat - dth <= -90:
                cols = np.arange(grid.width)
            else:
                dlon = np.degrees(np.arcsin(np.sin(theta) / np.cos(np.radians(lat))))
                start = int(np.floor(((lon - dlon + 180.0) % 360.0) * ppd)) - 1
                n = int(np.ceil(2 * dlon * ppd)) + 3
                cols = (np.arange(n) + start) % grid.width if n < grid.width \
                    else np.arange(grid.width)
 
            block = grid.data[np.ix_(rows, cols)].astype(float)
            lat_c = 90.0 - (rows + 0.5) / ppd
            lon_c = (cols + 0.5) / ppd - 180.0
            dist = _central_angle_km(lat, lon, lat_c[:, None], lon_c[None, :],
                                     body_km)
            inside = block[dist <= radius_km]
 
            hi = max(float(inside.max()), site_h) if inside.size else site_h
            lo = min(float(inside.min()), site_h) if inside.size else site_h
            row.update({
                "radius_km": radius_km,
                "site_height_m": round(site_h, 1),
                "max_height_m": round(hi, 1),
                "min_height_m": round(lo, 1),
                "max_above_site_m": round(hi - site_h, 1),
                "min_below_site_m": round(lo - site_h, 1),
                "relief_m": round(hi - lo, 1),
                "pixels_used": int(inside.size),
            })
        except Exception as exc:
            row["error"] = str(exc)
        results.append(row)
    return results
 
 
def save_terrain_csv(results, path="site_terrain_stats.csv"):
    first = ["site", "lat", "lon", "radius_km", "site_height_m",
             "max_height_m", "min_height_m", "max_above_site_m",
             "min_below_site_m", "relief_m", "pixels_used", "error"]
    keys = [k for k in first if any(k in r for r in results)]
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=keys)
        w.writeheader()
        w.writerows(results)
 
 
if __name__ == "__main__":
    ap = argparse.ArgumentParser(
        description="Build the LOLA elevation files and report the terrain "
                    "around each landing site.")
    ap.add_argument("--ppd", type=int, default=DEFAULT_PPD, choices=VALID_PPD)
    ap.add_argument("--force", action="store_true",
                    help="rebuild the files even if they already exist")
    ap.add_argument("--radius-km", type=float, default=TERRAIN_RADIUS_KM,
                    help="how far around each site to look (default %(default)s)")
    args = ap.parse_args()
 
    bin_path, meta_path = ensure_elevation_data(args.ppd, DATA_DIR, args.force)
    grid = ElevationGrid(bin_path, meta_path)
    print(f"{grid.meta['dataset']}: {grid.width} x {grid.height} pixels, "
          f"{grid.meta['resolution_m_at_equator']} m/pixel at the equator")
 
    stats = terrain_stats(grid, [site[2] for site in SITES], args.radius_km)
    print(f"\nTerrain within {args.radius_km:g} km of each site "
          f"(metres above the 1737.4 km reference sphere):")
    for r in stats:
        if "error" in r:
            print(f"  site {r['site']} ({r['lat']}, {r['lon']}): {r['error']}")
        else:
            print(f"  site {r['site']} ({r['lat']}, {r['lon']}): "
                  f"site {r['site_height_m']:.0f} | "
                  f"highest {r['max_height_m']:.0f} ({r['max_above_site_m']:+.0f} vs site) | "
                  f"lowest {r['min_height_m']:.0f} ({r['min_below_site_m']:+.0f} vs site)")
    save_terrain_csv(stats)
    print("Saved site_terrain_stats.csv")

