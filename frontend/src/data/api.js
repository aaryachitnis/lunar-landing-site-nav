// The only module components and hooks import data from. Return shapes are in SCHEMA.md.
//
// Live (FastAPI backend):  getSites, getSitePower (power and optional sky metrics)
// Modeled in the browser:  getSkyModel (Sun/Earth positions), getLunariumSites
// Terrain (NASA LOLA):     getTerrainPatch, getHorizonTerrain, getSiteHorizon
// Playground:              calculatePotential (live backend metrics, mock on errors)

import { fetchJson, postJson } from './backend.js';
import { describeSite } from './siteCatalog.js';
import { MOCK_SITES } from './mock/sites.js';
import { computeSiteMetrics } from './mock/metrics.js';
import { loadElevation } from './elevation.js';
import { samplePatch } from './terrainPatch.js';
import { assembleHorizonTerrain, fetchPack, fetchPackMeta } from './horizonTerrain.js';
import { TERRAIN_BASE } from '../scene/config.js';
import { ENGINE_SETTINGS, ENGINE_STEPS, mockEnginePotential } from './mock/engine.js';

const HOUR_MS = 3.6e6;
const DAY_MS = 24 * HOUR_MS;

// Shares one in-flight promise per key; failed requests are dropped so they can be retried.
const cached = (map, key, make) => {
  if (!map.has(key)) {
    const p = make();
    map.set(key, p);
    p.catch(() => map.delete(key));
  }
  return map.get(key);
};

// ── Sites ──────────────────────────────────────────────────────────────────

let sitesPromise = null;

/** @returns {Promise<Site[]>} Backend sites with display names attached. */
export function getSites() {
  if (!sitesPromise) {
    const request = fetchJson('/sites').then((sites) => sites.map(describeSite));
    sitesPromise = request;
    request.catch(() => {
      if (sitesPromise === request) sitesPromise = null;
    });
  }
  return sitesPromise;
}

/** Add a custom location to the persistent backend catalog. */
export async function addSite({ name, lat, lon }) {
  const site = await postJson('/sites', { name, lat, lon });
  sitesPromise = null;
  return describeSite(site);
}

/** @returns {Promise<Site[]>} Lunarium's own site list (mock catalog with terrain packs). */
export async function getLunariumSites() {
  return MOCK_SITES;
}

/** Lunarium accepts its own ids and backend ids, so the selected site carries across tabs. */
export async function getLunariumSite(id) {
  const local = MOCK_SITES.find((s) => s.id === id);
  if (local) return local;
  const live = await getSites().catch(() => []);
  return live.find((s) => s.id === id || s.legacyId === id) ?? null;
}

// ── Solar power (live) ─────────────────────────────────────────────────────

export const POWER_WINDOW = { daysBefore: 3, daysAfter: 27, stepHours: 2 };
const powerCache = new Map();

/**
 * Solar power per m² for a flat panel, from the backend's JPL Horizons ephemeris.
 * The window runs from 3 days before to 27 days after `dateISO`.
 * @returns {Promise<SitePower>}
 */
export function getSitePower(site, dateISO) {
  const t0 = Date.parse(dateISO);
  const { daysBefore, daysAfter, stepHours } = POWER_WINDOW;
  const start = new Date(t0 - daysBefore * DAY_MS).toISOString();
  const end = new Date(t0 + daysAfter * DAY_MS).toISOString();

  return cached(powerCache, `${site.id}|${dateISO}`, async () => {
    const res = await fetchJson(`/sites/${encodeURIComponent(site.id)}/metrics`, {
      start,
      end,
      step: `${stepHours}hour`,
      events_from: new Date(t0).toISOString(),
      include_sky: 'true',
    });
    // Samples are evenly spaced from `start`; the response carries values only.
    const startMs = Date.parse(res.start);
    const series = res.instantaneous_power_per_area_W_m2.map((wPerM2, i) => {
      const t = startMs + i * stepHours * HOUR_MS;
      return { t, hoursFromSelected: (t - t0) / HOUR_MS, wPerM2 };
    });
    const daily = res.daily_power_generated_per_area_kWh_per_m2_day.map((kWhPerM2, i) => ({
      day: i - daysBefore,
      kWhPerM2,
    }));
    return {
      site: res.site,
      start: res.start,
      end: res.end,
      stepHours,
      series,
      daily,
      nowWPerM2: valueAt(series, t0),
      totalKWhPerM2: daily.reduce((sum, d) => sum + d.kWhPerM2, 0),
      avgWPerM2: res.average_power_per_24h_W_m2,
      avgSunlitDaysWPerM2: res.average_power_sunlit_days_W_m2,
      nearestSunriseUtc: res.nearest_sunrise_utc,
      nearestSunsetUtc: res.nearest_sunset_utc,
      sky: res.sky
        ? {
            sunAltitudeDeg: res.sky.sun_altitude_degrees,
            sunVisible: res.sky.sun_visible,
            earthAltitudeDeg: res.sky.earth_altitude_degrees,
            earthVisible: res.sky.earth_visible,
            nearestEarthriseUtc: res.sky.nearest_earthrise_utc,
            nearestEarthsetUtc: res.sky.nearest_earthset_utc,
            longestDarknessH: res.sky.longest_darkness_hours,
            sunlitFraction: res.sky.sunlit_fraction,
          }
        : null,
      skyError: res.sky_error ?? null,
      windowDays: daysAfter,
      source: 'JPL Horizons via backend',
    };
  });
}

function valueAt(series, t) {
  const i = series.findIndex((p) => p.t >= t);
  if (i <= 0) return series[Math.max(i, 0)]?.wPerM2 ?? null;
  const a = series[i - 1];
  const b = series[i];
  return a.wPerM2 + ((b.wPerM2 - a.wPerM2) * (t - a.t)) / (b.t - a.t);
}

// ── Sun & Earth (modeled horizon visualization) ────────────────────────────

/**
 * Sun and Earth geometry for the terrain-aware horizon visualization.
 * Site-panel metric tiles use live ephemerides from getSitePower instead.
 * @returns {Promise<SkyModel>}
 */
export async function getSkyModel(site, dateISO) {
  const horizon = await getSiteHorizon(site);
  return computeSiteMetrics(null, site, new Date(dateISO), { horizon });
}

// ── Terrain ────────────────────────────────────────────────────────────────

const packMetaCache = new Map();
const terrainCache = new Map();
const packId = (site) => site.terrainId ?? site.id;
const packMeta = (site) => cached(packMetaCache, packId(site), () => fetchPackMeta(TERRAIN_BASE, packId(site)));

/**
 * First-person terrain and terrain horizon. Uses the site's prebuilt pack when there is one,
 * otherwise builds it from the global elevation grid in the browser.
 * @returns {Promise<HorizonTerrain>}
 */
export function getHorizonTerrain(site) {
  return cached(terrainCache, packId(site), async () => {
    const meta = await packMeta(site);
    if (meta) return fetchPack(TERRAIN_BASE, meta);
    const grid = await loadElevation();
    return assembleHorizonTerrain({ site, coarsePatch: (lat, lon, opts) => samplePatch(grid, lat, lon, opts) });
  });
}

/** Terrain horizon only. Cheap for sites with a pack: it is read from the pack's meta.json. */
export async function getSiteHorizon(site) {
  if (terrainCache.has(packId(site))) return (await terrainCache.get(packId(site))).horizon;
  const meta = await packMeta(site);
  return meta ? meta.horizon : (await getHorizonTerrain(site)).horizon;
}

/**
 * Square terrain patch centred on a site, on a local tangent-plane grid so it works at the poles.
 * @returns {Promise<TerrainPatch>}
 */
export async function getTerrainPatch(lat, lon, opts = {}) {
  const grid = await loadElevation();
  return samplePatch(grid, lat, lon, opts);
}

// ── Playground (/playground) ───────────────────────────────────────────────
//
// Power for any coordinate uses the shared metrics calculator. Saved sites use their ID;
// unsaved coordinates are sent to the coordinate-based backend endpoint.

// Within ~0.3 km of a backend site counts as "that site" (catalogue coordinates have 4–5 decimals).
const PLAYGROUND_MATCH_DEG = 0.01;
const playgroundPowerCache = new Map();

/** The site in `sites` at these coordinates, or null. Pure, so the form can show live/mock status. */
export function matchBackendSite(sites, lat, lon) {
  if (!sites || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return sites.find((s) => Math.abs(s.lat - lat) < PLAYGROUND_MATCH_DEG && Math.abs(s.lon - lon) < PLAYGROUND_MATCH_DEG) ?? null;
}

/** { site } for the backend site at these coordinates (site may be null), or { error } if unreachable. */
async function findBackendSite(lat, lon) {
  try {
    return { site: matchBackendSite(await getSites(), lat, lon) };
  } catch (error) {
    return { site: null, error };
  }
}

/**
 * Engine call for the Playground. Returns the backend's PowerMetricsResponse (snake_case) plus
 * where it came from: { dataSource: 'live' | 'mock', site, reason, response }.
 */
export async function getPotentialMetrics({ lat, lon, start, end, step }) {
  const { site } = await findBackendSite(lat, lon);
  const cacheSite = site?.id ?? `${lat},${lon}`;
  try {
    const response = await cached(
      playgroundPowerCache,
      `${cacheSite}|${start}|${end}|${step}`,
      () =>
        site
          ? fetchJson(`/sites/${encodeURIComponent(site.id)}/metrics`, { start, end, step })
          : postJson('/sites/metrics', { lat, lon, start, end, step }),
    );
    return { dataSource: 'live', site, reason: null, response };
  } catch (error) {
    return {
      dataSource: 'mock',
      site,
      reason: `Live data failed (${error.message}). Showing mock values.`,
      response: mockEnginePotential({ lat, lon, start, end, step }),
    };
  }
}

/**
 * "Calculate potential" for any coordinate → SCHEMA.md PotentialResult. Terrain comes from the
 * same real LOLA grid as the other views; power is live when possible.
 * @param {{lat:number, lon:number, start:string, durationDays:number, step:string, panelAreaM2:number, tileKm:number}} p
 * @returns {Promise<PotentialResult>}
 */
export async function calculatePotential({ lat, lon, start, durationDays, step, panelAreaM2, tileKm }) {
  const end = new Date(Date.parse(start) + durationDays * DAY_MS).toISOString();
  const [grid, engine] = await Promise.all([
    loadElevation(),
    getPotentialMetrics({ lat, lon, start, end, step }),
  ]);
  const terrain = samplePatch(grid, lat, lon, { sizeKm: tileKm, n: 128 });
  const stepH = ENGINE_STEPS[step];
  const t0 = Date.parse(engine.response.start);
  return {
    request: { lat, lon, start, end, durationDays, step, panelAreaM2, tileKm },
    site: {
      name: engine.site?.name ?? 'Custom site',
      backendId: engine.site?.id ?? null,
      lat,
      lon,
      nearSide: Math.abs(lon) <= 90,
      region: Math.abs(lat) >= 80 ? (lat < 0 ? 'South polar' : 'North polar') : Math.abs(lat) >= 60 ? 'High latitude' : 'Mid/low latitude',
      altitudeM: terrain.centerElevationM,
    },
    terrain,
    engine: {
      ...engine,
      efficiency: ENGINE_SETTINGS.panelEfficiency,
      source: engine.dataSource === 'live' ? 'JPL Horizons via backend' : 'Mock engine (simplified geometry)',
      // Samples are evenly spaced from `start`; the response carries values only (same as getSitePower).
      times: engine.response.instantaneous_power_per_area_W_m2.map((_, i) => t0 + i * stepH * HOUR_MS),
    },
  };
}

/** Engine options the Playground form offers (Horizons step strings and the engine's fixed settings). */
export { ENGINE_STEPS, ENGINE_SETTINGS };
