# Frontend data contract

Components and hooks read data only through [`api.js`](api.js). Each function's return shape
is below.

| Function | Source |
|---|---|
| `getSites()` | **Live:** backend `GET /sites`, plus display names |
| `getSitePower(site, dateISO)` | **Live:** backend `GET /sites/{id}/metrics` (JPL Horizons) |
| `getSkyModel(site, dateISO)` | **Mock:** geometric model in [`mock/metrics.js`](mock/metrics.js) |
| `getLunariumSites()` | **Mock:** Lunarium's site list in [`mock/sites.js`](mock/sites.js) |
| `getTerrainPatch`, `getHorizonTerrain`, `getSiteHorizon` | NASA LOLA elevation data, processed in the browser |

Conventions: angles in degrees; latitude -90 to 90 (south negative); longitude -180 to 180 (east
positive); times ISO 8601 UTC; azimuth clockwise from local north. Elevation is above the
astronomical horizon unless the field says `AboveHorizon` (relative to the local terrain horizon).

## `getSites() → Site[]`

The backend returns `{ id, lat, lon }`. [`siteCatalog.js`](siteCatalog.js) adds display fields by
matching coordinates against known landing sites (within 0.05°). Unmatched sites are named
"Site N".

```json
{
  "id": "site-3",
  "lat": 0.67138,
  "lon": 23.47398,
  "name": "Apollo 11",
  "category": "artemis-candidate | clps | international | apollo | south-pole | other",
  "agency": "NASA",
  "notes": "Mare Tranquillitatis (1969).",
  "terrainId": "apollo-11"
}
```

`terrainId` is set for matched sites. It names the prebuilt terrain pack, and lets a Lunarium
link (`?site=apollo-11`) select the same site on the Landing Sites tab.

## `getSitePower(site, dateISO) → SitePower`

Calls `GET /sites/{id}/metrics?start=…&end=…&step=2hour` for a window from 3 days before to 27
days after `dateISO`. Power is for a flat panel, per m², with no terrain shadowing. The backend
returns values only, so sample times are rebuilt from `start` and the step.

```json
{
  "site": { "id": "site-3", "lat": 0.67138, "lon": 23.47398 },
  "start": "2026-11-11T12:00:00Z",
  "end": "2026-12-11T12:00:00Z",
  "stepHours": 2,
  "series": [{ "t": 1794657600000, "hoursFromSelected": -72, "wPerM2": 0 }],
  "daily": [{ "day": -3, "kWhPerM2": 0 }],
  "nowWPerM2": 0,
  "totalKWhPerM2": 61.6,
  "avgWPerM2": 86,
  "avgSunlitDaysWPerM2": 160,
  "source": "JPL Horizons via backend"
}
```

## `getSkyModel(site, dateISO) → SkyModel` (mock)

```json
{
  "site": { "id": "...", "lat": -89.85, "lon": 160.0 },
  "selectedTime": "2026-11-14T12:00:00.000Z",
  "model": "mock-geometric-v1",
  "panel": { "areaM2": 2, "efficiency": 0.3, "tracking": "two-axis sun-tracking (assumed)" },
  "now": {
    "sunElevation": 1.2, "sunAzimuth": 210.5, "sunAboveHorizon": 0.8,
    "earthElevation": 4.1, "earthAzimuth": 2.3, "earthAboveHorizon": 3.6,
    "sunUp": true, "earthUp": true, "powerW": 816.6,
    "hoursToSunrise": 410, "hoursToSunset": 52,
    "hoursToEarthrise": 300, "hoursToEarthset": 130
  },
  "window": {
    "days": 27, "illuminatedFraction": 0.82, "earthVisibleFraction": 0.55,
    "meanPowerW": 640, "energyKWh": 414, "longestDarknessH": 61
  },
  "horizon": [{ "azimuth": 0, "elevation": 1.4 }],
  "series": [{
    "t": 1794657600000, "hoursFromSelected": -72,
    "sunElevation": 1.1, "sunAzimuth": 120, "sunAboveHorizon": -0.2,
    "earthElevation": 3.9, "earthAzimuth": 1.8, "earthAboveHorizon": 3.1,
    "illumination": 0.0, "earthVisible": true, "powerW": 0
  }]
}
```

- `hoursTo…` fields are `null` when the event is not within the window.
- `series` is hourly, from 3 days before to 27 days after the selected time.
- `powerW` is used only by Lunarium. The Landing Sites panel shows live power from `getSitePower`.

## `getTerrainPatch(lat, lon, { sizeKm, n }) → TerrainPatch`

Square patch centred on the site, on a local tangent-plane grid (row 0 = north edge,
column 0 = west edge). `heights` is row-major, metres relative to the 1737.4 km sphere.

```json
{
  "sizeKm": 80, "n": 64, "spacingM": 1270,
  "heights": "Float32Array(n*n)",
  "minM": -4200, "maxM": 1900, "meanM": -310,   // min / max / mean altitude over the whole patch
  "centerElevationM": 1450,
  "meanSlopeDeg": 4.2,                          // over the central area (centralKm)
  "roughnessM": 85,                             // RMS height deviation from best-fit plane, central area
  "centralKm": 19,                              // side of the central square used for slope + roughness
  "sourceResolutionM": 1895,               // 1895 for ldem_16, ~474 for ldem_64
  "source": "LOLA ldem_16 (bilinear)"
}
```

## `getHorizonTerrain(site) → HorizonTerrain` and `getSiteHorizon(site) → Horizon`

First-person terrain for Lunarium (`/lunarium`) plus the **terrain horizon**. The same horizon
feeds `getSkyModel`, so the 3D view and the Sun & Earth numbers always agree. If the backend
later provides Sun/Earth data, it should use the same horizon or return it.

Three square layers on a local east/north tangent plane centred on the site (row 0 = north edge,
column 0 = west edge, heights in metres relative to the 1737.4 km sphere):

| Layer | Size | Grid | Source |
|---|---|---|---|
| `near` | 2 km | 401² @ 5 m (5 m sites) · 201² @ 10 m (others) | NASA PGDA 5 m LOLA, else global grid |
| `mid` | 16 km | 641² @ 25 m · 321² @ 50 m | PGDA 5 m LOLA (holes filled, edges blended), else global grid |
| `far` | 300 km | 301² @ 1 km | global grid (`ldem_16`/`ldem_64`) |

```json
{
  "siteId": "malapert-massif",
  "source": "PGDA LOLA 5 m Site23 + LOLA ldem_16 (bilinear)",
  "hasFineData": true,
  "eyeHeightM": 2,                       // observer / panel mast height above the ground
  "groundM": 4993,                       // ground height at the site
  "horizon": { "stepDeg": 0.5, "eyeHeightM": 2, "elevation": [12.1, 12.0, "… 720 values (deg)"] },
  "layers": {
    "near": { "sizeM": 2000,   "n": 401, "spacingM": 5,    "heights": "Float32Array(n*n)" },
    "mid":  { "sizeM": 16000,  "n": 641, "spacingM": 25,   "heights": "Float32Array(n*n)" },
    "far":  { "sizeM": 300000, "n": 301, "spacingM": 1000, "heights": "Float32Array(n*n)" }
  }
}
```

**Site packs (static files).** Curated sites are precomputed by `scripts/fetch-site-terrain.mjs`
into `public/terrain/<siteId>/` (served at `${VITE_DATA_BASE}terrain/<siteId>/`):

- `meta.json`: everything above except `heights`, plus `version` and per layer `file`, `format`
  (`f32` = Float32 LE metres; `i16` = Int16 LE, `metres = value × scaleM + offsetM`).
  `getSiteHorizon` reads only this file (~5 KB).
- `near.f32`, `mid.i16`, `far.i16`: ~1.6 MB per 5 m site, ~0.55 MB otherwise.

Sites without a pack are built in the browser from the global grid (`horizonTerrain.js`).
