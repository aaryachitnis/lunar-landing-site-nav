# Handover: Lunar Landing Site Navigator

This is a handover for a new Claude session (or any newcomer). It summarises everything decided and built in the previous working session: the user's preferences, the current state, and the traps already found. Read it first, then the READMEs it links to.

---

## 1. One-paragraph summary

This is a monorepo for a challenge-brief project: a tool for **rapidly evaluating lunar landing sites**, focused on the **south pole**. Its outputs are Sun and Earth position relative to the local horizon, time to sunset and Earthset, solar power, and Earth-visibility (communications) windows. The **frontend** (`frontend/`, React 19 + Vite + three.js) is built and working. It has a "God's-eye" 3D globe on real NASA LRO imagery with clickable landing sites, and a side panel showing coordinates, a bird's-eye 3D terrain mesh, metrics and a 30-day timeline. **All metrics and sites are mocked** behind one data module (`frontend/src/data/api.js`). The **backend** (`backend/`, Python) is **empty**: another part of the team is writing the Python scripts that will provide real metrics.

## 2. Where to read more (all up to date)

| File | Contents |
|---|---|
| [README.md](README.md) | Project-wide context: the challenge brief, layout, quick start, end-to-end flow, mock model, conventions, decisions table, open questions |
| [frontend/README.md](frontend/README.md) | Frontend architecture, file map, fixed globe config, coordinate mapping, texture pipeline, data layer, how to add routes, verification, limitations |
| [backend/README.md](backend/README.md) | What the backend must produce and the two integration options. The user trimmed it, so it is now short. |
| [frontend/src/data/SCHEMA.md](frontend/src/data/SCHEMA.md) | **The data contract**: JSON shapes for `Site`, `SiteMetrics` and `TerrainPatch` |

## 3. Running it

```bash
cd frontend
npm install
npm run dev     # http://localhost:5173
```

On first run, `predev` runs `scripts/fetch-textures.mjs --if-missing`. It downloads about 80 MB of NASA source maps into `scripts/.cache/` and generates the files in `public/textures/`. Both folders are git-ignored. On the user's machine the textures have already been generated.

Example links:
- `/?site=shackleton-rim&t=2026-11-14T12:00:00.000Z`
- `/?site=apollo-11`
- `/?site=custom_-89.3_45` (custom coordinates)

Unknown paths show a 404 page.

## 4. How the session went (chronological)

1. **Moon model.** The user asked for a three.js Moon:
   - a high-subdivision sphere with displacement, normal and colour maps
   - a single hard directional Sun
   - ACES filmic tone mapping and no ambient light
   - its own folder, viewable locally

   The user chose **real NASA data** over procedural textures. Built as `moon-viewer/` (vanilla JS + Vite) with a texture pipeline from the NASA SVS CGI Moon Kit (https://svs.gsfc.nasa.gov/4720): `lroc_color_poles_4k.tif` and `ldem_16.tif`.
2. **Fixed look.** The user removed the lil-gui controls and fixed these values: Sun azimuth 60°, elevation 5°, intensity 3.2, exposure 1.0, **relief × 0**, normal strength 1.55, no shadows, no wireframe, no auto-rotate. These now live in `frontend/src/scene/config.js`. **Don't make them user-adjustable unless asked.**
3. **Dashboard.** The user gave the full challenge brief (summarised in the root README §1) and asked for:
   - a God's-eye globe with landing sites
   - clicking a site opens a side panel with coordinates, a bird's-eye view of the terrain subdivision, power data and other metrics
   - **mocked metrics and sites**

   The user chose **React + Vite** over vanilla. They rejected two plan drafts, which added two requirements:
   - a **monorepo** with `frontend/` (normal React folders: hooks, data, assets, …) and `backend/` (Python, left blank)
   - the God's-eye view is **one feature route and the home route**; more features will arrive as other routes, so there is a route registry

   `moon-viewer/` was moved to `frontend/`.
4. **Documentation.** The user asked for full-context READMEs (root, frontend, backend) written so that a person or an LLM can get up to speed. They later edited them: the status table was removed from the root README and the backend README was shortened.
5. **"Let there be light".** A toggle button, driven by a React hook, that illuminates the globe's dark hemisphere. The user called it the "dark side (far-side)". It was built as a fill light opposite the Sun, off by default. The assistant pointed out that the far side isn't actually dark, and the button's tooltip says "night side".
6. **Commits.** The user committed the work themselves: `ba1effc scaffold` and `ac2e4ff feat: let there be light`. The working tree is clean apart from this file.

## 5. User preferences and working style (observed)

- Uses **plan mode** for bigger tasks and rejects plans with short corrective notes. Fold those notes into the plan rather than starting over.
- Wants **mock data clearly separated** so the Python team can plug in later.
- Wants the **standard React folder conventions** (components, hooks, data, assets, pages, layouts, utils, styles).
- Wants the dashboard to be **multi-route**, with the globe as home.
- Keeps fixed visual settings fixed.
- Edits docs and commits on their own. **Don't commit unless asked.** Before editing README files, re-read them: they may have changed.
- British spelling appears in their requests ("visualisation", "colour"). It's fine to match it.

## 6. Architecture at a glance

```
frontend/src/
  main.jsx → BrowserRouter → App.jsx → AppLayout (nav + Outlet)
  routes.jsx                  route registry {path,label,element,index}; nav + Routes built from it
  pages/GlobePage/            home route: MoonView + SiteList + SitePanel; panel insets
  components/
    MoonView/                 globe container + HTML markers + LightToggle + loading overlay
    LightToggle/              "Let there be light" pill button
    SiteList/                 grouped list, search, custom lat/lon form
    SitePanel/                header, location, TerrainView, time controls, MetricTiles, PowerChart
    TerrainView/              own three.js renderer: 80×80 km, 64×64 vertices, 2× vertical, wireframe toggle
    MetricTiles/, PowerChart/ (recharts: power chart + elevation-above-horizon chart, synced; daily table)
  hooks/ useAsync, useSites, useSiteMetrics, useTerrainPatch, useMoonScene, useSelectedSite (URL ?site=&t=), useLetThereBeLight
  scene/ MoonScene.js (imperative three.js class), config.js (fixed look + NIGHT_FILL)
  data/ api.js (ONLY entry point), elevation.js (Int16 grid loader/sampler), mock/sites.js, mock/metrics.js, SCHEMA.md
  utils/ coords.js, format.js
  styles/global.css (dark-only tokens; categorical colours --cat-1..5; --series-sun/earth)
scripts/fetch-textures.mjs → public/textures/{moon_color.jpg, moon_normal.png, moon_disp.png, moon_elev_i16.bin, moon_meta.json}
```

Key mechanics:

- **Imperative three.js.** React owns the DOM. `MoonScene` owns WebGL and moves the registered marker `<button>`s every frame by projecting them through the camera. Markers on the far side of the globe are hidden.
- **Camera.** `flyTo(lat, lon)` slerps the camera direction toward the site.
- **Panel offset.** `setInsets(left, right)` uses `camera.setViewOffset` so the globe centres in the space left between the side panels (list 296 px, panel 420 px). This only happens above a 760 px width.
- **Clean-up.** Each renderer is fully disposed on unmount. Globe textures are cached at module level as promises, which is needed for StrictMode double-mounts.
- **Night fill.** `setNightSideLit(on)` fades a directional light opposite the Sun (2.6) plus an ambient light (0.35) over 800 ms. Both are 0 when off.
- **URL state.** `?site=<id>` and `?t=<ISO>`. Custom sites use ids of the form `custom_<lat>_<lon>`, parsed in `mock/sites.js`.

## 7. Data and the mock model

- **Elevation grid.** `moon_elev_i16.bin` is LOLA `ldem_16`: 5760×2880, Int16 metres, little-endian. Row 0 is 90°N and column 0 is 180°W. Range −8.98 to +10.69 km. It's loaded lazily (33 MB) the first time a panel opens.
- **Mock metrics** (`mock/metrics.js`, `model: 'mock-geometric-v1'`):
  - Sun: subsolar longitude from the synodic phase (reference new moon 2000-01-06 18:14 UTC); subsolar latitude ±1.54° over the draconic year.
  - Earth: libration of ±7.9° in longitude and ±6.7° in latitude.
  - Terrain horizon: ray-marched every 2° out to 150 km over the real grid, including curvature and a 2 m mast.
  - Power: 1361 W/m² × 2 m² × 0.3 × visible solar-disk fraction.
  - Output is an hourly series from −3 to +27 days, plus `now`, `window` summaries and the `horizon` profile.
- **Terrain patch** (`api.getTerrainPatch`): sampled on a **local tangent plane** (azimuthal equidistant), because lat/lon boxes collapse at the pole. Sites are clamped to ±89.99°.
- **Mock sites:** 17 in total.
  - Artemis candidates: Shackleton Rim, Connecting Ridge, de Gerlache Rim, Malapert Massif, Nobile Rim, Haworth, Leibnitz Beta.
  - CLPS: IM-1, IM-2, Blue Ghost M1.
  - International: Chandrayaan-3, SLIM, Chang'e 4, Chang'e 6.
  - Apollo: 11, 15, 17.
  - The coordinates of Shackleton, de Gerlache, Nobile and Haworth were **nudged onto nearby well-lit high ground**. The original approximate coordinates fell inside craters at 1.9 km resolution. Shackleton Rim is now −89.89, −150.33, about 1,503 m elevation, which matches the real rim height of ~1.5 km.
- **Sanity values** for 2026-11-14 12:00 UTC (about 5 days after new moon):
  - Apollo 11: Earth ~65–73° up, visible 100 % of the time.
  - Chang'e 4 and 6: Earth never visible.
  - Connecting Ridge: ~59 % sunlit and ~55 % Earth-visible over 27 days.
  - Blue Ghost M1 (east limb): sunlit.

## 8. Conventions (frontend and backend must agree)

- Latitude −90…90, south negative. Longitude −180…180, **east-positive**. Planetocentric.
- Azimuth in degrees **clockwise from north**.
- `…AboveHorizon` fields are relative to the **terrain** horizon; > 0 means visible.
- Times are ISO 8601 UTC in the API; `t` in series is epoch ms.
- Elevation in metres relative to the 1737.4 km sphere.
- **Globe mapping.** Mesh-local position: `x = cosφcosλ, y = sinφ, z = −cosφsinλ`. The mesh has `rotation.y = −π/2`, so longitude 0° faces +Z (the camera). This has been verified: Apollo 11 lands on Mare Tranquillitatis and Mare Crisium is on the east limb.
- **Metrics maths frame.** X points to 0°E on the equator and Z to the north pole. Local frame is an East/North/Up basis (`utils/coords.js`).

## 9. Design and chart rules in force

- The dataviz skill was followed:
  - **no dual y-axes**: power (W) and elevation (°) are separate stacked charts with `syncId`
  - thin 2 px lines
  - a legend when there are 2+ series
  - a table view
  - status always shown as icon + label, never colour alone
  - categorical colours are validated dark-mode steps, in fixed order: blue, orange, aqua, yellow, magenta
- Dark theme only. Plain CSS per component, tokens in `styles/global.css`.

## 10. How to verify (no test suite yet)

- `npm run build` must pass. The bundle-size warning (~1.25 MB) is known and accepted for now.
- **Screenshots.** Headless Chrome is installed at `/Applications/Google Chrome.app`:
  ```bash
  npx vite preview --port 4173 &
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --use-angle=swiftshader \
    --enable-unsafe-swiftshader --window-size=1440,900 --virtual-time-budget=30000 \
    --screenshot=out.png "http://localhost:4173/?site=shackleton-rim"
  ```
- **Clicking UI.** Launch Chrome with `--remote-debugging-port=9333 --user-data-dir=<tmp>`, wait for `/json` to respond, then drive it over the DevTools protocol with Node's built-in `WebSocket` (`Runtime.evaluate` to click, `Page.captureScreenshot` to capture).
- **Metrics without a browser.** Import `src/data/mock/metrics.js` from Node and build a `grid.sample()` over `public/textures/moon_elev_i16.bin`.
- Stop preview servers and delete `frontend/dist/` afterwards.

## 11. Gotchas already hit

- **Uninitialised constants.** Module-level constants used before their `const` declaration throw at load time. Keep config at the top of the file or in `scene/config.js`.
- **StrictMode double mount.** Effects run twice in dev, and texture readiness must not rely on a one-shot `LoadingManager`. This is why the texture cache stores `{ texture, ready: Promise }`.
- **Wireframe density.** A 128×128 wireframe in a 380 px view washed out the terrain, so it is 64×64 (also closer to the 1.9 km source resolution).
- **Recharts label collisions.** A `ReferenceLine` label on the x=0 line collided with the y-axis ticks, so a caption under the chart explains the dashed line instead.
- **Far side ≠ dark side.** The globe's dark hemisphere comes from the fixed decorative Sun. It does not follow the selected date; only the panel metrics do.
- **Large files.** The normal map PNG is 20 MB and the elevation bin 33 MB. Fine locally, but optimise before hosting.

## 12. Open items / likely next asks

These are undecided; confirm with the user before acting on any of them.

- Backend integration: static JSON in `frontend/public/data/` vs a FastAPI app with a Vite `/api` proxy. Only `api.js` function bodies change.
- Real ephemeris (SPICE / `spiceypy`, or JPL Horizons) and high-resolution LOLA polar DEMs for horizons and terrain patches.
- A real, sourced site list. When it arrives, move `SITE_CATEGORIES` and the custom-site helpers out of `data/mock/`.
- **Comparison view** (side-by-side sites and dates) as the next feature route.
- Time scrubbing or animation, possibly driving the globe's Sun (this would conflict with the fixed look, so ask first).
- Code-splitting and asset size; automated tests.
