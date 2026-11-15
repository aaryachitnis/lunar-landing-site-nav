import { getSitePower } from '../data/api.js';
import { useAsync } from './useAsync.js';

/** Live solar power from the backend for a site at an ISO time. */
export function useSitePower(site, dateISO) {
  return useAsync(() => (site ? getSitePower(site, dateISO) : null), [site?.id, dateISO]);
}
