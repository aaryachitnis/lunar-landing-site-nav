"""
LOLA elevation for the backend: download, convert, load and sample.

Source: NASA PDS LOLA LDEM grids (raw int16 half-metres, column 0 at 0 E), converted
to whole metres with column 0 at 180 W, the same layout as the frontend's grid.
Files live under data/terrain (or LOLA_DATA_DIR). Build ahead of time with
`python -m services.terrain_height [--ppd 64] [--force]`.
"""
import argparse
import json
import os
import sys
from functools import lru_cache
from pathlib import Path

import numpy as np
import requests

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

MOON_RADIUS_M = 1_737_400.0   # reference sphere the heights are measured from
LDEM_BASE_URL = (
    "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/"
    "lrolol_1xxx/data/lola_gdr/cylindrical/img/"
)
LDEM_SCALE_M = 0.5            # metres per stored unit (SCALING_FACTOR in the PDS label)
VALID_PPD = (4, 16, 64)
DEFAULT_PPD = 16
DATA_DIR = Path(
    os.environ.get("LOLA_DATA_DIR", Path(__file__).resolve().parents[1] / "data" / "terrain")
)

TERRAIN_RADIUS_KM = 10.0  # CLI terrain table radius


def _paths(data_dir, ppd):
    data_dir = Path(data_dir)
    return (data_dir / ".cache" / f"ldem_{ppd}.img",
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
    """Download ldem_<ppd>.img from NASA PDS to dest (atomically)."""
    url = f"{LDEM_BASE_URL}ldem_{ppd}.img"
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_name(dest.name + ".part")
    expected_bytes = (360 * ppd) * (180 * ppd) * 2
    print(f"Downloading {url}")
    try:
        with requests.get(url, headers={"User-Agent": "lunar-site-backend"}, stream=True,
                          timeout=60) as resp, open(part, "wb") as out:
            resp.raise_for_status()
            done, next_report = 0, 0.1
            for chunk in resp.iter_content(1 << 20):
                out.write(chunk)
                done += len(chunk)
                if done / expected_bytes >= next_report:
                    print(f"  {100 * done / expected_bytes:.0f}%")
                    next_report += 0.1
        if part.stat().st_size != expected_bytes:
            raise IOError("file is not the expected size (truncated download?)")
        part.replace(dest)
    except Exception as exc:
        part.unlink(missing_ok=True)
        raise RuntimeError(
            f"Could not download {url}: {exc}. "
            f"If this machine cannot reach NASA, download the file elsewhere "
            f"and copy it to {dest}; it will be picked up on the next run."
        ) from exc


def convert_ldem(img_path, bin_path, meta_path, ppd):
    """PDS half-metres, column 0 at 0 E -> whole metres, column 0 at 180 W.
    Works in row blocks so ldem_64 doesn't need to fit in memory."""
    height, width = 180 * ppd, 360 * ppd
    if Path(img_path).stat().st_size != height * width * 2:
        raise ValueError(f"{img_path} is not a {width} x {height} int16 grid for {ppd} pixels/degree.")
    src = np.memmap(img_path, dtype="<i2", mode="r", shape=(height, width))

    bin_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = bin_path.with_name(bin_path.name + ".part")
    lo, hi = np.inf, -np.inf
    try:
        with open(tmp, "wb") as f:
            for r0 in range(0, height, 256):
                block = np.rint(src[r0:r0 + 256].astype(np.float32) * LDEM_SCALE_M)
                block = np.roll(block, -width // 2, axis=1).astype("<i2")
                lo, hi = min(lo, int(block.min())), max(hi, int(block.max()))
                f.write(block.tobytes())
        tmp.replace(bin_path)
    except Exception:
        tmp.unlink(missing_ok=True)
        raise
    finally:
        del src

    meta = {
        "dataset": f"LOLA LDEM_{ppd} (NASA PDS)",
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
    """Download and convert if needed; returns (bin_path, meta_path)."""
    if ppd not in VALID_PPD:
        raise ValueError(f"ppd must be one of {VALID_PPD}, not {ppd}")
    img, bin_path, meta_path = _paths(data_dir, ppd)
    if not force and _is_built(bin_path, meta_path, ppd):
        return bin_path, meta_path
    if not img.exists():
        download_ldem(ppd, img)
    print(f"Converting {img.name} to whole-metre int16 ...")
    convert_ldem(img, bin_path, meta_path, ppd)
    print("Done.")
    return bin_path, meta_path


class ElevationGrid:
    """The converted grid, memory-mapped so only touched pixels are read."""

    def __init__(self, bin_path, meta_path):
        self.meta = json.loads(Path(meta_path).read_text())
        self.width = self.meta["width"]
        self.height = self.meta["height"]
        self.ppd = self.meta["ppd"]
        self.data = np.memmap(bin_path, dtype="<i2", mode="r",
                              shape=(self.height, self.width))
        self.offset = MOON_RADIUS_M
        self.pixel_km = (2 * np.pi * self.offset / 1000.0 / 360.0) / self.ppd

    def sample(self, lat_deg, lon_deg):
        """Bilinear height in metres above the reference sphere; numbers or arrays."""
        lat = np.asarray(lat_deg, dtype=float)
        lon = np.asarray(lon_deg, dtype=float)

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
    """Cached per process; a failed load isn't cached, so the next call retries."""
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
    """Site height, highest/lowest ground and relief within radius_km of each [lat, lon]."""
    if radius_km <= 0:
        raise ValueError("radius_km must be positive.")
    body_km = grid.offset / 1000.0
    theta = radius_km / body_km
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

            top = min(lat + dth, 90.0)
            bottom = max(lat - dth, -90.0)
            r0 = max(int(np.floor((90.0 - top) * ppd)) - 1, 0)
            r1 = min(int(np.floor((90.0 - bottom) * ppd)) + 1, grid.height - 1)
            rows = np.arange(r0, r1 + 1)

            # Every column when the circle contains a pole.
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

    from data import load_site_records

    stats = terrain_stats(grid, [site[2] for site in load_site_records()], args.radius_km)
    print(json.dumps(stats, indent=2))
