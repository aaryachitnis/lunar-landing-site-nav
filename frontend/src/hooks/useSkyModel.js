import { getSkyModel } from '../data/api.js';
import { useAsync } from './useAsync.js';

/** Mock Sun/Earth model for a site at an ISO time. No site means no request. */
export function useSkyModel(site, dateISO) {
  return useAsync(() => (site ? getSkyModel(site, dateISO) : null), [site?.id, dateISO]);
}
