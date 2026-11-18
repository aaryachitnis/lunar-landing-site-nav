import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import './Tour.css';

const PAD = 6;
const GAP = 14;
const EDGE = 12;
const NARROW = '(max-width: 760px)';

function tourDone(key) {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return true; // storage blocked: don't nag on every visit
  }
}

function markDone(key) {
  try {
    localStorage.setItem(key, '1');
  } catch {
    /* private mode */
  }
}

/** Whether a page's tour is showing: forced by ?tour=1 (then stripped from the URL), else once per browser when `auto`. */
export function useTour(storageKey, auto = true) {
  const [params, setParams] = useSearchParams();
  const [touring, setTouring] = useState(() => params.get('tour') === '1' || (auto && !tourDone(storageKey)));
  useEffect(() => {
    if (!params.has('tour')) return;
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('tour');
        return next;
      },
      { replace: true },
    );
  }, [params, setParams]);
  return [touring, setTouring];
}

// Several elements can share a name (nav tabs vs ☰ button); use whichever is actually on screen.
// Faded-out elements count as absent (Lunarium hides off-view cards with opacity, not display).
function findTarget(name) {
  for (const el of document.querySelectorAll(`[data-tour="${name}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && getComputedStyle(el).opacity !== '0') return el;
  }
  return null;
}

const sameRect = (a, b) => a && b && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;

function placeCard(rect, card, placement) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clampX = (x) => Math.min(Math.max(EDGE, x), vw - card.width - EDGE);
  const clampY = (y) => Math.min(Math.max(EDGE, y), vh - card.height - EDGE);

  if (window.matchMedia(NARROW).matches) {
    // Phones: full-width sheet on whichever end of the screen the target isn't.
    const atTop = rect && rect.top + rect.height / 2 > vh / 2;
    return atTop ? { top: EDGE, left: EDGE, right: EDGE } : { bottom: EDGE, left: EDGE, right: EDGE };
  }
  if (!rect) {
    const top = placement === 'bottom' ? vh - card.height - 32 : (vh - card.height) / 2;
    return { top, left: (vw - card.width) / 2 };
  }
  const cy = clampY(rect.top + rect.height / 2 - card.height / 2);
  const cx = clampX(rect.left + rect.width / 2 - card.width / 2);
  if (rect.right + GAP + card.width + EDGE <= vw) return { top: cy, left: rect.right + GAP };
  if (rect.left - GAP - card.width >= EDGE) return { top: cy, left: rect.left - GAP - card.width };
  if (rect.bottom + GAP + card.height + EDGE <= vh) return { top: rect.bottom + GAP, left: cx };
  if (rect.top - GAP - card.height >= EDGE) return { top: rect.top - GAP - card.height, left: cx };
  return { bottom: EDGE + 20, left: (vw - card.width) / 2 };
}

/** Step-through overlay that spotlights [data-tour] elements. `onStep` lets the page prepare (e.g. open a site). */
export default function Tour({ steps, storageKey, context, onStep, onClose }) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const [pos, setPos] = useState(null);
  const cardRef = useRef(null);
  const step = steps[index];
  const last = index === steps.length - 1;

  const finish = () => {
    markDone(storageKey);
    onClose();
  };
  const go = (i) => setIndex(Math.min(Math.max(0, i), steps.length - 1));

  useEffect(() => {
    onStep?.(step);
  }, [step, onStep]);

  // Follow the target every frame: it may mount late, animate in or scroll.
  useEffect(() => {
    setRect(null);
    if (!step.target) return;
    let frame;
    let scrolled = false;
    const tick = () => {
      const el = findTarget(step.target);
      if (el && !scrolled) {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        el.scrollIntoView({ block: window.matchMedia(NARROW).matches ? 'start' : 'nearest', behavior: reduce ? 'auto' : 'smooth' });
        scrolled = true;
      }
      const r = el?.getBoundingClientRect();
      const next = r && { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
      setRect((prev) => (sameRect(prev, next) ? prev : (next ?? null)));
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [step]);

  useLayoutEffect(() => {
    const card = cardRef.current?.getBoundingClientRect();
    if (!card) return;
    const view = rect && {
      ...rect,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
    };
    setPos(placeCard(view, card, step.placement));
  }, [rect, step]);

  useEffect(() => {
    cardRef.current?.focus({ preventScroll: true });
  }, [index]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') finish();
      else if (e.key === 'ArrowRight') go(index + 1);
      else if (e.key === 'ArrowLeft') go(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Portal: <main> is its own stacking context, so the nav would otherwise sit above the dimming.
  return createPortal(
    <div className="tour">
      {rect ? <div className="tour-spot" style={rect} /> : <div className={`tour-scrim${step.placement ? ' light' : ''}`} />}
      <div
        ref={cardRef}
        className="tour-card"
        role="dialog"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        tabIndex={-1}
        style={pos ?? { visibility: 'hidden' }}
      >
        <div className="tour-meta">
          <span className="hud-label tabular">
            {String(index + 1).padStart(2, '0')} / {String(steps.length).padStart(2, '0')}
          </span>
          {!last && (
            <button type="button" className="tour-skip" onClick={finish}>
              Skip tour
            </button>
          )}
        </div>
        <h2 id="tour-title">{step.title}</h2>
        <p id="tour-body">{typeof step.body === 'function' ? step.body(context ?? {}) : step.body}</p>
        <div className="tour-progress" aria-hidden="true">
          {steps.map((s, i) => (
            <span key={s.title} className={i === index ? 'on' : i < index ? 'done' : undefined} />
          ))}
        </div>
        <div className="tour-actions">
          {index > 0 && !last && (
            <button type="button" className="tour-btn" onClick={() => go(index - 1)}>
              Back
            </button>
          )}
          {step.guideLink && (
            <Link className="tour-btn" to="/guide" onClick={finish}>
              Open the Guide
            </Link>
          )}
          <button type="button" className="tour-btn primary" onClick={last ? finish : () => go(index + 1)}>
            {step.next ?? (last ? 'Done' : 'Next')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
