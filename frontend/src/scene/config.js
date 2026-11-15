// Fixed look of the globe (chosen by the team — not user-adjustable).
// Generated data (textures, per-site terrain packs). Served from public/ in dev; when hosting,
// set VITE_DATA_BASE (e.g. https://cdn.example.com/lunar/) to serve the large files from a CDN.
export const DATA_BASE = import.meta.env?.VITE_DATA_BASE ?? '/';
export const TEXTURE_BASE = `${DATA_BASE}textures/`;
export const TERRAIN_BASE = `${DATA_BASE}terrain/`;

export const SUN_AZIMUTH = 60; // degrees around the Y axis (0 = towards the default camera)
export const SUN_ELEVATION = 5; // degrees above the equator
export const SUN_INTENSITY = 3.2;
export const EXPOSURE = 1.0;
export const RELIEF_EXAGGERATION = 0; // × real lunar relief (0 = smooth sphere; detail from the normal map)
export const NORMAL_STRENGTH = 1.55;

export const SPHERE_SEGMENTS = [1024, 512];

// Camera
export const DEFAULT_VIEW = { lat: -35, lon: 0, distance: 4 }; // tilted so the south pole is in view
export const FOCUS_DISTANCE = 2.0;
export const FLY_DURATION_MS = 1400;

// "Let there be light" — optional fill that illuminates the night side (toggle in the UI).
// Off by default so the default look above (single Sun, no ambient) is unchanged.
export const NIGHT_FILL = {
  intensity: 2.6, // directional light opposite the Sun
  ambient: 0.35, // softens the band where both lights graze (the terminator)
  transitionMs: 800,
};
