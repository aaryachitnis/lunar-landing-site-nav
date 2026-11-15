import { formatDeg, formatDuration } from '../../utils/format.js';
import './MetricTiles.css';

/** Yes/No with an icon so status never relies on colour alone. */
function YesNo({ ok }) {
  return (
    <span className={`yes-no ${ok ? 'status-good' : 'status-critical'}`}>
      <span aria-hidden="true">{ok ? '●' : '○'}</span> {ok ? 'Yes' : 'No'}
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
  const vsTerrain = (above) => `${above >= 0 ? '+' : ''}${above.toFixed(1)}° vs terrain`;
  const until = (label, hours) => (
    <Tile label={label} value={formatDuration(hours)} sub={hours == null ? `not within ${windowNote}` : 'incl. terrain horizon'} />
  );
  return (
    <div className="tiles">
      <Tile label="Sun altitude" value={formatDeg(now.sunElevation)} sub={`az ${formatDeg(now.sunAzimuth, 0)} · ${vsTerrain(now.sunAboveHorizon)}`} />
      <Tile label="Sun visible" value={<YesNo ok={now.sunUp} />} sub="at selected time · terrain horizon" />
      {until('Time to sunset', now.hoursToSunset)}
      {until('Time to sunrise', now.hoursToSunrise)}
      <Tile label="Earth altitude" value={formatDeg(now.earthElevation)} sub={`az ${formatDeg(now.earthAzimuth, 0)} · ${vsTerrain(now.earthAboveHorizon)}`} />
      <Tile label="Earth visible" value={<YesNo ok={now.earthUp} />} sub="at selected time · terrain horizon" />
      {until('Time to Earthset', now.hoursToEarthset)}
      {until('Time to Earthrise', now.hoursToEarthrise)}
      <Tile label="Mean power" value={`${Math.round(w.meanPowerW)} W`} sub={`${Math.round(w.energyKWh)} kWh ${windowNote}`} />
      <Tile label="Longest darkness" value={formatDuration(w.longestDarknessH)} sub={windowNote} />
      <p className="tiles-note">
        Power assumes {panel.areaM2} m² panel, {Math.round(panel.efficiency * 100)}% efficiency, {panel.tracking}.
      </p>
    </div>
  );
}
