import { getSkyModel } from '../data/api.js';
import { useAsync } from './useAsync.js';

export function useSkyModel(site, dateISO) {
  return useAsync(() => (site ? getSkyModel(site, dateISO) : null), [site?.id, dateISO]);
}
