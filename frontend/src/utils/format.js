export function formatLat(lat, digits = 2) {
  return `${Math.abs(lat).toFixed(digits)}°${lat < 0 ? 'S' : 'N'}`;
}

export function formatLon(lon, digits = 2) {
  return `${Math.abs(lon).toFixed(digits)}°${lon < 0 ? 'W' : 'E'}`;
}

export function toDMS(deg, pos, neg) {
  const a = Math.abs(deg);
  const d = Math.floor(a);
  const mFloat = (a - d) * 60;
  const m = Math.floor(mFloat);
  const s = (mFloat - m) * 60;
  return `${d}° ${String(m).padStart(2, '0')}′ ${s.toFixed(1).padStart(4, '0')}″ ${deg < 0 ? neg : pos}`;
}

/** Hours → "3 d 4 h" / "5 h 12 m" / "40 m". */
export function formatDuration(hours) {
  if (hours == null || !Number.isFinite(hours)) return 'n/a';
  const totalMin = Math.round(hours * 60);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} m`;
  return `${m} m`;
}

export const formatDeg = (v, digits = 1) => (v == null ? 'n/a' : `${v.toFixed(digits)}°`);
export const formatPct = (v) => (v == null ? 'n/a' : `${Math.round(v * 100)}%`);

// Date/time formatting and validation live in utils/time.js.
