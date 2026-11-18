import { formatDuration } from '../../utils/format.js';
import './VisibilityTimeline.css';

const DAY_MS = 86400e3;
const fmt = (ms) => new Date(ms).toISOString().slice(5, 16).replace('T', ' ');

/** Sun and Earth visibility windows over the terrain horizon, from the selected time onwards. */
export default function VisibilityTimeline({ terrain, startMs, endMs }) {
  const span = endMs - startMs;
  if (!terrain || !(span > 0)) return null;
  const pct = (ms) => `${(Math.min(Math.max(ms - startMs, 0), span) / span) * 100}%`;
  const days = Math.floor(span / DAY_MS);
  const ticks = Array.from({ length: Math.floor(days / 7) + 1 }, (_, i) => i * 7);
  const rows = [
    ['Sun', 'sun', terrain.sun],
    ['Earth', 'earth', terrain.earth],
  ];

  return (
    <div className="vis-timeline">
      <h4>Visibility windows · next {days} d</h4>
      <div
        className="vis-tracks"
        role="img"
        aria-label={rows
          .map(([name, , b]) => `${name}: ${b.windows.length} window${b.windows.length === 1 ? '' : 's'}, visible ${Math.round(b.visibleFraction * 100)}% of the time`)
          .join('. ')}
      >
        {rows.map(([name, cls, body]) => (
          <div className="vis-row" key={cls}>
            <span className="vis-label">{name}</span>
            <div className="vis-track">
              {body.windows.map((w) => (
                <span
                  key={w.startMs}
                  className={`vis-seg ${cls}`}
                  style={{ left: pct(w.startMs), width: `calc(${pct(w.endMs)} - ${pct(w.startMs)})` }}
                  title={`${name} visible ${fmt(w.startMs)} → ${fmt(w.endMs)} UTC (${formatDuration(w.hours)})`}
                />
              ))}
            </div>
          </div>
        ))}
        <div className="vis-row vis-axis" aria-hidden="true">
          <span className="vis-label" />
          <div className="vis-track">
            {ticks.map((d) => (
              <span key={d} className="vis-tick" style={{ left: pct(startMs + d * DAY_MS) }}>
                {d === 0 ? 'now' : `+${d} d`}
              </span>
            ))}
          </div>
        </div>
      </div>
      <p className="vis-legend">
        Filled = above the terrain horizon. Earth bars are direct-to-Earth contact windows.
      </p>

      <details className="chart-table">
        <summary>Window table</summary>
        <table>
          <thead>
            <tr>
              <th>Body</th>
              <th>From (UTC)</th>
              <th>To (UTC)</th>
              <th>Length</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {rows.flatMap(([name, cls, body]) =>
              body.windows.length
                ? body.windows.map((w) => (
                    <tr key={`${cls}${w.startMs}`}>
                      <td>{name}</td>
                      <td>{fmt(w.startMs)}</td>
                      <td>{fmt(w.endMs)}</td>
                      <td>{formatDuration(w.hours)}</td>
                    </tr>
                  ))
                : [
                    <tr key={cls}>
                      <td>{name}</td>
                      <td colSpan={3}>Not visible in this window</td>
                    </tr>,
                  ],
            )}
          </tbody>
        </table>
      </details>
    </div>
  );
}
