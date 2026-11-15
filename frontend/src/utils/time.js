// Selected-time rules shared by the URL state and the panel's date picker.
//
// • All times are UTC. (Local time zones are meaningless thousands of years ago, and the
//   browser applies odd historical "local mean time" offsets before ~1900.)
// • Calendar: proleptic Gregorian, as JavaScript's Date uses, not Julian before 1582.
// • Era years ↔ astronomical years: 1 AD = 1, 1 BC = 0, 9999 BC = −9998 (no year zero in BC/AD).
// • Supported range: 1 Jan 9999 BC 00:00 UTC … 31 Dec 9999 AD 23:59 UTC.
//   Gotcha: Date.UTC(y, …) maps years 0–99 to 1900–1999, so always build dates with setUTCFullYear.

export const MAX_ERA_YEAR = 9999;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH_NAMES = MONTHS;

/** Build a UTC timestamp (ms) from an astronomical year; safe for years 0–99 and negative years. */
export function utcMs(astroYear, month, day = 1, hours = 0, minutes = 0) {
  const d = new Date(0);
  d.setUTCFullYear(astroYear, month, day);
  d.setUTCHours(hours, minutes, 0, 0);
  return d.getTime();
}

export const MIN_TIME_MS = utcMs(1 - MAX_ERA_YEAR, 0, 1, 0, 0); // 1 Jan 9999 BC
export const MAX_TIME_MS = utcMs(MAX_ERA_YEAR, 11, 31, 23, 59); // 31 Dec 9999 AD

export const toAstroYear = (eraYear, era) => (era === 'BC' ? 1 - eraYear : eraYear);
export const fromAstroYear = (y) => (y <= 0 ? { eraYear: 1 - y, era: 'BC' } : { eraYear: y, era: 'AD' });

export const daysInMonth = (astroYear, month) => new Date(utcMs(astroYear, month + 1, 0)).getUTCDate();

export const isInRange = (ms) => Number.isFinite(ms) && ms >= MIN_TIME_MS && ms <= MAX_TIME_MS;
export const clampTime = (ms) => Math.min(Math.max(ms, MIN_TIME_MS), MAX_TIME_MS);

/**
 * Validate a `?t=` value. Returns a clamped ISO string, or null if it isn't a date at all.
 * Accepts ISO 8601 including expanded years (e.g. "-009998-01-01T00:00:00.000Z").
 */
export function sanitizeTime(value) {
  if (!value) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return new Date(clampTime(ms)).toISOString();
}

/** Timestamp → the fields the date picker edits (UTC). */
export function toParts(ms) {
  const d = new Date(ms);
  return {
    ...fromAstroYear(d.getUTCFullYear()),
    month: d.getUTCMonth(),
    day: d.getUTCDate(),
    hours: d.getUTCHours(),
    minutes: d.getUTCMinutes(),
  };
}

/**
 * Picker fields → timestamp. Day is clamped to the month's length (e.g. 31 Feb → 28/29 Feb);
 * returns { ms, error } where error is set if the year is outside 1…9999.
 */
export function fromParts({ eraYear, era, month, day, hours, minutes }) {
  if (!Number.isInteger(eraYear) || eraYear < 1 || eraYear > MAX_ERA_YEAR) {
    return { ms: null, error: `Year must be 1–${MAX_ERA_YEAR} (AD or BC)` };
  }
  const y = toAstroYear(eraYear, era);
  const dd = Math.min(Math.max(day, 1), daysInMonth(y, month));
  return { ms: clampTime(utcMs(y, month, dd, hours, minutes)), error: null };
}

/** "14 Nov 2026 AD, 12:00 UTC" */
export function formatTime(ms) {
  const p = toParts(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${p.day} ${MONTHS[p.month]} ${p.eraYear} ${p.era}, ${pad(p.hours)}:${pad(p.minutes)} UTC`;
}
