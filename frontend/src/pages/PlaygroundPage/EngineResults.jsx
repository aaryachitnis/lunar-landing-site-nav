import { useMemo } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDuration } from '../../utils/format.js';
import '../../components/MetricTiles/MetricTiles.css';
import '../../components/PowerChart/PowerChart.css';

const axisProps = {
  stroke: 'var(--text-muted)',
  tick: { fill: 'var(--text-muted)', fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: 'var(--border)' },
};
const dayTick = (d) => `${Number(d.toFixed(1))} d`;
const fmt = (v, digits = 0) => v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

function Tile({ label, value, sub }) {
  return (
    <div className="tile">
      <div className="tile-label">{label}</div>
      <div className="tile-value tabular">{value}</div>
      {sub && <div className="tile-sub">{sub}</div>}
    </div>
  );
}

function TooltipBox({ active, payload, label, unit, digits, title }) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-title">{title(label)}</div>
      <div className="chart-tooltip-row">
        <span className="swatch" style={{ background: 'var(--series-power)' }} />
        <span>{p.name}</span>
        <span className="tabular">
          {fmt(p.value, digits)} {unit}
        </span>
      </div>
    </div>
  );
}

export default function EngineResults({ engine, request }) {
  const r = engine.response;
  const power = r.instantaneous_power_per_area_W_m2;
  const daily = r.daily_power_generated_per_area_kWh_per_m2_day;
  const area = request.panelAreaM2;
  const t0 = engine.times[0];

  const derived = useMemo(() => {
    const stepH = engine.times.length > 1 ? (engine.times[1] - engine.times[0]) / 3.6e6 : 0;
    let longestDark = 0;
    let run = 0;
    for (const p of power) {
      run = p > 0 ? 0 : run + stepH;
      longestDark = Math.max(longestDark, run);
    }
    return {
      peak: Math.max(...power),
      sunlitFraction: power.filter((p) => p > 0).length / power.length,
      longestDark,
      totalKwhM2: daily.reduce((s, v) => s + v, 0),
    };
  }, [engine, power, daily]);

  const powerData = useMemo(() => power.map((p, i) => ({ day: (engine.times[i] - t0) / 86400e3, power: p })), [power, engine.times, t0]);
  const dailyData = useMemo(() => daily.map((kwh, d) => ({ day: d + 1, kwh })), [daily]);

  return (
    <div className="pg-engine">
      <div className="tiles">
        <Tile label="Avg power (24 h)" value={`${fmt(r.average_power_per_24h_W_m2, 1)} W/m²`} sub={`${fmt(r.average_power_per_24h_W_m2 * area)} W for ${fmt(area, area % 1 ? 1 : 0)} m²`} />
        <Tile label="Avg power (sunlit days)" value={`${fmt(r.average_power_sunlit_days_W_m2, 1)} W/m²`} sub={`${fmt(r.average_power_sunlit_days_W_m2 * area)} W for the array`} />
        <Tile label="Energy in window" value={`${fmt(derived.totalKwhM2, 2)} kWh/m²`} sub={`${fmt(derived.totalKwhM2 * area, 1)} kWh for the array`} />
        <Tile label="Peak power" value={`${fmt(derived.peak, 1)} W/m²`} sub={`${fmt(derived.peak * area)} W for the array`} />
        <Tile label="Sunlit samples" value={`${Math.round(derived.sunlitFraction * 100)}%`} sub={`of ${power.length} samples (${r.step})`} />
        <Tile label="Longest darkness" value={formatDuration(derived.longestDark)} sub="within the window" />
      </div>

      <div className="power-chart">
        <h4>Instantaneous power per m² (W/m²)</h4>
        <ResponsiveContainer width="100%" height={150}>
          <AreaChart data={powerData} margin={{ top: 6, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="var(--border)" strokeOpacity={0.5} vertical={false} />
            <XAxis dataKey="day" type="number" domain={['dataMin', 'dataMax']} tickFormatter={dayTick} {...axisProps} />
            <YAxis {...axisProps} width={44} />
            <Tooltip
              content={<TooltipBox unit="W/m²" digits={1} title={(d) => `${new Date(t0 + d * 86400e3).toISOString().slice(0, 16).replace('T', ' ')} UTC`} />}
              cursor={{ stroke: 'var(--text-muted)' }}
            />
            <Area dataKey="power" name="Power" type="linear" stroke="var(--series-power)" strokeWidth={2} fill="var(--series-power)" fillOpacity={0.18} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>

        <h4>Daily energy per m² (kWh/m²·day)</h4>
        <ResponsiveContainer width="100%" height={130}>
          <BarChart data={dailyData} margin={{ top: 6, right: 8, bottom: 0, left: -12 }} barCategoryGap={2}>
            <CartesianGrid stroke="var(--border)" strokeOpacity={0.5} vertical={false} />
            <XAxis dataKey="day" {...axisProps} interval="preserveStartEnd" tickFormatter={(d) => `D${d}`} />
            <YAxis {...axisProps} width={44} />
            <Tooltip
              content={<TooltipBox unit="kWh/m²" digits={3} title={(d) => `Day ${d}`} />}
              cursor={{ fill: 'var(--accent-dim)' }}
            />
            <Bar dataKey="kwh" name="Energy" fill="var(--series-power)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>

        <details className="chart-table">
          <summary>Daily table</summary>
          <table>
            <thead>
              <tr>
                <th>Day</th>
                <th>kWh/m²</th>
                <th>Array kWh</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {dailyData.map((d) => (
                <tr key={d.day}>
                  <td>{d.day}</td>
                  <td>{d.kwh.toFixed(3)}</td>
                  <td>{(d.kwh * area).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>
      <p className="pg-hint">
        {engine.source} · {r.start} → {r.end} · step {r.step} · horizontal panel at {Math.round(engine.efficiency * 100)}%
        efficiency, no terrain shadowing (engine model).
      </p>
    </div>
  );
}
