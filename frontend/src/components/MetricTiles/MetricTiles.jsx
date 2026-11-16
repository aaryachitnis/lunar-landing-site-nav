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

/** Live Sun/Earth metrics from JPL Horizons, evaluated against the astronomical horizon. */
export function SkyTiles({
  sky,
  sunEvents,
  selectedTime,
  windowDays = 27,
  skyError,
  sunEventsLoading,
  sunEventsError,
}) {
  const windowNote = `next ${windowDays} d`;
  const hoursUntil = (eventTime) => {
    if (!eventTime) return null;
    const delta = Date.parse(eventTime) - Date.parse(selectedTime);
    return Number.isFinite(delta) && delta >= -1000 ? Math.max(0, delta / 3.6e6) : null;
  };
  const until = (label, eventTime, skyRequired = false) => {
    const hours = hoursUntil(eventTime);
    const loading = sunEventsLoading;
    const unavailable = !loading && (sunEventsError || (skyRequired && (skyError || !sky)));
    return (
      <Tile
        label={label}
        value={loading ? '…' : formatDuration(unavailable ? null : hours)}
        sub={
          loading
            ? 'JPL Horizons'
            : unavailable
              ? 'JPL Horizons unavailable'
              : hours == null
                ? `not within ${windowNote}`
                : 'JPL Horizons · astronomical horizon'
        }
      />
    );
  };
  return (
    <div className="tiles">
      <Tile
        label="Sun altitude"
        value={formatDeg(sky?.sunAltitudeDeg)}
        sub={sky ? 'JPL Horizons · astronomical horizon' : 'Live sky metrics unavailable'}
      />
      <Tile
        label="Sun visible"
        value={sky ? <YesNo ok={sky.sunVisible} /> : 'n/a'}
        sub="at selected time · astronomical horizon"
      />
      {until('Time to sunset', sunEvents?.nearestSunsetUtc)}
      {until('Time to sunrise', sunEvents?.nearestSunriseUtc)}
      <Tile
        label="Earth altitude"
        value={formatDeg(sky?.earthAltitudeDeg)}
        sub={sky ? 'JPL Horizons · astronomical horizon' : 'Live sky metrics unavailable'}
      />
      <Tile
        label="Earth visible"
        value={sky ? <YesNo ok={sky.earthVisible} /> : 'n/a'}
        sub="at selected time · astronomical horizon"
      />
      {until('Time to Earthset', sky?.nearestEarthsetUtc, true)}
      {until('Time to Earthrise', sky?.nearestEarthriseUtc, true)}
      <Tile
        label="Sunlit"
        value={sky ? `${Math.round(sky.sunlitFraction * 100)}%` : 'n/a'}
        sub={windowNote}
      />
      <Tile
        label="Longest darkness"
        value={formatDuration(sky?.longestDarknessH)}
        sub={windowNote}
      />
      <p className="tiles-note">
        JPL Horizons data; visibility and darkness use the astronomical horizon and do not account for local terrain.
      </p>
    </div>
  );
}
