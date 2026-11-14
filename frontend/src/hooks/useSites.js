import { getSites } from '../data/api.js';
import { useAsync } from './useAsync.js';

export function useSites() {
  return useAsync(() => getSites(), []);
}
