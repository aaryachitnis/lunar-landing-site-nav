import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/** Selected site id + date live in the URL (?site=…&t=…) so views are shareable. */
export function useSelectedSite() {
  const [params, setParams] = useSearchParams();
  const siteId = params.get('site');
  const time = params.get('t');

  const update = useCallback(
    (changes) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(changes)) {
            if (v == null) next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: false },
      ),
    [setParams],
  );

  const actions = useMemo(
    () => ({
      selectSite: (id) => update({ site: id }),
      clearSite: () => update({ site: null }),
      setTime: (iso) => update({ t: iso }),
    }),
    [update],
  );

  return { siteId, time, ...actions };
}
