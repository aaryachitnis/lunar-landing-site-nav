import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { calculatePotential, ENGINE_SETTINGS, ENGINE_STEPS } from '../../data/api.js';
import { formatLat, formatLon, toDMS } from '../../utils/format.js';
import { sanitizeTime } from '../../utils/time.js';
import PotentialForm, { validateForm } from './PotentialForm.jsx';
import TerrainMap2D from './TerrainMap2D.jsx';
import EngineResults from './EngineResults.jsx';
import '../../components/SitePanel/SitePanel.css';
import './PlaygroundPage.css';

const metres = (m) => `${Math.round(m).toLocaleString()} m`;

function nowHour() {
  const d = new Date();
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString();
}

/** Form state from the URL (?lat&lon&t&days&step&area&tile), so a calculation is shareable. */
function initialValues(params) {
  return {
    lat: params.get('lat') ?? '',
    lon: params.get('lon') ?? '',
    siteName: '',
    start: sanitizeTime(params.get('t')) ?? nowHour(),
    durationDays: params.get('days') ?? '30',
    step: ENGINE_STEPS[params.get('step')] ? params.get('step') : ENGINE_SETTINGS.defaultStep,
    panelAreaM2: params.get('area') ?? '2',
    tileKm: ['20', '40', '80'].includes(params.get('tile')) ? params.get('tile') : '40',
  };
}

/**
 * Playground: enter any lunar coordinate, "Calculate potential", and see site info, a 2D terrain
 * map (real LOLA, same source as the God's-eye view) and live processing-engine results when
 * available, with an explicit mock fallback if the backend request fails.
 */
export default function PlaygroundPage() {
  const [params, setParams] = useSearchParams();
  const [values, setValues] = useState(() => initialValues(params));
  const [errors, setErrors] = useState({});
  const [state, setState] = useState({ result: null, error: null, busy: false });
  const runId = useRef(0);

  const run = useCallback(async (p) => {
    const id = ++runId.current;
    setState((s) => ({ ...s, busy: true, error: null }));
    try {
      const result = await calculatePotential(p);
      if (id === runId.current) setState({ result, error: null, busy: false });
    } catch (error) {
      if (id === runId.current) setState((s) => ({ ...s, error, busy: false }));
    }
  }, []);

  const submit = () => {
    const { params: p, errors: errs } = validateForm(values);
    setErrors(errs);
    if (!p) return;
    setParams(
      { lat: p.lat, lon: p.lon, t: p.start, days: p.durationDays, step: p.step, area: p.panelAreaM2, tile: p.tileKm },
      { replace: true },
    );
    run(p);
  };

  // A shared link with coordinates calculates straight away.
  useEffect(() => {
    const { params: p } = validateForm(values);
    if (p && params.has('lat') && params.has('lon')) run(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { result, error, busy } = state;
  return (
    <div className="playground-page">
      <div className="pg-layout">
        <aside className="pg-left">
          <PotentialForm
            values={values}
            errors={errors}
            onChange={(patch) => setValues((v) => ({ ...v, ...patch }))}
            onSubmit={submit}
            busy={busy}
          />
        </aside>

        <section className="pg-right" aria-live="polite" aria-busy={busy}>
          {error && <p className="pg-error field-error">Calculation failed: {String(error.message ?? error)}</p>}
          {!result && !busy && !error && (
            <div className="pg-empty">
              <p className="pg-empty-title">Awaiting coordinates</p>
              <p>Enter a longitude and latitude, then press Calculate potential.</p>
            </div>
          )}
          {!result && busy && <div className="pg-empty pg-loading">Calculating potential…</div>}

          {result && (
            <div className={`pg-cards${busy ? ' is-refreshing' : ''}`}>
              <article className="pg-card panel-section">
                <h3>Landing site info</h3>
                <dl className="kv">
                  <dt>Site</dt>
                  <dd>
                    {result.site.name}
                    {result.site.backendId && <span className="muted"> backend id {result.site.backendId}</span>}
                  </dd>
                  <dt>Latitude</dt>
                  <dd className="tabular">
                    {formatLat(result.site.lat, 4)} <span className="muted">{toDMS(result.site.lat, 'N', 'S')}</span>
                  </dd>
                  <dt>Longitude</dt>
                  <dd className="tabular">
                    {formatLon(result.site.lon, 4)} <span className="muted">{toDMS(result.site.lon, 'E', 'W')}</span>
                  </dd>
                  <dt>Hemisphere</dt>
                  <dd>{result.site.nearSide ? 'Near side (Earth-facing)' : 'Far side'}</dd>
                  <dt>Region</dt>
                  <dd>{result.site.region}</dd>
                  <dt>Altitude</dt>
                  <dd className="tabular">{metres(result.site.altitudeM)}</dd>
                </dl>
              </article>

              <article className="pg-card panel-section">
                <h3>Terrain mapping</h3>
                <div className="pg-terrain">
                  <TerrainMap2D patch={result.terrain} />
                  <dl className="kv pg-terrain-stats">
                    <dt>Mean slope</dt>
                    <dd className="tabular">{result.terrain.meanSlopeDeg.toFixed(1)}° <span className="muted">central {Math.round(result.terrain.centralKm)} km</span></dd>
                    <dt>Roughness</dt>
                    <dd className="tabular">{metres(result.terrain.roughnessM)} <span className="muted">RMS</span></dd>
                    <dt>Min altitude</dt>
                    <dd className="tabular">{metres(result.terrain.minM)}</dd>
                    <dt>Mean altitude</dt>
                    <dd className="tabular">{metres(result.terrain.meanM)}</dd>
                    <dt>Max altitude</dt>
                    <dd className="tabular">{metres(result.terrain.maxM)}</dd>
                    <dt>Relief</dt>
                    <dd className="tabular">{metres(result.terrain.maxM - result.terrain.minM)}</dd>
                  </dl>
                </div>
                <p className="panel-caption">
                  {result.terrain.sizeKm} × {result.terrain.sizeKm} km · {result.terrain.n}×{result.terrain.n} samples ·{' '}
                  {Math.round(result.terrain.spacingM)} m spacing · source {result.terrain.source} (same grid as the God's-eye view)
                </p>
              </article>

              <article className="pg-card panel-section">
                <div className="section-head">
                  <h3>Processing engine</h3>
                  <span className={`tag-mock${result.engine.dataSource === 'live' ? ' is-live' : ''}`}>
                    {result.engine.dataSource === 'live' ? 'Live · JPL Horizons' : 'Mock engine'}
                  </span>
                </div>
                {result.engine.reason && <p className="pg-hint pg-reason">{result.engine.reason}</p>}
                <EngineResults engine={result.engine} request={result.request} />
              </article>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
