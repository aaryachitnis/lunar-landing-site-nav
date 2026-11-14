# Lunar Landing Site Navigator

A tool for **rapidly evaluating and comparing lunar landing sites**: where the Sun and Earth are in the sky at a site on a given date, how long until sunset / Earthset, how much solar power is available, and how often direct-to-Earth communication is possible. The focus is the **lunar south pole**, where most upcoming missions are headed.

This README is the entry point for anyone — teammate, reviewer, or LLM — picking up the project. It covers the problem, what exists today, how the pieces fit, the conventions, and what is still open.

| Read next | For |
|---|---|
| [frontend/README.md](frontend/README.md) | The React + three.js dashboard: architecture, files, conventions, how to extend |
| [backend/README.md](backend/README.md) | What the Python side must produce and how it plugs in |
| [frontend/src/data/SCHEMA.md](frontend/src/data/SCHEMA.md) | **The data contract** between backend and frontend (exact JSON shapes) |

---

## 1. The problem (challenge brief, summarised)

NASA's Commercial Lunar Payload Services (CLPS) program and other lunar missions must pick landing **sites and dates** that satisfy both science and engineering teams. Two environmental factors dominate:

- **Sun position** → power from solar arrays and thermal conditions.
- **Earth position** → whether direct-to-Earth communication is possible without a relay satellite.

At the **south pole** these vary wildly: the Sun skims the horizon (elevation of a few degrees at most), so local terrain (crater rims, massifs) decides whether a spot is lit; Earth hovers near the horizon and bobs above/below it with libration. Small changes in location or date can flip a site from viable to unusable.

Mission schedules slip (hardware delays, launch changes), so planners repeatedly need to **re-evaluate alternative sites near the original, or alternative dates at the same site, quickly**. Existing tools (NASA Quickmap, Moon Trek, JPL Horizons) are powerful but built for detailed analysis and are hard for non-specialists to use for fast scenario comparison.

### Objectives the brief suggests (not all required)

1. **Site selection & comparison** — curated list (Apollo, CLPS targets, commercial, other nations' landers) plus custom coordinates; side-by-side or sequential comparison.
2. **Date/time flexibility** — pick a landing date/time; explore change across lunar days and seasons.
3. **Sun & Earth position visualisation** — relative to the local horizon; time remaining to sunset / Earthset.
4. **Power & communication metrics** — solar elevation, sunlight duration, Earth visibility windows.
5. **Multiple visualisations** — 2D maps, 3D surfaces, other creative views.
6. **Temporal dynamics** — animations/timelines over a lunar day or multiple days.
7. **Accessibility across skill levels** — useful to mission planners *and* educators / the public.

---

## 2. Repository layout

```
lunar-landing-site-nav/
├── README.md              ← you are here (project-wide context)
├── frontend/              ← React 19 + Vite + three.js dashboard
│   ├── README.md          ← frontend architecture & conventions
│   ├── scripts/fetch-textures.mjs   ← downloads NASA maps, builds textures + elevation grid
│   ├── public/textures/   ← generated (git-ignored)
│   └── src/
│       ├── data/api.js    ← the single data entry point (mock today, backend later)
│       ├── data/SCHEMA.md ← data contract
│       └── …
└── backend/               ← Python scripts (to be written)
    └── README.md          ← backend responsibilities & integration plan
```

---

## 3. Quick start

Requirements: Node.js 18+ (developed on Node 22+), npm, internet access on first run.

```bash
cd frontend
npm install
npm run dev          # first run downloads ~80 MB from NASA and generates textures (~30 s)
# open http://localhost:5173
```

Useful URLs:

- `http://localhost:5173/` — globe, no site selected
- `http://localhost:5173/?site=shackleton-rim&t=2026-11-14T12:00:00.000Z` — site + time selected
- `http://localhost:5173/?site=custom_-89.3_45` — custom coordinates (lat −89.3°, lon 45°E)

Production build: `npm run build && npm run preview`.

---

## 5. How it works (end to end)

```
NASA SVS CGI Moon Kit (public domain)
  ├─ lroc_color_poles_4k.tif  (LRO LROC colour mosaic)
  └─ ldem_16.tif              (LRO LOLA elevation, float km, 16 px/deg ≈ 1.9 km/px)
        │  frontend/scripts/fetch-textures.mjs  (Node + sharp + geotiff)
        ▼
frontend/public/textures/
  moon_color.jpg   moon_normal.png   moon_disp.png   moon_elev_i16.bin   moon_meta.json
        │
        ├─► Globe (three.js): colour + normal map on a 1024×512 sphere, one hard "Sun" light
        │
        └─► data/elevation.js: Int16 elevation grid (lazy, ~33 MB) for
              • site elevation & slope
              • 80×80 km terrain patch (bird's-eye mesh)
              • terrain horizon profile (used by the mock metrics)

Components ─► hooks ─► data/api.js ─► mock/ (today)   │   Python backend output (later)
```

### The mock metrics model (`frontend/src/data/mock/metrics.js`)

A stand-in until the backend exists. Per site and selected time it produces an hourly series from −3 to +27 days:

- **Sun direction:** subsolar longitude from the synodic phase (29.53 d; reference new moon 2000-01-06 18:14 UTC), subsolar latitude ±1.54° over the draconic year.
- **Earth direction:** sub-Earth point wobbles with optical libration (±7.9° longitude over the anomalistic month, ±6.7° latitude over the draconic month).
- **Terrain horizon:** ray-marched every 2° of azimuth out to 150 km over the real LOLA grid, including lunar curvature and a 2 m mast height.
- **Visibility:** fraction of the solar disk (0.266° radius) or Earth disk (0.95°) above the terrain horizon.
- **Power:** 1361 W/m² × 2 m² × 30 % efficiency × visible solar fraction (two-axis sun-tracking panel assumed).
- **Derived:** current Sun/Earth elevation & azimuth, time to next sunset/sunrise and Earthset/Earthrise, % time sunlit / Earth-visible, mean power, energy, longest darkness.

Known simplifications: no true ephemeris, no Earth–Moon distance or parallax, coarse 1.9 km terrain (real polar horizons need ~5–20 m/px data), Earth considered "visible" at > 50 % disk.

---

## 6. Conventions (shared by frontend and backend)

- **Latitude** −90…+90 (south negative). **Longitude** −180…+180, **east-positive**. Planetocentric.
- **Azimuth** degrees clockwise from local north (0 = N, 90 = E).
- **Elevation** degrees above the astronomical horizon. Fields named `…AboveHorizon` are relative to the **local terrain horizon** (> 0 means visible).
- **Time** ISO 8601 UTC strings in the API; epoch milliseconds (`t`) inside series.
- **Lengths:** elevation in metres (relative to the 1737.4 km reference sphere), distances in km.
- **Moon radius:** 1737.4 km.
- Sites very near a pole are clamped to ±89.99° for local-frame maths (north is undefined at the pole itself).

---

## 7. Key decisions so far (and why)

| Decision | Reason |
|---|---|
| Monorepo: `frontend/` (React) + `backend/` (Python) | Team split: frontend team builds UI; another group writes Python analysis scripts. |
| React + Vite, three.js used **imperatively** (no react-three-fiber) | UI will grow (multiple feature routes, panels). Kept the original three.js scene code as a class. |
| The God's-eye globe is the **home route**; other features become sibling routes | Dashboard will have more features; a route registry (`frontend/src/routes.jsx`) builds both nav and routes. |
| Real NASA LRO data (LROC colour, LOLA elevation) | Real crater positions; real terrain drives elevation, slope and horizons. |
| Globe look is **fixed**, not user-adjustable: Sun azimuth 60°, elevation 5°, intensity 3.2, exposure 1.0, relief ×0 (smooth sphere; detail from normal map, strength 1.55), ACES filmic tone mapping, **no ambient light** | Chosen by the team; values live in `frontend/src/scene/config.js`. |
| Optional **"Let there be light"** toggle (`useLetThereBeLight` hook) adds a fill light opposite the Sun to illuminate the globe's night side; off by default | Lets users see terrain on the unlit hemisphere (e.g. far-side sites) without changing the default fixed look. Visual only; metrics are unaffected. |
| All data goes through `frontend/src/data/api.js`; shapes in `SCHEMA.md` | Backend swap changes one file. |
| Selected site + time stored in the URL (`?site=…&t=…`) | Shareable views; back/forward works. |
| Charts: no dual axes; power and elevation are two stacked charts with synced hover; daily table for accessibility | Follows the team's data-viz rules. |
| Terrain patches sampled on a local tangent plane (azimuthal), not a lat/lon box | Lat/lon boxes collapse near the pole. |

---

## 8. Open questions / next steps

None of these are decided; listed so the next person knows where the edges are.

- **Backend integration shape:** static JSON files generated by Python scripts vs a small HTTP API (e.g. FastAPI). Either fits `api.js`. See [backend/README.md](backend/README.md).
- **Real ephemeris:** SPICE (via `spiceypy`) or JPL Horizons for Sun/Earth directions from each site.
- **Higher-resolution polar terrain:** LOLA polar DEMs (tens of metres/pixel) for accurate horizons and terrain patches; the frontend can render any `TerrainPatch` the backend sends.
- **Real site list:** replace `frontend/src/data/mock/sites.js` (coordinates there are approximate; four polar sites were nudged onto nearby well-lit high ground in the 1.9 km data).
- **Comparison view:** side-by-side metrics for several sites/dates (natural next feature route).
- **Animation:** scrubbing time and moving the globe's Sun accordingly (currently the globe's Sun is fixed by design).
- **Bundle/data size:** the elevation grid is 33 MB and the normal map 20 MB — fine locally, worth optimising before hosting.

---

## 9. Data credits

Imagery and elevation: NASA Scientific Visualization Studio, *CGI Moon Kit* (https://svs.gsfc.nasa.gov/4720), from Lunar Reconnaissance Orbiter LROC and LOLA. Public domain.
