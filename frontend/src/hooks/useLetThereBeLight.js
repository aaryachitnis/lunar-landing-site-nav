import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'letThereBeLight';

function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Toggle that illuminates the globe's night side.
 * Keeps the state in React, mirrors it to the MoonScene, and remembers the choice per browser.
 * @param {{ current: import('../scene/MoonScene.js').MoonScene | null }} sceneRef
 * @returns {{ lit: boolean, toggle: () => void, setLit: (on: boolean) => void }}
 */
export function useLetThereBeLight(sceneRef) {
  const [lit, setLit] = useState(readStored);

  useEffect(() => {
    sceneRef.current?.setNightSideLit(lit);
    try {
      localStorage.setItem(STORAGE_KEY, lit ? '1' : '0');
    } catch {
      /* storage unavailable; state still works for this session */
    }
  }, [lit, sceneRef]);

  const toggle = useCallback(() => setLit((v) => !v), []);
  return { lit, toggle, setLit };
}
