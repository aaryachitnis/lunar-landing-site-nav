import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { getSitePower } from './api.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

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
      }),
      { headers: { 'content-type': 'application/json' } },
    );
  };

  const selectedTime = '2026-01-01T04:30:00.000Z';
  const power = await getSitePower({ id: 'orig1' }, selectedTime);
  const url = new URL(requestUrl, 'http://localhost');

  assert.equal(url.pathname, '/api/sites/orig1/metrics');
  assert.equal(url.searchParams.get('events_from'), selectedTime);
  assert.equal(url.searchParams.get('start'), '2025-12-29T04:30:00.000Z');
  assert.equal(url.searchParams.get('end'), '2026-01-28T04:30:00.000Z');
  assert.equal(power.nearestSunriseUtc, '2026-01-01T10:00:00Z');
  assert.equal(power.nearestSunsetUtc, '2026-01-01T22:00:00Z');
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
});
