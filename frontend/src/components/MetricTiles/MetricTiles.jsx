import { formatDeg, formatDuration } from '../../utils/format.js';
import './MetricTiles.css';

/** Yes/No with an icon, so status never relies on colour alone. */
function YesNo({ ok }) {
  return (
    <span className={`yes-no ${ok ? 'status-good' : 'status-critical'}`}>
      <span aria-hidden="true">{ok ? '●' : '○'}</span> {ok ? 'Yes' : 'No'}
    </span>
  );
}

function Tile({ label, value, sub }) {
  return (
    <div className="tile">
      <div className="tile-label">{label}</div>
      <div className="tile-value tabular">{value}</div>
      {sub && <div className="tile-sub">{sub}</div>}
    </div>
  );
}

const wm2 = (v) => (v == null ? '…' : `${v < 10 ? v.toFixed(1) : Math.round(v)} W/m²`);

/** Live solar power from the backend. See SCHEMA.md → SitePower. */
export function PowerTiles({ power }) {
  const days = power.daily.length;
  return (
    <div className="tiles">
      <Tile label="Power now" value={wm2(power.nowWPerM2)} sub="at selected time" />
      <Tile label="Energy" value={`${power.totalKWhPerM2.toFixed(1)} kWh/m²`} sub={`over ${days} days`} />
      <Tile label="Mean power" value={wm2(power.avgWPerM2)} sub="averaged over 24 h days" />
      <Tile label="Mean, sunlit days" value={wm2(power.avgSunlitDaysWPerM2)} sub="days with any sunlight" />
      <p className="tiles-note">Flat panel, per m². Sun position from JPL Horizons; terrain shadowing not included.</p>
    </div>
  );
}

/** Mock Sun and Earth model. See SCHEMA.md → SkyModel. */
export function SkyTiles({ sky }) {
  const { now, window: w } = sky;
  const windowNote = `next ${w.days} d`;
  const vsTerrain = (above) => `${above >= 0 ? '+' : ''}${above.toFixed(1)}° vs terrain`;
  const until = (label, hours) => (
    <Tile label={label} value={formatDuration(hours)} sub={hours == null ? `not within ${windowNote}` : 'incl. terrain horizon'} />
  );
  return (
    <div className="tiles">
      <Tile label="Sun altitude" value={formatDeg(now.sunElevation)} sub={`az ${formatDeg(now.sunAzimuth, 0)} · ${vsTerrain(now.sunAboveHorizon)}`} />
      <Tile label="Sun visible" value={<YesNo ok={now.sunUp} />} sub="at selected time" />
      {until('Time to sunset', now.hoursToSunset)}
      {until('Time to sunrise', now.hoursToSunrise)}
      <Tile label="Earth altitude" value={formatDeg(now.earthElevation)} sub={`az ${formatDeg(now.earthAzimuth, 0)} · ${vsTerrain(now.earthAboveHorizon)}`} />
      <Tile label="Earth visible" value={<YesNo ok={now.earthUp} />} sub="at selected time" />
      {until('Time to Earthset', now.hoursToEarthset)}
      {until('Time to Earthrise', now.hoursToEarthrise)}
      <Tile label="Sunlit" value={`${Math.round(w.illuminatedFraction * 100)}%`} sub={windowNote} />
      <Tile label="Longest darkness" value={formatDuration(w.longestDarknessH)} sub={windowNote} />
    </div>
  );
}
