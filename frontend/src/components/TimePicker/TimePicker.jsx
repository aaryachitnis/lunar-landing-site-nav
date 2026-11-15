import { useEffect, useState } from 'react';
import { MAX_ERA_YEAR, MONTH_NAMES, daysInMonth, formatTime, fromParts, toAstroYear, toParts } from '../../utils/time.js';
import './TimePicker.css';

const pad = (n) => String(n).padStart(2, '0');

/**
 * UTC date/time picker covering 9999 BC … 9999 AD. Replaces <input type="datetime-local">,
 * which can't represent BC years, accepts years up to 275760 and works in local time.
 */
export default function TimePicker({ value, onChange }) {
  const parts = toParts(Date.parse(value));
  const [yearText, setYearText] = useState(String(parts.eraYear));
  const [error, setError] = useState(null);

  // Keep the year draft in sync when the time changes elsewhere (±1 d buttons, URL).
  useEffect(() => {
    setYearText(String(parts.eraYear));
    setError(null);
  }, [parts.eraYear, parts.era]);

  const commit = (changes) => {
    const next = { ...parts, eraYear: Number(yearText), ...changes };
    const { ms, error: err } = fromParts(next);
    setError(err);
    if (ms != null) onChange(new Date(ms).toISOString());
  };

  const onYear = (text) => {
    setYearText(text);
    if (/^\d{1,4}$/.test(text) && Number(text) >= 1) commit({ eraYear: Number(text) });
    else setError(`Year must be 1–${MAX_ERA_YEAR} (AD or BC)`);
  };

  const dim = daysInMonth(toAstroYear(parts.eraYear, parts.era), parts.month);

  return (
    <div className="time-picker">
      <div className="time-picker-fields">
        <select aria-label="Day" value={parts.day} onChange={(e) => commit({ day: Number(e.target.value) })}>
          {Array.from({ length: dim }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              {i + 1}
            </option>
          ))}
        </select>
        <select aria-label="Month" value={parts.month} onChange={(e) => commit({ month: Number(e.target.value) })}>
          {MONTH_NAMES.map((m, i) => (
            <option key={m} value={i}>
              {m}
            </option>
          ))}
        </select>
        <input
          className="time-picker-year tabular"
          type="text"
          inputMode="numeric"
          aria-label="Year"
          aria-invalid={!!error}
          maxLength={4}
          value={yearText}
          onChange={(e) => onYear(e.target.value.trim())}
          onBlur={() => error && (setYearText(String(parts.eraYear)), setError(null))}
        />
        <select aria-label="Era" value={parts.era} onChange={(e) => commit({ era: e.target.value })}>
          <option value="AD">AD</option>
          <option value="BC">BC</option>
        </select>
        <input
          type="time"
          aria-label="Time (UTC)"
          value={`${pad(parts.hours)}:${pad(parts.minutes)}`}
          onChange={(e) => {
            const [h, m] = e.target.value.split(':').map(Number);
            if (Number.isInteger(h) && Number.isInteger(m)) commit({ hours: h, minutes: m });
          }}
        />
        <span className="muted">UTC</span>
      </div>
      {error ? (
        <p className="field-error">{error}</p>
      ) : (
        <p className="time-picker-note muted">
          {formatTime(Date.parse(value))} · range 9999 BC – 9999 AD
        </p>
      )}
    </div>
  );
}
