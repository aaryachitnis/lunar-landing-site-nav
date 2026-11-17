import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ENGINE_SETTINGS } from '../../data/api.js';
import './GuidePage.css';

const { solarIntensityWm2: S, panelEfficiency: EFF } = ENGINE_SETTINGS;
const flatPanelW = (elevDeg) => Math.round(S * EFF * Math.sin((elevDeg * Math.PI) / 180));

const METRICS = [
  ['Sun altitude', 'How high the Sun is above a flat horizon, in degrees. Negative means below it.', 'Sets solar power and how long shadows are. At the poles it stays within about ±1.5°.'],
  ['Sun visible', 'Whether the Sun is above the real skyline (hills and crater rims) right now.', 'Judged against the terrain horizon traced from NASA LOLA elevation. The flat-horizon answer is shown underneath for comparison.'],
  ['Power now', 'Electrical power a 1 m² flat, horizontal solar panel would make at the selected time.', `Solar intensity ${S} W/m² × ${Math.round(EFF * 100)}% efficiency × sin(Sun altitude).`],
  ['Energy', 'Total energy that panel would collect over the window shown.', 'Sum of the power curve. Compare sites over the same window.'],
  ['Mean power / Mean, sunlit days', 'Average power over every 24 h, and over only the days with some sunlight.', 'The gap between them shows how much of the window is spent in darkness.'],
  ['Sunlit', 'Share of the window where the Sun is above the skyline.', 'Higher means less battery and heater mass to survive the night. Compare with the flat value to see what the terrain costs.'],
  ['Longest darkness', 'Longest unbroken stretch without sunlight in the window.', 'Drives battery sizing: the lander must survive this on stored energy.'],
  ['Earth altitude / Earth visible', 'Where Earth sits in the sky and whether it is above the skyline.', 'Earth must be visible for direct-to-Earth radio. Otherwise a relay satellite is needed.'],
  ['Earth in view / Longest comms gap', 'Share of the window Earth is above the skyline, and the longest stretch it is hidden.', 'The gap is how long the lander must operate without talking to Earth. "Lost to terrain" is time Earth is up but behind a hill.'],
  ['Terrain horizon', 'How high the skyline rises in the direction of the Sun or Earth.', 'A body is visible only when it is higher than this. From a mountain top it can be below 0°, so you see past the flat horizon.'],
  ['Mean slope', 'Average steepness of the ground around the site.', 'Landers typically need gentle slopes (a few degrees) to touch down safely.'],
  ['Surface roughness', 'How bumpy the ground is: RMS height difference from a best-fit plane.', 'Measured at km scale from LOLA, so it misses boulders. Treat it as a regional indicator.'],
];

export default function GuidePage() {
  const { hash } = useLocation();
  // Router navigation doesn't scroll to #anchors on its own.
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);

  return (
    <div className="guide-page">
      <article className="guide">
        <header className="guide-hero">
          <p className="hud-label">Guide</p>
          <h1>Why landing on the Moon is a timing problem</h1>
          <p className="guide-lead">
            A lander runs on sunlight and talks to Earth by radio. On the Moon, both the Sun and Earth move slowly and
            sometimes hide behind the horizon. Picking a landing site means picking a place <em>and</em> a date where both
            work for long enough.
          </p>
          <nav className="guide-toc" aria-label="On this page">
            <a href="#sun">The Sun</a>
            <a href="#earth">Earth</a>
            <a href="#power">Power</a>
            <a href="#metrics">Reading the numbers</a>
            <a href="#views">Using the views</a>
            <a href="#limits">Data and limits</a>
          </nav>
        </header>

        <section id="sun">
          <h2>1 · The Sun barely rises at the poles</h2>
          <p>
            The Moon's spin axis is tilted only about 1.5° from upright relative to the Sun. Near the equator the Sun
            climbs high overhead. At the poles it never climbs more than about 1.5° above a flat horizon, so it circles
            the sky skimming the ground. A small hill or crater rim can block it completely.
          </p>
          <SunPathDiagram />
          <p>
            One lunar day lasts about 29.5 Earth days. Near the equator that means roughly two weeks of sunlight
            followed by two weeks of night. Near the poles some ridges are lit for most of the year while crater floors
            nearby never see the Sun at all. Those shadowed floors are where water ice may survive, which is why
            missions are heading there.
          </p>
          <details>
            <summary>Planner detail</summary>
            <p>
              The Sun's elevation over a polar site varies by up to ±1.54° over the year (the lunar "seasons") and its
              azimuth sweeps a full 360° each lunar day. Because the Sun is near the horizon, terrain is everything: the
              same coordinates can be lit or dark depending on the local horizon profile. The site panel and Lunarium both
              trace that horizon from NASA LOLA elevation (see <a href="#limits">limits</a>).
            </p>
          </details>
        </section>

        <section id="earth">
          <h2>2 · Earth hangs almost still in the sky</h2>
          <p>
            The Moon always keeps the same face towards Earth, so from any one spot Earth barely moves. It wobbles a few
            degrees back and forth over the month (called <strong>libration</strong>).
          </p>
          <div className="guide-cards">
            <div className="guide-card">
              <h3>Near side</h3>
              <p>Earth is always up. Direct radio contact is available all the time.</p>
              <Link to="/?site=orig3">See Apollo 11 →</Link>
            </div>
            <div className="guide-card">
              <h3>Poles and edges</h3>
              <p>Earth sits right on the horizon and bobs above and below it with libration. Contact comes in windows.</p>
              <Link to="/lunarium?site=shackleton-rim">Stand on Shackleton's rim →</Link>
            </div>
            <div className="guide-card">
              <h3>Far side</h3>
              <p>Earth is never visible. Missions such as Chang'e 4 need a relay satellite to talk home.</p>
              <Link to="/?site=orig15">See Chang'e 4 →</Link>
            </div>
          </div>
        </section>

        <section id="power">
          <h2>3 · Low Sun, little power</h2>
          <p>
            A flat solar panel catches the most light when the Sun is overhead. When the Sun is low, the same light is
            spread over a much larger area. With the settings this tool uses ({S} W/m² sunlight, {Math.round(EFF * 100)}%
            efficient panel):
          </p>
          <table className="guide-table">
            <thead>
              <tr>
                <th scope="col">Sun altitude</th>
                <th scope="col">Flat-panel power</th>
                <th scope="col">Typical place</th>
              </tr>
            </thead>
            <tbody className="tabular">
              <tr><td>90°</td><td>{flatPanelW(90)} W/m²</td><td>Equator, noon</td></tr>
              <tr><td>45°</td><td>{flatPanelW(45)} W/m²</td><td>Mid-latitudes</td></tr>
              <tr><td>10°</td><td>{flatPanelW(10)} W/m²</td><td>High latitudes</td></tr>
              <tr><td>1.5°</td><td>{flatPanelW(1.5)} W/m²</td><td>South pole, best case</td></tr>
            </tbody>
          </table>
          <p>
            That is why polar landers mount their panels <em>vertically</em> and why lit ridges are so valuable. The figures
            in this tool are for a flat, horizontal panel. They are best for comparing sites with each other, not for
            sizing a real array.
          </p>
        </section>

        <section id="metrics">
          <h2>4 · Reading the numbers</h2>
          <p>What each figure in the site panel and Playground means, and why a mission planner cares.</p>
          <dl className="guide-glossary">
            {METRICS.map(([term, plain, detail]) => (
              <div key={term}>
                <dt>{term}</dt>
                <dd>
                  {plain}
                  <span className="guide-why">{detail}</span>
                </dd>
              </div>
            ))}
          </dl>
          <p className="guide-note">
            Status (visible, partly blocked, hidden) is always shown with a label or icon as well as colour.
          </p>
        </section>

        <section id="views">
          <h2>5 · Using the views</h2>
          <ol className="guide-steps">
            <li>
              <strong><Link to="/">Landing Sites</Link></strong>: pick a site on the globe or from the list, then a date.
              The panel shows terrain, solar power for the next month, and Sun and Earth visibility.
            </li>
            <li>
              <strong><Link to="/lunarium">Lunarium</Link></strong>: stand at the site and watch the Sun and Earth move over
              the real horizon. Press play, or jump to the next sunrise, sunset, Earthrise or Earthset.
            </li>
            <li>
              <strong><Link to="/playground">Playground</Link></strong>: type any coordinates to get the same analysis for a
              place that isn't in the list, and save it if it's worth keeping. Saved sites are marked{' '}
              <em>user-added</em>.
            </li>
          </ol>
          <p className="guide-note">The site and time are in the address bar, so any view can be shared as a link.</p>
        </section>

        <section id="limits">
          <h2>6 · Data and limits</h2>
          <ul>
            <li>Sun and Earth positions come from NASA JPL Horizons, through this tool's backend.</li>
            <li>Terrain, slope and roughness come from NASA LRO LOLA elevation: about 1.9 km per pixel globally and 5 m at key polar sites.</li>
            <li>
              Live Sun and Earth visibility use the terrain horizon from the 1.9 km LOLA grid, out to 150 km. Rims smaller
              than about 2 km are not captured, and solar power figures still assume a flat horizon.
            </li>
            <li>Lunarium's Sun and Earth motion is a geometric model, labelled as modelled in that view.</li>
            <li>User-added sites are not checked; treat their names and coordinates as unverified.</li>
          </ul>
        </section>
      </article>
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
