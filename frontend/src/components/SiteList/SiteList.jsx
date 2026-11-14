import { useMemo, useState } from 'react';
import { SITE_CATEGORIES, makeCustomSite } from '../../data/mock/sites.js';
import { formatLat, formatLon } from '../../utils/format.js';
import './SiteList.css';

/**
 * Left-hand list of landing sites grouped by category, with search and custom coordinates.
 * @param {{ sites: object[], selectedId: string|null, onSelect: (id) => void, onAddCustom: (site) => void, loading: boolean }} props
 */
export default function SiteList({ sites, selectedId, onSelect, onAddCustom, loading, collapsed, onToggle }) {
  const [query, setQuery] = useState('');
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [error, setError] = useState(null);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = sites.filter((s) => !q || `${s.name} ${s.agency}`.toLowerCase().includes(q));
    return Object.entries(SITE_CATEGORIES)
      .map(([key, cat]) => ({ key, ...cat, sites: filtered.filter((s) => s.category === key) }))
      .filter((g) => g.sites.length);
  }, [sites, query]);

  const submitCustom = (e) => {
    e.preventDefault();
    const la = Number(lat);
    const lo = Number(lon);
    if (lat === '' || lon === '' || !Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) {
      setError('Latitude −90…90, longitude −180…180');
      return;
    }
    setError(null);
    onAddCustom(makeCustomSite(la, lo));
  };

  return (
    <aside className={`site-list${collapsed ? ' collapsed' : ''}`} aria-label="Landing sites">
      <button className="site-list-toggle" onClick={onToggle} aria-expanded={!collapsed}>
        {collapsed ? 'Sites ›' : '‹ Hide'}
      </button>
      {!collapsed && (
        <>
          <div className="site-list-head">
            <h2>Landing sites</h2>
            <span className="tag-mock" title="Placeholder sites until the backend provides real data">Mock</span>
          </div>
          <input
            className="site-search"
            type="search"
            placeholder="Search sites or agencies"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search sites"
          />
          <div className="site-groups">
            {loading && <p className="muted">Loading sites…</p>}
            {groups.map((g) => (
              <section key={g.key}>
                <h3>
                  <span className="cat-dot" style={{ '--c': g.color }} />
                  {g.label}
                </h3>
                <ul>
                  {g.sites.map((s) => (
                    <li key={s.id}>
                      <button className={`site-row${s.id === selectedId ? ' active' : ''}`} onClick={() => onSelect(s.id)}>
                        <span className="site-row-name">{s.name}</span>
                        <span className="site-row-coords tabular">
                          {formatLat(s.lat, 1)} {formatLon(s.lon, 1)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <form className="custom-site" onSubmit={submitCustom}>
            <h3>Custom coordinates</h3>
            <div className="custom-site-fields">
              <label>
                <span>Lat °</span>
                <input inputMode="decimal" placeholder="-89.5" value={lat} onChange={(e) => setLat(e.target.value)} />
              </label>
              <label>
                <span>Lon °E</span>
                <input inputMode="decimal" placeholder="45" value={lon} onChange={(e) => setLon(e.target.value)} />
              </label>
              <button type="submit">Go</button>
            </div>
            {error && <p className="field-error">{error}</p>}
          </form>
        </>
      )}
    </aside>
  );
}
