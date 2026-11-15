# Frontend

React 19 + Vite + three.js. For the project overview and conventions, see the [root README](../README.md).

## Run

Start the backend first (see [backend/README.md](../backend/README.md)), then:

```bash
npm install
npm run dev          # http://localhost:5173
npm run dev:phone    # HTTPS on your local network, for testing on a phone
npm run build        # production build in dist/
npm run preview      # serve the build on http://localhost:4173
npm run textures     # rebuild public/textures/ from NASA maps
npm run terrain      # rebuild public/terrain/ site packs (needs textures)
```

`dev` and `build` generate textures and terrain first if they are missing. The first run downloads about 80 MB of global maps and 300 MB of polar terrain into `scripts/.cache/`. Generated files are git-ignored.

### Environment variables

| Variable | Default | Use |
|---|---|---|
| `VITE_API_BASE` | `/api` | Backend URL in production builds, e.g. `https://api.example.com` |
| `BACKEND_URL` | `http://127.0.0.1:8000` | Where the dev and preview servers forward `/api` |
| `VITE_DATA_BASE` | `/` | Serve `textures/` and `terrain/` from a CDN |

### Testing on a phone

Run `npm run dev:phone` and open the `https://` Network URL on a phone on the same Wi-Fi. Accept the certificate warning once (Advanced → Proceed). Motion sensors only work over HTTPS. On Windows, allow Node through the firewall on private networks.

## Features

### Landing Sites (`/`)

- **Globe:** the Moon in NASA imagery, with a marker per site. Orbit and zoom; selecting a site flies the camera to it.
- **Let there be light:** lights the globe's night side. Visual only, off by default, remembered per browser.
- **Site list** (left): sites from the backend, grouped by category, with search.
- **Site panel** (right):
  1. Name, category and a link to stand at the site in Lunarium.
  2. Location: coordinates, elevation, slope and roughness.
  3. Bird's-eye 3D terrain, 80 × 80 km.
  4. Time picker.
  5. **Solar power (live):** power now, energy, mean power, and a 30-day chart with a daily table. Power is per m² for a flat panel, from JPL Horizons via the backend. The first request for a site takes a few seconds.
  6. **Sun & Earth (mock):** altitudes, visibility, time to sunset/sunrise and Earthset/Earthrise, percentage sunlit and longest darkness.

### Lunarium (`/lunarium`)

A first-person view at the site, 2 m above the ground. It runs entirely on the mock Sun/Earth model and real terrain.

- Real terrain out to the horizon. Five polar sites use NASA 5 m data within 8 km; everywhere else uses the 1.9 km global grid. Craters and rocks near the viewer are generated and cosmetic.
- Look around by dragging, or turn on **Motion** to use the phone's sensors. Pinch or scroll to zoom.
- Sun and Earth cards show visibility, time to set or rise, and a **Follow** button. Arrows at the screen edge point to off-screen bodies.
- The time bar covers 12 hours before to 3 days after the selected time, with play, scrub and jump-to-next-event.
- On phones the HUD is compact, and the Sun and Earth are drawn larger than true size so they are easy to find. Labels still use true sizes.
- Debug: `?stats` shows frame rate; `?yaw=…&pitch=…` sets the starting view.

### Navigation

Tabs come from `src/routes.jsx`. Switching tabs keeps `?site=` and `?t=`. On phones the tabs fold into a ☰ menu, and on Lunarium only a floating ☰ button is shown. Old `/horizon` links redirect to `/lunarium`.

| URL param | Meaning |
|---|---|
| `site` | Site id: a backend id such as `site-3`, or a Lunarium id such as `shackleton-rim` |
| `t` | Selected time, ISO 8601 UTC. Defaults to the current hour. |

## Architecture

```
main.jsx → App.jsx → AppLayout (nav + <Outlet/>) → pages from routes.jsx

GlobePage                         HorizonPage (Lunarium)
├─ MoonView → scene/MoonScene     ├─ scene/HorizonScene (+ sunVisibility.worker)
├─ SiteList                       ├─ horizonModel.js
└─ SitePanel                      └─ TimeBar
   ├─ TerrainView
   ├─ PowerTiles, PowerChart  ← live
   └─ SkyTiles                ← mock

hooks (useSites, useSitePower, useSkyModel, useTerrainPatch) → data/api.js
  ├─ data/backend.js    fetch to the FastAPI backend
  ├─ data/mock/         Sun/Earth model and Lunarium's site list
  └─ data/elevation.js, terrainPatch.js, horizonTerrain.js   NASA terrain
```

Rules:

- Components get data from hooks, and hooks call `data/api.js`. Nothing else fetches.
- three.js is imperative. React owns the container; each scene class owns its WebGL context and is fully disposed on unmount.
- `hooks/useAsync.js` returns `{ data, error, loading }` and ignores stale responses.

## Data layer

| Function | Returns | Source |
|---|---|---|
| `getSites()` | `Site[]` | Backend `GET /sites`, named by `siteCatalog.js` |
| `getSitePower(site, t)` | `SitePower` | Backend `GET /sites/{id}/metrics` |
| `getSkyModel(site, t)` | `SkyModel` | Mock model in `mock/metrics.js` |
| `getLunariumSites()`, `getLunariumSite(id)` | `Site[]`, `Site` | `mock/sites.js`; `getLunariumSite` also accepts backend ids |
| `getTerrainPatch(lat, lon, opts)` | `TerrainPatch` | Global elevation grid |
| `getHorizonTerrain(site)`, `getSiteHorizon(site)` | `HorizonTerrain`, horizon | Prebuilt site pack, else built from the grid |

Shapes are in [src/data/SCHEMA.md](src/data/SCHEMA.md). Backend errors (not running, Horizons down) show as a message in the panel section that needs the data.

## File map

```
scripts/
  fetch-textures.mjs        NASA maps → public/textures/
  fetch-site-terrain.mjs    per-site terrain packs → public/terrain/
src/
  routes.jsx                tab registry: { path, label, element, index?, immersive? }
  layouts/AppLayout.*       header, tabs, phone menu
  pages/GlobePage/          Landing Sites
  pages/HorizonPage/        Lunarium
  components/               MoonView, SiteList, SitePanel, TerrainView, MetricTiles,
                            PowerChart, TimePicker, LightToggle, MissionClock
  hooks/                    data hooks, URL state, scene lifecycles
  scene/                    MoonScene, HorizonScene, fixed globe config
  data/                     api.js, backend.js, siteCatalog.js, terrain code, mock/
  utils/                    coordinates, formatting, time
  styles/global.css         design tokens (dark theme)
```

## The globe

`src/scene/config.js` holds the look the team fixed: Sun at azimuth 60°, elevation 5°, intensity 3.2, no ambient light, ACES filmic tone mapping, normal-map strength 1.55, no relief. The globe's Sun is decorative and does not follow the selected date.

Coordinate mapping, in case you touch markers or textures:

- NASA maps are equirectangular: column 0 at 180°W, row 0 at 90°N.
- The sphere is rotated `rotation.y = -π/2` so longitude 0° faces the default camera.
- Mesh-local position: `x = cosφ·cosλ, y = sinφ, z = -cosφ·sinλ` (`utils/coords.js`).

## Adding a tab

1. Create `src/pages/MyFeature/MyFeature.jsx`.
2. Add `{ path: '/my-feature', label: 'My feature', element: <MyFeature /> }` to `src/routes.jsx`. Add `immersive: true` for a full-screen view.
3. Get data through a hook that calls `data/api.js`, and document new shapes in `SCHEMA.md`.

## Styling

- Plain CSS, one file per component; tokens in `src/styles/global.css`. Dark theme only.
- Category colours `--cat-1` to `--cat-5` are a colour-blind-safe set. Status colours always come with an icon and a label.
- Charts: no dual y-axes, 2 px lines, and a table next to every chart.
- `.tag-mock` marks anything still mocked.

## Checking changes

There is no automated test suite yet.

```bash
npm run build      # must pass
npm run preview    # with the backend running, then open:
```

- `/?site=site-3&t=2026-11-14T12:00:00.000Z`: Apollo 11. Live power loads after a few seconds; the Sun is below the horizon.
- `/?site=site-8`: an unnamed south-pole site, shown as "Site 8".
- `/lunarium?site=shackleton-rim`: first-person view on 5 m terrain.

Headless screenshots: `chrome --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --virtual-time-budget=30000 --screenshot=out.png <url>`.

## Known limitations

- Live power ignores terrain shadowing; the mock Sun/Earth model includes it. Near the poles they can disagree.
- The Sun/Earth model is geometric, not ephemeris-grade.
- The 33 MB elevation grid loads the first time a site panel opens.
- The JS bundle is about 1.3 MB; code-splitting hasn't been done.
