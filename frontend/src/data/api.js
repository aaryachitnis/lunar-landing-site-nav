// The only module components and hooks import data from. Return shapes are in SCHEMA.md.
//
// Live (FastAPI backend):  getSites, getSitePower
// Mocked in the browser:   getSkyModel (Sun/Earth positions), getLunariumSites
// Terrain (NASA LOLA):     getTerrainPatch, getHorizonTerrain, getSiteHorizon

import { fetchJson } from './backend.js';
import { describeSite } from './siteCatalog.js';
import { MOCK_SITES } from './mock/sites.js';
import { computeSiteMetrics } from './mock/metrics.js';
import { loadElevation } from './elevation.js';
import { samplePatch } from './terrainPatch.js';
import { assembleHorizonTerrain, fetchPack, fetchPackMeta } from './horizonTerrain.js';
import { TERRAIN_BASE } from '../scene/config.js';

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
  sitesPromise ??= fetchJson('/sites').then((sites) => sites.map(describeSite));
  sitesPromise.catch(() => (sitesPromise = null));
  return sitesPromise;
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
  return live.find((s) => s.id === id) ?? null;
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

// ── Sun & Earth (mock) ─────────────────────────────────────────────────────

/**
 * Sun and Earth positions, visibility and rise/set times from a simplified geometric model
 * run in the browser. Mocked until the backend provides Sun/Earth data.
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
