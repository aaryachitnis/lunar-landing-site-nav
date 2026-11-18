import { formatDeg, formatDuration, formatPct } from '../../utils/format.js';
import Hint from '../Hint/Hint.jsx';
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
      <div className="tile-label">
        {label}
        <Hint metric={label} />
      </div>
      <div className="tile-value tabular">{value}</div>
      {sub && <div className="tile-sub">{sub}</div>}
    </div>
  );
}

const wm2 = (v) => (v == null ? '…' : `${v < 10 ? v.toFixed(1) : Math.round(v)} W/m²`);
const yesNo = (v) => (v ? 'yes' : 'no');

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

/**
 * Live Sun/Earth metrics from JPL Horizons. With `terrain`, visibility is judged against the
 * LOLA horizon and the flat-horizon value is shown underneath for comparison.
 */
export function SkyTiles({
  sky,
  terrain,
  sunEvents,
  selectedTime,
  windowDays = 27,
  skyError,
  terrainError,
  sunEventsLoading,
  sunEventsError,
}) {
  const windowNote = `next ${windowDays} d`;
  const hoursUntil = (eventTime) => {
    if (!eventTime) return null;
    const delta = Date.parse(eventTime) - Date.parse(selectedTime);
    return Number.isFinite(delta) && delta >= -1000 ? Math.max(0, delta / 3.6e6) : null;
  };
  const until = (label, eventTime, available, source) => {
    const hours = hoursUntil(eventTime);
    const loading = sunEventsLoading;
    const unavailable = !loading && !available;
    return (
      <Tile
        label={label}
        value={loading ? '…' : formatDuration(unavailable ? null : hours)}
        sub={loading ? 'JPL Horizons' : unavailable ? 'JPL Horizons unavailable' : hours == null ? `not within ${windowNote}` : source}
      />
    );
  };

  if (terrain && sky) {
    const { sun, earth } = terrain;
    const overTerrain = 'over terrain';
    return (
      <div className="tiles">
        <Tile label="Sun altitude" value={formatDeg(sky.sunAltitudeDeg)} sub={`terrain horizon there: ${formatDeg(sun.horizonDeg)}`} />
        <Tile label="Sun visible" value={<YesNo ok={sun.visible} />} sub={`over terrain · flat horizon: ${yesNo(sky.sunVisible)}`} />
        {until('Time to sunset', sun.setUtc, true, overTerrain)}
        {until('Time to sunrise', sun.riseUtc, true, overTerrain)}
        <Tile label="Earth altitude" value={formatDeg(sky.earthAltitudeDeg)} sub={`terrain horizon there: ${formatDeg(earth.horizonDeg)}`} />
        <Tile label="Earth visible" value={<YesNo ok={earth.visible} />} sub={`over terrain · flat horizon: ${yesNo(sky.earthVisible)}`} />
        {until('Time to Earthset', earth.setUtc, true, overTerrain)}
        {until('Time to Earthrise', earth.riseUtc, true, overTerrain)}
        <Tile label="Sunlit" value={formatPct(sun.visibleFraction)} sub={`${windowNote} · flat ${formatPct(sun.flatVisibleFraction)}`} />
        <Tile label="Longest darkness" value={formatDuration(sun.longestHiddenH)} sub={windowNote} />
        <Tile label="Earth in view" value={formatPct(earth.visibleFraction)} sub={`${windowNote} · flat ${formatPct(earth.flatVisibleFraction)}`} />
        <Tile
          label="Longest comms gap"
          value={formatDuration(earth.longestHiddenH)}
          sub={earth.hiddenByTerrainH > 0 ? `${formatDuration(earth.hiddenByTerrainH)} lost to terrain` : windowNote}
        />
        <p className="tiles-note">
          Sun and Earth from JPL Horizons. Horizon traced through NASA LOLA terrain ({(terrain.resolutionM / 1000).toFixed(1)} km
          grid, out to {terrain.maxRangeKm} km), so rims smaller than the grid are not captured.
        </p>
      </div>
    );
  }

  const skyOk = !sunEventsError;
  const source = 'JPL Horizons · astronomical horizon';
  return (
    <div className="tiles">
      <Tile label="Sun altitude" value={formatDeg(sky?.sunAltitudeDeg)} sub={sky ? source : 'Live sky metrics unavailable'} />
      <Tile label="Sun visible" value={sky ? <YesNo ok={sky.sunVisible} /> : 'n/a'} sub="at selected time · astronomical horizon" />
      {until('Time to sunset', sunEvents?.nearestSunsetUtc, skyOk, source)}
      {until('Time to sunrise', sunEvents?.nearestSunriseUtc, skyOk, source)}
      <Tile label="Earth altitude" value={formatDeg(sky?.earthAltitudeDeg)} sub={sky ? source : 'Live sky metrics unavailable'} />
      <Tile label="Earth visible" value={sky ? <YesNo ok={sky.earthVisible} /> : 'n/a'} sub="at selected time · astronomical horizon" />
      {until('Time to Earthset', sky?.nearestEarthsetUtc, skyOk && !skyError && !!sky, source)}
      {until('Time to Earthrise', sky?.nearestEarthriseUtc, skyOk && !skyError && !!sky, source)}
      <Tile label="Sunlit" value={sky ? formatPct(sky.sunlitFraction) : 'n/a'} sub={windowNote} />
      <Tile label="Longest darkness" value={formatDuration(sky?.longestDarknessH)} sub={windowNote} />
      <p className="tiles-note">
        {terrainError ? `Terrain horizon unavailable (${terrainError}). ` : ''}
        JPL Horizons data; visibility and darkness use the astronomical horizon and do not account for local terrain.
      </p>
    </div>
  );
}
