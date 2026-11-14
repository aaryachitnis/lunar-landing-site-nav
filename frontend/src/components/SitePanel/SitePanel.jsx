import { useEffect } from 'react';
import { SITE_CATEGORIES } from '../../data/mock/sites.js';
import { useSiteMetrics } from '../../hooks/useSiteMetrics.js';
import { useTerrainPatch } from '../../hooks/useTerrainPatch.js';
import { formatLat, formatLon, toDMS, toDateTimeLocal } from '../../utils/format.js';
import TerrainView from '../TerrainView/TerrainView.jsx';
import MetricTiles from '../MetricTiles/MetricTiles.jsx';
import PowerChart from '../PowerChart/PowerChart.jsx';
import './SitePanel.css';

const TERRAIN = { sizeKm: 80, n: 64 };

/**
 * Right-hand panel for the selected site.
 * @param {{ site: object, time: string, onTimeChange: (iso) => void, onClose: () => void }} props
 */
export default function SitePanel({ site, time, onTimeChange, onClose }) {
  const metrics = useSiteMetrics(site, time);
  const terrain = useTerrainPatch(site, TERRAIN);
  const cat = SITE_CATEGORIES[site.category];

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const shiftDays = (d) => onTimeChange(new Date(new Date(time).getTime() + d * 86400e3).toISOString());
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
          <dt>Elevation</dt>
          <dd className="tabular">{patch ? `${Math.round(patch.centerElevationM).toLocaleString()} m` : '…'}</dd>
          <dt>Mean slope</dt>
          <dd className="tabular">{patch ? `${patch.meanSlopeDeg.toFixed(1)}° (central 20 km)` : '…'}</dd>
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
            <button onClick={() => shiftDays(-1)} aria-label="One day earlier">
              −1 d
            </button>
            <input
              type="datetime-local"
              value={toDateTimeLocal(new Date(time))}
              onChange={(e) => e.target.value && onTimeChange(new Date(e.target.value).toISOString())}
              aria-label="Selected date and time"
            />
            <button onClick={() => shiftDays(1)} aria-label="One day later">
              +1 d
            </button>
          </div>
        </div>
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
