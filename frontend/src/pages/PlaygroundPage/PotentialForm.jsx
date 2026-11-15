import { useState } from 'react';
import TimePicker from '../../components/TimePicker/TimePicker.jsx';
import { addSite, ENGINE_SETTINGS, ENGINE_STEPS, matchBackendSite } from '../../data/api.js';
import { useSites } from '../../hooks/useSites.js';

const TILE_SIZES = [20, 40, 80];

/**
 * Left column of the sketch: coordinates, other parameters and "Calculate potential".
 * Values are kept as strings so inputs can be mid-edit; validation happens in validateForm().
 * @param {{ values: object, errors: object, onChange: (patch: object) => void, onSubmit: () => void, busy: boolean }} props
 */
export default function PotentialForm({ values, errors, onChange, onSubmit, busy }) {
  const [siteRefreshKey, setSiteRefreshKey] = useState(0);
  const [saveState, setSaveState] = useState({ busy: false, error: null, message: null });
  const backend = useSites(siteRefreshKey);
  const latitude = Number(values.lat);
  const rawLongitude = Number(values.lon);
  const longitude = rawLongitude > 180 ? rawLongitude - 360 : rawLongitude;
  const hasCoordinates = String(values.lat).trim() !== '' && String(values.lon).trim() !== '';
  const match = hasCoordinates
    ? matchBackendSite(backend.data, latitude, longitude)
    : null;
  const source = match
    ? { live: true, text: `Live metrics: ${match.name}` }
    : {
        live: true,
        text: 'Custom coordinates use live backend metrics; mock fallback if unavailable',
      };

  const saveCustomSite = async () => {
    const name = String(values.siteName ?? '').trim();
    const errors = [];
    if (!name) errors.push('Enter a name for this site.');
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      errors.push('Enter a latitude from -90 to 90.');
    }
    if (!Number.isFinite(rawLongitude) || rawLongitude < -180 || rawLongitude > 360) {
      errors.push('Enter a longitude from -180 to 180 (or 0 to 360).');
    }
    if (match) errors.push('These coordinates are already in the site list.');
    if (errors.length) {
      setSaveState({ busy: false, error: errors.join(' '), message: null });
      return;
    }

    setSaveState({ busy: true, error: null, message: null });
    try {
      const saved = await addSite({ name, lat: latitude, lon: longitude });
      setSiteRefreshKey((key) => key + 1);
      setSaveState({
        busy: false,
        error: null,
        message: `Added ${saved.fullName} to the site list.`,
      });
    } catch (error) {
      setSaveState({
        busy: false,
        error: String(error.message ?? error),
        message: null,
      });
    }
  };

  const field = (name, label, props = {}) => (
    <label className="pg-field">
      <span className="pg-label">{label}</span>
      <input
        className="pg-input tabular"
        inputMode="decimal"
        value={values[name]}
        onChange={(e) => onChange({ [name]: e.target.value })}
        aria-invalid={!!errors[name]}
        {...props}
      />
      {errors[name] && <span className="field-error">{errors[name]}</span>}
    </label>
  );

  return (
    <form
      className="pg-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      noValidate
    >
      <div className="pg-form-head">
        <h2>Custom site</h2>
      </div>

      <label className="pg-field">
        <span className="pg-label">Saved site (live data)</span>
        <select
          className="pg-input"
          value={match?.id ?? ''}
          disabled={!backend.data}
          onChange={(e) => {
            const s = backend.data.find((x) => x.id === e.target.value);
            if (s) onChange({ lat: String(s.lat), lon: String(s.lon) });
          }}
        >
          <option value="">{backend.loading ? 'Loading sites…' : 'Custom coordinates'}</option>
          {backend.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      {field('lon', 'Longitude (°E)', { placeholder: '-180 … 180, east positive' })}
      {field('lat', 'Latitude (°N)', { placeholder: '-90 … 90, north positive' })}
      <p className={`pg-source ${source.live ? 'is-live' : ''}`} role="status">
        <span aria-hidden="true">{source.live ? '●' : '○'}</span> {source.text}
      </p>

      <div className="pg-save-site">
        {field('siteName', 'Add custom location to site list', { placeholder: 'Site name' })}
        <button
          className="pg-add-site"
          type="button"
          disabled={saveState.busy || busy || !!match}
          onClick={saveCustomSite}
        >
          {saveState.busy ? 'Adding…' : match ? 'Already saved' : 'Add to site list'}
        </button>
        {saveState.error && <p className="field-error" role="alert">{saveState.error}</p>}
        {saveState.message && <p className="pg-hint" role="status">{saveState.message}</p>}
        {backend.error && <p className="pg-hint">Site list could not be loaded; saving requires the backend.</p>}
      </div>

      <fieldset className="pg-fieldset">
        <legend className="pg-label">Analysis window</legend>
        <span className="pg-sublabel">Start (UTC)</span>
        <TimePicker value={values.start} onChange={(iso) => onChange({ start: iso })} />
        {errors.start && <span className="field-error">{errors.start}</span>}
        <div className="pg-row">
          {field('durationDays', 'Duration (days)', { placeholder: '1 … 60' })}
          <label className="pg-field">
            <span className="pg-label">Step</span>
            <select className="pg-input tabular" value={values.step} onChange={(e) => onChange({ step: e.target.value })}>
              {Object.keys(ENGINE_STEPS).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>
      </fieldset>

      <fieldset className="pg-fieldset">
        <legend className="pg-label">Solar array</legend>
        {field('panelAreaM2', 'Panel area (m²)', { placeholder: 'e.g. 2' })}
        <p className="pg-hint">
          Efficiency {Math.round(ENGINE_SETTINGS.panelEfficiency * 100)}% (engine setting) · horizontal panel
        </p>
      </fieldset>

      <fieldset className="pg-fieldset">
        <legend className="pg-label">Terrain tile</legend>
        <span className="segmented" role="group" aria-label="Terrain tile size">
          {TILE_SIZES.map((km) => (
            <button key={km} type="button" aria-pressed={Number(values.tileKm) === km} onClick={() => onChange({ tileKm: String(km) })}>
              {km} km
            </button>
          ))}
        </span>
      </fieldset>

      <button className="pg-submit" type="submit" disabled={busy}>
        {busy ? 'Calculating…' : 'Calculate potential'}
      </button>
    </form>
  );
}

/** Returns { params, errors }; params is null when anything is invalid. */
export function validateForm(v) {
  const errors = {};
  const num = (s) => (String(s).trim() === '' ? NaN : Number(s));
  let lon = num(v.lon);
  const lat = num(v.lat);
  const durationDays = num(v.durationDays);
  const panelAreaM2 = num(v.panelAreaM2);

  if (!Number.isFinite(lat) || lat < -90 || lat > 90) errors.lat = 'Enter a latitude from -90 to 90.';
  if (!Number.isFinite(lon) || lon < -180 || lon > 360) errors.lon = 'Enter a longitude from -180 to 180 (or 0 to 360).';
  else if (lon > 180) lon -= 360; // 0…360 convention → east-positive -180…180
  if (!Number.isFinite(durationDays) || durationDays < 1 || durationDays > 60) errors.durationDays = '1 to 60 days.';
  if (!Number.isFinite(panelAreaM2) || panelAreaM2 <= 0 || panelAreaM2 > 1e6) errors.panelAreaM2 = 'Greater than 0.';
  // The engine parses dates with Python datetime (years 1–9999 AD only).
  const startMs = Date.parse(v.start);
  if (new Date(startMs).getUTCFullYear() < 1) errors.start = 'The engine accepts dates from 1 AD onwards.';
  else if (Number.isFinite(durationDays) && new Date(startMs + durationDays * 86400e3).getUTCFullYear() > 9999)
    errors.start = 'The window must end by 31 Dec 9999 AD.';

  if (Object.keys(errors).length) return { params: null, errors };
  return {
    params: { lat, lon, start: v.start, durationDays, step: v.step, panelAreaM2, tileKm: Number(v.tileKm) },
    errors,
  };
}
