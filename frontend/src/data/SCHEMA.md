# Frontend data contract

The frontend reads all data through [`api.js`](api.js). Everything is currently **mocked**
in [`mock/`](mock/). The backend (Python) should produce data in these shapes; then each
function in `api.js` becomes a `fetch()` with the same return value.

Conventions: angles in degrees; latitude −90…90 (south negative); longitude −180…180
(east positive); times ISO 8601 UTC; azimuth clockwise from local north; elevation above
the astronomical horizon unless the field says `AboveHorizon` (relative to the local terrain horizon).

## `getSites() → Site[]`

```json
{
  "id": "shackleton-rim",
  "name": "Shackleton Rim",
  "lat": -89.85,
  "lon": 160.0,
  "category": "artemis-candidate | clps | international | apollo",
  "agency": "NASA",
  "notes": "free text",
  "mock": true
}
```

## `getSiteMetrics(site, dateISO) → SiteMetrics`

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
    "hoursToSunrise": 410,           // hours to the next sunrise; null if not within window
    "hoursToSunset": 52,             // hours to the next sunset; null if not within window
    "hoursToEarthrise": 300,         // hours to the next Earthrise; null if not within window
    "hoursToEarthset": 130           // hours to the next Earthset; null if not within window
  },
  "window": {
    "days": 27,
    "illuminatedFraction": 0.82,
    "earthVisibleFraction": 0.55,
    "meanPowerW": 640,
    "energyKWh": 414,
    "longestDarknessH": 61
  },
  "horizon": [{ "azimuth": 0, "elevation": 1.4 }],          // terrain horizon profile (0.5° steps; same as HorizonTerrain.horizon)
  "series": [{                                              // hourly, from selected −3 d to +27 d
    "t": 1794657600000, "hoursFromSelected": -72,
    "sunElevation": 1.1, "sunAzimuth": 120, "sunAboveHorizon": -0.2,
    "earthElevation": 3.9, "earthAzimuth": 1.8, "earthAboveHorizon": 3.1,
    "illumination": 0.0, "earthVisible": true, "powerW": 0
  }]
}
```

## `getTerrainPatch(lat, lon, { sizeKm, n }) → TerrainPatch`

Square patch centred on the site, on a local tangent-plane grid (row 0 = north edge,
column 0 = west edge). `heights` is row-major, metres relative to the 1737.4 km sphere.

```json
{
  "sizeKm": 80, "n": 64, "spacingM": 1270,
  "heights": "Float32Array(n*n) — JSON: number[]",
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

First-person terrain for the Horizon View (`/horizon`) plus the **terrain horizon**. This one
horizon drives *both* the Horizon View and `getSiteMetrics` (`sunAboveHorizon`, `illumination`,
`powerW`, `earthVisible`), so the 3D view and the dashboard numbers always agree. A backend that
returns metrics should use the same horizon (or also return it here).

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
