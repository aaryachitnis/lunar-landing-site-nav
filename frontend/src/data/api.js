// Single data-access layer for the frontend. Components and hooks import ONLY from here.
// Today everything is mocked locally; when the Python backend is ready, swap each function
// body for a fetch() to its endpoint/JSON file — return shapes are documented in SCHEMA.md.

import { MOCK_SITES, parseCustomSiteId } from './mock/sites.js';
import { computeSiteMetrics } from './mock/metrics.js';
import { loadElevation } from './elevation.js';
import { destination, clampLat } from '../utils/coords.js';

const latency = (ms = 120) => new Promise((r) => setTimeout(r, ms));

/** @returns {Promise<Site[]>} */
export async function getSites() {
  await latency();
  return MOCK_SITES;
}

/** Resolve a site id (including custom_<lat>_<lon> ids) to a site object. */
export async function getSite(id) {
  const sites = await getSites();
  return sites.find((s) => s.id === id) ?? parseCustomSiteId(id);
}

/**
 * @param {Site} site
 * @param {string} dateISO selected time (ISO 8601)
 * @returns {Promise<SiteMetrics>}
 */
export async function getSiteMetrics(site, dateISO) {
  const grid = await loadElevation();
  await latency(80);
  return computeSiteMetrics(grid, site, new Date(dateISO));
}

/**
 * Square terrain patch centred on a site, sampled on a local tangent-plane grid
 * (azimuthal equidistant), so it works at the poles.
 * @returns {Promise<TerrainPatch>}
 */
export async function getTerrainPatch(lat, lon, { sizeKm = 80, n = 128 } = {}) {
  const grid = await loadElevation();
  const la0 = clampLat(lat);
  const step = sizeKm / (n - 1);
  const heights = new Float32Array(n * n);
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (let j = 0; j < n; j++) {
    const north = sizeKm / 2 - j * step; // row 0 = north edge
    for (let i = 0; i < n; i++) {
      const east = -sizeKm / 2 + i * step;
      const dist = Math.hypot(east, north);
      const [la, lo] = dist === 0 ? [la0, lon] : destination(la0, lon, (Math.atan2(east, north) * 180) / Math.PI, dist);
      const h = grid.sample(la, lo);
      heights[j * n + i] = h;
      sum += h;
      if (h < min) min = h;
      if (h > max) max = h;
    }
  }
  // Mean slope and roughness over the central quarter of the patch (where a lander would actually be).
  const c0 = Math.floor(n * 0.375);
  const c1 = Math.ceil(n * 0.625);
  const mid = (c0 + c1 - 1) / 2;
  let slopeSum = 0;
  let count = 0;
  let zSum = 0;
  let xz = 0;
  let yz = 0;
  let xx = 0;
  let yy = 0;
  const stepM = step * 1000;
  for (let j = c0; j < c1; j++) {
    for (let i = c0; i < c1; i++) {
      const z = heights[j * n + i];
      const dx = (heights[j * n + i + 1] - heights[j * n + i - 1]) / (2 * stepM);
      const dy = (heights[(j + 1) * n + i] - heights[(j - 1) * n + i]) / (2 * stepM);
      slopeSum += Math.atan(Math.hypot(dx, dy)) * (180 / Math.PI);
      count++;
      // Accumulate for a least-squares plane z = a + b·x + c·y (x, y centred, so the terms decouple).
      const x = i - mid;
      const y = j - mid;
      zSum += z;
      xz += x * z;
      yz += y * z;
      xx += x * x;
      yy += y * y;
    }
  }
  // Surface roughness: RMS height deviation from the best-fit plane (detrended, so a uniform
  // tilt is "slope", not "roughness"). Baseline = sample spacing, so this is km-scale roughness.
  const a = zSum / count;
  const b = xz / xx;
  const c = yz / yy;
  let sq = 0;
  for (let j = c0; j < c1; j++) {
    for (let i = c0; i < c1; i++) {
      const r = heights[j * n + i] - (a + b * (i - mid) + c * (j - mid));
      sq += r * r;
    }
  }
  await latency(40);
  return {
    sizeKm,
    n,
    spacingM: stepM,
    heights,
    minM: min,
    maxM: max,
    meanM: sum / (n * n),
    centerElevationM: grid.sample(la0, lon),
    meanSlopeDeg: slopeSum / count,
    roughnessM: Math.sqrt(sq / count),
    centralKm: (c1 - c0 - 1) * step,
    sourceResolutionM: grid.resolutionM,
    source: `${grid.dataset} (bilinear)`,
  };
}
