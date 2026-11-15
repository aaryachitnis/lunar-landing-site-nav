"""Curated lunar landing-site coordinates in (latitude, longitude) degrees.

The order is stable because the legacy API assigns site IDs from each site's
position in this catalog.
"""

from typing import Final

SiteCoordinates = tuple[float, float]

SITES: Final[tuple[SiteCoordinates, ...]] = (
    (-84.2287, 69.44396),
    (20.19032, 30.77314),
    (0.67138, 23.47398),
    (-3.6452, -17.4715),
    (26.13214, 3.6338),
    (-3.01234, -23.42159),
    (-8.99123, 15.51441),
    (-87.90019, 89.69908),
    (-86.77509, -23.13639),
)