import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { routes, SHARED_PARAMS } from '../routes.jsx';
import logo from '../assets/logo.svg';
import MissionClock from '../components/MissionClock/MissionClock.jsx';
import './AppLayout.css';

/** Keep ?site=&t= when switching tabs so the same site/time shows in every view. */
function sharedSearch(search) {
  const from = new URLSearchParams(search);
  const to = new URLSearchParams();
  for (const k of SHARED_PARAMS) if (from.has(k)) to.set(k, from.get(k));
  const s = to.toString();
  return s ? `?${s}` : '';
}

export default function AppLayout() {
  const location = useLocation();
  const current = routes.find((r) => (r.index ? location.pathname === '/' : location.pathname === r.path));
  const immersive = Boolean(current?.immersive);
  const search = sharedSearch(location.search);

  // Small-screen menu (☰): closes on navigation, Escape and outside clicks.
  const [open, setOpen] = useState(false);
  const navRef = useRef(null);
  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    const onDown = (e) => !navRef.current?.contains(e.target) && setOpen(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  const links = routes.map((r) => (
    <NavLink
      key={r.path}
      to={{ pathname: r.path, search }}
      end
      onClick={() => setOpen(false)}
      className={({ isActive }) => `app-nav-link${isActive ? ' active' : ''}`}
    >
      {r.label}
    </NavLink>
  ));

  return (
    <div className={`app-shell${immersive ? ' immersive' : ''}`}>
      <header className="app-nav" ref={navRef}>
        <button
          className={`app-menu-btn${open ? ' open' : ''}`}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="app-menu"
          onClick={() => setOpen((o) => !o)}
        >
          <span />
          <span />
          <span />
        </button>
        <NavLink to={{ pathname: '/', search }} className="app-brand">
          <img src={logo} alt="" width="22" height="22" />
          <span>Lunar Site Navigator</span>
        </NavLink>
        <nav aria-label="Features" className="app-tabs">
          {links}
        </nav>
        <MissionClock />
        {open && (
          <div className="app-menu" id="app-menu">
            <div className="app-menu-brand">
              <img src={logo} alt="" width="18" height="18" />
              <span>Lunar Site Navigator</span>
            </div>
            <nav aria-label="Features (menu)">{links}</nav>
            <MissionClock />
          </div>
        )}
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
