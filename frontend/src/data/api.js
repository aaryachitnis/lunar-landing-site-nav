// Single data-access layer for the frontend. Components and hooks import ONLY from here.
// Today everything is mocked locally; when the Python backend is ready, swap each function
// body for a fetch() to its endpoint/JSON file — return shapes are documented in SCHEMA.md.

import { MOCK_SITES } from './mock/sites.js';
import { computeSiteMetrics } from './mock/metrics.js';
import { loadElevation } from './elevation.js';
import { samplePatch } from './terrainPatch.js';
import { assembleHorizonTerrain, fetchPack, fetchPackMeta } from './horizonTerrain.js';
import { TERRAIN_BASE } from '../scene/config.js';

const latency = (ms = 120) => new Promise((r) => setTimeout(r, ms));

/** @returns {Promise<Site[]>} */
export async function getSites() {
  await latency();
  return MOCK_SITES;
}

/** Resolve a site id to a site object (null if unknown). */
export async function getSite(id) {
  const sites = await getSites();
  return sites.find((s) => s.id === id) ?? null;
}

/**
 * @param {Site} site
 * @param {string} dateISO selected time (ISO 8601)
 * @returns {Promise<SiteMetrics>}
 */
export async function getSiteMetrics(site, dateISO) {
  // Same terrain horizon as the Horizon View (one source of truth for visibility/power).
  const horizon = await getSiteHorizon(site);
  await latency(80);
  return computeSiteMetrics(null, site, new Date(dateISO), { horizon });
}

// Per-site caches (promises, so concurrent callers share one request).
const packMetaCache = new Map();
const terrainCache = new Map();
const cached = (map, key, make) => {
  if (!map.has(key)) {
    const p = make();
    map.set(key, p);
    p.catch(() => map.delete(key));
  }
  return map.get(key);
};

/**
 * First-person terrain (near/mid/far layers) + terrain horizon for a site → SCHEMA.md
 * HorizonTerrain. Curated sites load a precomputed site pack (~1–2 MB); otherwise it is built
 * from the global elevation grid in the browser.
 * @returns {Promise<HorizonTerrain>}
 */
export function getHorizonTerrain(site) {
  return cached(terrainCache, site.id, async () => {
    const meta = await cached(packMetaCache, site.id, () => fetchPackMeta(TERRAIN_BASE, site.id));
    if (meta) return fetchPack(TERRAIN_BASE, meta);
    const grid = await loadElevation();
    return assembleHorizonTerrain({ site, coarsePatch: (lat, lon, opts) => samplePatch(grid, lat, lon, opts) });
  });
}

/**
 * Terrain horizon profile only ({stepDeg, eyeHeightM, elevation[]}). Cheap for curated sites:
 * it comes from the pack's meta.json without loading terrain layers.
 */
export async function getSiteHorizon(site) {
  if (terrainCache.has(site.id)) return (await terrainCache.get(site.id)).horizon;
  const meta = await cached(packMetaCache, site.id, () => fetchPackMeta(TERRAIN_BASE, site.id));
  return meta ? meta.horizon : (await getHorizonTerrain(site)).horizon;
}

/**
 * Square terrain patch centred on a site, sampled on a local tangent-plane grid
 * (azimuthal equidistant), so it works at the poles.
 * @returns {Promise<TerrainPatch>}
 */
export async function getTerrainPatch(lat, lon, opts = {}) {
  const grid = await loadElevation();
  const patch = samplePatch(grid, lat, lon, opts);
  await latency(40);
  return patch;
}
