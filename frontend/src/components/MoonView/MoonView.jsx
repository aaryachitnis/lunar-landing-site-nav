import { useEffect, useRef } from 'react';
import { useMoonScene } from '../../hooks/useMoonScene.js';
import { SITE_CATEGORIES } from '../../data/mock/sites.js';
import './MoonView.css';

/**
 * God's-eye globe with HTML site markers.
 * @param {{ sites: object[], selectedSite: object|null, onSelect: (id) => void, insets: {left:number,right:number} }} props
 */
export default function MoonView({ sites, selectedSite, onSelect, insets }) {
  const containerRef = useRef(null);
  const markerEls = useRef(new Map());
  const { sceneRef, status } = useMoonScene(containerRef);

  // Register marker elements with the scene (it positions them every frame).
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    for (const s of sites) scene.registerMarker(s.id, s.lat, s.lon, markerEls.current.get(s.id));
    return () => sites.forEach((s) => scene.registerMarker(s.id));
  }, [sites, sceneRef]);

  useEffect(() => {
    sceneRef.current?.setInsets(insets.left, insets.right);
  }, [insets.left, insets.right, sceneRef]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (selectedSite) scene.flyTo(selectedSite.lat, selectedSite.lon);
    else scene.resetView();
  }, [selectedSite?.id, sceneRef]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="moon-view">
      <div ref={containerRef} className="moon-canvas" />
      <div className="moon-markers" aria-label="Landing sites on the globe">
        {sites.map((s) => {
          const selected = s.id === selectedSite?.id;
          return (
            <button
              key={s.id}
              ref={(el) => (el ? markerEls.current.set(s.id, el) : markerEls.current.delete(s.id))}
              className={`site-marker${selected ? ' selected' : ''}`}
              style={{ '--marker-color': SITE_CATEGORIES[s.category]?.color }}
              onClick={() => onSelect(s.id)}
              aria-label={`${s.name} (${SITE_CATEGORIES[s.category]?.label})`}
              aria-pressed={selected}
            >
              <span className="site-marker-dot" />
              <span className="site-marker-label">{s.name}</span>
            </button>
          );
        })}
      </div>
      {!status.loaded && (
        <div className={`moon-loading${status.error ? ' error' : ''}`}>
          {status.error ?? `Loading lunar maps… ${Math.round(status.progress * 100)}%`}
        </div>
      )}
      <div className="moon-credit">Imagery & elevation: NASA LRO (LROC / LOLA)</div>
    </div>
  );
}
