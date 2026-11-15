"""Curated lunar landing sites and their metadata.

Coordinates are planetocentric degrees in (latitude, longitude) order.
"""

import re
from typing import Final

SiteCoordinates = tuple[float, float]
SiteRecord = tuple[str, str, SiteCoordinates, str, str]
_LEGACY_SITE_ID_PATTERN = re.compile(r"site-([1-9]\d*)\Z")

# Each record is (id, name, (latitude, longitude), description, agency).

SITES: Final[tuple[SiteRecord, ...]] = (
    ("orig1", "Artemis 3 (Amundsen)", (-84.2287, 69.44396), "Proposed lunar south polar landing region near Amundsen crater. Offers access to ancient highland terrain and nearby permanently shadowed regions of scientific interest.", "NASA"),
    ("orig2", "Apollo 17 (Taurus-Littrow)", (20.19032, 30.77314), "Final Apollo lunar landing site, situated in the Taurus-Littrow valley between mountainous highlands and volcanic mare terrain. Selected to investigate highland materials and volcanic deposits.", "NASA"),
    ("orig3", "Apollo 11 (Mare Tranquillitatis)", (0.67138, 23.47398), "Historic first crewed lunar landing site, located within Mare Tranquillitatis. A relatively smooth mare basalt plain selected to demonstrate the feasibility of a crewed lunar landing.", "NASA"),
    ("orig4", "Apollo 14 (Fra Mauro)", (-3.6452, -17.4715), "Located in the Fra Mauro highlands, containing material associated with the Imbrium impact basin. Selected to investigate lunar crustal materials and impact ejecta.", "NASA"),
    ("orig5", "Apollo 15 (Hadley-Apennine)", (26.13214, 3.6338), "Located near Hadley Rille and the Apennine Mountains, providing access to mountainous highland terrain, volcanic plains and a prominent lunar geological rille.", "NASA"),
    ("orig6", "Apollo 12 (Oceanus Procellarum)", (-3.01234, -23.42159), "Located in Oceanus Procellarum (Ocean of Storms), a large lunar mare region. Selected to investigate mare basalt deposits and demonstrate precision landing capabilities.", "NASA"),
    ("orig7", "Apollo 16 (Descartes Highlands)", (-8.99123, 15.51441), "Located in the Descartes Highlands, an elevated lunar region investigated for ancient crustal materials and geological history, including highland rocks and impact-related deposits.", "NASA"),
    ("orig8", "Faustini Rim A", (-87.90019, 89.69908), "Proposed lunar south polar landing region near the rim of Faustini crater. Offers access to polar highland terrain and proximity to permanently shadowed regions that may contain water ice.", "NASA"),
    ("orig9", "Haworth", (-86.77509, -23.13639), "Lunar south polar region associated with Haworth crater. Offers opportunities to investigate ancient highland terrain and potentially volatile-bearing permanently shadowed regions.", "NASA"),
)


def find_site_record(site_id: str) -> SiteRecord | None:
    """Find a site by canonical ID or its previous position-based ID."""
    for site in SITES:
        if site[0] == site_id:
            return site

    match = _LEGACY_SITE_ID_PATTERN.fullmatch(site_id)
    if match is None:
        return None

    index = int(match.group(1)) - 1
    return SITES[index] if index < len(SITES) else None