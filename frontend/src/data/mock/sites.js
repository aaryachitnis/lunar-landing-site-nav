// MOCK landing sites. Coordinates are approximate and for UI development only —
// the backend will replace this list (see data/SCHEMA.md).

export const SITE_CATEGORIES = {
  'artemis-candidate': { label: 'Artemis candidate', color: 'var(--cat-1)' },
  clps: { label: 'CLPS / commercial', color: 'var(--cat-2)' },
  international: { label: 'International', color: 'var(--cat-3)' },
  apollo: { label: 'Apollo (historical)', color: 'var(--cat-4)' },
  custom: { label: 'Custom', color: 'var(--cat-5)' },
};

export const MOCK_SITES = [
  // South-pole Artemis candidate regions
  { id: 'shackleton-rim', name: 'Shackleton Rim', lat: -89.89, lon: -150.33, category: 'artemis-candidate', agency: 'NASA', notes: 'Near-continuous illumination on the crater rim; PSR ice nearby.' },
  { id: 'connecting-ridge', name: 'Connecting Ridge', lat: -89.45, lon: -137.3, category: 'artemis-candidate', agency: 'NASA', notes: 'Ridge between Shackleton and de Gerlache with high illumination.' },
  { id: 'de-gerlache-rim', name: 'de Gerlache Rim', lat: -89.04, lon: -99.26, category: 'artemis-candidate', agency: 'NASA', notes: 'Rim of de Gerlache crater.' },
  { id: 'malapert-massif', name: 'Malapert Massif', lat: -85.99, lon: -2.93, category: 'artemis-candidate', agency: 'NASA', notes: 'Tall massif with good Earth visibility.' },
  { id: 'nobile-rim', name: 'Nobile Rim', lat: -84.26, lon: 50.11, category: 'artemis-candidate', agency: 'NASA', notes: 'Rim of Nobile crater.' },
  { id: 'haworth', name: 'Haworth', lat: -86.8, lon: 4.66, category: 'artemis-candidate', agency: 'NASA', notes: 'Adjacent to the Haworth PSR.' },
  { id: 'leibnitz-beta', name: 'Leibnitz Beta Plateau', lat: -85.4, lon: 31.7, category: 'artemis-candidate', agency: 'NASA', notes: 'Elevated plateau.' },
  // CLPS / commercial
  { id: 'im-1', name: 'IM-1 Odysseus', lat: -80.13, lon: 1.44, category: 'clps', agency: 'Intuitive Machines', notes: 'Near Malapert A (2024).' },
  { id: 'im-2', name: 'IM-2 Athena', lat: -84.79, lon: 29.2, category: 'clps', agency: 'Intuitive Machines', notes: 'Mons Mouton region (2025).' },
  { id: 'blue-ghost-1', name: 'Blue Ghost M1', lat: 18.56, lon: 61.81, category: 'clps', agency: 'Firefly Aerospace', notes: 'Mare Crisium (2025).' },
  // International
  { id: 'chandrayaan-3', name: 'Chandrayaan-3', lat: -69.37, lon: 32.32, category: 'international', agency: 'ISRO', notes: 'Vikram lander (2023).' },
  { id: 'slim', name: 'SLIM', lat: -13.32, lon: 25.25, category: 'international', agency: 'JAXA', notes: 'Near Shioli crater (2024).' },
  { id: 'change-4', name: "Chang'e 4", lat: -45.46, lon: 177.59, category: 'international', agency: 'CNSA', notes: 'Von Kármán crater, far side (2019).' },
  { id: 'change-6', name: "Chang'e 6", lat: -41.64, lon: -153.99, category: 'international', agency: 'CNSA', notes: 'Apollo basin, far side sample return (2024).' },
  // Apollo
  { id: 'apollo-11', name: 'Apollo 11', lat: 0.674, lon: 23.473, category: 'apollo', agency: 'NASA', notes: 'Mare Tranquillitatis (1969).' },
  { id: 'apollo-15', name: 'Apollo 15', lat: 26.132, lon: 3.634, category: 'apollo', agency: 'NASA', notes: 'Hadley–Apennine (1971).' },
  { id: 'apollo-17', name: 'Apollo 17', lat: 20.191, lon: 30.772, category: 'apollo', agency: 'NASA', notes: 'Taurus–Littrow (1972).' },
].map((s) => ({ ...s, mock: true }));

export function makeCustomSite(lat, lon) {
  const la = Number(lat.toFixed(4));
  const lo = Number(lon.toFixed(4));
  return {
    id: `custom_${la}_${lo}`,
    name: 'Custom site',
    lat: la,
    lon: lo,
    category: 'custom',
    agency: '—',
    notes: 'User-entered coordinates.',
    mock: true,
  };
}

export function parseCustomSiteId(id) {
  const m = /^custom_(-?[\d.]+)_(-?[\d.]+)$/.exec(id || '');
  return m ? makeCustomSite(Number(m[1]), Number(m[2])) : null;
}
