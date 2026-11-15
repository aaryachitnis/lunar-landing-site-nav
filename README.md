# Lunar Landing Site Navigator

A tool for quickly evaluating and comparing lunar landing sites. For a site and a date it shows where the Sun and Earth are in the sky, how long until sunset and Earthset, how much solar power is available, and when direct-to-Earth communication is possible. The focus is the lunar south pole, where most upcoming missions are headed.

| Read next | For |
|---|---|
| [frontend/README.md](frontend/README.md) | The React + three.js app: features, architecture, how to extend it |
| [backend/README.md](backend/README.md) | The FastAPI service: setup, endpoints, tests |
| [frontend/src/data/SCHEMA.md](frontend/src/data/SCHEMA.md) | The data contract: exact shapes the frontend works with |

## Quick start

You need Python 3.10+, Node.js 18+ and internet access (the backend calls JPL Horizons; the first frontend run downloads NASA maps).

**1. Backend** (terminal 1)

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
uvicorn app.main:app --reload        # http://127.0.0.1:8000/docs
```

**2. Frontend** (terminal 2)

```bash
cd frontend
npm install
npm run dev                          # http://localhost:5173
```

The first `npm run dev` downloads about 380 MB of NASA data and builds textures and terrain. It takes a few minutes, once. The dev server forwards `/api/*` to the backend, so no extra setup is needed.

## The problem

NASA's Commercial Lunar Payload Services (CLPS) program and other missions must pick landing sites and dates that work for both science and engineering. Two things dominate:

- **Sun position:** solar power and thermal conditions.
- **Earth position:** whether the lander can talk to Earth directly, without a relay satellite.

At the south pole both are on a knife edge. The Sun skims the horizon, so crater rims and massifs decide whether a spot is lit. Earth hovers near the horizon and bobs above and below it. Small changes in place or date can turn a good site into an unusable one.

Schedules slip, so planners repeatedly need to re-check nearby sites or other dates, fast. Existing tools (NASA Quickmap, Moon Trek, JPL Horizons) are powerful but built for detailed analysis, not quick comparison.

## What's in the repo

```
lunar-landing-site-nav/
├── backend/     FastAPI service: site list and solar power from JPL Horizons
└── frontend/    React 19 + Vite + three.js app
    └── src/data/api.js   the only place the UI gets data from
```

The app has two tabs:

- **Landing Sites:** a 3D globe of the backend's sites. Selecting one opens a panel with location, terrain, live solar power and the Sun/Earth model.
- **Lunarium:** stand at a site in first person and watch the Sun and Earth move over the real terrain horizon.

## Where the data comes from

| Data | Source | Status |
|---|---|---|
| Site list: names, agencies, descriptions | Backend `GET /sites` | **Live** |
| Solar power (W/m², daily kWh/m²) | Backend `GET /sites/{id}/metrics`, using JPL Horizons | **Live** |
| Sun and Earth positions, rise/set times, visibility | Geometric model in `frontend/src/data/mock/metrics.js` | **Mock**, tagged in the UI |
| Lunarium's site list | `frontend/src/data/mock/sites.js` | **Mock** |
| Terrain, elevation, slope, horizon | NASA LRO LOLA elevation data, processed in the browser | Real data |

When the backend adds Sun/Earth data, only `getSkyModel` in `frontend/src/data/api.js` needs to change.

## Conventions

Frontend and backend both follow these.

- **Latitude** -90 to 90, south negative. **Longitude** -180 to 180, east positive. Planetocentric.
- **Azimuth** in degrees clockwise from local north (0 = N, 90 = E).
- **Elevation** in degrees above the astronomical horizon. Fields named `…AboveHorizon` are relative to the local terrain horizon, so > 0 means visible.
- **Time** is ISO 8601 UTC in APIs and epoch milliseconds (`t`) inside series.
- **Heights** in metres relative to the 1737.4 km reference sphere.
- Sites very close to a pole are clamped to ±89.99° for local maths, because "north" is undefined at the pole itself.

## Key decisions

| Decision | Why |
|---|---|
| Monorepo with `frontend/` and `backend/` | The team splits into UI and Python analysis. |
| The UI reads all data through `frontend/src/data/api.js` | Swapping a mock for a backend call changes one function. |
| Selected site and time live in the URL (`?site=…&t=…`) | Views are shareable, and back/forward works. Both tabs keep them. |
| Real NASA LRO data for imagery and elevation | Real craters, slopes and horizons. |
| The globe's look is fixed (values in `frontend/src/scene/config.js`) | Chosen by the team. Not user-adjustable. |
| three.js is used imperatively, without react-three-fiber | The scene code stays a plain class that React mounts. |
| Terrain is sampled on a local tangent plane, not a lat/lon box | Lat/lon boxes collapse near the pole. |

## Open questions

- **Sun and Earth from the backend.** JPL Horizons already supplies the Sun; adding Earth (and the terrain horizon) would retire the mock model.
- **Terrain shadowing in power.** The backend's power assumes a flat panel with no terrain in the way. At the poles, terrain often blocks the Sun.
- **Comparison view.** Several sites or dates side by side would be a natural next tab.
- **Hosting.** The frontend is static files. The backend needs a host that runs Python (see the backend README for CORS).

## Data credits

Imagery and elevation: NASA Scientific Visualization Studio, *CGI Moon Kit* (https://svs.gsfc.nasa.gov/4720), from Lunar Reconnaissance Orbiter LROC and LOLA. High-resolution polar terrain: NASA PGDA LOLA 5 m DEMs (Barker et al. 2021, https://pgda.gsfc.nasa.gov/products/78). Sun ephemeris: JPL Horizons. All public domain.
