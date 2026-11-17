import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { calculatePotential, ENGINE_SETTINGS, ENGINE_STEPS } from '../../data/api.js';
import { formatLat, formatLon, toDMS } from '../../utils/format.js';
import { sanitizeTime } from '../../utils/time.js';
import { isCalculatedLocationCurrent } from './potentialSite.js';
import PotentialForm, { FIELD_LABELS, validateForm } from './PotentialForm.jsx';
import TerrainMap2D from './TerrainMap2D.jsx';
import EngineResults from './EngineResults.jsx';
import { errorText, useAlert } from '../../components/MissionAlert/MissionAlert.jsx';
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

export default function PlaygroundPage() {
  const [params, setParams] = useSearchParams();
  const [values, setValues] = useState(() => initialValues(params));
  const [errors, setErrors] = useState({});
  const [state, setState] = useState({ result: null, error: null, busy: false });
  const runId = useRef(0);
  const alert = useAlert();

  const run = useCallback(async (p) => {
    const id = ++runId.current;
    setState((s) => ({ ...s, busy: true, error: null }));
    try {
      const result = await calculatePotential(p);
      if (id !== runId.current) return;
      setState({ result, error: null, busy: false });
      if (result.engine.dataSource !== 'live') {
        alert({
          level: 'caution',
          source: 'Playground · Power',
          title: 'Live ephemeris unavailable',
          message: 'JPL Horizons could not be reached, so the power figures come from a simplified geometric model. Treat them as estimates.',
          detail: result.engine.reason,
        });
      }
    } catch (error) {
      if (id !== runId.current) return;
      setState((s) => ({ ...s, error, busy: false }));
      alert({
        level: 'warning',
        source: 'Playground · Calculate',
        title: 'Calculation failed',
        message: 'The potential for these coordinates could not be calculated. Check the inputs and try again.',
        detail: errorText(error),
      });
    }
  }, [alert]);

  const submit = () => {
    const { params: p, errors: errs } = validateForm(values);
    setErrors(errs);
    if (!p) {
      const bad = Object.keys(FIELD_LABELS).filter((k) => errs[k]);
      alert({
        level: 'caution',
        source: 'Playground · Inputs',
        title: 'Check the inputs',
        message: `${bad.length === 1 ? 'One field needs' : `${bad.length} fields need`} fixing before the calculation can run:`,
        items: bad.map((k) => ({ label: FIELD_LABELS[k], text: errs[k] })),
        key: 'pg-inputs',
        onClose: () => {
          const el = document.getElementById(`pg-${bad[0]}`);
          (el?.matches('input, select') ? el : el?.querySelector('input, select'))?.focus();
        },
      });
      return;
    }
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
  const canAddSite = isCalculatedLocationCurrent(result, values, { busy, error });
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
            canAddSite={canAddSite}
          />
        </aside>

        <section className="pg-right" aria-live="polite" aria-busy={busy}>
          {!result && !busy && (
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
                    {result.site.backendId && <span className="muted"> · in site list</span>}
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
                  {Math.round(result.terrain.spacingM)} m spacing · {result.terrain.source}
                </p>
              </article>

              <article className="pg-card panel-section">
                <div className="section-head">
                  <h3>Processing engine</h3>
                  <span className={`tag-mock${result.engine.dataSource === 'live' ? ' is-live' : ''}`}>
                    {result.engine.dataSource === 'live' ? 'Live · JPL Horizons' : 'Simplified model'}
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
