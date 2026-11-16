import { useEffect, useMemo, useRef, useState } from 'react';

// Single-hue ramp (dark navy → pale ice blue), the same as the God's-eye 3D terrain view.
const LOW = [0x0d, 0x1a, 0x2b];
const HIGH = [0xd6, 0xe9, 0xff];
const SUN_AZ = 315; // shaded relief lit from the north-west (cartographic convention)
const SUN_EL = 35;
const EXAGGERATION = 2;

/** Shaded relief image (RGBA) for a TerrainPatch: altitude colour × hillshade. */
function renderRelief({ n, heights, minM, maxM, spacingM }) {
  const img = new ImageData(n, n);
  const range = Math.max(maxM - minM, 1);
  const az = (SUN_AZ * Math.PI) / 180;
  const el = (SUN_EL * Math.PI) / 180;
  const sun = [Math.cos(el) * Math.sin(az), Math.cos(el) * Math.cos(az), Math.sin(el)];
  const h = (i, j) => heights[Math.min(Math.max(j, 0), n - 1) * n + Math.min(Math.max(i, 0), n - 1)];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const dx = ((h(i + 1, j) - h(i - 1, j)) / (2 * spacingM)) * EXAGGERATION; // east
      const dy = ((h(i, j - 1) - h(i, j + 1)) / (2 * spacingM)) * EXAGGERATION; // north (row 0 = north)
      const len = Math.hypot(dx, dy, 1);
      const shade = Math.max(0, (-dx * sun[0] - dy * sun[1] + sun[2]) / len);
      const t = (h(i, j) - minM) / range;
      const k = (j * n + i) * 4;
      const light = 0.3 + 0.7 * shade;
      for (let c = 0; c < 3; c++) img.data[k + c] = (LOW[c] + (HIGH[c] - LOW[c]) * t) * light;
      img.data[k + 3] = 255;
    }
  }
  return img;
}

export default function TerrainMap2D({ patch }) {
  const canvasRef = useRef(null);
  const [hover, setHover] = useState(null);
  const image = useMemo(() => renderRelief(patch), [patch]);

  useEffect(() => {
    const canvas = canvasRef.current;
    canvas.width = patch.n;
    canvas.height = patch.n;
    canvas.getContext('2d').putImageData(image, 0, 0);
  }, [image, patch.n]);

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width;
    const fy = (e.clientY - r.top) / r.height;
    if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return setHover(null);
    const i = Math.min(patch.n - 1, Math.round(fx * (patch.n - 1)));
    const j = Math.min(patch.n - 1, Math.round(fy * (patch.n - 1)));
    setHover({
      x: fx * 100,
      y: fy * 100,
      eastKm: (fx - 0.5) * patch.sizeKm,
      northKm: (0.5 - fy) * patch.sizeKm,
      altM: patch.heights[j * patch.n + i],
    });
  };

  const scaleKm = patch.sizeKm / 4;
  return (
    <div className="pg-map">
      <div className="pg-map-frame" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        <canvas ref={canvasRef} className="pg-map-canvas" role="img" aria-label={`Shaded relief map, ${patch.sizeKm} km square, centred on the site`} />
        <svg className="pg-map-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <line x1="50" y1="44" x2="50" y2="56" />
          <line x1="44" y1="50" x2="56" y2="50" />
          <circle cx="50" cy="50" r="2.2" />
        </svg>
        <div className="pg-map-north" aria-hidden="true">
          N<span>▲</span>
        </div>
        <div className="pg-map-scale" style={{ width: `${(scaleKm / patch.sizeKm) * 100}%` }}>
          <span className="tabular">{scaleKm} km</span>
        </div>
        {hover && (
          <>
            <div className="pg-map-cursor" style={{ left: `${hover.x}%`, top: `${hover.y}%` }} />
            <div className="pg-map-readout tabular">
              {hover.eastKm >= 0 ? 'E' : 'W'} {Math.abs(hover.eastKm).toFixed(1)} km · {hover.northKm >= 0 ? 'N' : 'S'}{' '}
              {Math.abs(hover.northKm).toFixed(1)} km · {Math.round(hover.altM).toLocaleString()} m
            </div>
          </>
        )}
      </div>
      <div className="pg-map-legend">
        <span className="tabular">{Math.round(patch.minM).toLocaleString()} m</span>
        <span className="pg-map-ramp" aria-hidden="true" />
        <span className="tabular">{Math.round(patch.maxM).toLocaleString()} m</span>
      </div>
    </div>
  );
}
