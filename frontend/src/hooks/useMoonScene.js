import { useEffect, useRef, useState } from 'react';
import { MoonScene } from '../scene/MoonScene.js';

/** Creates the globe inside `containerRef` for the lifetime of the component and disposes it on unmount. */
export function useMoonScene(containerRef) {
  const sceneRef = useRef(null);
  const [status, setStatus] = useState({ progress: 0, loaded: false, error: null });

  useEffect(() => {
    const scene = new MoonScene(containerRef.current, {
      onLoadProgress: (p) => setStatus((s) => ({ ...s, progress: p })),
      onLoaded: () => setStatus((s) => ({ ...s, progress: 1, loaded: true })),
      onError: (name) => setStatus((s) => ({ ...s, error: `Failed to load ${name}.` })),
    });
    sceneRef.current = scene;
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, [containerRef]);

  return { sceneRef, status };
}
