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
| `GET /sites` | All sites with `id`, `name`, `loc`, `desc`, and `agency`; also includes `lat` and `lon` for compatibility |
| `GET /sites/{site_id}/metrics?start=…&end=…&step=4hour&events_from=…` | Solar power and nearest sunrise/sunset for the time range |

`start` and `end` are ISO 8601 and required. A `Z` suffix or an offset is fine; times without one are treated as UTC. `step` is a Horizons step such as `2hour` and defaults to `4hour`. Optional `events_from` selects when the sunrise/sunset search begins; it must be within `start` and `end`, and defaults to `start`. A 30-day request takes several seconds.

Metrics response:

| Field | Meaning |
|---|---|
| `instantaneous_power_per_area_W_m2` | Power per m² at each step, starting at `start` |
| `daily_power_generated_per_area_kWh_per_m2_day` | Energy per m² for each 24 h block from `start`; a final partial day covers only its own hours |
| `average_power_per_24h_W_m2` | Mean power over the whole range |
| `average_power_sunlit_days_W_m2` | Mean power over days with any sunlight |
| `nearest_sunrise_utc` / `nearest_sunset_utc` | Next sunrise and sunset at or after `events_from` (or `start`), within the requested range, as UTC ISO 8601 timestamps; `null` if no crossing occurs |

Power is for a flat, horizontal panel, using the solar constant and panel efficiency in [`app/config.py`](app/config.py). Terrain shadowing is not included.
Sunrise and sunset are estimated from Sun elevation crossing 0° by linear interpolation between Horizons samples. The `step` parameter therefore affects event-time precision.

Errors: `400` bad dates or reversed range, `404` unknown site, `502` bad data from Horizons, `503` `astroquery` not installed.

## Sites

The catalog is [`data/sites.py`](data/sites.py). Canonical IDs are stored with each site (for example, `orig1`); the previous position-based IDs (`site-1`, `site-2`, …) remain accepted for metrics requests. `loc` is `[latitude, longitude]` in planetocentric degrees, with east-positive longitude. Metrics responses include the same site metadata.

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
data/sites.py             site catalog
tests/                    unit tests
```

## Tests

From the repository root:

```powershell
python -m unittest discover -s backend/tests -t backend -v
```
