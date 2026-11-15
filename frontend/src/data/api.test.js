import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { addSite, getPotentialMetrics, getSitePower, getSites } from './api.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const metricsResponse = {
  site: { id: 'custom-location', name: 'Custom location', loc: [-87, 43], lat: -87, lon: 43 },
  start: '2026-01-01T00:00:00Z',
  end: '2026-01-02T00:00:00Z',
  step: '4hour',
  instantaneous_power_per_area_W_m2: [0, 100, 100, 0],
  daily_power_generated_per_area_kWh_per_m2_day: [1.2],
  average_power_per_24h_W_m2: 50,
  average_power_sunlit_days_W_m2: 50,
  nearest_sunrise_utc: '2026-01-01T03:00:00Z',
  nearest_sunset_utc: '2026-01-01T21:00:00Z',
};

test('getSitePower requests sun events from the selected time and returns timestamps', async () => {
  let requestUrl;
  globalThis.fetch = async (url) => {
    requestUrl = String(url);
    return new Response(
      JSON.stringify({
        site: { id: 'orig1' },
        start: '2025-12-29T04:30:00Z',
        end: '2026-01-28T04:30:00Z',
        instantaneous_power_per_area_W_m2: [10, 20],
        daily_power_generated_per_area_kWh_per_m2_day: [1.5],
        average_power_per_24h_W_m2: 15,
        average_power_sunlit_days_W_m2: 20,
        nearest_sunrise_utc: '2026-01-01T10:00:00Z',
        nearest_sunset_utc: '2026-01-01T22:00:00Z',
        sky: {
          sun_altitude_degrees: 19.6,
          sun_visible: true,
          earth_altitude_degrees: 30.6,
          earth_visible: true,
          nearest_earthrise_utc: '2026-01-02T03:00:00Z',
          nearest_earthset_utc: '2026-01-02T15:00:00Z',
          longest_darkness_hours: 14.5,
          sunlit_fraction: 0.47,
        },
        sky_error: null,
      }),
      { headers: { 'content-type': 'application/json' } },
    );
  };

  const selectedTime = '2026-01-01T04:30:00.000Z';
  const power = await getSitePower({ id: 'orig1' }, selectedTime);
  const url = new URL(requestUrl, 'http://localhost');

  assert.equal(url.pathname, '/api/sites/orig1/metrics');
  assert.equal(url.searchParams.get('events_from'), selectedTime);
  assert.equal(url.searchParams.get('include_sky'), 'true');
  assert.equal(url.searchParams.get('start'), '2025-12-29T04:30:00.000Z');
  assert.equal(url.searchParams.get('end'), '2026-01-28T04:30:00.000Z');
  assert.equal(power.nearestSunriseUtc, '2026-01-01T10:00:00Z');
  assert.equal(power.nearestSunsetUtc, '2026-01-01T22:00:00Z');
  assert.deepEqual(power.sky, {
    sunAltitudeDeg: 19.6,
    sunVisible: true,
    earthAltitudeDeg: 30.6,
    earthVisible: true,
    nearestEarthriseUtc: '2026-01-02T03:00:00Z',
    nearestEarthsetUtc: '2026-01-02T15:00:00Z',
    longestDarknessH: 14.5,
    sunlitFraction: 0.47,
  });
  assert.equal(power.windowDays, 27);
  assert.equal(power.skyError, null);
});

test('getPotentialMetrics posts unsaved coordinates to the live metrics endpoint', async () => {
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = new URL(String(url), 'http://localhost');
    requests.push({ requestUrl, options });
    const body = requestUrl.pathname === '/api/sites'
      ? [{ id: 'orig1', name: 'Apollo 11', lat: 0.67, lon: 23.47, desc: '', agency: 'NASA' }]
      : metricsResponse;
    return new Response(JSON.stringify(body), {
      headers: { 'content-type': 'application/json' },
    });
  };

  const result = await getPotentialMetrics({
    lat: -87,
    lon: 43,
    start: '2026-01-01T00:00:00Z',
    end: '2026-01-02T00:00:00Z',
    step: '4hour',
  });

  assert.equal(result.dataSource, 'live');
  assert.equal(result.site, null);
  assert.equal(result.response.site.id, 'custom-location');
  assert.equal(result.response.nearest_sunrise_utc, '2026-01-01T03:00:00Z');
  const metricsRequest = requests.find(({ requestUrl }) => requestUrl.pathname === '/api/sites/metrics');
  assert.equal(metricsRequest.options.method, 'POST');
  assert.deepEqual(JSON.parse(metricsRequest.options.body), {
    lat: -87,
    lon: 43,
    start: '2026-01-01T00:00:00Z',
    end: '2026-01-02T00:00:00Z',
    step: '4hour',
  });
});

test('addSite posts a location explicitly to the persistent catalog', async () => {
  const requests = [];
  const created = {
    id: 'custom-123',
    name: 'Shackleton Ridge',
    loc: [-89, 25],
    lat: -89,
    lon: 25,
    desc: '',
    agency: 'Custom',
  };
  globalThis.fetch = async (url, options = {}) => {
    const request = { url: String(url), options };
    requests.push(request);
    if (options.method !== 'POST') return new Response(JSON.stringify([created]));
    return new Response(
      JSON.stringify(created),
      { headers: { 'content-type': 'application/json' } },
    );
  };

  const site = await addSite({ name: 'Shackleton Ridge', lat: -89, lon: 25 });
  const sites = await getSites();

  const saveRequest = requests.find(({ options }) => options.method === 'POST');
  assert.equal(new URL(saveRequest.url, 'http://localhost').pathname, '/api/sites');
  assert.deepEqual(JSON.parse(saveRequest.options.body), {
    name: 'Shackleton Ridge',
    lat: -89,
    lon: 25,
  });
  assert.equal(site.id, 'custom-123');
  assert.equal(site.fullName, 'Shackleton Ridge');
  assert.equal(sites.some((saved) => saved.id === 'custom-123'), true);
});

test('getSitePower preserves null when no sunrise or sunset is in range', async () => {
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        site: { id: 'orig2' },
        start: '2026-01-01T00:00:00Z',
        end: '2026-01-31T00:00:00Z',
        instantaneous_power_per_area_W_m2: [0, 0],
        daily_power_generated_per_area_kWh_per_m2_day: [0],
        average_power_per_24h_W_m2: 0,
        average_power_sunlit_days_W_m2: 0,
        nearest_sunrise_utc: null,
        nearest_sunset_utc: null,
      }),
      { headers: { 'content-type': 'application/json' } },
    );

  const power = await getSitePower({ id: 'orig2' }, '2026-01-04T00:00:00.000Z');

  assert.equal(power.nearestSunriseUtc, null);
  assert.equal(power.nearestSunsetUtc, null);
  assert.equal(power.sky, null);
  assert.equal(power.skyError, null);
});

test('getSitePower exposes partial sky failure without discarding solar metrics', async () => {
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        site: { id: 'orig3' },
        start: '2026-01-01T00:00:00Z',
        end: '2026-01-31T00:00:00Z',
        instantaneous_power_per_area_W_m2: [0, 100],
        daily_power_generated_per_area_kWh_per_m2_day: [1],
        average_power_per_24h_W_m2: 10,
        average_power_sunlit_days_W_m2: 20,
        nearest_sunrise_utc: '2026-01-02T03:00:00Z',
        nearest_sunset_utc: null,
        sky: null,
        sky_error: 'Earth ephemeris unavailable',
      }),
      { headers: { 'content-type': 'application/json' } },
    );

  const power = await getSitePower({ id: 'orig3' }, '2026-01-04T00:00:00.000Z');

  assert.equal(power.nearestSunriseUtc, '2026-01-02T03:00:00Z');
  assert.equal(power.sky, null);
  assert.equal(power.skyError, 'Earth ephemeris unavailable');
});
