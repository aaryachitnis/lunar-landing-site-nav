# Backend

A FastAPI service that lists lunar landing sites and estimates solar power at each one, using Sun positions from JPL Horizons. For the project overview, see the [root README](../README.md).

## Setup

You need Python 3.10+ and internet access (each metrics request queries JPL Horizons).

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
uvicorn app.main:app --reload
```

Interactive docs: http://127.0.0.1:8000/docs

The frontend's dev server forwards `/api/*` here, so local development needs no CORS setup.

## Endpoints

| Method and path | Returns |
|---|---|
| `GET /health` | Service status |
| `GET /sites` | Current JSON catalog with `id`, `name`, `loc`, `desc`, and `agency`; also includes `lat` and `lon` |
| `POST /sites` | Add a named location to the catalog; duplicate coordinates return `409` |
| `POST /sites/metrics` | Calculate metrics for unsaved coordinates supplied in the JSON body |
| `GET /sites/{site_id}/metrics?start=…&end=…&step=4hour&events_from=…&include_sky=true` | Solar power, sunrise/sunset, and optional live Sun/Earth metrics |

`start` and `end` are ISO 8601 and required. A `Z` suffix or an offset is fine; times without one are treated as UTC. `step` is a Horizons step such as `2hour` and defaults to `4hour`. Optional `events_from` selects the time for sky-state values and the start of rise/set searches; it must be within `start` and `end`, and defaults to `start`. Set `include_sky=true` to fetch Earth's ephemeris and add the `sky` object to the response; it is off by default. A 30-day request takes several seconds.

Custom metrics requests use `{ "lat": -89.0, "lon": 25.0, "start": "...", "end": "...", "step": "4hour" }`. They do not create or modify a catalog entry. To persist a site, send `POST /sites` with `{ "name": "...", "lat": -89.0, "lon": 25.0 }`. The add operation writes to `data/sites.json`; there is no delete endpoint.

Metrics response:

| Field | Meaning |
|---|---|
| `instantaneous_power_per_area_W_m2` | Power per m² at each step, starting at `start` |
| `daily_power_generated_per_area_kWh_per_m2_day` | Energy per m² for each 24 h block from `start`; a final partial day covers only its own hours |
| `average_power_per_24h_W_m2` | Mean power over the whole range |
| `average_power_sunlit_days_W_m2` | Mean power over days with any sunlight |
| `nearest_sunrise_utc` / `nearest_sunset_utc` | Next sunrise and sunset at or after `events_from` (or `start`), within the requested range, as UTC ISO 8601 timestamps; `null` if no crossing occurs |
| `sky` | Present when `include_sky=true` and both ephemerides are valid; includes Sun/Earth altitude and visibility at `events_from`, next Earthrise/Earthset, longest darkness, and sunlit fraction over the remaining range |
| `sky_error` | If optional sky metrics fail, contains the reason while preserving valid solar power and sunrise/sunset results |

Power is for a flat, horizontal panel, using the solar constant and panel efficiency in [`app/config.py`](app/config.py). Terrain shadowing is not included.
Sunrise/sunset and Earthrise/Earthset are estimated from apparent elevation crossing 0° by linear interpolation between Horizons samples. Longest darkness and sunlit fraction use the same interpolated Sun horizon crossings. The `step` parameter therefore affects event-time precision and longest-darkness accuracy. Visibility uses the astronomical horizon; local terrain obstruction is not included.

Errors: `400` bad dates or reversed range, `404` unknown site, `409` duplicate site coordinates, `422` invalid request body, `502` bad data from Horizons, `503` `astroquery` not installed.

## Sites

The catalog is [`data/sites.json`](data/sites.json), a JSON array read and validated by [`data/sites.py`](data/sites.py). Each entry has `id`, `name`, `loc` (`[latitude, longitude]`), `desc`, and `agency`; coordinates are planetocentric degrees with east-positive longitude. Canonical IDs are stored with each site (for example, `orig1`); the previous position-based IDs (`site-1`, `site-2`, …) remain accepted for metrics requests. Coordinate-based metrics use the transient ID `custom-location`.

## Configuration

| Environment variable | Use |
|---|---|
| `CORS_ORIGINS` | Comma-separated origins allowed to call the API from a browser, e.g. `https://example.com`. Needed only when the frontend is served from a different domain. Unset means CORS is off. |

## Code layout

```
app/main.py               FastAPI app, CORS
app/config.py             settings (solar constant, efficiency, default step, CORS)
app/api/routes/           /health and /sites endpoints
core/                     response models, coordinate and date helpers
services/power_services.py   Horizons query and power calculations
data/sites.json           persisted site catalog
data/sites.py             catalog validation, lookup and add operations
tests/                    unit tests
```

## Tests

From the repository root:

```powershell
python -m unittest discover -s backend/tests -t backend -v
```
