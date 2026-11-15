import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import './PowerChart.css';

const axisProps = {
  stroke: 'var(--text-muted)',
  tick: { fill: 'var(--text-muted)', fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: 'var(--border)' },
};
const dayTick = (d) => `${d > 0 ? '+' : ''}${d} d`;
const DAY_TICKS = [-3, 0, 3, 6, 9, 12, 15, 18, 21, 24, 27];

function TooltipBox({ active, payload, label, unit }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-title">{dayTick(Number(label.toFixed(2)))} from selected</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="chart-tooltip-row">
          <span className="swatch" style={{ background: p.color }} />
          <span>{p.name}</span>
          <span className="tabular">
            {p.value.toFixed(unit === 'W' ? 0 : 1)}
            {unit}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Solar power (W) over the timeline, plus a daily table. */
export default function PowerChart({ series }) {
  const data = useMemo(
    () =>
      series
        .filter((_, i) => i % 2 === 0)
        .map((p) => ({
          day: p.hoursFromSelected / 24,
          power: p.powerW,
        })),
    [series],
  );

  const daily = useMemo(() => {
    const rows = new Map();
    for (const p of series) {
      if (p.hoursFromSelected < 0) continue;
      const d = Math.floor(p.hoursFromSelected / 24);
      const r = rows.get(d) ?? { day: d, sunH: 0, earthH: 0, wh: 0 };
      r.sunH += p.illumination > 0.5 ? 1 : 0;
      r.earthH += p.earthVisible ? 1 : 0;
      r.wh += p.powerW;
      rows.set(d, r);
    }
    return [...rows.values()];
  }, [series]);

  return (
    <div className="power-chart">
      <p className="chart-note">Dashed line = selected time.</p>
      <h4>Solar power (W)</h4>
      <ResponsiveContainer width="100%" height={130}>
        <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="var(--border)" strokeOpacity={0.5} vertical={false} />
          <XAxis dataKey="day" type="number" domain={['dataMin', 'dataMax']} ticks={DAY_TICKS} tickFormatter={dayTick} {...axisProps} />
          <YAxis {...axisProps} width={44} />
          <Tooltip content={<TooltipBox unit="W" />} cursor={{ stroke: 'var(--text-muted)' }} />
          <ReferenceLine x={0} stroke="var(--text-secondary)" strokeDasharray="3 3" />
          <Area dataKey="power" name="Power" type="stepAfter" stroke="var(--series-power)" strokeWidth={2} fill="var(--series-power)" fillOpacity={0.18} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>

      <details className="chart-table">
        <summary>Daily table</summary>
        <table>
          <thead>
            <tr>
              <th>Day</th>
              <th>Sunlit h</th>
              <th>Earth h</th>
              <th>Energy kWh</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {daily.map((r) => (
              <tr key={r.day}>
                <td>+{r.day}</td>
                <td>{r.sunH}</td>
                <td>{r.earthH}</td>
                <td>{(r.wh / 1000).toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
