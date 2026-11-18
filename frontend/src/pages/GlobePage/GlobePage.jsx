import { useCallback, useEffect, useMemo, useState } from 'react';
import MoonView from '../../components/MoonView/MoonView.jsx';
import SiteList from '../../components/SiteList/SiteList.jsx';
import SitePanel from '../../components/SitePanel/SitePanel.jsx';
import { useSites } from '../../hooks/useSites.js';
import { useSelectedSite } from '../../hooks/useSelectedSite.js';
import Tour, { useTour } from '../../components/Tour/Tour.jsx';
import { TOUR_SITE_ID, TOUR_STEPS, TOUR_STORAGE_KEY } from '../../components/Tour/tourSteps.js';
import { errorText, useErrorAlert } from '../../components/MissionAlert/MissionAlert.jsx';
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

export default function GlobePage() {
  const { data: fetchedSites, loading, error } = useSites();
  const { siteId, time, selectSite, clearSite, setTime } = useSelectedSite();
  const [listCollapsed, setListCollapsed] = useState(false);
  const narrow = useIsNarrow();
  // First visit only, never over a shared site link; ?tour=1 (Guide) replays it.
  const [touring, setTouring] = useTour(TOUR_STORAGE_KEY, !siteId);
  const defaultTime = useMemo(() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    return d.toISOString();
  }, []);

  const sites = useMemo(() => fetchedSites ?? [], [fetchedSites]);
  useErrorAlert(error, (e) => ({
    level: 'warning',
    source: 'Landing sites · Catalogue',
    title: 'Site catalogue unavailable',
    message: 'The landing-site list could not be loaded from the server. Reload the page, or use the Playground to enter coordinates directly.',
    detail: errorText(e),
  }));

  // Also accept Lunarium ids (apollo-11) and the backend's old ids (site-3) from shared links.
  const selectedSite = sites.find((s) => s.id === siteId) ?? sites.find((s) => s.terrainId === siteId || s.legacyId === siteId) ?? null;
  const close = useCallback(() => clearSite(), [clearSite]);

  const tourSiteId = (sites.find((s) => s.id === TOUR_SITE_ID) ?? sites[0])?.id;
  const [tourPicked, setTourPicked] = useState(false);
  const onTourStep = useCallback(
    (step) => {
      if (step.needsSite && !selectedSite && tourSiteId) {
        selectSite(tourSiteId);
        setTourPicked(true);
      }
    },
    [selectedSite, tourSiteId, selectSite],
  );
  // A site clicked mid-tour is the user's own pick, so the panel step shouldn't claim we chose it.
  useEffect(() => {
    if (selectedSite && selectedSite.id !== tourSiteId) setTourPicked(false);
  }, [selectedSite, tourSiteId]);

  const insets = narrow
    ? { left: 0, right: 0 }
    : { left: listCollapsed ? 0 : LIST_W, right: selectedSite ? PANEL_W : 0 };

  return (
    <div className="globe-page">
      <MoonView sites={sites} selectedSite={selectedSite} onSelect={selectSite} insets={insets} />
      <SiteList
        sites={sites}
        loading={loading}
        error={error}
        selectedId={siteId}
        onSelect={selectSite}
        collapsed={listCollapsed || (narrow && !!selectedSite)}
        onToggle={() => setListCollapsed((c) => !c)}
      />
      {selectedSite && <SitePanel key={selectedSite.id} site={selectedSite} time={time ?? defaultTime} onTimeChange={setTime} onClose={close} />}
      {touring && <Tour steps={TOUR_STEPS} storageKey={TOUR_STORAGE_KEY} context={{ siteName: selectedSite?.fullName, tourPicked }} onStep={onTourStep} onClose={() => setTouring(false)} />}
    </div>
  );
}
