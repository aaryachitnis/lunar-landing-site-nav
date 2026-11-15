import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SITE_CATEGORIES } from '../../data/mock/sites.js';
import { useSiteMetrics } from '../../hooks/useSiteMetrics.js';
import { useTerrainPatch } from '../../hooks/useTerrainPatch.js';
import { formatLat, formatLon, toDMS } from '../../utils/format.js';
import { MAX_TIME_MS, MIN_TIME_MS, clampTime } from '../../utils/time.js';
import TerrainView from '../TerrainView/TerrainView.jsx';
import TimePicker from '../TimePicker/TimePicker.jsx';
import MetricTiles from '../MetricTiles/MetricTiles.jsx';
import PowerChart from '../PowerChart/PowerChart.jsx';
import './SitePanel.css';

const TERRAIN = { sizeKm: 80, n: 64 };
const ALT_STATS = [
  { key: 'minM', label: 'Min' },
  { key: 'meanM', label: 'Mean' },
  { key: 'maxM', label: 'Max' },
];

/**
 * Right-hand panel for the selected site.
 * @param {{ site: object, time: string, onTimeChange: (iso) => void, onClose: () => void }} props
 */
export default function SitePanel({ site, time, onTimeChange, onClose }) {
  const metrics = useSiteMetrics(site, time);
  const terrain = useTerrainPatch(site, TERRAIN);
  const cat = SITE_CATEGORIES[site.category];
  const [altStat, setAltStat] = useState('meanM');

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const timeMs = Date.parse(time);
  const shiftDays = (d) => onTimeChange(new Date(clampTime(timeMs + d * 86400e3)).toISOString());
  const metres = (m) => `${Math.round(m).toLocaleString()} m`;
  const patch = terrain.data;

  return (
    <aside className="site-panel" aria-label={`${site.name} details`}>
      <header className="panel-header">
        <div>
          <div className="panel-badges">
            <span className="badge" style={{ '--c': cat?.color }}>
              <span className="cat-dot" />
              {cat?.label}
            </span>
            {site.mock && <span className="tag-mock" title="Placeholder data until the backend is connected">Mock data</span>}
          </div>
          <h2>{site.name}</h2>
          <p className="panel-sub">
            {site.agency} · {site.notes}
          </p>
          <Link className="stand-here" to={`/horizon?site=${encodeURIComponent(site.id)}&t=${encodeURIComponent(time)}`}>
            🧑‍🚀 Stand here · look at the horizon →
          </Link>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close panel">
          ✕
        </button>
      </header>

      <section className="panel-section">
        <h3>Location</h3>
        <dl className="kv">
          <dt>Latitude</dt>
          <dd className="tabular">
            {formatLat(site.lat, 4)} <span className="muted">{toDMS(site.lat, 'N', 'S')}</span>
          </dd>
          <dt>Longitude</dt>
          <dd className="tabular">
            {formatLon(site.lon, 4)} <span className="muted">{toDMS(site.lon, 'E', 'W')}</span>
          </dd>
          <dt>Altitude</dt>
          <dd className="tabular">{patch ? metres(patch.centerElevationM) : '…'}</dd>
          <dt>Mean slope</dt>
          <dd className="tabular">{patch ? `${patch.meanSlopeDeg.toFixed(1)}° (central ${Math.round(patch.centralKm)} km)` : '…'}</dd>
          <dt>Surface roughness</dt>
          <dd className="tabular" title="RMS height deviation from the best-fit plane, at the elevation grid's km-scale resolution">
            {patch ? `${metres(patch.roughnessM)} RMS (central ${Math.round(patch.centralKm)} km)` : '…'}
          </dd>
          <dt>Patch altitude</dt>
          <dd className="alt-stat">
            <span className="segmented" role="group" aria-label="Altitude statistic">
              {ALT_STATS.map(({ key, label }) => (
                <button key={key} type="button" aria-pressed={altStat === key} onClick={() => setAltStat(key)}>
                  {label}
                </button>
              ))}
            </span>
            <span className="tabular">{patch ? metres(patch[altStat]) : '…'}</span>
            {patch && <span className="muted">({patch.sizeKm} km patch)</span>}
          </dd>
        </dl>
      </section>

      <section className="panel-section">
        <h3>Terrain · bird's-eye</h3>
        <TerrainView patch={patch} sunAzimuth={metrics.data?.now.sunAzimuth ?? null} loading={terrain.loading} />
        {patch && (
          <p className="panel-caption tabular">
            {patch.sizeKm} × {patch.sizeKm} km · {patch.n}×{patch.n} vertices · {Math.round(patch.spacingM)} m spacing ·
            relief {Math.round(patch.minM).toLocaleString()} to {Math.round(patch.maxM).toLocaleString()} m · source {patch.source}
          </p>
        )}
        {terrain.error && <p className="field-error">{String(terrain.error.message ?? terrain.error)}</p>}
      </section>

      <section className="panel-section">
        <div className="section-head">
          <h3>Conditions</h3>
          <div className="time-controls">
            <button onClick={() => shiftDays(-1)} disabled={timeMs <= MIN_TIME_MS} aria-label="One day earlier">
              −1 d
            </button>
            <button onClick={() => shiftDays(1)} disabled={timeMs >= MAX_TIME_MS} aria-label="One day later">
              +1 d
            </button>
          </div>
        </div>
        <TimePicker value={time} onChange={onTimeChange} />
        {metrics.loading && !metrics.data && <p className="muted">Computing…</p>}
        {metrics.error && <p className="field-error">{String(metrics.error.message ?? metrics.error)}</p>}
        {metrics.data && (
          <div className={metrics.loading ? 'is-refreshing' : undefined}>
            <MetricTiles metrics={metrics.data} />
          </div>
        )}
      </section>

      {metrics.data && (
        <section className="panel-section">
          <h3>Timeline · 30 days</h3>
          <PowerChart series={metrics.data.series} />
        </section>
      )}
    </aside>
  );
}
