# Backend

A FastAPI service that serves the lunar landing-site catalogue and calculates solar power and Sun/Earth visibility at any point on the Moon, using ephemerides from JPL Horizons. It powers [lunarsky.select](https://lunarsky.select). For the project overview, see the [root README](../README.md).

## Endpoints

| Method and path | Returns |
|---|---|
| `GET /health` | Service status |
| `GET /sites` | The site catalogue: `id`, `name`, `desc`, `agency`, `loc`, plus `lat` and `lon` |
| `POST /sites` | Adds a named location to the catalogue. Duplicate coordinates return `409`. |
| `GET /sites/{site_id}/metrics` | Solar power, sunrise/sunset and optional Sun/Earth metrics for a catalogue site |
| `POST /sites/metrics` | The same metrics for any coordinates, without saving them |
| `GET /sites/{site_id}/communications` | Full Earth-visibility report over LOLA terrain: windows, mountain sectors, hours hidden. Takes `start`, `end`, `step` (e.g. `1h`) and tuning options; see `/docs`. |
| `GET /sites/surface-roughness` | Mean slope, max slope and detrended RMS roughness within 10 km of every catalogue site |

Interactive API docs are served at `/docs`.

### Metrics parameters

| Parameter | Meaning |
|---|---|
| `start`, `end` | Required, ISO 8601. Times without a `Z` or offset are treated as UTC. |
| `step` | Horizons step size, e.g. `2hour`. Defaults to `4hour`. |
| `events_from` | Time for the sky-state values and the start of rise/set searches. Must be within the range; defaults to `start`. |
| `include_sky` | `true` adds the `sky` object with Earth ephemeris data. Off by default. |
| `include_terrain` | `true` adds the `terrain` object: Sun and Earth visibility over the LOLA terrain horizon. Off by default. |

`POST /sites/metrics` takes `lat`, `lon`, `start`, `end` and `step` as a JSON body, e.g. `{ "lat": -89.0, "lon": 25.0, "start": "…", "end": "…", "step": "4hour" }`. To save a location, send `POST /sites` with `{ "name": "…", "lat": -89.0, "lon": 25.0 }`.

A 30-day request takes several seconds, mostly waiting on Horizons.

### Metrics response

| Field | Meaning |
|---|---|
| `instantaneous_power_per_area_W_m2` | Power per m² at each step from `start` |
| `daily_power_generated_per_area_kWh_per_m2_day` | Energy per m² for each 24 h block from `start`. A final partial day covers only its own hours. |
| `average_power_per_24h_W_m2` | Mean power over the whole range |
| `average_power_sunlit_days_W_m2` | Mean power over days with any sunlight |
| `nearest_sunrise_utc`, `nearest_sunset_utc` | Next sunrise and sunset at or after `events_from`, or `null` if none falls in the range |
| `sky` | With `include_sky=true`: Sun and Earth altitude and visibility at `events_from`, next Earthrise/Earthset, longest darkness and sunlit fraction |
| `sky_error` | Why the optional sky metrics failed. Power and sunrise/sunset are still returned. |
| `terrain` | With `include_terrain=true`: for the Sun and Earth, visibility at `events_from`, the terrain horizon in their direction, next rise/set over terrain, visible fraction (and the flat-horizon fraction), longest hidden stretch, hours hidden by terrain, and visibility windows. Also the 360° horizon profile. |
| `terrain_error` | Why the terrain metrics failed. Everything else is still returned. |

Errors: `400` bad dates or reversed range, `404` unknown site, `409` duplicate coordinates, `422` invalid body, `502` bad data from Horizons, `503` `astroquery` not installed.

## How the numbers are calculated

- **Power** is for a flat, horizontal panel: solar constant × panel efficiency × the cosine of the Sun's angle from vertical. Both constants are in [`app/config.py`](app/config.py).
- **Rise and set times** are found where the apparent elevation crosses 0°, interpolated linearly between Horizons samples. Longest darkness and sunlit fraction use the same crossings, so a smaller `step` gives more precise times.
- **Visibility** in `sky` uses the astronomical horizon. In `terrain`, the horizon is traced through NASA LOLA elevation in 360 directions out to 150 km, allowing for the Moon's curvature; a body is visible when its centre is above it. Positions are interpolated to 10-minute steps. The grid is 1.9 km per pixel, so smaller rims are missed.
- **Power** does not yet include terrain shadowing.

## Site catalogue

The catalogue is [`data/sites.json`](data/sites.json), validated and updated by [`data/sites.py`](data/sites.py). Each entry has an `id` (e.g. `orig1`), `name`, `loc` as `[latitude, longitude]`, `desc` and `agency`. Coordinates are planetocentric degrees with east-positive longitude. Older position-based ids (`site-1`, `site-2`, …) still work for metrics requests.

## Code layout

```
app/main.py                  FastAPI app and CORS
app/config.py                settings: solar constant, efficiency, default step, CORS
app/api/routes/              /health and /sites endpoints
core/                        response models, coordinate and date helpers
services/power_services.py   Horizons queries, power and sky calculations
services/terrain_height.py   LOLA download, conversion and sampling
services/mountain_visibility.py  terrain skyline and Earth visibility (from the comms branch)
services/terrain_sky.py      Sun and Earth visibility over the terrain skyline
services/surface_roughness.py    slope and roughness around each site
data/                        site catalogue and its validation
tests/                       unit tests
```

## Run locally

You need Python 3.10+ and internet access, since each metrics request queries JPL Horizons.

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
uvicorn app.main:app --reload        # http://127.0.0.1:8000/docs
```

The frontend's dev server forwards `/api` here, so local development needs no CORS setup.

Terrain data: the first terrain request downloads the LOLA grid `ldem_16.img` (33 MB) from the NASA PDS Geosciences Node and converts it to `data/terrain/` (git-ignored; set `LOLA_DATA_DIR` to move it). To do this ahead of time, run `python -m services.terrain_height`.

Tests, from the repository root:

```powershell
python -m unittest discover -s backend/tests -t backend -v
```

## Deployment

Hosted on Render. The start command is in the `Procfile`. Render's disk is temporary, so each new instance downloads the LOLA grid on its first terrain request (a few seconds). Set `CORS_ORIGINS` to a comma-separated list of origins only if a browser calls the API from another domain. The live frontend proxies `/api` through Netlify, so it doesn't need it.
