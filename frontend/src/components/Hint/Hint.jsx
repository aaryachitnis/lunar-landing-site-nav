import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { METRIC_DOCS } from '../../data/metricDocs.js';
import './Hint.css';

const WIDTH = 260;
const GAP = 6;

/** "i" button that explains a metric; hover/focus on desktop, tap on touch. */
export default function Hint({ metric, text = METRIC_DOCS[metric]?.text }) {
  const id = useId();
  const btnRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);

  // Fixed positioning so the bubble isn't clipped by the scrolling site panel.
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const left = Math.min(Math.max(8, r.left + r.width / 2 - WIDTH / 2), window.innerWidth - WIDTH - 8);
    const below = r.bottom + GAP + 120 < window.innerHeight;
    setPos(below ? { left, top: r.bottom + GAP } : { left, bottom: window.innerHeight - r.top + GAP });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e) => e.key === 'Escape' && close();
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!text) return null;
  return (
    <span className="hint" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        ref={btnRef}
        type="button"
        className="hint-btn"
        aria-label={metric ? `About ${metric}` : 'More info'}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        // Opens only: on touch the tap also focuses, so toggling would shut it straight away. Blur closes.
        onClick={() => setOpen(true)}
        onFocus={(e) => e.target.matches(':focus-visible') && setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        i
      </button>
      {/* Portal: inside <main> the bubble would sit under the tour's dimming layer. */}
      {open &&
        pos &&
        createPortal(
          <span id={id} role="tooltip" className="hint-body" style={{ ...pos, width: WIDTH }}>
            {text}
          </span>,
          document.body,
        )}
    </span>
  );
}
