import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import './MissionAlert.css';

const LEVELS = {
  advisory: { label: 'Advisory', icon: 'i' },
  caution: { label: 'Caution', icon: '!' },
  warning: { label: 'Warning', icon: '×' },
};

const AlertContext = createContext(() => {});

/** alert({ level: 'advisory'|'caution'|'warning', source, title, message, items?, detail?, key?, onClose? }) */
export const useAlert = () => useContext(AlertContext);

export const errorText = (e) => String(e?.message ?? e);

/** Raises an alert whenever `error` changes to a new non-null value. */
export function useErrorAlert(error, build) {
  const alert = useAlert();
  const buildRef = useRef(build);
  buildRef.current = build;
  useEffect(() => {
    if (error) alert(buildRef.current(error));
  }, [error, alert]);
}

/** Inline twin of the dialog for a single form field; pass the input's aria-describedby id. */
export function FieldAlert({ id, children, level = 'caution' }) {
  if (!children) return null;
  return (
    <span className={`field-alert level-${level}`} id={id}>
      <span className="field-alert-tag" aria-hidden="true">
        <span className="ma-icon">{LEVELS[level].icon}</span>
        {LEVELS[level].label}
      </span>
      <span className="field-alert-text">{children}</span>
    </span>
  );
}

const utcClock = () => new Date().toISOString().slice(11, 19);

export function AlertProvider({ children }) {
  const [queue, setQueue] = useState([]);
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const push = useCallback((a) => {
    const next = { level: 'caution', ...a, key: a.key ?? `${a.source}|${a.title}|${a.message}`, at: utcClock() };
    // Same key already queued = same problem; StrictMode and repeated clicks would otherwise stack it.
    setQueue((q) => (q.some((x) => x.key === next.key) ? q : [...q, next]));
  }, []);
  const dismiss = useCallback(() => {
    const closing = queueRef.current[0];
    setQueue((q) => q.slice(1));
    // Deferred until the dialog has restored focus, so onClose can move it (e.g. to a bad field).
    if (closing?.onClose) setTimeout(closing.onClose, 0);
  }, []);

  return (
    <AlertContext.Provider value={push}>
      {children}
      <AlertDialog alert={queue[0]} remaining={queue.length - 1} onClose={dismiss} />
    </AlertContext.Provider>
  );
}

function AlertDialog({ alert, remaining, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    // showModal() puts it in the top layer, so it also shows over Lunarium's fullscreen view.
    if (alert && !d.open) d.showModal();
    else if (!alert && d.open) d.close();
  }, [alert]);

  const lvl = LEVELS[alert?.level] ?? LEVELS.caution;
  return (
    <dialog
      ref={ref}
      className={`mission-alert level-${alert?.level ?? 'caution'}`}
      role="alertdialog"
      aria-labelledby="mission-alert-title"
      aria-describedby="mission-alert-msg"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // The dialog element itself only receives clicks on its backdrop (the panel fills it).
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {alert && (
        <div className="ma-panel" key={alert.key}>
          <div className="ma-band" aria-hidden="true" />
          <header className="ma-head">
            <span className="ma-icon" aria-hidden="true">
              {lvl.icon}
            </span>
            <span className="ma-level">{lvl.label}</span>
            {alert.source && <span className="ma-source">{alert.source}</span>}
            <span className="ma-time tabular">{alert.at} UTC</span>
          </header>
          <div className="ma-body">
            <h2 id="mission-alert-title">{alert.title}</h2>
            <p id="mission-alert-msg">{alert.message}</p>
            {alert.items?.length > 0 && (
              <ul className="ma-items">
                {alert.items.map((it) => (
                  <li key={it.label ?? it}>
                    {it.label ? (
                      <>
                        <b>{it.label}</b> {it.text}
                      </>
                    ) : (
                      it
                    )}
                  </li>
                ))}
              </ul>
            )}
            {alert.detail && <p className="ma-detail tabular">{alert.detail}</p>}
          </div>
          <footer className="ma-foot">
            <span className="ma-hint">
              {remaining > 0 && <span className="ma-more">+{remaining} more · </span>}
              <span className="ma-hint-key">Esc or click outside to close</span>
              <span className="ma-hint-touch">Tap outside to close</span>
            </span>
            <button type="button" className="ma-ack" onClick={onClose} autoFocus>
              {remaining > 0 ? 'Next' : 'Acknowledge'}
            </button>
          </footer>
        </div>
      )}
    </dialog>
  );
}
