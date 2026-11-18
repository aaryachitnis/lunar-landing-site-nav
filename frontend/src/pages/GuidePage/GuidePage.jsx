import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ENGINE_SETTINGS } from '../../data/api.js';
import { METRIC_DOCS, METRIC_GROUPS } from '../../data/metricDocs.js';
import './GuidePage.css';

const { solarIntensityWm2: S, panelEfficiency: EFF } = ENGINE_SETTINGS;
const flatPanelW = (elevDeg) => Math.round(S * EFF * Math.sin((elevDeg * Math.PI) / 180));
const MAX_W = flatPanelW(90);

const CHAPTERS = [
  { id: 'sun', n: '01', title: 'The Sun', blurb: 'At the poles it barely clears the horizon.', icon: <SunIcon /> },
  { id: 'earth', n: '02', title: 'Earth', blurb: 'Hangs almost still. Sometimes behind a hill.', icon: <EarthIcon /> },
  { id: 'power', n: '03', title: 'Power', blurb: 'A low Sun means very little power.', icon: <PowerIcon /> },
  { id: 'metrics', n: '04', title: 'The numbers', blurb: 'What every figure in the app means.', icon: <GaugeIcon /> },
];

const POWER_ROWS = [
  { deg: 90, place: 'Equator, noon' },
  { deg: 45, place: 'Mid-latitudes' },
  { deg: 10, place: 'High latitudes' },
  { deg: 1.5, place: 'South pole, best case' },
];

const VIEWS = [
  { to: '/', name: 'Landing Sites', text: 'Pick a site on the globe or from the list, then a date. See terrain, solar power and Sun/Earth visibility.' },
  { to: '/lunarium', name: 'Lunarium', text: 'Stand at the site and watch the Sun and Earth move over the real horizon.' },
  { to: '/playground', name: 'Playground', text: "Type any coordinates for the same analysis, and save sites worth keeping." },
];

export default function GuidePage() {
  const { hash } = useLocation();
  const [group, setGroup] = useState(METRIC_GROUPS[0].key);
  // Router navigation doesn't scroll to #anchors on its own.
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);

  const metrics = Object.entries(METRIC_DOCS).filter(([, d]) => d.group === group);

  // Standard tablist keys: arrows wrap, Home/End jump; focus follows selection.
  const onTabKey = (e) => {
    const i = METRIC_GROUPS.findIndex((g) => g.key === group);
    const n = METRIC_GROUPS.length;
    const to = { ArrowRight: (i + 1) % n, ArrowLeft: (i - 1 + n) % n, Home: 0, End: n - 1 }[e.key];
    if (to == null) return;
    e.preventDefault();
    const key = METRIC_GROUPS[to].key;
    setGroup(key);
    document.getElementById(`tab-${key}`)?.focus();
  };

  return (
    <div className="guide-page">
      <article className="guide">
        <header className="guide-hero">
          <p className="hud-label">Guide</p>
          <h1>Landing on the Moon is a timing problem</h1>
          <p className="guide-lead">
            A lander runs on sunlight and talks to Earth by radio. On the Moon both move slowly and sometimes hide behind
            the horizon, so picking a site means picking a place <em>and</em> a date where both work for long enough.
          </p>
          <div className="guide-ctas">
            <Link className="guide-btn primary" to="/?tour=1">
              ▶ Take the app tour
            </Link>
            <a className="guide-btn" href="#sun">
              Read the basics ↓
            </a>
          </div>
        </header>

        <nav className="guide-chapters" aria-label="Chapters">
          {CHAPTERS.map((c) => (
            <a key={c.id} className="chapter-card" href={`#${c.id}`}>
              <span className="chapter-n tabular">{c.n}</span>
              <span className="chapter-icon" aria-hidden="true">
                {c.icon}
              </span>
              <span className="chapter-title">{c.title}</span>
              <span className="chapter-blurb">{c.blurb}</span>
            </a>
          ))}
        </nav>

        <section id="sun" className="guide-section">
          <SectionHead n="01" title="The Sun barely rises at the poles" />
          <p>
            The Moon's spin axis is tilted only about 1.5°. Near the equator the Sun climbs high overhead. At the poles it
            never gets more than about 1.5° above a flat horizon, so it circles the sky skimming the ground, and a small
            hill or crater rim can block it completely.
          </p>
          <SunPathDiagram />
          <div className="guide-facts">
            <Fact value="29.5 d" label="One lunar day" />
            <Fact value="~14 d" label="Of night at the equator" />
            <Fact value="±1.5°" label="Sun height at the poles" />
          </div>
          <p>
            Near the poles some ridges are lit for most of the year while crater floors nearby never see the Sun. Those
            shadowed floors may hold water ice, which is why missions are heading there.
          </p>
          <details>
            <summary>Planner detail</summary>
            <p>
              The Sun's elevation over a polar site varies by up to ±1.54° over the year and its azimuth sweeps a full 360°
              each lunar day. Because the Sun is near the horizon, terrain is everything: the same coordinates can be lit
              or dark depending on the local skyline. The site panel and Lunarium both trace that skyline from NASA LOLA
              elevation (see <a href="#limits">limits</a>).
            </p>
          </details>
        </section>

        <section id="earth" className="guide-section">
          <SectionHead n="02" title="Earth hangs almost still in the sky" />
          <p>
            The Moon always shows Earth the same face, so from any one spot Earth barely moves. It wobbles a few degrees
            back and forth over the month, called <strong>libration</strong>. Where you land decides whether it's up.
          </p>
          <div className="earth-cards">
            <EarthCard kind="near" title="Near side" text="Earth is always up. Direct radio contact all the time." to="/?site=orig3" cta="See Apollo 11" />
            <EarthCard
              kind="limb"
              title="Poles and edges"
              text="Earth sits on the horizon and bobs above and below it. Contact comes in windows."
              to="/lunarium?site=shackleton-rim"
              cta="Stand on Shackleton's rim"
            />
            <EarthCard kind="far" title="Far side" text="Earth is never visible. A relay satellite is needed to talk home." to="/?site=orig15" cta="See Chang'e 4" />
          </div>
        </section>

        <section id="power" className="guide-section">
          <SectionHead n="03" title="Low Sun, little power" />
          <p>
            A flat solar panel catches the most light when the Sun is overhead. When it's low, the same light spreads over
            a much larger area. With this tool's settings ({S} W/m² sunlight, {Math.round(EFF * 100)}% efficient panel):
          </p>
          <ul className="power-bars" aria-label="Flat-panel power by Sun altitude">
            {POWER_ROWS.map(({ deg, place }) => {
              const w = flatPanelW(deg);
              return (
                <li key={deg}>
                  <span className="pb-label">
                    <span className="tabular">{deg}°</span> {place}
                  </span>
                  <span className="pb-track" aria-hidden="true">
                    <span className="pb-fill" style={{ width: `${Math.max(1, (w / MAX_W) * 100)}%` }} />
                  </span>
                  <span className="pb-value tabular">{w} W/m²</span>
                </li>
              );
            })}
          </ul>
          <p>
            That's why polar landers mount panels <em>vertically</em> and why lit ridges are so valuable. Figures in this
            tool are for a flat panel: good for comparing sites, not for sizing a real array.
          </p>
        </section>

        <section id="metrics" className="guide-section">
          <SectionHead n="04" title="Reading the numbers" />
          <p>
            What each figure in the site panel and Playground means. In the app, hover or tap the{' '}
            <span className="inline-hint">i</span> next to any figure for the same text.
          </p>
          <div className="metric-tabs" role="tablist" aria-label="Metric groups" onKeyDown={onTabKey}>
            {METRIC_GROUPS.map((g) => (
              <button
                key={g.key}
                type="button"
                role="tab"
                id={`tab-${g.key}`}
                aria-selected={group === g.key}
                tabIndex={group === g.key ? 0 : -1}
                aria-controls="metric-panel"
                onClick={() => setGroup(g.key)}
              >
                {g.label}
              </button>
            ))}
          </div>
          <div className="metric-grid" id="metric-panel" role="tabpanel" aria-labelledby={`tab-${group}`} tabIndex={0}>
            {metrics.map(([term, d]) => (
              <div key={term} className="metric-card">
                <h3>{term}</h3>
                <p>{d.text}</p>
              </div>
            ))}
          </div>
          <p className="guide-note">Status (visible, hidden) is always shown with a label or icon as well as colour.</p>
        </section>

        <section id="views" className="guide-section">
          <SectionHead n="05" title="Three ways to explore" />
          <div className="view-cards">
            {VIEWS.map((v) => (
              <Link key={v.to} className="view-card" to={v.to}>
                <span className="view-name">{v.name} →</span>
                <span>{v.text}</span>
              </Link>
            ))}
          </div>
          <p className="guide-note">
            The site and time live in the address bar, so any view can be shared as a link.{' '}
            Replay the <Link to="/?tour=1">app tour</Link> or the <Link to="/lunarium?tour=1">Lunarium intro</Link>.
          </p>
        </section>

        <section id="limits" className="guide-section">
          <SectionHead n="06" title="Data and limits" />
          <ul className="limits">
            <li><strong>Sun and Earth positions</strong> come from NASA JPL Horizons, through this tool's backend.</li>
            <li><strong>Terrain, slope and roughness</strong> come from NASA LRO LOLA elevation: about 1.9 km per pixel globally and 5 m at key polar sites.</li>
            <li><strong>Visibility</strong> uses the terrain horizon from the 1.9 km grid, out to 150 km. Rims smaller than about 2 km aren't captured, and power figures still assume a flat horizon.</li>
            <li><strong>Lunarium's</strong> Sun and Earth motion is a geometric model, labelled as modelled in that view.</li>
            <li><strong>User-added sites</strong> aren't checked; treat their names and coordinates as unverified.</li>
          </ul>
        </section>
      </article>
    </div>
  );
}

function SectionHead({ n, title }) {
  return (
    <h2 className="section-head-guide">
      <span className="tabular">{n}</span>
      {title}
    </h2>
  );
}

function Fact({ value, label }) {
  return (
    <div className="fact">
      <span className="fact-value tabular">{value}</span>
      <span className="fact-label">{label}</span>
    </div>
  );
}

/** Small sky sketch: where Earth sits relative to the horizon for each kind of site. */
function EarthCard({ kind, title, text, to, cta }) {
  const earthY = { near: 26, limb: 50, far: null }[kind];
  return (
    <div className="earth-card">
      <svg viewBox="0 0 160 70" aria-hidden="true">
        <rect x="0" y="0" width="160" height="56" className="ec-sky" />
        {earthY != null && <circle cx="80" cy={earthY} r="9" className="ec-earth" />}
        {kind === 'limb' && <path d="M80 36 v-10 M80 64 v-6" className="ec-wobble" />}
        <path d="M0 56 L56 56 L70 50 L84 56 L160 56 L160 70 L0 70 Z" className="ec-ground" />
        {kind === 'far' && (
          <text x="80" y="34" textAnchor="middle" className="ec-note">
            no Earth
          </text>
        )}
      </svg>
      <h3>{title}</h3>
      <p>{text}</p>
      <Link to={to}>{cta} →</Link>
    </div>
  );
}

/** Equator vs pole Sun paths, with the polar path exaggerated so it is visible. */
function SunPathDiagram() {
  return (
    <figure className="guide-figure">
      <svg viewBox="0 0 640 200" role="img" aria-labelledby="sunpath-title sunpath-desc">
        <title id="sunpath-title">Sun path at the equator compared with the south pole</title>
        <desc id="sunpath-desc">
          At the equator the Sun arcs high overhead. At the pole it moves almost level along the horizon and a crater rim
          can hide it.
        </desc>
        <g>
          <text x="160" y="20" className="fig-title" textAnchor="middle">Equator</text>
          <path d="M30 160 A130 120 0 0 1 290 160" className="fig-path" />
          <circle cx="160" cy="42" r="9" className="fig-sun" />
          <line x1="20" y1="160" x2="300" y2="160" className="fig-ground" />
          <text x="160" y="185" className="fig-note" textAnchor="middle">Sun climbs up to 90°</text>
        </g>
        <g transform="translate(320 0)">
          <text x="160" y="20" className="fig-title" textAnchor="middle">South pole</text>
          <path d="M20 160 L95 160 L130 128 L165 160 L300 160" className="fig-ground fig-ridge" />
          <path d="M20 146 L300 146" className="fig-path" />
          <circle cx="60" cy="146" r="9" className="fig-sun" />
          <circle cx="235" cy="146" r="9" className="fig-sun" />
          <circle cx="130" cy="146" r="9" className="fig-sun hidden" />
          <text x="130" y="112" className="fig-note" textAnchor="middle">hidden by rim</text>
          <text x="160" y="185" className="fig-note" textAnchor="middle">Sun stays within ~1.5° (exaggerated)</text>
        </g>
      </svg>
    </figure>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 40 40">
      <path d="M4 30 H36" className="ic-line" />
      <circle cx="20" cy="27" r="6" className="ic-sun" />
      <path d="M20 14 v4 M10 19 l3 3 M30 19 l-3 3" className="ic-ray" />
    </svg>
  );
}
function EarthIcon() {
  return (
    <svg viewBox="0 0 40 40">
      <circle cx="20" cy="17" r="8" className="ic-earth" />
      <path d="M4 30 L14 30 L18 26 L22 30 L36 30" className="ic-line" />
    </svg>
  );
}
function PowerIcon() {
  return (
    <svg viewBox="0 0 40 40">
      <path d="M8 30 L32 30 L28 20 L12 20 Z" className="ic-panel" />
      <path d="M20 20 V30 M10 25 H30" className="ic-line" />
      <path d="M21 6 L16 15 H22 L19 22" className="ic-ray" />
    </svg>
  );
}
function GaugeIcon() {
  return (
    <svg viewBox="0 0 40 40">
      <path d="M8 28 A12 12 0 0 1 32 28" className="ic-line" />
      <path d="M20 28 L27 18" className="ic-ray" />
      <circle cx="20" cy="28" r="2" className="ic-dot" />
    </svg>
  );
}
