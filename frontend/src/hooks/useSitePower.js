import { getSitePower } from '../data/api.js';
import { useAsync } from './useAsync.js';

export function useSitePower(site, dateISO) {
  return useAsync(() => (site ? getSitePower(site, dateISO) : null), [site?.id, dateISO]);
}
