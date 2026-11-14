import { NavLink, Outlet } from 'react-router-dom';
import { routes } from '../routes.jsx';
import logo from '../assets/logo.svg';
import './AppLayout.css';

export default function AppLayout() {
  return (
    <div className="app-shell">
      <header className="app-nav">
        <NavLink to="/" className="app-brand">
          <img src={logo} alt="" width="22" height="22" />
          <span>Lunar Site Navigator</span>
        </NavLink>
        <nav aria-label="Features">
          {routes.map((r) => (
            <NavLink key={r.path} to={r.path} end className={({ isActive }) => `app-nav-link${isActive ? ' active' : ''}`}>
              {r.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
