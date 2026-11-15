// Builds per-site terrain packs for Lunarium and the Sun/Earth model:
//   public/terrain/<siteId>/meta.json  – layer dims, ground height, terrain horizon profile
//   public/terrain/<siteId>/near.f32   – 2 km  local grid, Float32 metres
//   public/terrain/<siteId>/mid.i16    – 16 km local grid, Int16 (offset + 0.5 m steps)
//   public/terrain/<siteId>/far.i16    – 300 km local grid, Int16
// Format and layer layout: src/data/horizonTerrain.js and src/data/SCHEMA.md (HorizonTerrain).
//
// Five south-polar sites use NASA PGDA 5 m/px LOLA DEMs (Barker et al. 2021, public domain,
// https://pgda.gsfc.nasa.gov/products/78; ~41–71 MB each, cached in scripts/.cache/pgda/).
// Every other curated site is built from the global grid made by fetch-textures.mjs, which
// must run first (npm "predev"/"prebuild" run both in order).
//
// Usage: node scripts/fetch-site-terrain.mjs [--if-missing] [--force]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fromArrayBuffer } from 'geotiff';
import { destination, clampLat } from '../src/utils/coords.js';
import { MOCK_SITES } from '../src/data/mock/sites.js';
import { makeGrid } from '../src/data/elevation.js';
import { samplePatch } from '../src/data/terrainPatch.js';
import { assembleHorizonTerrain, encodePack, PACK_VERSION } from '../src/data/horizonTerrain.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(here, '.cache', 'pgda');
const TEXTURES = path.join(here, '..', 'public', 'textures');
const OUT = path.join(here, '..', 'public', 'terrain');
const PGDA = 'https://pgda.gsfc.nasa.gov/data/LOLA_5mpp';
const R = 1737400;

// App site id → PGDA tile (matched by name from PGDA product 78; checked to contain the site).
// The site coordinates in mock/sites.js were moved onto the highest gentle-slope (< 5°) spot
// within 1.5 km in this 5 m data, so the viewer stands on landable ground, not a hillside.
const SITE_TILES = {
  'shackleton-rim': 'Site04',
  'connecting-ridge': 'Site01',
  'de-gerlache-rim': 'Site11',
  'leibnitz-beta': 'Site20',
  'malapert-massif': 'Site23',
};
const FINE = { near: { sizeM: 2000, n: 401 }, mid: { sizeM: 16000, n: 641 } };

const args = new Set(process.argv.slice(2));
const log = (...a) => console.log('[terrain]', ...a);

function packIsCurrent(id) {
  try {
    return JSON.parse(fs.readFileSync(path.join(OUT, id, 'meta.json'), 'utf8')).version === PACK_VERSION;
  } catch {
    return false;
  }
}

if (args.has('--if-missing') && MOCK_SITES.every((s) => packIsCurrent(s.id))) {
  log('site packs up to date, skipping (run `npm run terrain` to rebuild)');
  process.exit(0);
}

function loadGlobalGrid() {
  const metaPath = path.join(TEXTURES, 'moon_meta.json');
  if (!fs.existsSync(metaPath)) throw new Error('Global elevation grid missing: run `npm run textures` first.');
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const e = meta.elevation;
  const buf = fs.readFileSync(path.join(TEXTURES, e.file));
  const data = new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
  return makeGrid({ data, width: e.width, height: e.height, pixelsPerDegree: e.pixelsPerDegree, resolutionM: e.resolutionM, dataset: e.dataset });
}

async function download(tile) {
  const name = `${tile}_final_adj_5mpp_surf.tif`;
  const dest = path.join(CACHE, name);
  if (fs.existsSync(dest) && !args.has('--force')) return dest;
  fs.mkdirSync(CACHE, { recursive: true });
  const url = `${PGDA}/${tile}/${name}`;
  log(`downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${url}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}

// South polar stereographic (lat_0 = −90, lon_0 = 0, sphere R), as in the PGDA GeoTIFF keys.
function toStereo(lat, lon) {
  const rho = 2 * R * Math.tan(((90 + lat) / 2) * (Math.PI / 180));
  const l = lon * (Math.PI / 180);
  return [rho * Math.sin(l), rho * Math.cos(l)];
}

async function loadTile(file) {
  const buf = fs.readFileSync(file);
  const tiff = await fromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const img = await tiff.getImage();
  const [x0, y0, x1, y1] = img.getBoundingBox();
  const w = img.getWidth();
  const h = img.getHeight();
  const [data] = await img.readRasters();
  const nodata = img.getGDALNoData();
  const res = (x1 - x0) / w;
  const sample = (x, y) => {
    const fx = (x - x0) / res - 0.5;
    const fy = (y1 - y) / res - 0.5;
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    if (i < 0 || j < 0 || i >= w - 1 || j >= h - 1) return NaN;
    const tx = fx - i;
    const ty = fy - j;
    const v = (ii, jj) => {
      const z = data[jj * w + ii];
      return z === nodata || !Number.isFinite(z) ? NaN : z;
    };
    return (v(i, j) * (1 - tx) + v(i + 1, j) * tx) * (1 - ty) + (v(i, j + 1) * (1 - tx) + v(i + 1, j + 1) * tx) * ty;
  };
  return { x0, y0, x1, y1, sample };
}

/** Resample a PGDA tile onto a local east/north grid centred on (lat, lon). NaN = no data. */
function resample(tile, lat, lon, { sizeM, n }) {
  const out = new Float32Array(n * n);
  const step = sizeM / (n - 1);
  for (let j = 0; j < n; j++) {
    const north = sizeM / 2 - j * step;
    for (let i = 0; i < n; i++) {
      const east = -sizeM / 2 + i * step;
      const d = Math.hypot(east, north);
      const [la, lo] = d === 0 ? [lat, lon] : destination(lat, lon, (Math.atan2(east, north) * 180) / Math.PI, d / 1000);
      out[j * n + i] = tile.sample(...toStereo(la, lo));
    }
  }
  return out;
}

async function fineLayers(site) {
  const tileName = SITE_TILES[site.id];
  if (!tileName) return null;
  const tile = await loadTile(await download(tileName));
  const lat = clampLat(site.lat);
  const [sx, sy] = toStereo(lat, site.lon);
  if (!(sx > tile.x0 && sx < tile.x1 && sy > tile.y0 && sy < tile.y1)) {
    log(`WARNING ${site.id} lies outside PGDA ${tileName}; using the global grid only`);
    return null;
  }
  return { near: resample(tile, lat, site.lon, FINE.near), mid: resample(tile, lat, site.lon, FINE.mid), source: `PGDA LOLA 5 m ${tileName}` };
}

const grid = loadGlobalGrid();
const coarsePatch = (lat, lon, opts) => samplePatch(grid, lat, lon, opts);
let bytes = 0;
for (const site of MOCK_SITES) {
  if (args.has('--if-missing') && packIsCurrent(site.id)) continue;
  const t0 = Date.now();
  const terrain = await assembleHorizonTerrain({ site, coarsePatch, fine: await fineLayers(site) });
  const { meta, files } = encodePack(terrain);
  const dir = path.join(OUT, site.id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, buf] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), Buffer.from(buf));
    bytes += buf.byteLength;
  }
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta));
  log(`${site.id}: ${terrain.hasFineData ? '5 m' : 'global'} terrain, ground ${Math.round(terrain.groundM)} m (${Date.now() - t0} ms)`);
}
log(`done → ${path.relative(process.cwd(), OUT)} (${(bytes / 1e6).toFixed(1)} MB of layers written)`);
