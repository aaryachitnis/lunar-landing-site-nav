// Downloads NASA's CGI Moon Kit maps (public domain) and converts them into
// browser-friendly textures for the viewer:
//   moon_color.jpg   – LROC albedo (sRGB)
//   moon_disp.png    – 8-bit normalised elevation (vertex displacement)
//   moon_normal.png  – tangent-space normal map derived from full-precision LOLA elevation
//   moon_elev_i16.bin – full-res LOLA elevation grid, little-endian Int16 metres (for lookups / terrain patches)
//   moon_meta.json   – elevation range + grid dims, so the viewer can scale displacement in real units
//
// Source: https://svs.gsfc.nasa.gov/4720
// Usage: node scripts/fetch-textures.mjs [--if-missing] [--force]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { fromArrayBuffer } from 'geotiff';

const here = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(here, '.cache');
const OUT = path.join(here, '..', 'public', 'textures');
const BASE = 'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720';

const COLOR_SRC = 'lroc_color_poles_4k.tif'; // 4096x2048 RGB, ~13 MB

const MOON_RADIUS_KM = 1737.4;

// ── Terrain resolution: the ONLY line to change to swap the elevation source ──
// 16 → ldem_16.tif:  5760×2880 float32 km, ~66 MB source, ~1.9 km/px, ~33 MB moon_elev_i16.bin
// 64 → ldem_64.tif: 23040×11520 float32 km, ~1 GB source, ~474 m/px, ~530 MB moon_elev_i16.bin
//      (the browser downloads that bin when a site panel opens; the build needs several GB of RAM)
const ELEV_PPD = 16; // pixels per degree
const ELEV_SRC = `ldem_${ELEV_PPD}.tif`;
const ELEV_W = 360 * ELEV_PPD;
const ELEV_H = 180 * ELEV_PPD;
const ELEV_RES_M = ((Math.PI * MOON_RADIUS_KM) / ELEV_H) * 1000; // metres per pixel (latitude)
const NORMAL_STRENGTH = 3; // bakes a mild slope exaggeration; tweak live via normalScale in the GUI
const OUT_W = 4096;
const OUT_H = 2048;
const DISP_W = 2048;
const DISP_H = 1024;

const OUTPUTS = ['moon_color.jpg', 'moon_disp.png', 'moon_normal.png', 'moon_elev_i16.bin', 'moon_meta.json'];

const args = new Set(process.argv.slice(2));
const builtPpd = () => {
  try {
    return JSON.parse(fs.readFileSync(path.join(OUT, 'moon_meta.json'), 'utf8')).elevation.pixelsPerDegree ?? 16;
  } catch {
    return null;
  }
};
// Skip only if everything exists AND was built at the configured resolution (so changing ELEV_PPD rebuilds).
if (args.has('--if-missing') && OUTPUTS.every((f) => fs.existsSync(path.join(OUT, f))) && builtPpd() === ELEV_PPD) {
  console.log('[textures] already generated, skipping (run `npm run textures` to rebuild)');
  process.exit(0);
}

fs.mkdirSync(CACHE, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

async function download(name) {
  const dest = path.join(CACHE, name);
  if (fs.existsSync(dest) && !args.has('--force')) return dest;
  const url = `${BASE}/${name}`;
  console.log(`[textures] downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${url}`);
  const total = Number(res.headers.get('content-length')) || 0;
  const chunks = [];
  let got = 0;
  let lastPct = -1;
  for await (const chunk of res.body) {
    chunks.push(chunk);
    got += chunk.length;
    const pct = total ? Math.floor((got / total) * 100) : -1;
    if (pct !== lastPct && pct % 10 === 0) {
      process.stdout.write(`  ${pct}%\r`);
      lastPct = pct;
    }
  }
  fs.writeFileSync(dest + '.part', Buffer.concat(chunks));
  fs.renameSync(dest + '.part', dest);
  console.log(`  saved ${(got / 1e6).toFixed(1)} MB`);
  return dest;
}

async function buildColor(src) {
  await sharp(src, { limitInputPixels: false })
    .resize(OUT_W, OUT_H, { fit: 'fill' })
    .toColourspace('srgb')
    .jpeg({ quality: 92, mozjpeg: true })
    .toFile(path.join(OUT, 'moon_color.jpg'));
  console.log('[textures] wrote moon_color.jpg');
}

async function readElevation(src) {
  const buf = fs.readFileSync(src);
  // Avoid copying the file buffer when it isn't a slice of a shared pool (matters for the ~1 GB ldem_64).
  const ab = buf.byteOffset === 0 && buf.byteLength === buf.buffer.byteLength ? buf.buffer : buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const tiff = await fromArrayBuffer(ab);
  const image = await tiff.getImage();
  const w = image.getWidth();
  const h = image.getHeight();
  if (w !== ELEV_W || h !== ELEV_H) {
    throw new Error(`[textures] ${ELEV_SRC} is ${w}×${h}, expected ${ELEV_W}×${ELEV_H} for ELEV_PPD = ${ELEV_PPD}`);
  }
  const [band] = await image.readRasters();
  return { w, h, data: band instanceof Float32Array ? band : Float32Array.from(band) };
}

async function buildDisplacement({ w, h, data }) {
  let min = Infinity;
  let max = -Infinity;
  for (const v of data) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min;
  const bytes = new Uint8Array(w * h);
  for (let i = 0; i < data.length; i++) bytes[i] = Math.round(((data[i] - min) / range) * 255);
  await sharp(bytes, { raw: { width: w, height: h, channels: 1 } })
    .resize(DISP_W, DISP_H, { fit: 'fill' })
    .png()
    .toFile(path.join(OUT, 'moon_disp.png'));
  fs.writeFileSync(
    path.join(OUT, 'moon_meta.json'),
    JSON.stringify(
      {
        radiusKm: MOON_RADIUS_KM,
        minKm: min,
        maxKm: max,
        elevation: {
          file: 'moon_elev_i16.bin',
          width: w,
          height: h,
          pixelsPerDegree: ELEV_PPD,
          resolutionM: ELEV_RES_M,
          dataset: `LOLA ldem_${ELEV_PPD}`,
          units: 'm',
          type: 'int16le',
          layout: 'equirectangular, row 0 = 90N, col 0 = 180W',
        },
        source: `NASA SVS 4720 (LOLA ldem_${ELEV_PPD})`,
      },
      null,
      2,
    ),
  );
  console.log(`[textures] wrote moon_disp.png (elevation ${min.toFixed(2)} … ${max.toFixed(2)} km)`);
}

async function buildElevationBin({ data }) {
  const out = Buffer.alloc(data.length * 2);
  for (let i = 0; i < data.length; i++) out.writeInt16LE(Math.round(data[i] * 1000), i * 2);
  fs.writeFileSync(path.join(OUT, 'moon_elev_i16.bin'), out);
  console.log(`[textures] wrote moon_elev_i16.bin (${(out.length / 1e6).toFixed(1)} MB)`);
}

// Tangent-space normal map for an equirectangular height field.
// three.js convention: R = +u (east), G = +v (north, OpenGL style), B = out of surface.
async function buildNormal({ w, h, data }) {
  const out = new Uint8Array(w * h * 3);
  const dyKm = (Math.PI * MOON_RADIUS_KM) / h; // pixel height in km
  const at = (x, y) => data[y * w + ((x + w) % w)]; // wrap longitude
  for (let y = 0; y < h; y++) {
    const lat = Math.PI / 2 - ((y + 0.5) / h) * Math.PI;
    const dxKm = ((2 * Math.PI * MOON_RADIUS_KM) / w) * Math.max(Math.cos(lat), 0.05);
    const yn = Math.max(y - 1, 0); // row above (north)
    const ys = Math.min(y + 1, h - 1); // row below (south)
    for (let x = 0; x < w; x++) {
      const dhdx = (at(x + 1, y) - at(x - 1, y)) / (2 * dxKm);
      const dhdy = (at(x, yn) - at(x, ys)) / ((ys - yn) * dyKm);
      let nx = -dhdx * NORMAL_STRENGTH;
      let ny = -dhdy * NORMAL_STRENGTH;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      const i = (y * w + x) * 3;
      out[i] = Math.round(((nx / len) * 0.5 + 0.5) * 255);
      out[i + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255);
      out[i + 2] = Math.round(((nz / len) * 0.5 + 0.5) * 255);
    }
  }
  await sharp(out, { raw: { width: w, height: h, channels: 3 } })
    .resize(OUT_W, OUT_H, { fit: 'fill' })
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, 'moon_normal.png'));
  console.log('[textures] wrote moon_normal.png');
}

const [colorPath, elevPath] = await Promise.all([download(COLOR_SRC), download(ELEV_SRC)]);
await buildColor(colorPath);
console.log('[textures] reading elevation…');
const elev = await readElevation(elevPath);
await buildDisplacement(elev);
await buildElevationBin(elev);
await buildNormal(elev);
console.log(`[textures] done → ${path.relative(process.cwd(), OUT)}`);
