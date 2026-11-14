import { useCallback, useEffect, useMemo, useState } from 'react';
import MoonView from '../../components/MoonView/MoonView.jsx';
import SiteList from '../../components/SiteList/SiteList.jsx';
import SitePanel from '../../components/SitePanel/SitePanel.jsx';
import { useSites } from '../../hooks/useSites.js';
import { useSelectedSite } from '../../hooks/useSelectedSite.js';
import { parseCustomSiteId } from '../../data/mock/sites.js';
import './GlobePage.css';

const PANEL_W = 420;
const LIST_W = 296;

function useIsNarrow() {
  const query = '(max-width: 760px)';
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}

/** Home route: God's-eye globe of candidate landing sites. */
export default function GlobePage() {
  const { data: fetchedSites, loading } = useSites();
  const { siteId, time, selectSite, clearSite, setTime } = useSelectedSite();
  const [listCollapsed, setListCollapsed] = useState(false);
  const narrow = useIsNarrow();
  const defaultTime = useMemo(() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    return d.toISOString();
  }, []);

  // Custom sites come from the URL id, so a shared link restores them.
  const sites = useMemo(() => {
    const list = fetchedSites ?? [];
    const custom = parseCustomSiteId(siteId);
    return custom && !list.some((s) => s.id === custom.id) ? [...list, custom] : list;
  }, [fetchedSites, siteId]);

  const selectedSite = sites.find((s) => s.id === siteId) ?? null;
  const close = useCallback(() => clearSite(), [clearSite]);

  const insets = narrow
    ? { left: 0, right: 0 }
    : { left: listCollapsed ? 0 : LIST_W, right: selectedSite ? PANEL_W : 0 };

  return (
    <div className="globe-page">
      <MoonView sites={sites} selectedSite={selectedSite} onSelect={selectSite} insets={insets} />
      <SiteList
        sites={sites}
        loading={loading}
        selectedId={siteId}
        onSelect={selectSite}
        onAddCustom={(s) => selectSite(s.id)}
        collapsed={listCollapsed || (narrow && !!selectedSite)}
        onToggle={() => setListCollapsed((c) => !c)}
      />
      {selectedSite && <SitePanel key={selectedSite.id} site={selectedSite} time={time ?? defaultTime} onTimeChange={setTime} onClose={close} />}
    </div>
  );
}
