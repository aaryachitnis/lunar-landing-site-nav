import { getTerrainPatch } from '../data/api.js';
import { useAsync } from './useAsync.js';

export function useTerrainPatch(site, options) {
  return useAsync(
    () => (site ? getTerrainPatch(site.lat, site.lon, options) : null),
    [site?.lat, site?.lon, options?.sizeKm, options?.n],
  );
}
