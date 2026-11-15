import { getSiteMetrics } from '../data/api.js';
import { useAsync } from './useAsync.js';

/** Metrics for a site at a given ISO time; null site → no request. */
export function useSiteMetrics(site, dateISO) {
  return useAsync(() => (site ? getSiteMetrics(site, dateISO) : null), [site?.id, dateISO]);
}
