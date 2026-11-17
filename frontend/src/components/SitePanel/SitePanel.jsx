import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SITE_CATEGORIES } from '../../data/siteCatalog.js';
import { useSitePower } from '../../hooks/useSitePower.js';
import { useTerrainPatch } from '../../hooks/useTerrainPatch.js';
import { formatLat, formatLon, toDMS } from '../../utils/format.js';
import { MAX_TIME_MS, MIN_TIME_MS, clampTime } from '../../utils/time.js';
import TerrainView from '../TerrainView/TerrainView.jsx';
import TimePicker from '../TimePicker/TimePicker.jsx';
import { PowerTiles, SkyTiles } from '../MetricTiles/MetricTiles.jsx';
import PowerChart from '../PowerChart/PowerChart.jsx';
import UserBadge, { USER_ADDED_NOTE } from '../UserBadge/UserBadge.jsx';
import VisibilityTimeline from '../VisibilityTimeline/VisibilityTimeline.jsx';
import './SitePanel.css';

const TERRAIN = { sizeKm: 80, n: 64 };
const ALT_STATS = [
  { key: 'minM', label: 'Min' },
  { key: 'meanM', label: 'Mean' },
  { key: 'maxM', label: 'Max' },
];

const errorText = (e) => String(e.message ?? e);

function InfoTip({ text }) {
  const [open, setOpen] = useState(false);
  return (
    <span className={`info-tip${open ? ' open' : ''}`} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        className="icon-btn"
        aria-label="About this site"
        aria-describedby="site-description"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
      >
        i
      </button>
      <span id="site-description" role="tooltip" className="info-tip-body">
        {text}
      </span>
    </span>
  );
}

export default function SitePanel({ site, time, onTimeChange, onClose }) {
  const power = useSitePower(site, time);
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
    <aside className="site-panel" aria-label={`${site.fullName} details`}>
      <header className="panel-header">
        <div>
          <div className="panel-badges">
            {site.userAdded ? (
              <UserBadge label />
            ) : (
              <span className="badge" style={{ '--c': cat?.color }}>
                <span className="cat-dot" />
                {cat?.label}
              </span>
            )}
          </div>
          <h2>{site.name}</h2>
          <p className="panel-sub">
            {site.userAdded ? USER_ADDED_NOTE : [site.region, site.agency].filter(Boolean).join(' · ')}
          </p>
          <Link className="stand-here" to={`/lunarium?site=${encodeURIComponent(site.id)}&t=${encodeURIComponent(time)}`}>
            🧑‍🚀 Stand here · look at the horizon →
          </Link>
        </div>
        <div className="panel-actions">
          {site.description && <InfoTip text={site.description} />}
          <button className="icon-btn" onClick={onClose} aria-label="Close panel">
            ✕
          </button>
        </div>
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
        <TerrainView patch={patch} sunAzimuth={power.data?.sky?.sunAzimuthDeg ?? null} loading={terrain.loading} />
        {patch && (
          <p className="panel-caption tabular">
            {patch.sizeKm} × {patch.sizeKm} km · {patch.n}×{patch.n} vertices · {Math.round(patch.spacingM)} m spacing ·
            relief {Math.round(patch.minM).toLocaleString()} to {Math.round(patch.maxM).toLocaleString()} m · source {patch.source}
          </p>
        )}
        {terrain.error && <p className="field-error">{errorText(terrain.error)}</p>}
      </section>

      <section className="panel-section">
        <div className="section-head">
          <h3>Time</h3>
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
      </section>

      <section className="panel-section">
        <h3>Solar power</h3>
        {power.loading && !power.data && <p className="muted">Fetching ephemeris from JPL Horizons…</p>}
        {power.error && <p className="field-error">{errorText(power.error)}</p>}
        {power.data && (
          <div className={power.loading ? 'is-refreshing' : undefined}>
            <PowerTiles power={power.data} />
            <PowerChart power={power.data} />
          </div>
        )}
        <Link className="panel-caption guide-link" to="/guide#metrics">
          What do these numbers mean? →
        </Link>
      </section>

      <section className="panel-section">
        <h3>
          Sun &amp; Earth
          <span className="tag-mock is-live" title="JPL Horizons positions, judged against the NASA LOLA terrain horizon">
            Live
          </span>
        </h3>
        {power.loading && !power.data && <p className="muted">Fetching Sun/Earth ephemeris from JPL Horizons…</p>}
        {power.error && !power.data && <p className="field-error">{errorText(power.error)}</p>}
        {power.data && (
          <div className={power.loading ? 'is-refreshing' : undefined}>
            {power.data.skyError && (
              <p className="field-error">Live sky metrics unavailable: {power.data.skyError}</p>
            )}
            <VisibilityTimeline terrain={power.data.terrain} startMs={Date.parse(time)} endMs={Date.parse(power.data.end)} />
            <SkyTiles
              sky={power.data.sky}
              terrain={power.data.terrain}
              terrainError={power.data.terrainError}
              sunEvents={power.data}
              selectedTime={time}
              windowDays={power.data.windowDays}
              skyError={power.data.skyError}
              sunEventsLoading={power.loading}
              sunEventsError={power.error}
            />
          </div>
        )}
      </section>
    </aside>
  );
}
