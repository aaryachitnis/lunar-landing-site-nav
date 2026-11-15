// Sun/Earth timeline checked against the first-person terrain horizon, so ridge, labels and time bar agree.

import { horizonAt } from '../../data/horizonTerrain.js';

export const SUN_RADIUS_DEG = 0.266;
export const EARTH_RADIUS_DEG = 0.95;
const PANEL_W_PER_FRAC = 1361 * 2 * 0.3; // same panel as mock metrics: 2 m², 30 %, tracking
export const WINDOW = { beforeH: 12, afterH: 72 };

const frac = (above, r) => Math.max(0, Math.min(1, (above + r) / (2 * r)));
const lerpAz = (a, b, f) => (a + ((((b - a + 540) % 360) - 180) * f) + 360) % 360;

/** Hourly samples from metrics.series with visibility vs the local horizon. */
export function buildTimeline(metrics, horizon) {
  const samples = metrics.series.map((p) => {
    const sunAbove = p.sunElevation - horizonAt(horizon, p.sunAzimuth);
    const earthAbove = p.earthElevation - horizonAt(horizon, p.earthAzimuth);
    return {
      t: p.t,
      sunAz: p.sunAzimuth,
      sunEl: p.sunElevation,
      earthAz: p.earthAzimuth,
      earthEl: p.earthElevation,
      sunFrac: frac(sunAbove, SUN_RADIUS_DEG),
      earthFrac: frac(earthAbove, EARTH_RADIUS_DEG),
    };
  });
  const t0 = new Date(metrics.selectedTime).getTime();
  return { t0, start: t0 - WINDOW.beforeH * 3.6e6, end: t0 + WINDOW.afterH * 3.6e6, samples, horizon };
}

/** Interpolated state at time t (ms). */
export function stateAt(tl, t) {
  const s = tl.samples;
  const x = Math.max(0, Math.min(s.length - 1.0001, (t - s[0].t) / 3.6e6));
  const i = Math.floor(x);
  const f = x - i;
  const a = s[i];
  const b = s[i + 1];
  const sunAz = lerpAz(a.sunAz, b.sunAz, f);
  const sunEl = a.sunEl + (b.sunEl - a.sunEl) * f;
  const earthAz = lerpAz(a.earthAz, b.earthAz, f);
  const earthEl = a.earthEl + (b.earthEl - a.earthEl) * f;
  const sunAbove = sunEl - horizonAt(tl.horizon, sunAz);
  const earthAbove = earthEl - horizonAt(tl.horizon, earthAz);
  const sunFrac = frac(sunAbove, SUN_RADIUS_DEG);
  const earthFrac = frac(earthAbove, EARTH_RADIUS_DEG);
  return {
    t,
    sunAz,
    sunEl,
    sunAbove,
    sunFrac,
    powerW: PANEL_W_PER_FRAC * sunFrac,
    earthAz,
    earthEl,
    earthAbove,
    earthFrac,
    hoursToSun: hoursToFlip(tl, t, 'sunFrac', sunFrac > 0.5),
    hoursToEarth: hoursToFlip(tl, t, 'earthFrac', earthFrac > 0.5),
  };
}

/** Hours until visibility (frac > 0.5) flips from `up`; null if not in the data. */
function hoursToFlip(tl, t, key, up) {
  const s = tl.samples;
  const i0 = Math.max(0, Math.ceil((t - s[0].t) / 3.6e6));
  for (let i = i0; i < s.length; i++) if (s[i][key] > 0.5 !== up) return (s[i].t - t) / 3.6e6;
  return null;
}

/** Runs of {startMs, endMs, level: 'full'|'partial'} for the time bar. */
export function visibilityRuns(tl, key) {
  const runs = [];
  const level = (v) => (v >= 0.98 ? 'full' : v > 0.02 ? 'partial' : null);
  let cur = null;
  for (const p of tl.samples) {
    if (p.t < tl.start - 3.6e6 || p.t > tl.end + 3.6e6) continue;
    const l = level(p[key]);
    if (cur && cur.level === l) cur.endMs = p.t + 3.6e6;
    else {
      if (cur?.level) runs.push(cur);
      cur = { startMs: p.t, endMs: p.t + 3.6e6, level: l };
    }
  }
  if (cur?.level) runs.push(cur);
  return runs;
}

/** Next time (ms, within the window) Sun or Earth visibility flips. */
export function nextTransition(tl, t, key) {
  const s = tl.samples;
  const st = stateAt(tl, t);
  const up = st[key] > 0.5;
  for (let i = Math.max(0, Math.ceil((t - s[0].t) / 3.6e6)); i < s.length; i++) {
    if (s[i].t > tl.end) break;
    if (s[i][key] > 0.5 !== up) return s[i].t - 1.8e6; // half an hour before, to watch it happen
  }
  return null;
}

export function fmtHours(h) {
  if (h == null) return null;
  const totalMin = Math.round(h * 60);
  const d = Math.floor(totalMin / 1440);
  const hh = Math.floor((totalMin % 1440) / 60);
  const mm = totalMin % 60;
  if (d) return `${d}d ${hh}h`;
  if (hh) return `${hh}h ${mm}m`;
  return `${mm}m`;
}
