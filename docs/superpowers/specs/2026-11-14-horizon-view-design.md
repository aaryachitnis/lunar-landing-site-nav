# Horizon View (Lunarium): design

Date: 2026-11-14 · Status: draft for approval · Context: hackathon, demo in a few days.

## 1. Intent

A mission planner picks a landing site and time, then **stands there**: a first-person,
full-3D view of the lunar surface at the site, looking out to the horizon, with black sky,
the Sun and Earth in their true positions. They look around by moving their phone (or
dragging on a laptop) to find the Sun and Earth and see at a glance whether terrain blocks
them, how much sunlight the site gets, and how that changes over the next few days.

Why: the existing dashboard gives numbers and charts. Standing at the site makes it
obvious *why* a site is lit or dark (that ridge blocks the Sun at 210°) and is a strong
demo moment. Inspiration: Solarium-style "look around the sky" apps.

## 2. Goals

1. First-person 3D view at any selected site, realistic enough to read as "standing on
   the Moon" (real terrain shape, hard low sunlight, black shadows, black starry sky).
2. Look around: **phone motion sensors** on Android Chrome; **mouse/touch drag** on laptop
   and as fallback.
3. Sun and Earth drawn at true angular size and position from the metrics data, with
   labels: visible / partly blocked / hidden, degrees above the terrain horizon, % of
   disk showing, time to set/rise, power (Sun).
4. Finding aids: compass strip (lunar N/E/S/W + azimuth) and edge arrows to off-screen
   Sun/Earth.
5. Time sandbox: a time bar from **landing − 12 h to landing + 3 days** showing when the
   Sun and Earth are visible; play/pause, speeds, scrub, jump-to-landing.
6. Works with mock data now; swaps to backend Sun/Earth data without UI changes.

## 3. Non-goals (v1)

- Camera passthrough / AR (WebXR `immersive-ar`). Motion sensors only.
- Walking or moving around; the viewer is fixed at the site (eye height 2 m, see C12).
- Real ephemeris (backend's job; frontend consumes whatever `getSiteMetrics` returns).
- High-res terrain for non-polar sites (Apollo, Chang'e, etc.); they get the coarse grid.
- Mapping the phone's real-world compass to lunar north.

## 4. Anti-goals (failure even if it "works")

- **The view and the numbers disagree** (label says "visible" while the Sun is drawn
  behind a ridge, or vice versa). See §7.
- Jittery or laggy motion that makes the view hard to hold or nauseating.
- Too slow on a mid-range Android phone to demo (target ≥ 30 fps).
- Ground near the viewer that looks like big flat polygons.

## 5. Decided with the user

- Full 3D surface, as realistic as possible ("actually standing there").
- Audience: mission planners checking Sun/Earth visibility and sunlight at a site.
- Scrubbing time does **not** move the camera; the view stays where the user was looking.
- Because panning and dragging at once is awkward: **play** is the main way to move time
  on phone, and each Sun/Earth label has a **Follow** toggle that locks the view onto that
  body while time runs. Moving the phone/dragging releases Follow.
- Time window: the few days after landing (−12 h … +3 d around the selected time).
- Layout per the approved mockup: labels beside Sun/Earth, compass strip top, two-row
  visibility time bar bottom, back-to-site chip top-left, motion on/off chip top-right.

## 6. Decisions made by Claude (check these)

| # | Decision | Reason |
|---|---|---|
| C1 | New sibling route `/horizon?site=…&t=…` in `routes.jsx`; "Stand here" button in `SitePanel` opens it with the same `site`/`t`. | Fits route-registry convention; URL stays shareable. |
| C2 | Device orientation via `DeviceOrientationEvent` (no WebXR). Yaw is **relative**: when motion is enabled the current view direction is kept and turning the phone turns the view. | Simpler and more robust than WebXR; avoids compass noise; no meaning to Earth's compass on the Moon. |
| C3 | Dev server served over **HTTPS** (`@vitejs/plugin-basic-ssl`, `--host`) so Android Chrome exposes sensors. User accepts the self-signed cert once. | Sensors require a secure context. |
| C4 | **Terrain source v1:** NASA PGDA per-site 5 m LOLA DEMs (`https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/SiteNN/SiteNN_final_adj_5mpp_surf.tif`, ~41–71 MB each, ~16 km square, south polar stereographic metres). Map: Site04 → Shackleton Rim, Site01 → Connecting Ridge, Site11 → de Gerlache Rim, Site20 → Leibnitz Beta, Site23 → Malapert. Beyond the tile, and for all other sites, use the existing 1.9 km `ldem_16` grid. The 3.3 GB 87°S mosaic and 1.8 GB 20 m map are **not** used in v1. | Fits in a few days; real 5 m detail where the demo sites are. |
| C5 | A Node prep script (like `fetch-textures.mjs`, using existing `geotiff`/`sharp` devDeps) downloads the tiles once (git-ignored), reprojects to a local east/north grid centred on the site, and writes compact per-site files to `public/terrain/<siteId>/`. If the site's coordinates fall outside its tile, it falls back to coarse data and logs a warning. | Browser never touches raw GeoTIFFs. Teammate working on LOLA may later own this step in `backend/`; keep the output format documented in `SCHEMA.md` so either side can produce it. |
| C6 | Rendering: three.js, imperative scene class (like `MoonScene.js`) in `src/scene/HorizonScene.js`, with a `useHorizonScene` hook. Concentric detail levels: fine mesh near the viewer, coarser outward, coarse far ring to ~150 km with lunar curvature applied (terrain drops below eye level with distance). | Matches existing architecture; keeps phone fps up. |
| C7 | Near-field realism is **generated**: small craters and scattered rocks (instanced) within a few hundred metres, plus a tiled regolith detail normal/albedo texture. Seeded from site id so it is stable. Cosmetic only, excluded from horizon/visibility maths. | No dataset has human-scale detail. |
| C8 | Lighting: one directional Sun light with shadows near the viewer, no ambient except faint Earthshine from Earth's direction; Sun disk 0.53° with glow; Earth 1.9° with its phase lit from the Sun direction; static starfield. | Looks lunar; matches existing "no ambient" look decision. |
| C9 | Sun/Earth positions come from `getSiteMetrics(site, t).series` (hourly az/el), linearly interpolated for smooth playback. Window −12 h…+3 d is a slice of the existing −3 d…+27 d series. | No new API needed; backend swap is free. |
| C11 | **Site coordinates vs tiles.** The PGDA→site mapping above was matched by name (PGDA product 78 lists Site01 Connecting ridge, Site04 Shackleton rim, Site11 de Gerlache rim, Site20 Leibnitz beta plateau, Site23 Malapert massif) and is **not yet verified by coordinates**. First step of the prep script: read each tile's bounds and check the app site lies inside with ≥ 2 km margin. If not, **move the site in `sites.js` to the tile's best-lit high point** (or tile centre). The mock coordinates are already marked approximate/nudged. Dashboard numbers for those sites change; acceptable for mock data. | Keeps the demo sites on 5 m terrain (anti-goal 4). |
| C12 | **One observer height: 2 m** for both the view's eye height and the visibility/power horizon (replaces 1.7 m in §8). The horizon profile from §7 replaces the mock's coarse 2°-step profile for the dashboard too, so view, labels and dashboard all agree. | Single source of truth (anti-goal 1). |
| C13 | **Demo time is found, not assumed.** Plan includes a step that scans the −12 h…+3 d series at each 5 m site for a sunset/sunrise or Earthset close to the ridge, picks the best site+time, and records it as the demo link in the README. If Shackleton has none, the demo uses whichever site does. | Shackleton may be lit throughout any 3-day window. |
| C10 | Playback speeds: 1×, 1 h/s, 6 h/s. Bars: bright = fully visible, faded = partly blocked, empty = hidden; "+1d +2d +3d" ticks; current time in UTC. | |

## 7. Keeping view and numbers consistent (anti-goal 1)

The mock metrics currently compute the terrain horizon from the 1.9 km grid, but the
view will render 5 m terrain, so they could disagree. v1 rule:

- The prep script also computes a **horizon profile** (terrain elevation angle every
  0.5° of azimuth, from eye height, using the 5 m tile + coarse far grid + curvature) and
  writes it with the terrain.
- When that profile exists, the mock metrics use it instead of their own coarse horizon.
  Later, the backend provides both the profile and the metrics.
- Generated rocks/craters are excluded from the profile and must not visibly poke above
  the real horizon line where the Sun/Earth are (keep generated features small and below
  eye level).

## 8. Data contract additions (add to `SCHEMA.md`)

`getHorizonTerrain(site) → HorizonTerrain` (new, in `api.js`):

```json
{
  "siteId": "shackleton-rim",
  "source": "PGDA LOLA 5 m Site04 + ldem_16",
  "eyeHeightM": 2.0,
  "centerElevationM": 1450,
  "near": { "sizeKm": 16, "n": 3201, "spacingM": 5, "heights": "Int16/Float32 binary URL" },
  "far":  { "radiusKm": 150, "...": "coarse ring or grid, format left to builder" },
  "horizon": [{ "azimuth": 0, "elevation": 1.42 }]
}
```

Heights in metres relative to the 1737.4 km sphere; grid row 0 = north, col 0 = west
(same as `TerrainPatch`). Exact binary layout and LOD decimation are the builder's call,
but must be documented.

## 9. Constraints

- React 19 + Vite 8 + three.js 0.187, imperative three (no react-three-fiber).
- All data via `src/data/api.js`; conventions per root README §6 (az clockwise from N,
  east-positive lon, UTC).
- Target device: user's Android phone, Chrome, landscape. Laptop Chrome as second target.
- Downloaded raw data is git-ignored; generated `public/terrain/` is git-ignored (like
  `public/textures/`).
- Add `.superpowers/` to `.gitignore`.

## 10. Left to the builder

- Mesh LOD scheme, decimation levels, binary format/compression for terrain files.
- Exact sensor-to-camera maths (quaternion from alpha/beta/gamma, screen orientation,
  smoothing filter strength).
- Procedural crater/rock density and textures (CC0 or generated).
- Shadow technique and quality settings for phone vs laptop.
- Component breakdown of the HUD (labels, compass, edge arrows, time bar).

## 11. Demo success check

On the Android phone at `https://<laptop-ip>:5173/horizon?site=<demo site>&t=<demo time>` (from C13):
turn on motion, turn around to find Earth and the Sun using the arrows, read a label,
press play at 6 h/s with Follow on the Sun and watch it skim/dip behind the ridge while
the Sun bar and label agree. Same flow with mouse drag on a laptop.
