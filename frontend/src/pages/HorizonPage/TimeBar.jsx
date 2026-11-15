import { useRef } from 'react';

const fmtUtc = (ms) => {
  const d = new Date(ms);
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })} · ${d.toISOString().slice(11, 16)} UTC`;
};

/** SPIKE: two-row Sun/Earth visibility bar with play, speed and scrub. */
export default function TimeBar({ timeline, now, sunRuns, earthRuns, playing, onPlay, speeds, speed, onSpeed, onScrub, onLanding, onNextSun, onNextEarth, windowLabel }) {
  const trackRef = useRef(null);
  const span = timeline.end - timeline.start;
  const pct = (ms) => `${Math.max(0, Math.min(100, ((ms - timeline.start) / span) * 100))}%`;
  const rel = (now - timeline.t0) / 3.6e6;
  const relLabel = `${rel >= 0 ? '+' : '−'}${Math.floor(Math.abs(rel) / 24) ? `${Math.floor(Math.abs(rel) / 24)}d ` : ''}${Math.floor(Math.abs(rel) % 24)}h`;

  const scrubAt = (e) => {
    const r = trackRef.current.getBoundingClientRect();
    onScrub(timeline.start + ((e.clientX - r.left) / r.width) * span);
  };
  const ticks = [0, 24, 48, 72].map((h) => ({ h, ms: timeline.t0 + h * 3.6e6 }));

  return (
    <div className="hz-timebar">
      <div className="hz-tb-controls">
        <div className="hz-tb-group">
          <button className="hz-btn primary" onClick={onPlay} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? '❚❚' : '▶'}
          </button>
          {speeds.map((s) => (
            <button key={s.v} className={`hz-btn ${speed === s.v ? 'on' : ''}`} onClick={() => onSpeed(s.v)}>
              {s.label}
            </button>
          ))}
          <button className="hz-btn" onClick={onLanding} title="Back to landing time">
            ⟲ Landing
          </button>
          <button className="hz-btn" onClick={onNextSun} title="Jump to just before the next sunset/sunrise">
            ⏭ ☀
          </button>
          <button className="hz-btn" onClick={onNextEarth} title="Jump to just before the next Earthset/Earthrise">
            ⏭ 🌍
          </button>
        </div>
        <div className="hz-tb-time tabular">
          <b>{fmtUtc(now)}</b> <span className="muted">({relLabel} from landing)</span>
        </div>
        <div className="muted hz-tb-window">{windowLabel}</div>
      </div>
      <div className="hz-tb-tracks">
        {[
          ['☀ Sun', sunRuns, 'sun'],
          ['🌍 Earth', earthRuns, 'earth'],
        ].map(([label, runs, cls]) => (
          <div className="hz-tb-row" key={cls}>
            <span className="hz-tb-label">{label}</span>
            <div className="hz-tb-track">
              {runs.map((r, k) => (
                <div
                  key={k}
                  className={`hz-tb-seg ${cls} ${r.level}`}
                  style={{ left: pct(r.startMs), width: `calc(${pct(r.endMs)} - ${pct(r.startMs)})` }}
                />
              ))}
            </div>
          </div>
        ))}
        <div
          className="hz-tb-ticks"
          ref={trackRef}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            scrubAt(e);
          }}
          onPointerMove={(e) => e.buttons && scrubAt(e)}
        >
          {ticks.map((t) => (
            <span key={t.h} className={`hz-tb-tick ${t.h === 0 ? 'landing' : ''}`} style={{ left: pct(t.ms) }}>
              {t.h === 0 ? 'Landing' : `+${t.h / 24}d`}
            </span>
          ))}
          <div className="hz-tb-head" style={{ left: pct(now) }} />
        </div>
      </div>
    </div>
  );
}
