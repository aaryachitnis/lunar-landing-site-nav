// Turns the backend's sites into what the UI shows. The backend provides the name, agency and
// description; this adds a category, splits the name into mission and region, and links the
// site to Lunarium's terrain pack for the same place.

import { MOCK_SITES } from './mock/sites.js';

export const SITE_CATEGORIES = {
  'artemis-candidate': { label: 'Artemis candidate', color: 'var(--cat-1)' },
  clps: { label: 'CLPS / commercial', color: 'var(--cat-2)' },
  international: { label: 'International', color: 'var(--cat-3)' },
  apollo: { label: 'Apollo (historical)', color: 'var(--cat-4)' },
  'south-pole': { label: 'South-pole sites', color: 'var(--cat-5)' },
  other: { label: 'Other sites', color: 'var(--text-muted)' },
};

const TERRAIN_MATCH_DEG = 0.05;

function categoryOf(name, lat) {
  if (/^apollo\b/i.test(name)) return 'apollo';
  if (/^artemis\b/i.test(name)) return 'artemis-candidate';
  if (lat < -80) return 'south-pole';
  return 'other';
}

/** "Apollo 17 (Taurus-Littrow)" → { mission: "Apollo 17", region: "Taurus-Littrow" }. */
function splitName(fullName) {
  const m = /^(.*?)\s*\((.+)\)\s*$/.exec(fullName);
  return m ? { mission: m[1], region: m[2] } : { mission: fullName, region: null };
}

/** Backend site ({ id, name, desc, agency, lat, lon }) → the Site shape in SCHEMA.md. */
export function describeSite(site, index) {
  const fullName = site.name || site.id;
  const { mission, region } = splitName(fullName);
  const terrain = MOCK_SITES.find(
    (k) => Math.abs(k.lat - site.lat) < TERRAIN_MATCH_DEG && Math.abs(k.lon - site.lon) < TERRAIN_MATCH_DEG,
  );
  return {
    id: site.id,
    lat: site.lat,
    lon: site.lon,
    name: mission,
    region,
    fullName,
    agency: site.agency,
    description: site.desc,
    category: categoryOf(fullName, site.lat),
    terrainId: terrain?.id,
    // Ids the backend used before it named its sites; old shared links still use them.
    legacyId: `site-${index + 1}`,
  };
}
