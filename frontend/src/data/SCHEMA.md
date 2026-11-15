# Frontend data contract

Components and hooks read data only through [`api.js`](api.js). Each function's return shape
is below.

| Function | Source |
|---|---|
| `getSites()` | **Live:** backend `GET /sites`, plus display names |
| `getSitePower(site, dateISO)` | **Live:** backend `GET /sites/{id}/metrics` (JPL Horizons), including nearest sunrise/sunset from `dateISO` |
| `getSkyModel(site, dateISO)` | **Modeled:** geometric model in [`mock/metrics.js`](mock/metrics.js) |
| `getLunariumSites()` | **Mock:** Lunarium's site list in [`mock/sites.js`](mock/sites.js) |
| `getTerrainPatch`, `getHorizonTerrain`, `getSiteHorizon` | NASA LOLA elevation data, processed in the browser |
| `calculatePotential(params)` | Playground. **Live** backend metrics for saved sites and custom coordinates; mock only if the backend request fails. Terrain from LOLA |
| `addSite({ name, lat, lon })` | **Live:** explicitly adds a custom location to the backend JSON catalog |

Conventions: angles in degrees; latitude -90 to 90 (south negative); longitude -180 to 180 (east
positive); times ISO 8601 UTC; azimuth clockwise from local north. Elevation is above the
astronomical horizon unless the field says `AboveHorizon` (relative to the local terrain horizon).

## `getSites() → Site[]`

The backend returns `{ id, name, desc, agency, loc, lat, lon }`. [`siteCatalog.js`](siteCatalog.js)
reshapes each site for the UI:

```json
{
  "id": "orig2",
  "lat": 20.19032,
  "lon": 30.77314,
  "name": "Apollo 17",
  "region": "Taurus-Littrow",
  "fullName": "Apollo 17 (Taurus-Littrow)",
  "agency": "NASA",
  "description": "Final Apollo lunar landing site, situated in the Taurus-Littrow valley …",
  "category": "artemis-candidate | apollo | south-pole | other",
  "terrainId": "apollo-17",
  "legacyId": "site-2"
}
```

- `name` and `region` are split from the backend name "Mission (Region)". Names without brackets have no region.
- `category` comes from the name (Apollo, Artemis) or latitude (below 80°S is south pole).
- `terrainId` is set when a Lunarium terrain pack exists within 0.05° of the site. It also lets a
  Lunarium link (`?site=apollo-17`) select the same site on the Landing Sites tab.
- `legacyId` is the backend's old position-based id, so links shared before sites were named still work.

The backend reads `backend/data/sites.json` for each catalog lookup. New locations are added with
`POST /sites`; there is intentionally no delete endpoint. Saving is explicit and separate from
calculating metrics.

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
  "nearestSunriseUtc": "2026-11-15T18:24:00Z",
  "nearestSunsetUtc": "2026-11-16T04:12:00Z",
  "source": "JPL Horizons via backend"
}
```

The request includes `events_from=dateISO`, so the event times are the next crossings at or after
the selected time, even though the power-series window begins three days earlier. Both fields are
`null` when no event occurs before the end of the 27-day window.

## `getSkyModel(site, dateISO) → SkyModel` (modeled)

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
- In the Landing Sites panel, the time-to-sunrise/sunset tiles use `getSitePower`'s live event
  timestamps; Sun/Earth positions, visibility, Earth events, and illumination remain modeled locally.

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

## `calculatePotential(params) → PotentialResult` (Playground)

Params: `{ lat, lon, start, durationDays, step, panelAreaM2, tileKm }` (`step` is a Horizons step string:
`1hour`, `2hour`, `4hour`, `12hour` or `1day`).

Coordinates within 0.01° of a saved site use `GET /sites/{id}/metrics`; other coordinates use
`POST /sites/metrics` with latitude and longitude. Both return the backend's `PowerMetricsResponse`
unchanged in `engine.response`. If the live call fails, the mock is used and `engine.reason` says why.

```json
{
  "request": { "lat": 0.67138, "lon": 23.47398, "start": "2026-11-15T00:00:00.000Z", "end": "…",
               "durationDays": 30, "step": "4hour", "panelAreaM2": 2, "tileKm": 40 },
  "site": { "name": "Apollo 11", "backendId": "site-3", "lat": 0.67138, "lon": 23.47398,
            "nearSide": true, "region": "Mid/low latitude", "altitudeM": -1922 },
  "terrain": "TerrainPatch (see getTerrainPatch), sizeKm = tileKm, n = 128",
  "engine": {
    "dataSource": "live | mock",
    "reason": null,                       // why the mock was used, else null
    "source": "JPL Horizons via backend",
    "efficiency": 0.2,                    // backend setting, not in the response
    "times": [1794787200000],             // epoch ms per sample: start + i × step
    "response": {                         // backend PowerMetricsResponse, unchanged
      "site": { "id": "site-3", "lat": 0.67138, "lon": 23.47398 },
      "start": "2026-11-15T00:00:00Z", "end": "2026-12-15T00:00:00Z", "step": "4hour",
      "instantaneous_power_per_area_W_m2": [0.0],
      "daily_power_generated_per_area_kWh_per_m2_day": [0.0],
      "average_power_per_24h_W_m2": 85.3,
      "average_power_sunlit_days_W_m2": 150.5
    }
  }
}
```
