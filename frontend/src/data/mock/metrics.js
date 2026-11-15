// MOCK metrics generator. A deliberately simplified geometric model so the UI shows
// plausible, internally consistent numbers until the Python backend provides real ones:
//   • Sun: subsolar longitude from the synodic phase (reference new moon 2000-01-06 18:14 UTC),
//     subsolar latitude ±1.54° over the draconic year.
//   • Earth: sub-Earth point wobbles with optical libration (±7.9° lon, ±6.7° lat).
//   • Horizon: normally passed in (api.getSiteHorizon → the same 5 m/global LOLA horizon the Horizon View
//     renders, 0.5° steps); falls back to ray-marching the global grid here (2° steps) incl. curvature.
//   • Power: sun-tracking panel, 2 m² at 30% efficiency, scaled by visible fraction of the solar disk.
// Not ephemeris-grade. Output shape documented in data/SCHEMA.md.

import { MOON_RADIUS_KM, latLonToVec, enuBasis, elevAz, destination, clampLat } from '../../utils/coords.js';

const SYNODIC_H = 29.530589 * 24;
const ANOMALISTIC_H = 27.554550 * 24;
const DRACONIC_H = 27.212221 * 24;
const DRACONIC_YEAR_H = 346.62 * 24;
const REF_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);

const SOLAR_CONSTANT = 1361; // W/m²
const PANEL = { areaM2: 2, efficiency: 0.3, tracking: 'two-axis sun-tracking (assumed)' };
const SUN_RADIUS_DEG = 0.266;
const EARTH_RADIUS_DEG = 0.95;
const MAST_HEIGHT_M = 2;

const HORIZON_STEP_DEG = 2;
const HORIZON_MAX_KM = 150;

const hoursSince = (ms) => (ms - REF_NEW_MOON) / 3.6e6;

function sunDirection(tMs) {
  const h = hoursSince(tMs);
  const phase = ((h % SYNODIC_H) + SYNODIC_H) % SYNODIC_H / SYNODIC_H;
  const lon = 180 - 360 * phase; // new moon → subsolar point on the far side
  const lat = 1.54 * Math.sin((2 * Math.PI * h) / DRACONIC_YEAR_H);
  return latLonToVec(lat, lon);
}

function earthDirection(tMs) {
  const h = hoursSince(tMs);
  const lon = 7.9 * Math.sin((2 * Math.PI * h) / ANOMALISTIC_H);
  const lat = 6.7 * Math.sin((2 * Math.PI * h) / DRACONIC_H);
  return latLonToVec(lat, lon);
}

/** Terrain horizon elevation (deg) for each azimuth bin, from the elevation grid. */
export function computeHorizon(grid, lat, lon) {
  const h0 = grid.sample(lat, lon) + MAST_HEIGHT_M;
  const bins = [];
  for (let az = 0; az < 360; az += HORIZON_STEP_DEG) {
    let best = -90;
    for (let d = 0.5; d <= HORIZON_MAX_KM; d += d < 20 ? 0.5 : 1.5) {
      const [la, lo] = destination(lat, lon, az, d);
      const drop = (d * d) / (2 * MOON_RADIUS_KM); // km, curvature
      const dz = (grid.sample(la, lo) - h0) / 1000 - drop;
      const ang = Math.atan2(dz, d) * (180 / Math.PI);
      if (ang > best) best = ang;
    }
    bins.push(best);
  }
  return bins;
}

/** Horizon elevation (deg) at azimuth `az` from {stepDeg, elevation[]}, linearly interpolated. */
const horizonAt = ({ stepDeg, elevation: bins }, az) => {
  const x = az / stepDeg;
  const i = Math.floor(x) % bins.length;
  const j = (i + 1) % bins.length;
  const f = x - Math.floor(x);
  return bins[i] * (1 - f) + bins[j] * f;
};

/** Fraction of a disk of angular radius r visible above a horizon (linear approximation). */
const visibleFraction = (elevAboveHorizon, r) => Math.max(0, Math.min(1, (elevAboveHorizon + r) / (2 * r)));

/**
 * @param {object|null} grid  from loadElevation(); only needed when no `horizon` is given
 * @param {{lat:number, lon:number}} site
 * @param {Date} date    selected time
 * @param {{daysBefore?:number, days?:number, stepH?:number, horizon?:{stepDeg:number, elevation:number[]}}} opts
 */
export function computeSiteMetrics(grid, site, date, { daysBefore = 3, days = 30, stepH = 1, horizon: given } = {}) {
  const lat = clampLat(site.lat);
  const basis = enuBasis(lat, site.lon);
  const horizon = given ?? { stepDeg: HORIZON_STEP_DEG, elevation: computeHorizon(grid, lat, site.lon) };
  const t0 = date.getTime();

  const series = [];
  for (let h = -daysBefore * 24; h <= (days - daysBefore) * 24; h += stepH) {
    const t = t0 + h * 3.6e6;
    const sun = elevAz(sunDirection(t), basis);
    const earth = elevAz(earthDirection(t), basis);
    const sunAbove = sun.elev - horizonAt(horizon, sun.az);
    const earthAbove = earth.elev - horizonAt(horizon, earth.az);
    const illum = visibleFraction(sunAbove, SUN_RADIUS_DEG);
    series.push({
      t,
      hoursFromSelected: h,
      sunElevation: sun.elev,
      sunAzimuth: sun.az,
      sunAboveHorizon: sunAbove,
      earthElevation: earth.elev,
      earthAzimuth: earth.az,
      earthAboveHorizon: earthAbove,
      illumination: illum,
      earthVisible: visibleFraction(earthAbove, EARTH_RADIUS_DEG) > 0.5,
      powerW: SOLAR_CONSTANT * PANEL.areaM2 * PANEL.efficiency * illum,
    });
  }

  const i0 = series.findIndex((p) => p.hoursFromSelected === 0);
  const now = series[i0];
  const future = series.slice(i0);

  // Time until a condition flips (sunset/sunrise, Earthset/Earthrise) within the window.
  // Hours until the next time `isUp` changes to `toUp` (rise if true, set if false); null if not in window.
  const timeUntilEdge = (isUp, toUp) => {
    for (let k = 1; k < future.length; k++) {
      if (isUp(future[k]) === toUp && isUp(future[k - 1]) !== toUp) return future[k].hoursFromSelected;
    }
    return null;
  };
  const sunIsUp = (p) => p.illumination > 0.5;
  const earthIsUp = (p) => p.earthVisible;
  const sunUp = sunIsUp(now);
  const earthUp = earthIsUp(now);

  let longestDark = 0;
  let run = 0;
  for (const p of future) {
    run = p.illumination > 0.5 ? 0 : run + stepH;
    longestDark = Math.max(longestDark, run);
  }
  const mean = (f) => future.reduce((a, p) => a + f(p), 0) / future.length;

  return {
    site: { id: site.id, lat: site.lat, lon: site.lon },
    selectedTime: new Date(t0).toISOString(),
    model: 'mock-geometric-v1',
    panel: PANEL,
    now: {
      sunElevation: now.sunElevation,
      sunAzimuth: now.sunAzimuth,
      sunAboveHorizon: now.sunAboveHorizon,
      earthElevation: now.earthElevation,
      earthAzimuth: now.earthAzimuth,
      earthAboveHorizon: now.earthAboveHorizon,
      sunUp,
      earthUp,
      powerW: now.powerW,
      // Hours to the next event of each kind (terrain horizon included); null if not within the window.
      hoursToSunrise: timeUntilEdge(sunIsUp, true),
      hoursToSunset: timeUntilEdge(sunIsUp, false),
      hoursToEarthrise: timeUntilEdge(earthIsUp, true),
      hoursToEarthset: timeUntilEdge(earthIsUp, false),
    },
    window: {
      days: days - daysBefore,
      illuminatedFraction: mean((p) => (p.illumination > 0.5 ? 1 : 0)),
      earthVisibleFraction: mean((p) => (p.earthVisible ? 1 : 0)),
      meanPowerW: mean((p) => p.powerW),
      energyKWh: (mean((p) => p.powerW) * future.length * stepH) / 1000,
      longestDarknessH: longestDark,
    },
    horizon: horizon.elevation.map((elev, k) => ({ azimuth: k * horizon.stepDeg, elevation: elev })),
    series,
  };
}
