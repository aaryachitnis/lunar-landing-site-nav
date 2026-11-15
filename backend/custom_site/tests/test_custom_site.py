"""Tests for the custom landing-site feature. Run with:  pytest custom_site/tests"""

from __future__ import annotations

import json
import threading
import urllib.request
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
import pytest

from custom_site import (
    EngineConfigError,
    EngineContractError,
    EngineError,
    EngineUnavailable,
    InvalidSiteRequest,
    SiteRequest,
    SiteResult,
    build_request,
    calculate_site_potential,
    get_client,
)
from custom_site.config import load_settings
from custom_site.http_client import HttpEngineClient
from custom_site.mock_engine import SOLAR_CONSTANT_W_M2, MockEngineClient
from custom_site.terrain import hillshade, slope_map_deg

START = datetime(2026, 1, 1, tzinfo=timezone.utc)


def run(lon, lat, **params):
    params.setdefault("start_time_utc", START)
    return calculate_site_potential(lon, lat, client=MockEngineClient(), **params)


# ----------------------------------------------------------------- validation
@pytest.mark.parametrize(
    "lon, lat",
    [(0, 91), (0, -91), (361, 0), (-361, 0), (float("nan"), 0), (0, float("inf")), ("abc", 0), (None, 0)],
)
def test_bad_coordinates_are_rejected(lon, lat):
    with pytest.raises(InvalidSiteRequest):
        build_request(lon, lat)


def test_longitude_is_wrapped_with_a_note():
    request, notes = build_request(190, 10)
    assert request.longitude == pytest.approx(-170)
    assert notes and "wrapped" in notes[0]
    assert run(350, 0).site.longitude == pytest.approx(-10)


def test_boundary_values_are_accepted():
    for lon, lat in [(180, 90), (-180, -90), (0, 0)]:
        assert build_request(lon, lat)[0].latitude == lat


def test_unknown_and_invalid_parameters_are_rejected():
    with pytest.raises(InvalidSiteRequest, match="Unknown parameter"):
        build_request(0, 0, panel_size=3)
    with pytest.raises(InvalidSiteRequest, match="panel_efficiency"):
        build_request(0, 0, panel_efficiency=1.5)
    with pytest.raises(InvalidSiteRequest, match="samples"):
        build_request(0, 0, duration_days=366, step_hours=0.1)


def test_none_parameters_fall_back_to_defaults_and_start_time_is_filled():
    request, _ = build_request(0, 0, duration_days=None)
    assert request.duration_days == 29.53
    assert request.start_time_utc is not None and request.start_time_utc.tzinfo is not None


# ----------------------------------------------------------- mock engine
def test_mock_is_deterministic_per_location_and_differs_between_locations():
    a, b = run(10, 20), run(10, 20)
    assert a.terrain == b.terrain and a.power == b.power and a.ephemeris == b.ephemeris
    assert a.terrain.elevation_m != run(10.0001, 20).terrain.elevation_m


def test_mock_result_is_flagged_and_matches_contract():
    r = run(23.47, 0.67)
    assert r.data_source == "mock" and r.warnings
    assert SiteResult.model_validate_json(r.model_dump_json()) == r  # JSON round trip
    n = len(r.ephemeris.times_utc)
    assert len(r.power.power_w) == len(r.ephemeris.sun.elevation_deg) == len(r.ephemeris.earth.azimuth_deg) == n
    grid = np.asarray(r.terrain.elevation_m)
    assert grid.shape == (128, 128)
    assert r.terrain.min_elevation_m == pytest.approx(grid.min())


def test_sun_geometry_is_plausible():
    # Apollo 11 landed shortly after local sunrise (real Sun elevation ~11 deg).
    # The mock uses a mean synodic month, so allow generous slack; this mainly guards sign errors.
    landing = datetime(1969, 7, 20, 20, 17, tzinfo=timezone.utc)
    r = run(23.47297, 0.67408, start_time_utc=landing, duration_days=1)
    assert 0 < r.ephemeris.sun.elevation_deg[0] < 30
    # Over a full lunar day an equatorial site is lit about half the time.
    assert run(0, 0).power.summary.sunlit_fraction == pytest.approx(0.5, abs=0.05)


def test_earth_visibility_follows_near_and_far_side():
    assert run(0, 0).power.summary.earth_visible_fraction == 1.0
    assert run(180, 0).power.summary.earth_visible_fraction == 0.0
    assert run(0, 0).site.near_side and not run(180, 0).site.near_side


def test_power_is_zero_in_darkness_and_bounded_by_the_array_rating():
    r = run(0, 0, panel_area_m2=10, panel_efficiency=0.25)
    ceiling = 10 * 0.25 * SOLAR_CONSTANT_W_M2
    for power, elevation in zip(r.power.power_w, r.ephemeris.sun.elevation_deg):
        assert 0 <= power <= ceiling + 1e-6
        if elevation <= 0:
            assert power == 0
    assert r.power.summary.peak_power_w <= ceiling + 1e-6


def test_terrain_helpers():
    r = run(0, 0)
    t = r.terrain
    slope = slope_map_deg(t.elevation_m, t.pixel_size_m)
    assert np.isfinite(slope).all() and slope.mean() == pytest.approx(t.mean_slope_deg)
    shade = hillshade(t.elevation_m, t.pixel_size_m)
    assert shade.min() >= 0 and shade.max() <= 1
    # a plane tilted 10 deg to the east must report a 10 deg slope everywhere
    x = np.arange(16) * 10.0
    plane = np.tile(np.tan(np.radians(10)) * x, (16, 1))
    assert slope_map_deg(plane, 10.0) == pytest.approx(10.0)


def test_failure_injection_reaches_the_caller():
    client = MockEngineClient(fail=EngineUnavailable("down"))
    with pytest.raises(EngineUnavailable):
        calculate_site_potential(0, 0, client=client)


# ------------------------------------------------------------- factory/config
def test_factory_selects_backend_from_settings():
    assert isinstance(get_client(load_settings({})), MockEngineClient)
    http = get_client(load_settings({"LUNAR_ENGINE_BACKEND": "http", "LUNAR_ENGINE_URL": "http://x:1"}))
    assert isinstance(http, HttpEngineClient) and http.url == "http://x:1/api/v1/landing-site/potential"
    with pytest.raises(EngineConfigError):
        get_client(load_settings({"LUNAR_ENGINE_BACKEND": "http"}))
    with pytest.raises(EngineConfigError):
        get_client(load_settings({"LUNAR_ENGINE_BACKEND": "nope"}))


# ----------------------------------------------------- HTTP client end to end
class _Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        body = self.rfile.read(int(self.headers["Content-Length"]))
        self.server.received = (self.path, json.loads(body))
        mode = self.server.mode
        if mode == "ok":
            reply = MockEngineClient().calculate_potential(SiteRequest.model_validate_json(body))
            self._send(200, reply.model_copy(update={"data_source": "engine"}).model_dump_json().encode())
        elif mode == "422":
            detail = [{"loc": ["body", "latitude"], "msg": "bad lat", "type": "value_error"}]
            self._send(422, json.dumps({"detail": detail}).encode())
        elif mode == "500":
            self._send(500, b'{"detail": "engine exploded"}')
        else:  # "garbage": valid JSON, wrong shape
            self._send(200, b'{"hello": 1}')

    def _send(self, code, payload):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *args):
        pass


@pytest.fixture
def engine_server():
    server = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    server.mode, server.received = "ok", None
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield server
    server.shutdown()
    server.server_close()


def _client(server):
    no_proxy = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    return HttpEngineClient(f"http://127.0.0.1:{server.server_port}", opener=no_proxy, timeout_s=10)


def test_http_client_round_trip(engine_server):
    result = calculate_site_potential(12.5, -3.25, client=_client(engine_server), start_time_utc=START)
    path, sent = engine_server.received
    assert path == "/api/v1/landing-site/potential"
    assert sent["longitude"] == 12.5 and sent["latitude"] == -3.25
    assert result.data_source == "engine" and result.site.longitude == 12.5


@pytest.mark.parametrize(
    "mode, error",
    [("422", InvalidSiteRequest), ("500", EngineError), ("garbage", EngineContractError)],
)
def test_http_client_maps_failures(engine_server, mode, error):
    engine_server.mode = mode
    with pytest.raises(error) as info:
        calculate_site_potential(0, 0, client=_client(engine_server))
    if mode == "422":
        assert "latitude: bad lat" in str(info.value)
    if mode == "500":
        assert info.value.status_code == 500 and "exploded" in str(info.value)


def test_http_client_reports_unreachable_engine():
    server = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    client = _client(server)
    server.server_close()  # nothing is listening on that port any more
    with pytest.raises(EngineUnavailable):
        calculate_site_potential(0, 0, client=client)
