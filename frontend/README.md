# Frontend — Lunar Landing Site Navigator

React 19 + Vite + three.js dashboard. Project-wide context (the problem, conventions, decisions, roadmap) is in the [root README](../README.md); this file covers how the frontend is built and how to work on it.

## Run

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # production build → dist/
npm run preview      # serve the build on http://localhost:4173
npm run textures     # (re)generate public/textures/ from NASA source maps
```

`dev` and `build` automatically run `npm run textures --if-missing` first. The first run downloads ~80 MB into `scripts/.cache/` and takes ~30 s. Generated files are git-ignored.

## What the user sees

**Home route `/` — God's-eye view** (`src/pages/GlobePage/`)

- **Globe:** NASA-textured Moon on a black starfield. You can orbit and zoom; panning is off. Site markers are HTML elements projected onto the globe each frame, coloured by category and hidden when on the far side. Hover shows the name.
- **Site list (left, collapsible):** sites grouped by category, with search by name/agency and a custom lat/lon form.
- **Site panel (right)** opens on selecting a site. Esc or ✕ closes it.
  1. Name, category, agency, notes and a "Mock data" tag.
  2. Location: lat/lon in decimal and DMS, real elevation, mean slope over the central 20 km.
  3. Bird's-eye terrain: an 80 × 80 km patch, 64×64 vertices, 2× vertical exaggeration, lit from the current Sun azimuth. It has a mesh-wireframe toggle, auto-orbits until the user drags, and shows a north arrow and a site pin.
  4. Conditions: date/time picker with ±1 day buttons, plus tiles for:
     - Sun elevation, and time to sunset or sunrise
     - Earth elevation, and time to Earthset or Earthrise
     - % sunlit and % Earth-visible
     - mean power and energy
     - longest darkness
  5. Timeline from −3 to +27 days: a solar power chart and a Sun/Earth elevation-above-terrain-horizon chart with synced hover, plus a daily table.
- When a site is selected the camera flies to it. The globe's centre shifts so it sits in the space left free by the panels.

**`*`:** 404 page.

### URL state

| Param | Meaning |
|---|---|
| `site` | Site id, e.g. `shackleton-rim`, or `custom_<lat>_<lon>` such as `custom_-89.3_45` |
| `t` | Selected time (ISO 8601). If absent, defaults to the current hour. |

Links are shareable, and back/forward navigates between selections.

## Architecture

```
main.jsx ─ BrowserRouter ─ App.jsx ─ AppLayout (nav + <Outlet/>)
                                      └─ routes.jsx  → GlobePage (index route)
GlobePage
  ├─ MoonView ──── useMoonScene ──── scene/MoonScene.js (three.js, imperative)
  ├─ SiteList
  └─ SitePanel
       ├─ TerrainView (own small three.js renderer)
       ├─ MetricTiles
       └─ PowerChart (recharts)

hooks/useSites | useSiteMetrics | useTerrainPatch  ─►  data/api.js  ─►  data/mock/* + data/elevation.js
hooks/useSelectedSite  ─►  URL search params
```

Rules:

- **Components never import from `data/mock/` or fetch directly for site data or metrics.** They use hooks, and hooks call `data/api.js`. The one exception: `SITE_CATEGORIES`, `makeCustomSite` and `parseCustomSiteId` (UI metadata) are imported from `data/mock/sites.js`. Move them to a non-mock module when the real site list arrives.
- **three.js is imperative.** React owns the DOM container and marker elements; `MoonScene` owns WebGL and moves registered marker elements every frame. Every renderer is fully disposed on unmount (geometry, materials, context), so changing routes doesn't leak WebGL contexts. Globe textures are cached at module level, so returning to the globe is instant.
- **Async data** goes through `hooks/useAsync.js`, which returns `{ data, error, loading }` and ignores stale responses.

## File map

```
index.html                     mounts #root, loads src/main.jsx
vite.config.js                 React plugin
scripts/fetch-textures.mjs     NASA download + texture/elevation generation (Node)
public/textures/               generated, git-ignored
src/
  main.jsx                     React root, BrowserRouter, global CSS
  App.jsx                      <Routes> built from routes.jsx, plus 404
  routes.jsx                   ROUTE REGISTRY: { path, label, element, index? }
  layouts/AppLayout.jsx/.css   top nav bar (links from routes.jsx) + <Outlet/>
  pages/
    GlobePage/GlobePage.jsx    home feature: composes MoonView, SiteList, SitePanel; panel insets
    NotFoundPage.jsx
  components/
    MoonView/                  globe container + HTML markers + loading overlay
    SiteList/                  grouped list, search, custom coordinates form
    SitePanel/                 the right-hand panel (composition, time controls)
    TerrainView/               bird's-eye terrain mesh (three.js, OrbitControls)
    MetricTiles/               metric tiles with status indicators (icon + label, not colour alone)
    PowerChart/                recharts small multiples + daily table
  hooks/
    useAsync.js                generic async state
    useSites.js                → api.getSites()
    useSiteMetrics.js          → api.getSiteMetrics(site, dateISO)
    useTerrainPatch.js         → api.getTerrainPatch(lat, lon, { sizeKm, n })
    useMoonScene.js            creates/disposes MoonScene; exposes load status
    useSelectedSite.js         ?site= / ?t= URL state + actions
  scene/
    config.js                  FIXED globe look + camera constants (see below)
    MoonScene.js               renderer, camera, OrbitControls, Sun, stars, moon, markers, flyTo, setInsets
  data/
    api.js                     PUBLIC DATA INTERFACE (mock today)
    SCHEMA.md                  data contract for the backend
    elevation.js               lazy loader + bilinear sampler for moon_elev_i16.bin
    mock/sites.js              17 mock sites + categories + custom-site helpers
    mock/metrics.js            mock metrics model (see root README §5)
  utils/
    coords.js                  lat/lon ↔ vectors, ENU basis, elevation/azimuth, great-circle destination
    format.js                  lat/lon/DMS/duration/percent formatting, datetime-local helper
  styles/global.css            design tokens (dark theme), base styles
  assets/logo.svg
```

## The globe (fixed look)

`src/scene/config.js` holds values the team chose and fixed. They are deliberately not exposed in the UI:

| Constant | Value |
|---|---|
| Sun azimuth / elevation | 60° / 5° (world space, relative to the default camera) |
| Sun intensity | 3.2 (single `DirectionalLight`, **no ambient light**) |
| Tone mapping / exposure | `ACESFilmicToneMapping` / 1.0 |
| Relief exaggeration | 0 (smooth sphere; displacement map not applied) |
| Normal map strength | 1.55 |
| Sphere segments | 1024 × 512 |
| Default camera | looking at lat −35°, lon 0°, distance 4 (south pole in view) |
| Focus distance / fly duration | 2.0 / 1400 ms |

The globe's Sun is decorative. It does not follow the selected date; the panel's metrics do.

### Coordinate mapping (important if you touch markers or textures)

- The NASA maps are equirectangular, with column 0 at 180°W and row 0 at 90°N.
- `THREE.SphereGeometry` UVs line up with them, and the mesh is rotated `rotation.y = −π/2` so that longitude 0° faces +Z (the default camera).
- Mesh-local position of (lat φ, lon λ): `x = cosφ·cosλ, y = sinφ, z = −cosφ·sinλ` (`utils/coords.js → latLonToMeshLocal`).
- The metrics maths uses a separate moon-fixed frame (`latLonToVec`, with X towards 0°E on the equator and Z towards the north pole) and a local East/North/Up basis (`enuBasis`).
- Verified visually: Apollo 11 lands on Mare Tranquillitatis, Mare Crisium sits on the east limb, and Tycho is in the south.

## Texture pipeline (`scripts/fetch-textures.mjs`)

| Output | From | Notes |
|---|---|---|
| `moon_color.jpg` | `lroc_color_poles_4k.tif` | 4096×2048 sRGB |
| `moon_normal.png` | `ldem_16.tif` | Tangent-space normals computed from float elevation. The x-gradient is corrected by 1/cos(lat) for the equirectangular stretch. R = east, G = north (OpenGL). |
| `moon_disp.png` | `ldem_16.tif` | 8-bit normalised elevation (unused while relief = 0) |
| `moon_elev_i16.bin` | `ldem_16.tif` | 5760×2880 little-endian Int16 **metres**, ~33 MB |
| `moon_meta.json` | — | min/max elevation (−8.98 … +10.69 km), grid dims, layout |

Source: https://svs.gsfc.nasa.gov/4720 (public domain). Flags: `--if-missing` skips generation if all outputs already exist; `--force` re-downloads.

## Data layer

`src/data/api.js` is the only module the UI talks to for data:

| Function | Returns | Today |
|---|---|---|
| `getSites()` | `Site[]` | `mock/sites.js` |
| `getSite(id)` | `Site` | mock list, or parses a `custom_…` id |
| `getSiteMetrics(site, dateISO)` | `SiteMetrics` | `mock/metrics.js` over the real elevation grid |
| `getTerrainPatch(lat, lon, { sizeKm, n })` | `TerrainPatch` | sampled from the real elevation grid on a local tangent plane |

The shapes are documented in [src/data/SCHEMA.md](src/data/SCHEMA.md). **To connect the backend**, replace these function bodies with `fetch()` calls returning the same shapes. Nothing else should need to change. Note that `TerrainPatch.heights` is a `Float32Array` in the mock; a JSON `number[]` also works, because `TerrainView` only indexes into it.

Mock latency is simulated (~100 ms) so loading states are exercised.

## Adding a feature route

1. Create `src/pages/MyFeature/MyFeature.jsx` (plus a `.css` file if needed).
2. Add `{ path: '/my-feature', label: 'My feature', element: <MyFeature /> }` to `src/routes.jsx`. The nav link and route are generated from this entry.
3. Fetch data through a hook backed by `data/api.js`. Add new API functions there and document their shapes in `SCHEMA.md`.

## Styling and charts

- Plain CSS, one file per component, with tokens in `src/styles/global.css`. The theme is dark only.
- Category colours `--cat-1…5` are a validated colour-blind-safe categorical set (dark steps). Chart series use `--series-sun` (amber) and `--series-earth` (blue).
- Status colours (`--good`, `--critical`) are always paired with an icon and label.
- Chart rules: no dual y-axes (use separate stacked charts instead), thin 2 px lines, legends for multi-series charts, and a table view alongside the charts.

## Verifying changes

There is no automated test suite yet. The current checks:

```bash
npm run build                                   # must succeed
npm run preview                                 # then open the deep links below
```

- `/?site=shackleton-rim&t=2026-11-14T12:00:00.000Z`: elevation ≈ 1,500 m; the terrain mesh shows Shackleton crater beside the pin.
- `/?site=apollo-11&t=2026-11-20T12:00:00.000Z`: marker on Mare Tranquillitatis; Earth ≈ 70° up, visible 100 % of the time.
- `/?site=change-4`: far side, so Earth visibility is 0 %.
- `/does-not-exist`: the 404 page.

Headless screenshots work with Chrome: `--headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --virtual-time-budget=30000 --screenshot=out.png <url>`.

## Known limitations

- Terrain and horizons come from 1.9 km/px data: too coarse for real polar lighting analysis.
- The elevation grid (33 MB) loads the first time a panel opens.
- The JS bundle is ~1.25 MB (three.js + recharts); code-splitting hasn't been done.
- Site coordinates are approximate mock values.
- No comparison view yet. Only one site can be selected at a time.
