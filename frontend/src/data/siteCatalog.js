// Display names for the backend's sites. The backend returns only ids and coordinates,
// so each site is matched to a known landing site by position.

import { MOCK_SITES } from './mock/sites.js';

export const SITE_CATEGORIES = {
  'artemis-candidate': { label: 'Artemis candidate', color: 'var(--cat-1)' },
  clps: { label: 'CLPS / commercial', color: 'var(--cat-2)' },
  international: { label: 'International', color: 'var(--cat-3)' },
  apollo: { label: 'Apollo (historical)', color: 'var(--cat-4)' },
  'south-pole': { label: 'South-pole sites', color: 'var(--cat-5)' },
  other: { label: 'Other sites', color: 'var(--text-muted)' },
};

const EXTRA_KNOWN_SITES = [
  { id: 'apollo-12', name: 'Apollo 12', lat: -3.012, lon: -23.422, category: 'apollo', agency: 'NASA', notes: 'Oceanus Procellarum (1969).' },
  { id: 'apollo-14', name: 'Apollo 14', lat: -3.645, lon: -17.471, category: 'apollo', agency: 'NASA', notes: 'Fra Mauro (1971).' },
  { id: 'apollo-16', name: 'Apollo 16', lat: -8.973, lon: 15.5, category: 'apollo', agency: 'NASA', notes: 'Descartes Highlands (1972).' },
];

const KNOWN_SITES = [...MOCK_SITES, ...EXTRA_KNOWN_SITES];
const MATCH_TOLERANCE_DEG = 0.05;

const fmtCoord = (v, pos, neg) => `${Math.abs(v).toFixed(2)}°${v >= 0 ? pos : neg}`;

/** Adds name, category, agency and notes to a backend site ({ id, lat, lon }). */
export function describeSite(site) {
  const known = KNOWN_SITES.find(
    (k) => Math.abs(k.lat - site.lat) < MATCH_TOLERANCE_DEG && Math.abs(k.lon - site.lon) < MATCH_TOLERANCE_DEG,
  );
  if (known) {
    const { name, category, agency, notes } = known;
    // terrainId points Lunarium at the prebuilt terrain pack for this place, if there is one.
    return { ...site, name, category, agency, notes, terrainId: known.id };
  }
  const number = site.id.replace(/^site-/, '');
  return {
    ...site,
    name: `Site ${number}`,
    category: site.lat < -80 ? 'south-pole' : 'other',
    agency: 'Backend catalog',
    notes: `${fmtCoord(site.lat, 'N', 'S')}, ${fmtCoord(site.lon, 'E', 'W')}`,
  };
}
