# custom_site: custom lunar landing site

Lets a user type in any lunar longitude/latitude, click **Calculate potential**, and see
landing-site info, a 2D terrain map and power/sky results, the same layout as the schematic.
Runs on **mock data** today; switching to the FastAPI engine is a config change.

Requires Python 3.9+, `pydantic` v2 and `numpy` (the core). `streamlit` and `plotly` are only
needed for the UI and are imported lazily.

## Why it should not conflict with other branches

* Purely additive: one new folder, **no existing file is edited**. Relative imports only, so the
  folder can be moved under any package.
* Core dependencies are pydantic and numpy; the HTTP client uses only the standard library.
* The UI is a thin layer over `calculate_site_potential()`. The same call works from Streamlit,
  Dash, a notebook or the CLI.

## Layout

| File | Role |
|---|---|
| `schemas.py` | **The contract** (`SiteRequest`, `SiteResult`). Share this with the engine. |
| `service.py` | `calculate_site_potential(lon, lat, **params)`: validates input, calls the engine |
| `client.py`, `config.py` | `PotentialEngineClient` interface; `get_client()` picks mock or HTTP from env vars |
| `mock_engine.py` | Deterministic mock (same coordinates always give the same output) |
| `http_client.py` | Real engine client (stdlib `urllib`) |
| `terrain.py` | Slope, roughness, hillshade for any elevation grid |
| `figures.py` | Plotly figures (terrain map, Sun/Earth sky track, power) |
| `ui_streamlit.py`, `demo_app.py` | The panel, and a standalone page to preview it |

## Use it

```python
# in the existing Streamlit dashboard, e.g. a new tab or page
from custom_site.ui_streamlit import render_custom_site_panel
render_custom_site_panel()
```

```bash
streamlit run custom_site/demo_app.py          # preview the UI on its own
python -m custom_site --lat 0.67 --lon 23.47    # CLI summary (add --json for the full payload)
pytest custom_site/tests                        # 25 tests
```

Not on Streamlit? Call `calculate_site_potential(...)` and feed the result to
`figures.terrain_figure / sky_figure / power_figure` (they return plain Plotly figures, so
`dcc.Graph(figure=...)` works in Dash).

## Swap mock for the real engine

```bash
export LUNAR_ENGINE_BACKEND=http
export LUNAR_ENGINE_URL=http://localhost:8000
# optional: LUNAR_ENGINE_ENDPOINT_PATH, LUNAR_ENGINE_TIMEOUT_S
```

No code changes. An in-process engine can also be injected: any object with
`calculate_potential(SiteRequest) -> SiteResult` works, e.g.
`render_custom_site_panel(client=MyEngine())`.

## Contract for the engine (proposed, agree it with the engine owner)

`POST /api/v1/landing-site/potential` takes a `SiteRequest` and returns a `SiteResult`.
The engine can import the models directly so the two sides cannot drift:

```python
from custom_site.schemas import SiteRequest, SiteResult

@router.post("/api/v1/landing-site/potential", response_model=SiteResult)
def potential(req: SiteRequest) -> SiteResult:
    ...  # Horizons positions + LOLA/Moon Trek terrain + power calc -> SiteResult
```

`python -m custom_site --schema` prints the JSON Schema. Set `data_source="engine"` in real replies.
Unknown extra fields in responses are ignored, so the engine can add data without breaking the UI.
Bump `SCHEMA_VERSION` on breaking changes. Conventions: east-positive longitude, azimuth clockwise
from north, UTC timestamps, terrain grid row 0 = north.

## Assumptions to confirm

* **Request parameters** beyond lon/lat (start time, duration, step, array area/efficiency,
  terrain tile size) are guesses at what the power engine needs. Delete or add fields in
  `SiteRequest` and the form to match.
* **Mock limits:** simplified Sun/Earth geometry (not Horizons), flat horizontal array with no
  horizon masking, procedural terrain (not LOLA). Every mock result is labelled as such.
* The terrain tile is a JSON grid (128 x 128 by default). For much larger tiles, return a
  downsampled grid or add a separate raster endpoint.
