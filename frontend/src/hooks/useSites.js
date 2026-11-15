import { getLunariumSites, getSites } from '../data/api.js';
import { useAsync } from './useAsync.js';

export function useSites(refreshKey = 0) {
  return useAsync(() => getSites(), [refreshKey]);
}

export function useLunariumSites() {
  return useAsync(() => getLunariumSites(), []);
}
