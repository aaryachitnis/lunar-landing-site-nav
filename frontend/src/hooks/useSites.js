import { getLunariumSites, getSites } from '../data/api.js';
import { useAsync } from './useAsync.js';

/** Sites from the backend. */
export function useSites(refreshKey = 0) {
  return useAsync(() => getSites(), [refreshKey]);
}

/** Lunarium's site list. */
export function useLunariumSites() {
  return useAsync(() => getLunariumSites(), []);
}
