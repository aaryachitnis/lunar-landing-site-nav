import { MOCK_SITES } from './mock/sites.js';

export const SITE_CATEGORIES = {
  'artemis-candidate': { label: 'Artemis candidate', color: 'var(--cat-1)' },
  clps: { label: 'CLPS / commercial', color: 'var(--cat-2)' },
  international: { label: 'International', color: 'var(--cat-3)' },
  apollo: { label: 'Apollo (historical)', color: 'var(--cat-4)' },
  'south-pole': { label: 'South-pole sites', color: 'var(--cat-5)' },
  other: { label: 'Other sites', color: 'var(--text-muted)' },
  'user-added': { label: 'User-added', color: 'var(--text-secondary)' },
};

const CLPS_AGENCIES = /intuitive machines|firefly|astrobotic|ispace|draper/i;
const INTERNATIONAL_AGENCIES = /^(isro|jaxa|cnsa|esa|roscosmos|kari)$/i;

/** Saved from the Playground: the backend gives these `custom-…` ids and agency "Custom". */
export const isUserAdded = (site) => /^custom-/.test(site.id) || site.agency === 'Custom';

const TERRAIN_MATCH_DEG = 0.05;

function categoryOf(name, lat, agency = '') {
  if (/^apollo\b/i.test(name)) return 'apollo';
  if (CLPS_AGENCIES.test(agency)) return 'clps';
  if (INTERNATIONAL_AGENCIES.test(agency)) return 'international';
  if (/^artemis\b/i.test(name)) return 'artemis-candidate';
  if (lat < -80) return 'south-pole';
  return 'other';
}

/** "Apollo 17 (Taurus-Littrow)" → { mission: "Apollo 17", region: "Taurus-Littrow" }. */
function splitName(fullName) {
  const m = /^(.*?)\s*\((.+)\)\s*$/.exec(fullName);
  return m ? { mission: m[1], region: m[2] } : { mission: fullName, region: null };
}

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
    category: isUserAdded(site) ? 'user-added' : categoryOf(fullName, site.lat, site.agency),
    userAdded: isUserAdded(site),
    terrainId: terrain?.id,
    // Ids the backend used before it named its sites; old shared links still use them.
    legacyId: `site-${index + 1}`,
  };
}
