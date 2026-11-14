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
  "category": "artemis-candidate | clps | international | apollo | custom",
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
    "hoursToSunTransition": 52,      // hours to sunset if sunUp, else to sunrise; null if not within window
    "hoursToEarthTransition": 130    // hours to Earthset if earthUp, else to Earthrise
  },
  "window": {
    "days": 27,
    "illuminatedFraction": 0.82,
    "earthVisibleFraction": 0.55,
    "meanPowerW": 640,
    "energyKWh": 414,
    "longestDarknessH": 61
  },
  "horizon": [{ "azimuth": 0, "elevation": 1.4 }],          // terrain horizon profile
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
  "minM": -4200, "maxM": 1900,
  "centerElevationM": 1450,
  "meanSlopeDeg": 4.2,
  "sourceResolutionM": 1895,
  "source": "LOLA ldem_16 (bilinear)"
}
```
