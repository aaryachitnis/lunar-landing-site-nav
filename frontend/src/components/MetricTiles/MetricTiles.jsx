import { formatDeg, formatDuration, formatPct } from '../../utils/format.js';
import './MetricTiles.css';

function Status({ ok, yes, no }) {
  return (
    <span className={`status ${ok ? 'status-good' : 'status-critical'}`}>
      <span aria-hidden="true">{ok ? '●' : '○'}</span> {ok ? yes : no}
    </span>
  );
}

function Tile({ label, value, sub, children }) {
  return (
    <div className="tile">
      <div className="tile-label">{label}</div>
      <div className="tile-value tabular">{value}</div>
      {sub && <div className="tile-sub">{sub}</div>}
      {children}
    </div>
  );
}

/** @param {{ metrics: object }} props  — see data/SCHEMA.md → SiteMetrics */
export default function MetricTiles({ metrics }) {
  const { now, window: w, panel } = metrics;
  const windowNote = `next ${w.days} d`;
  return (
    <div className="tiles">
      <Tile label="Sun elevation" value={formatDeg(now.sunElevation)} sub={`az ${formatDeg(now.sunAzimuth, 0)} · ${now.sunAboveHorizon >= 0 ? '+' : ''}${now.sunAboveHorizon.toFixed(1)}° vs terrain`}>
        <Status ok={now.sunUp} yes="Sunlit" no="In shadow" />
      </Tile>
      <Tile
        label={now.sunUp ? 'Time to sunset' : 'Time to sunrise'}
        value={formatDuration(now.hoursToSunTransition)}
        sub={now.hoursToSunTransition == null ? `not within ${windowNote}` : 'incl. terrain horizon'}
      />
      <Tile label="Earth elevation" value={formatDeg(now.earthElevation)} sub={`az ${formatDeg(now.earthAzimuth, 0)} · ${now.earthAboveHorizon >= 0 ? '+' : ''}${now.earthAboveHorizon.toFixed(1)}° vs terrain`}>
        <Status ok={now.earthUp} yes="Direct-to-Earth" no="No Earth link" />
      </Tile>
      <Tile
        label={now.earthUp ? 'Time to Earthset' : 'Time to Earthrise'}
        value={formatDuration(now.hoursToEarthTransition)}
        sub={now.hoursToEarthTransition == null ? `not within ${windowNote}` : 'incl. terrain horizon'}
      />
      <Tile label="Sunlit" value={formatPct(w.illuminatedFraction)} sub={windowNote} />
      <Tile label="Earth visible" value={formatPct(w.earthVisibleFraction)} sub={windowNote} />
      <Tile label="Mean power" value={`${Math.round(w.meanPowerW)} W`} sub={`${Math.round(w.energyKWh)} kWh ${windowNote}`} />
      <Tile label="Longest darkness" value={formatDuration(w.longestDarknessH)} sub={windowNote} />
      <p className="tiles-note">
        Power assumes {panel.areaM2} m² panel, {Math.round(panel.efficiency * 100)}% efficiency, {panel.tracking}.
      </p>
    </div>
  );
}
