// SPIKE: first-person "stand at the landing site" view. Throwaway prototype — see
// docs/superpowers/specs/2026-11-14-horizon-view-design.md for the intended design.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HorizonScene, deviceQuaternion } from '../../scene/HorizonScene.js';
import { getHorizonTerrain, getSite } from '../../data/api.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useSites } from '../../hooks/useSites.js';
import { useSelectedSite } from '../../hooks/useSelectedSite.js';
import { useSiteMetrics } from '../../hooks/useSiteMetrics.js';
import { buildTimeline, stateAt, visibilityRuns, nextTransition, fmtHours, WINDOW } from './horizonModel.js';
import TimeBar from './TimeBar.jsx';
import './HorizonPage.css';

const DEFAULT_SITE = 'shackleton-rim';
const SPEEDS = [
  { label: '1×', v: 1 },
  { label: '1 h/s', v: 3600 },
  { label: '6 h/s', v: 21600 },
];
const COMPASS = Array.from({ length: 24 }, (_, k) => {
  const az = k * 15;
  return { az, label: { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' }[az] ?? String(az) };
});

const isMobile = () => window.matchMedia('(pointer: coarse)').matches;
// Same breakpoint as the compact nav (layouts/AppLayout.css) and the compact HUD (HorizonPage.css).
const compactMQ = window.matchMedia('(max-width: 760px), (max-height: 500px)');
const isCompact = () => compactMQ.matches;

export default function HorizonPage() {
  const { siteId: urlSite, time: urlTime, selectSite } = useSelectedSite();
  const siteId = urlSite ?? DEFAULT_SITE;
  const defaultTime = useMemo(() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    return d.toISOString();
  }, []);
  const time = urlTime ?? defaultTime;

  const { data: sites } = useSites();
  const { data: site } = useAsync(() => getSite(siteId), [siteId]);
  const metrics = useSiteMetrics(site, time);
  const terrain = useAsync(() => (site ? getHorizonTerrain(site) : null), [site?.id]);

  const timeline = useMemo(
    () => (metrics.data && terrain.data ? buildTimeline(metrics.data, terrain.data.horizon) : null),
    [metrics.data, terrain.data],
  );

  const hostRef = useRef(null);
  const sceneRef = useRef(null);
  const tRef = useRef(new Date(time).getTime());
  const playRef = useRef({ playing: false, speed: SPEEDS[1].v });
  const [now, setNow] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(SPEEDS[1].v);
  const [follow, setFollowState] = useState(null);
  const [motion, setMotion] = useState('off'); // off | waiting | on
  const [toast, setToast] = useState(null);
  const showStats = useMemo(() => new URLSearchParams(location.search).has('stats'), []);
  const [stats, setStats] = useState(null);

  // HUD refs updated every frame without React re-renders.
  const compassRef = useRef(null);
  const sunCardRef = useRef(null);
  const earthCardRef = useRef(null);
  const sunArrowRef = useRef(null);
  const earthArrowRef = useRef(null);
  const headingRef = useRef(null);

  useEffect(() => {
    playRef.current = { playing, speed };
  }, [playing, speed]);

  // Scene lifecycle
  useEffect(() => {
    const scene = new HorizonScene(hostRef.current, { mobile: isMobile() });
    sceneRef.current = scene;
    const qp = new URLSearchParams(location.search); // debug: ?yaw=…&pitch=… initial view
    if (qp.has('yaw')) scene.yaw = Number(qp.get('yaw'));
    if (qp.has('pitch')) scene.pitch = Number(qp.get('pitch'));
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (terrain.data) sceneRef.current?.setTerrain(terrain.data);
  }, [terrain.data]);

  // Reset clock when the selected landing time / site changes.
  useEffect(() => {
    tRef.current = new Date(time).getTime();
    setPlaying(false);
  }, [time, siteId]);

  // Per-frame: advance time, move bodies, place HUD.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !timeline) return;
    let lastUi = 0;
    scene.onBeforeFrame = (dt) => {
      const p = playRef.current;
      if (p.playing) {
        tRef.current += dt * p.speed * 1000;
        if (tRef.current >= timeline.end) {
          tRef.current = timeline.end;
          setPlaying(false);
        }
      }
      const st = stateAt(timeline, tRef.current);
      scene.setBodies(st);
      const nowMs = performance.now();
      if (nowMs - lastUi > 100) {
        lastUi = nowMs;
        setNow(st);
        if (showStats) {
          setStats({ ...scene.stats });
          if (nowMs - (window.__hzLog ?? 0) > 2000) {
            window.__hzLog = nowMs;
            console.log('HZSTATS', JSON.stringify(scene.stats));
          }
        }
      }
    };
    scene.onFrame = (f) => placeHud(f, scene);
    return () => {
      scene.onBeforeFrame = null;
      scene.onFrame = null;
    };
  }, [timeline]);

  function placeHud(f, scene) {
    const w = hostRef.current.clientWidth;
    const h = hostRef.current.clientHeight;
    const hfov = (2 * Math.atan(Math.tan((f.fov * Math.PI) / 360) * (w / h)) * 180) / Math.PI;
    const pxPerDeg = w / hfov;
    const compact = isCompact();
    const gap = compact ? 32 : 26; // card offset from the body's centre (bodies are drawn larger on phones)
    const topY = compact ? (h > w ? 100 : 50) : 56; // portrait: compass sits below the top chips
    const bar = pageRef.current?.querySelector('.hz-timebar');
    const bottomY = bar ? bar.offsetTop - 8 : h - 120;
    if (compassRef.current) {
      compassRef.current.style.setProperty('--px-per-deg', `${pxPerDeg}px`);
      compassRef.current.style.setProperty('--az', f.az);
    }
    if (headingRef.current) headingRef.current.textContent = `${Math.round(f.az) % 360}° · ${f.el >= 0 ? '+' : ''}${f.el.toFixed(0)}°`;
    for (const [p, card, arrow] of [
      [f.sun, sunCardRef.current, sunArrowRef.current],
      [f.earth, earthCardRef.current, earthArrowRef.current],
    ]) {
      if (!card || !arrow) continue;
      if (p.inView) {
        const right = p.x + gap + card.offsetWidth < w - 8;
        const x = Math.max(8, right ? p.x + gap : p.x - gap - card.offsetWidth);
        const y = Math.max(topY, Math.min(bottomY - card.offsetHeight, p.y - card.offsetHeight / 2));
        card.style.transform = `translate(${x}px, ${y}px)`;
        card.style.opacity = 1;
        card.style.pointerEvents = 'auto';
        arrow.style.opacity = 0;
        arrow.style.pointerEvents = 'none';
      } else {
        card.style.opacity = 0;
        card.style.pointerEvents = 'none';
        // Edge arrow in the body's screen-space direction.
        const ang = Math.atan2(-p.camY, p.camX);
        const cx = w / 2;
        const cy = h / 2;
        const rx = w / 2 - (compact ? 60 : 70);
        const ry = h / 2 - (compact ? 70 : 90);
        const t = Math.min(Math.abs(rx / Math.cos(ang)), Math.abs(ry / Math.sin(ang)));
        arrow.style.transform = `translate(${cx + Math.cos(ang) * t - 50}px, ${cy + Math.sin(ang) * t - 16}px)`;
        arrow.querySelector('.arrow-glyph').style.transform = `rotate(${ang}rad)`;
        arrow.style.opacity = 1;
        arrow.style.pointerEvents = 'auto';
      }
    }
    if (f.follow !== followRef.current) {
      followRef.current = f.follow;
      setFollowState(f.follow);
    }
  }
  const followRef = useRef(null);

  const setFollow = useCallback((body) => {
    const next = followRef.current === body ? null : body;
    sceneRef.current?.setFollow(next);
  }, []);

  // Look controls: drag / pinch / wheel
  useEffect(() => {
    const el = hostRef.current;
    const pts = new Map();
    let pinch = null;
    const down = (e) => {
      el.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    };
    const move = (e) => {
      const prev = pts.get(e.pointerId);
      if (!prev) return;
      const cur = { x: e.clientX, y: e.clientY };
      pts.set(e.pointerId, cur);
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) sceneRef.current?.zoom(pinch / d);
        pinch = d;
      } else sceneRef.current?.drag(cur.x - prev.x, cur.y - prev.y);
    };
    const up = (e) => {
      pts.delete(e.pointerId);
      pinch = null;
    };
    const wheel = (e) => {
      e.preventDefault();
      sceneRef.current?.zoom(Math.exp(e.deltaY * 0.001));
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
    };
  }, []);

  // Phone motion sensors
  const motionCleanup = useRef(null);
  const toggleMotion = useCallback(async () => {
    const scene = sceneRef.current;
    if (motionCleanup.current) {
      motionCleanup.current();
      motionCleanup.current = null;
      scene?.disableMotion();
      setMotion('off');
      return;
    }
    if (!window.isSecureContext) {
      setToast('Motion needs HTTPS. On the laptop run "npm run dev:phone" and open the https:// Network URL.');
      return;
    }
    if (typeof DeviceOrientationEvent === 'undefined') {
      setToast('This browser has no motion sensors. Drag to look around.');
      return;
    }
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        if ((await DeviceOrientationEvent.requestPermission()) !== 'granted') return setToast('Motion permission denied.');
      } catch {
        return setToast('Motion permission denied.');
      }
    }
    setMotion('waiting');
    let first = true;
    const onOrient = (e) => {
      if (e.alpha == null) return;
      const screenDeg = screen.orientation?.angle ?? window.orientation ?? 0;
      const q = deviceQuaternion(e.alpha, e.beta, e.gamma, screenDeg);
      if (first) {
        first = false;
        scene.enableMotion(q);
        setMotion('on');
      } else scene.setDeviceQuaternion(q);
    };
    window.addEventListener('deviceorientation', onOrient);
    const timer = setTimeout(() => {
      if (first) {
        setToast('No motion data from this device. Drag to look around.');
        motionCleanup.current?.();
        motionCleanup.current = null;
        setMotion('off');
      }
    }, 2000);
    motionCleanup.current = () => {
      clearTimeout(timer);
      window.removeEventListener('deviceorientation', onOrient);
    };
  }, []);
  useEffect(() => () => motionCleanup.current?.(), []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(id);
  }, [toast]);

  const pageRef = useRef(null);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else pageRef.current?.requestFullscreen?.().then(() => screen.orientation?.lock?.('landscape').catch(() => {}));
  };

  const jumpTo = (ms) => {
    if (ms == null || !timeline) return;
    tRef.current = Math.max(timeline.start, Math.min(timeline.end, ms));
  };

  const sunRuns = useMemo(() => (timeline ? visibilityRuns(timeline, 'sunFrac') : []), [timeline]);
  const earthRuns = useMemo(() => (timeline ? visibilityRuns(timeline, 'earthFrac') : []), [timeline]);

  const loadingMsg = !site
    ? 'Loading site…'
    : terrain.loading
      ? 'Building terrain…'
      : metrics.loading && !metrics.data
        ? 'Computing Sun & Earth…'
        : null;

  return (
    <div className="horizon-page" ref={pageRef}>
      <div className="horizon-canvas" ref={hostRef} />

      <div className="hz-top-left">
        <select className="hz-chip" value={siteId} onChange={(e) => selectSite(e.target.value)} aria-label="Landing site">
          {!sites?.some((s) => s.id === siteId) && <option value={siteId}>{site?.name ?? siteId}</option>}
          {sites?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {terrain.data && (
          <span className={`hz-chip hz-source ${terrain.data.hasFineData ? 'fine' : ''}`} title={terrain.data.source}>
            {terrain.data.hasFineData ? '5 m LOLA terrain' : '1.9 km terrain'}
          </span>
        )}
      </div>

      <div className="hz-compass" ref={compassRef} aria-hidden="true">
        <div className="hz-compass-strip">
          {[-360, 0, 360].map((off) =>
            COMPASS.map((c) => (
              <span key={`${off}-${c.az}`} className={`tick ${c.label.length <= 2 ? 'cardinal' : ''}`} style={{ '--tick-az': c.az + off }}>
                {c.label}
              </span>
            )),
          )}
          {now &&
            [-360, 0, 360].map((off) => (
              <span key={`b${off}`}>
                <span className="tick body sun" style={{ '--tick-az': now.sunAz + off }}>
                  ☀
                </span>
                <span className="tick body earth" style={{ '--tick-az': now.earthAz + off }}>
                  ●
                </span>
              </span>
            ))}
        </div>
        <div className="hz-compass-center" />
        <div className="hz-heading" ref={headingRef} />
      </div>

      <div className="hz-top-right">
        <button className={`hz-chip ${motion === 'on' ? 'active' : ''}`} onClick={toggleMotion}>
          📱<span className="hz-long"> Motion:</span> {motion === 'waiting' ? '…' : motion}
        </button>
        {showStats && stats && (
          <span className="hz-chip tabular" title="fps while rendering · pixel ratio · shadow-visibility compute time">
            {stats.rendering ? `${stats.fps} fps` : 'idle'} · {stats.pixelRatio}× · vis {stats.visMs} ms
          </span>
        )}
        <button className="hz-chip" onClick={toggleFullscreen} aria-label="Fullscreen">
          ⛶
        </button>
      </div>

      {now && (
        <>
          <div className="hz-card" ref={sunCardRef}>
            <div className="hz-card-head">
              <h5>☀ Sun</h5>
              <Status frac={now.sunFrac} />
            </div>
            <div className="tabular">
              {now.sunFrac > 0.5 ? 'Sets' : 'Rises'} in <b>{fmtHours(now.hoursToSun) ?? '> 27 d'}</b> · ~{Math.round(now.powerW)} W
            </div>
            <div className="tabular hz-detail">
              {Math.abs(now.sunAbove).toFixed(1)}° {now.sunAbove >= 0 ? 'above' : 'below'} ridge · {Math.round(now.sunFrac * 100)}% of disk
            </div>
            <div className="muted tabular hz-detail">
              az {now.sunAz.toFixed(1)}° · el {now.sunEl.toFixed(2)}°
            </div>
            <button
              className={`hz-follow ${follow === 'sun' ? 'on' : ''}`}
              onClick={() => setFollow('sun')}
              aria-pressed={follow === 'sun'}
            >
              {follow === 'sun' ? '◉ Following' : '○ Follow'}
            </button>
          </div>
          <div className="hz-card" ref={earthCardRef}>
            <div className="hz-card-head">
              <h5>🌍 Earth</h5>
              <Status frac={now.earthFrac} />
            </div>
            <div className="tabular">
              {now.earthFrac > 0.5 ? 'Sets' : 'Rises'} in <b>{fmtHours(now.hoursToEarth) ?? '> 27 d'}</b>
            </div>
            <div className="tabular hz-detail">
              {Math.abs(now.earthAbove).toFixed(1)}° {now.earthAbove >= 0 ? 'above' : 'below'} rim
            </div>
            <div className="muted tabular hz-detail">
              az {now.earthAz.toFixed(1)}° · el {now.earthEl.toFixed(2)}°
            </div>
            <button
              className={`hz-follow ${follow === 'earth' ? 'on' : ''}`}
              onClick={() => setFollow('earth')}
              aria-pressed={follow === 'earth'}
            >
              {follow === 'earth' ? '◉ Following' : '○ Follow'}
            </button>
          </div>
          <button className="hz-arrow sun" ref={sunArrowRef} onClick={() => setFollow('sun')} aria-label="Turn to the Sun">
            <span className="arrow-glyph">➜</span> ☀ {Math.round(now.sunAz)}°
          </button>
          <button className="hz-arrow earth" ref={earthArrowRef} onClick={() => setFollow('earth')} aria-label="Turn to Earth">
            <span className="arrow-glyph">➜</span> 🌍 {Math.round(now.earthAz)}°
          </button>
        </>
      )}

      {timeline && now && (
        <TimeBar
          timeline={timeline}
          now={now.t}
          sunRuns={sunRuns}
          earthRuns={earthRuns}
          playing={playing}
          onPlay={() => {
            if (!playing && tRef.current >= timeline.end) tRef.current = timeline.start;
            setPlaying(!playing);
          }}
          speeds={SPEEDS}
          speed={speed}
          onSpeed={setSpeed}
          onScrub={jumpTo}
          onLanding={() => jumpTo(timeline.t0)}
          onNextSun={() => jumpTo(nextTransition(timeline, tRef.current + 60e3, 'sunFrac'))}
          onNextEarth={() => jumpTo(nextTransition(timeline, tRef.current + 60e3, 'earthFrac'))}
          windowLabel={`−${WINDOW.beforeH} h … +${WINDOW.afterH / 24} d`}
        />
      )}

      {loadingMsg && <div className="hz-loading">{loadingMsg}</div>}
      {(terrain.error || metrics.error) && <div className="hz-loading error">{String((terrain.error || metrics.error).message)}</div>}
      {toast && <div className="hz-toast">{toast}</div>}
    </div>
  );
}

function Status({ frac }) {
  if (frac >= 0.98) return <div className="hz-status ok">Visible</div>;
  if (frac > 0.02)
    return (
      <div className="hz-status warn">
        Partly blocked<span className="hz-long"> by terrain</span>
      </div>
    );
  return (
    <div className="hz-status bad">
      Hidden<span className="hz-long"> behind terrain</span>
    </div>
  );
}
