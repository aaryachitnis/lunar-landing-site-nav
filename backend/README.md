# Backend — Lunar Landing Site Navigator

Python scripts that compute the **real** landing-site data the dashboard displays. **This folder is empty so far.** The frontend currently runs on mock data and is ready to switch to backend output once it exists.

Read the [root README](../README.md) first for the problem and shared conventions.

## What the backend needs to produce

The frontend reads all data through one module, [`frontend/src/data/api.js`](../frontend/src/data/api.js). Its exact JSON shapes are in [`frontend/src/data/SCHEMA.md`](../frontend/src/data/SCHEMA.md). That file is the contract: if the backend returns those shapes, the frontend works unchanged.

## Integration options (undecided)

Either option works with the frontend; only the bodies of `api.js` change.

1. **Precomputed static JSON.** Scripts write files such as `sites.json`, `metrics/<siteId>/<date>.json` and `terrain/<siteId>.json` into `frontend/public/data/`. Then `api.js` does `fetch('/data/…')`. This is the simplest option and needs no server, but it limits custom coordinates and arbitrary dates.
2. **Small HTTP API** (e.g. FastAPI): `GET /sites`, `GET /sites/{id}/metrics?t=…`, `GET /terrain?lat=…&lon=…&sizeKm=…&n=…`, with Vite dev-server proxying `/api` to it. This supports custom coordinates and any date. Terrain grids can be large, so consider binary (Float32/Int16) or gzip for `heights`.
