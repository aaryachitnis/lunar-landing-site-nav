// Computes Sun visibility (0..1, fraction of the solar disk above the terrain) on coarse grids
// over the mid and far terrain layers, for one Sun direction. Runs off the main thread and only
// when the Sun has moved, instead of ray-marching per vertex every frame.

const R2 = 2 * 1737400;
const SUN_R = 0.266;
let mid = null;
let far = null;

function sample(L, e, n) {
  const fx = (e + L.sizeM / 2) / L.spacingM;
  const fy = (L.sizeM / 2 - n) / L.spacingM;
  const i = Math.floor(fx);
  const j = Math.floor(fy);
  if (i < 0 || j < 0 || i >= L.n - 1 || j >= L.n - 1) return NaN;
  const tx = fx - i;
  const ty = fy - j;
  const h = L.heights;
  const k = j * L.n + i;
  return (h[k] * (1 - tx) + h[k + 1] * tx) * (1 - ty) + (h[k + L.n] * (1 - tx) + h[k + L.n + 1] * tx) * ty;
}
const heightAt = (e, n) => {
  const v = sample(mid, e, n);
  return Number.isFinite(v) ? v : sample(far, e, n);
};

function visGrid(L, stride, se, sn, elDeg) {
  const m = Math.floor((L.n - 1) / stride) + 1;
  const out = new Uint8Array(m * m);
  const half = L.sizeM / 2;
  const step = L.spacingM * stride;
  for (let j = 0; j < m; j++) {
    const n0 = half - j * step;
    for (let i = 0; i < m; i++) {
      const e0 = -half + i * step;
      const h0 = L.heights[j * stride * L.n + i * stride] + 4; // tolerance for data-resolution mismatch
      let best = -90;
      let d = 40;
      for (let k = 0; k < 44; k++) {
        const h = heightAt(e0 + se * d, n0 + sn * d);
        if (!Number.isFinite(h)) break;
        const a = Math.atan2(h - h0 - (d * d) / R2, d) * 57.29578;
        if (a > best) best = a;
        if (best > elDeg + SUN_R) break; // already fully blocked
        d *= 1.22;
      }
      out[j * m + i] = Math.round(255 * Math.min(1, Math.max(0, (elDeg - best + SUN_R) / (2 * SUN_R))));
    }
  }
  return { data: out, n: m };
}

self.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === 'terrain') {
    mid = msg.mid;
    far = msg.far;
    return;
  }
  if (msg.type === 'sun' && mid && far) {
    const a = (msg.az * Math.PI) / 180;
    const se = Math.sin(a);
    const sn = Math.cos(a);
    const midVis = visGrid(mid, msg.midStride, se, sn, msg.el);
    const farVis = visGrid(far, msg.farStride ?? 1, se, sn, msg.el);
    self.postMessage({ id: msg.id, az: msg.az, el: msg.el, mid: midVis, far: farVis }, [midVis.data.buffer, farVis.data.buffer]);
  }
};
