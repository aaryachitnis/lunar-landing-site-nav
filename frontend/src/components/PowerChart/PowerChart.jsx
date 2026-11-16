import { useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import './PowerChart.css';

const axisProps = {
  stroke: 'var(--text-muted)',
  tick: { fill: 'var(--text-muted)', fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: 'var(--border)' },
};
const dayTick = (d) => `${d > 0 ? '+' : ''}${d} d`;
const DAY_TICKS = [-3, 0, 3, 6, 9, 12, 15, 18, 21, 24, 27];

function TooltipBox({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-title">{dayTick(Number(label.toFixed(2)))} from selected</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="chart-tooltip-row">
          <span className="swatch" style={{ background: p.color }} />
          <span>{p.name}</span>
          <span className="tabular">{p.value.toFixed(1)} W/m²</span>
        </div>
      ))}
    </div>
  );
}

export default function PowerChart({ power }) {
  const data = useMemo(() => power.series.map((p) => ({ day: p.hoursFromSelected / 24, power: p.wPerM2 })), [power]);

  return (
    <div className="power-chart">
      <p className="chart-note">Dashed line = selected time.</p>
      <h4>Solar power (W/m²)</h4>
      <ResponsiveContainer width="100%" height={130}>
        <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="var(--border)" strokeOpacity={0.5} vertical={false} />
          <XAxis dataKey="day" type="number" domain={['dataMin', 'dataMax']} ticks={DAY_TICKS} tickFormatter={dayTick} {...axisProps} />
          <YAxis {...axisProps} width={44} />
          <Tooltip content={<TooltipBox />} cursor={{ stroke: 'var(--text-muted)' }} />
          <ReferenceLine x={0} stroke="var(--text-secondary)" strokeDasharray="3 3" />
          <Area dataKey="power" name="Power" type="monotone" stroke="var(--series-power)" strokeWidth={2} fill="var(--series-power)" fillOpacity={0.18} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>

      <details className="chart-table">
        <summary>Daily table</summary>
        <table>
          <thead>
            <tr>
              <th>Day</th>
              <th>Energy kWh/m²</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {power.daily.map((r) => (
              <tr key={r.day}>
                <td>{dayTick(r.day)}</td>
                <td>{r.kWhPerM2.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
