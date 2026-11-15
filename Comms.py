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


