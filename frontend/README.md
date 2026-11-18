# Frontend

The web app at [lunarsky.select](https://lunarsky.select), built with React 19, Vite and three.js. For the project overview, see the [root README](../README.md).

## Features

### Landing Sites (`/`)

- **Globe:** the Moon in NASA LRO imagery, with a marker for each site. Orbit and zoom; selecting a site flies the camera to it. The star background was made with SI generation; the Moon model was not.
- **Let there be light:** an optional fill light for the globe's night side. Visual only.
- **Site list:** sites from the backend, grouped into Apollo, Artemis candidates, south pole and other, with search.
- **Site panel:**
  - Mission, region, agency and category, with the site's description and a link to stand at the site in Lunarium.
  - Location: coordinates, elevation, slope and roughness.
  - Bird's-eye 3D terrain, 80 × 80 km.
  - A UTC time picker covering 9999 BC to 9999 AD.
  - **Solar power:** power now, energy and mean power, with a 30-day chart and a daily table. Values are per m² for a flat panel, from JPL Horizons.
  - **Sun & Earth:** altitudes, visibility, time to sunrise/sunset and Earthrise/Earthset, percentage sunlit and longest darkness, from JPL Horizons.

### Lunarium (`/lunarium`)

A first-person view 2 m above the ground at a site, with the Sun and Earth over the real terrain horizon. Lunarium was made with SI generation.

- Real terrain out to the horizon. Five south-polar sites use NASA 5 m data for the nearest 8 km; elsewhere the 1.9 km global grid is used. Craters and rocks next to the viewer are cosmetic.
- Look around by dragging, or turn on **Motion** to use the phone's sensors. Pinch or scroll to zoom.
- Sun and Earth cards show visibility and time to set or rise, with a **Follow** button. Edge arrows point to bodies that are off screen.
- A time bar from 12 hours before to 3 days after the selected time, with play, scrub and jump to the next event.
- Distant ridges cast shadows on the terrain as the Sun moves.

### Playground (`/playground`)

Pick a saved site or enter any latitude and longitude, choose an analysis window, a solar array area and a terrain tile size, then click **Calculate potential**:

- **Landing site info:** coordinates, hemisphere, region and altitude.
- **Terrain mapping:** a 2D shaded-relief map with a scale bar, legend and hover readout.
- **Processing engine:** power per m² and for the whole panel area, energy over the window, peak power, sunlit share and longest darkness.

Results are live from the backend. If it can't be reached, a clearly labelled mock result is shown instead. A promising location can be added to the site catalogue.

### Guide (`/guide`) and app tour

- **Guide:** explains why landing is a timing problem (Sun, Earth, power) and has a reference for every metric.
- **Tours:** step-by-step walkthroughs of the Landing Sites page and of Lunarium. Each runs once per browser (Landing Sites skips it when opened from a `?site=` link), and either can be replayed with `?tour=1`, e.g. `/?tour=1` or `/lunarium?tour=1`. Steps live in `components/Tour/tourSteps.js` and point at elements marked `data-tour="…"`. Seen flags are kept in `localStorage` (`lsn:tour-done`, `lsn:lunarium-tour-done`).
- **Metric hints:** the ⓘ next to each figure in the site panel and Playground shows the same text as the Guide. Both come from `data/metricDocs.js`, keyed by the site panel's label (Playground tiles pass `metric` when their label differs).

### Shareable links

Each view keeps its state in the URL, and switching tabs carries the site and time across.

| Parameter | Meaning |
|---|---|
| `site` | Site id, e.g. `orig3` (Apollo 11) or a Lunarium id such as `shackleton-rim` |
| `t` | Selected time, ISO 8601 UTC. Defaults to the current hour. |
| `tour` | `1` starts that page's tour (Landing Sites, Lunarium). Removed from the URL once read. |

Examples: [`/?site=orig3`](https://lunarsky.select/?site=orig3), [`/lunarium?site=shackleton-rim`](https://lunarsky.select/lunarium?site=shackleton-rim).

## Architecture

```
AppLayout (nav) → pages from routes.jsx

GlobePage                          HorizonPage (Lunarium)          PlaygroundPage
├─ MoonView → scene/MoonScene      ├─ scene/HorizonScene           ├─ PotentialForm
├─ SiteList                        │   └─ sunVisibility.worker     ├─ TerrainMap2D
└─ SitePanel                       ├─ horizonModel.js              └─ EngineResults
   ├─ TerrainView                  └─ TimeBar
   ├─ PowerTiles, PowerChart
   └─ SkyTiles

hooks → data/api.js
  ├─ data/backend.js                                  FastAPI backend
  ├─ data/elevation.js, terrainPatch.js, horizonTerrain.js   NASA LOLA terrain
  └─ data/mock/                                       Lunarium's Sun/Earth model, offline fallback
```

- Components get data from hooks, and hooks call `data/api.js`. Nothing else fetches, so swapping a data source changes one function.
- The three.js scenes are plain classes that React mounts. Each owns its WebGL context and is disposed on unmount.
- Return shapes are documented in [src/data/SCHEMA.md](src/data/SCHEMA.md).

## Run locally

Start the backend first (see [backend/README.md](../backend/README.md)), then:

```bash
npm install
npm run dev          # http://localhost:5173
npm run dev:phone    # HTTPS on your local network, for phones
npm run build        # production build in dist/
npm run preview      # serve the build on http://localhost:4173
npm test             # unit tests
```

`dev` and `build` generate textures and terrain first if they're missing. The first run downloads about 80 MB of global maps and 300 MB of polar terrain into `scripts/.cache/`. To rebuild them, run `npm run textures` or `npm run terrain`.

**On a phone:** run `npm run dev:phone` and open the `https://` Network URL on a phone on the same Wi-Fi. Accept the certificate warning once. Motion sensors only work over HTTPS. On Windows, allow Node through the firewall on private networks.

| Environment variable | Default | Use |
|---|---|---|
| `VITE_API_BASE` | `/api` | Backend URL for production builds |
| `BACKEND_URL` | `http://127.0.0.1:8000` | Where the dev and preview servers forward `/api` |
| `VITE_DATA_BASE` | `/` | Serve `textures/` and `terrain/` from a CDN |

## Deployment

The app is static files on Netlify. `public/_redirects` forwards `/api/*` to the backend on Render and sends every other path to the app.

## Limitations

- Live power and visibility ignore terrain shadowing, while Lunarium includes it, so near the poles they can disagree.
- Lunarium's Sun and Earth motion comes from a geometric model, not ephemerides.
- The 33 MB global elevation grid loads the first time a site panel opens.
