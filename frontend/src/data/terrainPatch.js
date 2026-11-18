// Pure terrain-patch sampler (no fetching), shared by api.js and build scripts.
import { destination, clampLat } from '../utils/coords.js';

/** Square patch on a local tangent-plane grid (azimuthal equidistant), so it works at the poles. */
export function samplePatch(grid, lat, lon, { sizeKm = 80, n = 128 } = {}) {
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
    source: `NASA ${grid.dataset}`,
  };
}
