"""
Solar power potential per lunar landing site, using JPL Horizons.

Untested against the live Horizons service: check the returned column
names (datetime_jd, AZ, EL, delta) if a query fails.
"""
import csv
import time as systime

import numpy as np
from astropy.time import Time
from astroquery.jplhorizons import Horizons

S0 = 1361.0  # solar constant, W/m^2 at 1 AU
MAX_ROWS = 80_000  # stay safely under Horizons' per-request row limit

# ----------------------------------------------------------------------
# USER INPUTS (these would come from your UI)
# ----------------------------------------------------------------------
START_DATE = "2027-01-01"   # ISO date, UTC
END_DATE = "2028-01-01"
STEP = "1h"                 # Horizons step, e.g. "10m", "1h"
EFFICIENCY_PERCENT = None   # e.g. 28 ; None -> default 30%
ORIENTATION = "horizontal"  # "horizontal", "vertical" or "tracking"
ARRAY_AZIMUTH_DEG = 0.0     # only used for "vertical"
MAST_HEIGHT_KM = 0.0        # array height above local surface

# 2D list of [latitude, longitude] in degrees (east-positive longitude)
SITES = [
    [-84.2287,69.44396],
        [20.19032,30.77314],
        [0.67138,23.47398],
        [-3.6452,-17.4715],
        [26.13214,3.6338],
        [-3.01234, -23.42159],
        [-8.99123, 15.51441],
        [-87.90019,89.69908],
        [-86.77509,-23.13639]

]


# ----------------------------------------------------------------------
def parse_efficiency(percent):
    """User gives a percentage (e.g. 28). None -> 30%. Returns a fraction."""
    if percent is None:
        return 0.30
    if not 0 < percent <= 100:
        raise ValueError("Efficiency must be between 0 and 100 (percent).")
    return percent / 100.0


def validate_dates(start, stop, step):
    t0, t1 = Time(start, scale="utc"), Time(stop, scale="utc")
    if t1 <= t0:
        raise ValueError("END_DATE must be after START_DATE.")
    unit = {"m": 1 / 1440, "h": 1 / 24, "d": 1.0}[step[-1]]
    n_rows = (t1 - t0).jd / (float(step[:-1]) * unit)
    if n_rows > MAX_ROWS:
        raise ValueError(
            f"{int(n_rows)} timesteps requested; use a larger STEP or "
            f"split the date range into chunks (limit ~{MAX_ROWS})."
        )


def sun_geometry(lat, lon, start, stop, step, elevation_km=0.0):
    """Sun azimuth/elevation/distance as seen from a lunar surface site."""
    obj = Horizons(
        id="10",  # Sun
        location={"lon": lon, "lat": lat,
                  "elevation": elevation_km, "body": 301},  # 301 = Moon
        epochs={"start": start, "stop": stop, "step": step},
    )
    eph = obj.ephemerides(quantities="4,20")  # 4 = az/el, 20 = range
    return (np.array(eph["datetime_jd"], dtype=float),
            np.array(eph["AZ"], dtype=float),     # deg from north, clockwise
            np.array(eph["EL"], dtype=float),     # deg above local horizontal
            np.array(eph["delta"], dtype=float))  # AU


def power_per_area(el, az, delta, efficiency, orientation,
                   array_az=0.0, horizon_az=None, horizon_el=None):
    """Electrical power (W) per m^2 of solar cell at each timestep."""
    el_r = np.radians(el)
    if orientation == "horizontal":
        cos_inc = np.sin(el_r)
    elif orientation == "vertical":
        cos_inc = np.cos(el_r) * np.cos(np.radians(az - array_az))
    elif orientation == "tracking":
        cos_inc = np.ones_like(el)
    else:
        raise ValueError(f"Unknown orientation: {orientation}")
    cos_inc = np.clip(cos_inc, 0.0, None)

    # Sunlit = Sun above terrain horizon (or above 0 deg if no mask supplied)
    if horizon_az is not None:
        mask_el = np.interp(az, horizon_az, horizon_el, period=360)
    else:
        mask_el = 0.0
    sunlit = el > mask_el

    return (S0 / delta**2) * efficiency * cos_inc * sunlit


def summarise(jd, p):
    dt_h = float(np.median(np.diff(jd))) * 24.0
    producing = p > 0
    longest, run = 0, 0
    for lit in producing:
        run = 0 if lit else run + 1
        longest = max(longest, run)
    return {
        "pct_time_producing": round(100 * producing.mean(), 2),
        "mean_W_per_m2": round(float(p.mean()), 3),
        "peak_W_per_m2": round(float(p.max()), 3),
        "energy_Wh_per_m2": round(float(p.sum() * dt_h), 1),
        "longest_night_h": round(longest * dt_h, 1),
    }


def analyse_sites(sites, start, stop, step, efficiency_percent,
                  orientation, array_az, mast_km, pause_s=1.0):
    """Run every site; a failure on one site never stops the rest."""
    validate_dates(start, stop, step)
    eff = parse_efficiency(efficiency_percent)
    results = []
    print(sites)
    for i, (lat, lon) in enumerate(sites):
        row = {"site": i, "lat": lat, "lon": lon}
        try:
            jd, az, el, d = sun_geometry(lat, lon, start, stop, step, mast_km)
            p = power_per_area(el, az, d, eff, orientation, array_az)
            row.update(summarise(jd, p))
        except Exception as exc:  # network, bad coords, Horizons errors
            row["error"] = str(exc)
        results.append(row)
        systime.sleep(pause_s)  # be polite to the Horizons server
    return results


def save_csv(results, path="site_power.csv"):
    keys = sorted({k for r in results for k in r},
                  key=lambda k: (k not in ("site", "lat", "lon"), k))
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=keys)
        w.writeheader()
        w.writerows(results)


if __name__ == "__main__":
    out = analyse_sites(SITES, START_DATE, END_DATE, STEP,
                        EFFICIENCY_PERCENT, ORIENTATION,
                        ARRAY_AZIMUTH_DEG, MAST_HEIGHT_KM)
    for r in out:
        print(r)
    save_csv(out)