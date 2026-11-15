# Backend — Lunar Landing Site Navigator

The backend is a FastAPI service that lists lunar landing sites and calculates
solar power estimates from JPL Horizons ephemerides. It requires Python 3.10+
and internet access when requesting metrics from Horizons.

## Setup

From this directory, create and activate a virtual environment, then install
the dependencies:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Start the API:

```powershell
uvicorn app.main:app --reload
```

Interactive API documentation is served at `http://127.0.0.1:8000/docs`.
`power_gen.py` is the retained legacy implementation; the structured backend
does not depend on running it.

## Endpoints

- `GET /health` — returns service status.
- `GET /sites` — returns the ordered site IDs and coordinates.
- `GET /sites/{site_id}/metrics?start=<ISO-8601>&end=<ISO-8601>&step=4hour`
  — fetches Sun ephemerides and returns per-area power estimates for the time
  range. `start` and `end` are required; `step` defaults to `4hour`.

The catalog is in [`data/sites.py`](data/sites.py). Its order is stable because
the API assigns IDs as `site-1`, `site-2`, and so on. Coordinates use
planetocentric latitude and east-positive longitude in degrees.

Datetime inputs may include a `Z` suffix or an explicit UTC offset. Naive
datetimes are interpreted as UTC. Invalid dates or reversed ranges return
`400`, unknown site IDs return `404`, malformed Horizons data returns `502`,
and a missing `astroquery` installation returns `503`.

Power estimates use the solar constant and panel efficiency from
[`app/config.py`](app/config.py). The shared calculations live in
[`services/power_services.py`](services/power_services.py). Daily energy is
integrated from samples in kWh/m²; a final partial day is integrated only over
its observed duration.

## Tests

Run the backend unit tests from this directory:

```powershell
python -m unittest discover -s tests -v
```
