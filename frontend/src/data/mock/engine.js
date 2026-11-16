// Playground fallback when the backend can't compute metrics. Same PowerMetricsResponse shape and
// flat-panel formula as services/power_services.py, but with the browser's mock Sun model.

import { computeSiteMetrics } from './metrics.js';

// Mirrors backend/app/config.py (solar_intensity_w_m2, solar_panel_efficiency, default_horizons_step).
// The live response doesn't include these, so keep them in sync by hand.
export const ENGINE_SETTINGS = { solarIntensityWm2: 1361, panelEfficiency: 0.2, defaultStep: '4hour' };

// Horizons step strings the engine forwards to JPL Horizons, in hours.
export const ENGINE_STEPS = { '1hour': 1, '2hour': 2, '4hour': 4, '12hour': 12, '1day': 24 };

// No terrain horizon: the engine ignores terrain, so use a flat "everything visible" horizon.
const FLAT_HORIZON = { stepDeg: 90, elevation: [-90, -90, -90, -90] };

const formatUtc = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z');

export function mockEnginePotential({ lat, lon, start, end, step }) {
  const stepH = ENGINE_STEPS[step];
  if (!stepH) throw new Error(`Unsupported step "${step}"`);
  const t0 = Date.parse(start);
  const t1 = Date.parse(end);
  if (!(t1 > t0)) throw new Error('End time must be later than start time.');

  const spanH = (t1 - t0) / 3.6e6;
  const days = Math.ceil(spanH / 24);
  const { series } = computeSiteMetrics(null, { lat, lon }, new Date(t0), {
    daysBefore: 0,
    days,
    stepH,
    horizon: FLAT_HORIZON,
  });
  const samples = series.filter((p) => p.hoursFromSelected <= spanH + 1e-9);

  const { solarIntensityWm2: S, panelEfficiency: eff } = ENGINE_SETTINGS;
  const power = samples.map((p) => S * eff * Math.max(0, Math.sin((p.sunElevation * Math.PI) / 180)));

  // Integrate into 24 h bins (kWh/m²), final partial day over its observed duration only.
  const hours = samples.map((p) => p.hoursFromSelected);
  const daily = [];
  for (let d = 0; d < Math.ceil(spanH / 24); d++) {
    const a = d * 24;
    const b = Math.min((d + 1) * 24, spanH);
    let wh = 0;
    for (let k = 1; k < hours.length; k++) {
      const lo = Math.max(hours[k - 1], a);
      const hi = Math.min(hours[k], b);
      if (hi <= lo) continue;
      const at = (h) => power[k - 1] + ((power[k] - power[k - 1]) * (h - hours[k - 1])) / (hours[k] - hours[k - 1]);
      wh += ((at(lo) + at(hi)) / 2) * (hi - lo);
    }
    daily.push(wh / 1000);
  }

  const totalKwh = daily.reduce((s, v) => s + v, 0);
  const sunlitDays = daily.filter((v) => v > 0);
  return {
    site: { id: 'custom', lat, lon },
    start: formatUtc(t0),
    end: formatUtc(t1),
    step,
    instantaneous_power_per_area_W_m2: power,
    daily_power_generated_per_area_kWh_per_m2_day: daily,
    average_power_per_24h_W_m2: spanH > 0 ? (totalKwh * 1000) / spanH : 0,
    average_power_sunlit_days_W_m2: sunlitDays.length ? (sunlitDays.reduce((s, v) => s + v, 0) * 1000) / (24 * sunlitDays.length) : 0,
  };
}
