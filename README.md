# Lunar Landing Site Navigator

**Live at [lunarsky.select](https://lunarsky.select)**: a web tool for rapidly evaluating lunar landing sites.

Pick a site and a date. The tool shows where the Sun and Earth sit in the local sky, how long until sunrise and sunset, how much solar power is available, and when direct-to-Earth communication is possible. The focus is the lunar south pole, where most upcoming missions are headed.

Built for the [NASA Space Apps Challenge 2026](https://www.spaceappschallenge.org/2026/find-a-team/space-larp-inc/?tab=project).

## The problem

Missions such as those in NASA's Commercial Lunar Payload Services (CLPS) program must choose landing sites and dates that work for both science and engineering. Two things dominate:

- **Sun position** sets solar power and thermal conditions.
- **Earth position** decides whether the lander can talk to Earth directly, without a relay satellite.

At the south pole both are on a knife edge. The Sun skims the horizon, so crater rims and massifs decide whether a spot is lit, and Earth bobs above and below the horizon. A small change in place or date can turn a good site into an unusable one.

Schedules slip, so planners need to re-check nearby sites and other dates quickly. Existing tools (NASA Quickmap, Moon Trek, JPL Horizons) are powerful but built for deep analysis, not quick comparison. This tool makes that comparison a few seconds of point-and-click, for mission planners, educators and the public alike.

## What it does

| View | What you get |
|---|---|
| **Landing Sites** | A 3D globe built from NASA imagery, with historic and candidate sites. Each site's panel shows location, elevation, slope, roughness, bird's-eye terrain, solar power with a 30-day chart, and Sun and Earth visibility. |
| **Lunarium** | Stand at a site in first person and watch the Sun and Earth move across the real terrain horizon. On a phone, point the device around to look. |
| **Playground** | Enter any coordinates and click **Calculate potential** to get site info, a 2D terrain map and power results. Add the location to the site catalogue if it's worth keeping. |

The selected site and time live in the URL, so any view can be shared as a link.

## How it meets the challenge

| Challenge objective | How the tool covers it |
|---|---|
| Site selection | A curated catalogue of Apollo sites and Artemis III south-pole candidates. Lunarium adds CLPS landers (IM-1, IM-2, Blue Ghost) and international missions (Chandrayaan-3, SLIM, Chang'e 4 and 6). The Playground takes any coordinates and can add them to the catalogue. |
| Date and time flexibility | A UTC time picker from 9999 BC to 9999 AD in the site panel and the Playground. The chosen time carries into Lunarium. |
| Sun and Earth relative to the horizon | Live Sun and Earth altitude and visibility per site, plus time to sunset/sunrise and Earthset/Earthrise. Lunarium shows both bodies over the real terrain horizon. |
| Power and communication | Solar power per m² now and over 30 days, daily energy, percentage sunlit and longest darkness. Earth visibility gives the direct-to-Earth window. |
| Multiple visualizations | A 3D globe, 3D bird's-eye terrain, a 2D shaded-relief map, a first-person 3D view and charts with tables. |
| Temporal dynamics | A 30-day power timeline, and Lunarium's animated time bar with play, scrub and jump to the next sunrise, sunset, Earthrise or Earthset. |
| Accessibility across skill levels | Technical figures for planners; Lunarium lets students and the public stand on Shackleton's rim and see why the Sun matters. Status never relies on colour alone, and it works on phones. |
| Topography and the horizon | NASA LOLA terrain, down to 5 m at key polar sites. The horizon is traced through the terrain and the curve of the Moon itself, since there is no atmosphere to bend light. |
| Libration | JPL Horizons ephemerides include Earth's libration wobble, and Lunarium's model applies it too. |

Side-by-side comparison of several sites is the main objective not yet built. Sites and dates can be compared one after another, and each scenario can be shared as a link.

## How it works

```
Browser (React + three.js, Netlify)
  ├─ NASA LOLA elevation ──► terrain, slope, roughness, horizon profile (computed in the browser)
  └─ /api ──► FastAPI backend (Render) ──► JPL Horizons
                 └─ Sun and Earth positions ──► power per m², sunrise/sunset, Earthrise/Earthset
```

- **Backend:** for each site and time window, queries JPL Horizons for the Sun and Earth as seen from that point on the Moon. It turns the results into power per m² for a flat panel, daily energy, rise and set times, sunlit fraction and longest darkness.
- **Frontend:** processes NASA LOLA elevation data in the browser, at about 1.9 km per pixel globally and 5 m per pixel at five south-polar sites. Terrain is sampled on a local flat grid around each site, so it stays accurate right up to the pole. From it the app builds 3D terrain and the horizon in every direction.

## Data and accuracy

| Data | Source | Status |
|---|---|---|
| Site catalogue (names, agencies, descriptions) | Backend, `data/sites.json` | Live |
| Solar power, sunrise/sunset | JPL Horizons via the backend | Live |
| Sun and Earth altitude, visibility, Earthrise/Earthset | JPL Horizons via the backend | Live |
| Terrain, elevation, slope, roughness, horizon | NASA LOLA, processed in the browser | Real data |
| Sun and Earth motion in Lunarium | Geometric model in the browser | Modelled, labelled in the UI |

Live power and visibility use the astronomical horizon, so they don't yet account for terrain blocking the Sun. Lunarium does include terrain. Anything modelled rather than live is labelled in the interface.

## Tech stack

- **Frontend:** React 19, Vite, three.js, Recharts, JavaScript
- **Backend:** Python, FastAPI, astroquery (JPL Horizons), NumPy, Pydantic
- **Data:** NASA LRO LROC imagery, LOLA elevation (CGI Moon Kit), PGDA 5 m polar terrain
- **Hosting:** Netlify (frontend) and Render (backend)

No special hardware is needed, and the app works on phones.

## Repository

```
lunar-landing-site-nav/
├── backend/     FastAPI service: site catalogue, solar power and sky metrics from JPL Horizons
└── frontend/    React + three.js app: globe, Lunarium, Playground
```

| Read next | For |
|---|---|
| [frontend/README.md](frontend/README.md) | Features in detail, architecture, running and testing the app |
| [backend/README.md](backend/README.md) | API endpoints, calculations, setup and tests |
| [frontend/src/data/SCHEMA.md](frontend/src/data/SCHEMA.md) | The data contract between the UI and the backend |

## Run locally

You need Python 3.10+, Node.js 18+ and internet access. The backend calls JPL Horizons, and the first frontend run downloads NASA maps.

**Backend** (terminal 1):

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
uvicorn app.main:app --reload        # http://127.0.0.1:8000/docs
```

**Frontend** (terminal 2):

```bash
cd frontend
npm install
npm run dev                          # http://localhost:5173
```

The first `npm run dev` downloads about 380 MB of NASA data and builds textures and terrain, which takes a few minutes once. The dev server forwards `/api` to the backend, so no extra setup is needed.


## SI generation

Two parts of the frontend were made with SI generation:

- **Lunarium** (`/lunarium`): the first-person view, in `frontend/src/pages/HorizonPage/`, `frontend/src/scene/HorizonScene.js` and `frontend/src/scene/sunVisibility.worker.js`.
- **The star background** behind the Landing Sites globe (`#makeStars` in `frontend/src/scene/MoonScene.js`). The Moon model itself was not.

## Data credits

Imagery and elevation: NASA Scientific Visualization Studio, *CGI Moon Kit* (https://svs.gsfc.nasa.gov/4720), from Lunar Reconnaissance Orbiter LROC and LOLA. High-resolution polar terrain: NASA PGDA LOLA 5 m DEMs (Barker et al. 2021, https://pgda.gsfc.nasa.gov/products/78). Sun and Earth ephemerides: NASA JPL Horizons. All public domain.
