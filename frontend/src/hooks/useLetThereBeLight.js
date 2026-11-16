import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'letThereBeLight';

function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Night-side fill toggle, mirrored to the MoonScene and remembered per browser. */
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
