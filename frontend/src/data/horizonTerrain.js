// Pure (no app config) so scripts/fetch-site-terrain.mjs can use it. Format: SCHEMA.md → HorizonTerrain.

import { clampLat, MOON_RADIUS_KM } from '../utils/coords.js';

export const EYE_HEIGHT_M = 2; // = mock metrics' panel mast height: the view and the numbers share one observer
export const PACK_VERSION = 2;
const HORIZON_STEP_DEG = 0.5;
const I16_SCALE_M = 0.5; // mid/far quantisation step (near stays Float32: 5 m cells need sub-metre detail)

const layer = (sizeM, n, heights) => ({ sizeM, n, spacingM: sizeM / (n - 1), heights });

/** Bilinear sample of a layer at local (east, north) metres; NaN outside. */
export function sampleLayer(L, east, north) {
  const fx = (east + L.sizeM / 2) / L.spacingM;
  const fy = (L.sizeM / 2 - north) / L.spacingM;
  const i = Math.floor(fx);
  const j = Math.floor(fy);
  if (i < 0 || j < 0 || i >= L.n - 1 || j >= L.n - 1) return NaN;
  const tx = fx - i;
  const ty = fy - j;
  const h = L.heights;
  const k = j * L.n + i;
  return (h[k] * (1 - tx) + h[k + 1] * tx) * (1 - ty) + (h[k + L.n] * (1 - tx) + h[k + L.n + 1] * tx) * ty;
}

/** Height at local (east, north) using the finest layer that covers it. */
export function heightAt({ layers }, east, north) {
  for (const L of [layers.near, layers.mid, layers.far]) {
    const h = sampleLayer(L, east, north);
    if (Number.isFinite(h)) return h;
  }
  return NaN;
}

/** Terrain horizon elevation (deg) every HORIZON_STEP_DEG of azimuth, incl. lunar curvature. */
export function computeHorizon(terrain) {
  const eye = terrain.groundM + terrain.eyeHeightM;
  const R = MOON_RADIUS_KM * 1000;
  const bins = [];
  for (let az = 0; az < 360; az += HORIZON_STEP_DEG) {
    const s = Math.sin((az * Math.PI) / 180);
    const c = Math.cos((az * Math.PI) / 180);
    let best = -90;
    for (let d = 10; d <= 149000; d += d < 1000 ? 5 : d < 8000 ? 25 : 500) {
      const h = heightAt(terrain, d * s, d * c);
      if (!Number.isFinite(h)) break;
      const ang = Math.atan2(h - eye - (d * d) / (2 * R), d) * (180 / Math.PI);
      if (ang > best) best = ang;
    }
    bins.push(Number(best.toFixed(3)));
  }
  return { stepDeg: HORIZON_STEP_DEG, eyeHeightM: terrain.eyeHeightM, elevation: bins };
}

/** Horizon elevation (deg) at any azimuth, linearly interpolated. */
export function horizonAt(horizon, az) {
  const b = horizon.elevation;
  const x = (((az % 360) + 360) % 360) / horizon.stepDeg;
  const i = Math.floor(x) % b.length;
  const f = x - Math.floor(x);
  return b[i] * (1 - f) + b[(i + 1) % b.length] * f;
}

/** Layers + horizon for a site. `fine` holds the optional 5 m LOLA layers (NaN = no data). */
export async function assembleHorizonTerrain({ site, coarsePatch, fine = null }) {
  const lat = clampLat(site.lat);
  const nMid = fine ? 641 : 321;
  const nNear = fine ? 401 : 201;
  const [farP, midP, nearP] = await Promise.all([
    coarsePatch(lat, site.lon, { sizeKm: 300, n: 301 }),
    coarsePatch(lat, site.lon, { sizeKm: 16, n: nMid }),
    coarsePatch(lat, site.lon, { sizeKm: 2, n: nNear }),
  ]);
  const far = layer(300000, 301, farP.heights);
  let mid;
  let near;
  if (fine) {
    // Bias between 5 m LOLA and the coarse grid (tens of metres), used to fill holes.
    let sum = 0;
    let cnt = 0;
    for (let k = 0; k < fine.mid.length; k += 7) {
      if (Number.isFinite(fine.mid[k])) {
        sum += fine.mid[k] - midP.heights[k];
        cnt++;
      }
    }
    const bias = cnt ? sum / cnt : 0;
    const n = nMid;
    const mh = new Float32Array(n * n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        const coarse = midP.heights[k];
        const v = Number.isFinite(fine.mid[k]) ? fine.mid[k] : coarse + bias;
        // Blend the outer 15% into the coarse grid so the seam with the far layer is hidden.
        const w = Math.min(1, Math.min(i, j, n - 1 - i, n - 1 - j) / (n - 1) / 0.15);
        mh[k] = v * w + coarse * (1 - w);
      }
    }
    mid = layer(16000, n, mh);
    near = layer(2000, nNear, Float32Array.from(fine.near, (v, k) => (Number.isFinite(v) ? v : nearP.heights[k] + bias)));
  } else {
    mid = layer(16000, nMid, Float32Array.from(midP.heights));
    near = layer(2000, nNear, Float32Array.from(nearP.heights));
  }
  const terrain = {
    siteId: site.id,
    source: fine ? `${fine.source} + ${farP.source}` : farP.source,
    hasFineData: !!fine,
    eyeHeightM: EYE_HEIGHT_M,
    groundM: sampleLayer(near, 0, 0),
    layers: { near, mid, far },
  };
  terrain.horizon = computeHorizon(terrain);
  return terrain;
}

/** Serialise to a site pack: meta (JSON, includes horizon) + binary layer files. */
export function encodePack(terrain) {
  const files = {};
  const layers = {};
  for (const [name, L] of Object.entries(terrain.layers)) {
    const meta = { sizeM: L.sizeM, n: L.n };
    if (name === 'near') {
      meta.file = 'near.f32';
      meta.format = 'f32';
      files[meta.file] = Float32Array.from(L.heights).buffer;
    } else {
      meta.file = `${name}.i16`;
      meta.format = 'i16';
      meta.offsetM = Math.round(terrain.groundM);
      meta.scaleM = I16_SCALE_M;
      const q = new Int16Array(L.heights.length);
      for (let k = 0; k < q.length; k++) q[k] = Math.max(-32767, Math.min(32767, Math.round((L.heights[k] - meta.offsetM) / I16_SCALE_M)));
      files[meta.file] = q.buffer;
    }
    layers[name] = meta;
  }
  const { siteId, source, hasFineData, eyeHeightM, groundM, horizon } = terrain;
  return { meta: { version: PACK_VERSION, siteId, source, hasFineData, eyeHeightM, groundM, horizon, layers }, files };
}

/** Inverse of encodePack. `buffers` maps file name → ArrayBuffer. */
export function decodePack(meta, buffers) {
  const layers = {};
  for (const [name, m] of Object.entries(meta.layers)) {
    const buf = buffers[m.file];
    const heights =
      m.format === 'f32' ? new Float32Array(buf) : Float32Array.from(new Int16Array(buf), (v) => v * m.scaleM + m.offsetM);
    layers[name] = layer(m.sizeM, m.n, heights);
  }
  const { siteId, source, hasFineData, eyeHeightM, groundM, horizon } = meta;
  return { siteId, source, hasFineData, eyeHeightM, groundM, horizon, layers };
}

/** Fetch a site pack's meta.json; null if there is no (current-version) pack. */
export async function fetchPackMeta(base, siteId) {
  try {
    const res = await fetch(`${base}${encodeURIComponent(siteId)}/meta.json`);
    // Dev servers answer unknown paths with index.html, so check the content type too.
    if (!res.ok || !res.headers.get('content-type')?.includes('json')) return null;
    const meta = await res.json();
    return meta.version === PACK_VERSION ? meta : null;
  } catch {
    return null;
  }
}

/** Fetch a pack's binary layers and decode it. */
export async function fetchPack(base, meta) {
  const entries = await Promise.all(
    Object.values(meta.layers).map(async (m) => {
      const res = await fetch(`${base}${encodeURIComponent(meta.siteId)}/${m.file}`);
      if (!res.ok) throw new Error(`Terrain pack file missing: ${m.file} (${res.status}). Run "npm run terrain".`);
      return [m.file, await res.arrayBuffer()];
    }),
  );
  return decodePack(meta, Object.fromEntries(entries));
}
