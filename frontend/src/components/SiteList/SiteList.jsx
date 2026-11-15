import { useMemo, useState } from 'react';
import { SITE_CATEGORIES } from '../../data/siteCatalog.js';
import { formatLat, formatLon } from '../../utils/format.js';
import './SiteList.css';

/** Left-hand list of landing sites grouped by category, with search. */
export default function SiteList({ sites, selectedId, onSelect, loading, error, collapsed, onToggle }) {
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = sites.filter((s) => !q || `${s.fullName} ${s.agency} ${s.description}`.toLowerCase().includes(q));
    return Object.entries(SITE_CATEGORIES)
      .map(([key, cat]) => ({ key, ...cat, sites: filtered.filter((s) => s.category === key) }))
      .filter((g) => g.sites.length);
  }, [sites, query]);

  return (
    <aside className={`site-list${collapsed ? ' collapsed' : ''}`} aria-label="Landing sites">
      <button className="site-list-toggle" onClick={onToggle} aria-expanded={!collapsed}>
        {collapsed ? 'Sites ›' : '‹ Hide'}
      </button>
      {!collapsed && (
        <>
          <div className="site-list-head">
            <h2>Landing sites</h2>
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
            {error && <p className="field-error">{String(error.message ?? error)}</p>}
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
                        <span className="site-row-name">
                          {s.name}
                          {s.region && <span className="site-row-region">{s.region}</span>}
                        </span>
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
        </>
      )}
    </aside>
  );
}
