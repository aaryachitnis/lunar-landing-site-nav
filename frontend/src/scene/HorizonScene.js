// Lunarium's first-person scene. Frame: x = east, y = up, z = -north, metres, origin at the site.
// Renders on demand; distant-ridge shadows come from a worker, recomputed only when the Sun moves.

import * as THREE from 'three';
import { MOON_RADIUS_KM } from '../utils/coords.js';
import { sampleLayer } from '../data/horizonTerrain.js';

const D2R = Math.PI / 180;
const R_M = MOON_RADIUS_KM * 1000;
const SUN_RADIUS_DEG = 0.266;
const EARTH_RADIUS_DEG = 0.95;
const SKY_DIST = 10;
const SUN_INTENSITY = 3.2;
// On phones the true-size disks are only a few pixels across, so they are drawn larger
// (display only: visibility, labels and power still use the true 0.53° / 1.9° disks).
const MOBILE_BODY_SCALE = { sun: 3, earth: 2 };
const REGOLITH = new THREE.Color('#9b978f');

/** Unit direction (scene frame) for azimuth (clockwise from north) and elevation, degrees. */
export function dirFromAzEl(az, el) {
  const a = az * D2R;
  const e = el * D2R;
  return new THREE.Vector3(Math.cos(e) * Math.sin(a), Math.sin(e), -Math.cos(e) * Math.cos(a));
}

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hashStr = (s) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);

// Tileable value noise on a size×size lattice.
function tileNoise(rand, size) {
  const g = Float32Array.from({ length: size * size }, rand);
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const at = (i, j) => g[(((j % size) + size) % size) * size + (((i % size) + size) % size)];
    const a = at(xi, yi) * (1 - sx) + at(xi + 1, yi) * sx;
    const b = at(xi, yi + 1) * (1 - sx) + at(xi + 1, yi + 1) * sx;
    return a * (1 - sy) + b * sy;
  };
}

/** Procedural tileable regolith: albedo + normal map (cm–dm scale bumps and tiny craters). */
function makeRegolithTextures(rand, N = 512) {
  const octaves = [4, 8, 16, 32, 64, 128].map((f) => ({ f, n: tileNoise(rand, f), a: 1 / Math.sqrt(f) }));
  const hgt = new Float32Array(N * N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let v = 0;
      for (const o of octaves) v += o.n((x / N) * o.f, (y / N) * o.f) * o.a;
      hgt[y * N + x] = v;
    }
  for (let c = 0; c < 70; c++) {
    const cx = rand() * N;
    const cy = rand() * N;
    const r = 3 + Math.pow(rand(), 3) * 40;
    const R = Math.ceil(r * 1.6);
    for (let dy = -R; dy <= R; dy++)
      for (let dx = -R; dx <= R; dx++) {
        const q = Math.hypot(dx, dy) / r;
        if (q > 1.6) continue;
        const d = q < 1 ? -(1 - q * q) * 0.9 : 0;
        const rim = 0.35 * Math.exp(-(((q - 1) / 0.25) ** 2));
        const x = (((Math.round(cx + dx) % N) + N) % N);
        const y = (((Math.round(cy + dy) % N) + N) % N);
        hgt[y * N + x] += (d + rim) * (r / 25);
      }
  }
  const normal = new Uint8Array(N * N * 4);
  const albedo = new Uint8Array(N * N * 4);
  const H = (x, y) => hgt[(((y % N) + N) % N) * N + (((x % N) + N) % N)];
  const strength = 6;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const k = (y * N + x) * 4;
      normal[k] = ((-dx / len) * 0.5 + 0.5) * 255;
      normal[k + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      normal[k + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      normal[k + 3] = 255;
      const a = 200 + (H(x, y) - 1) * 40 + (rand() - 0.5) * 18;
      albedo[k] = albedo[k + 1] = albedo[k + 2] = Math.max(120, Math.min(255, a));
      albedo[k + 3] = 255;
    }
  const tex = (data, srgb) => {
    const t = new THREE.DataTexture(data, N, N);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  };
  return { normalMap: tex(normal, false), map: tex(albedo, true) };
}

/** Adds generated craters + small undulations to the near layer, fading out by its edge. */
function addNearDetail(L, rand) {
  const h = Float32Array.from(L.heights);
  const half = L.sizeM / 2;
  const fade = (r) => (r < 4 ? r / 4 : 1) * (1 - THREE.MathUtils.smoothstep(r, 650, 950));
  const n1 = tileNoise(rand, 64);
  const n2 = tileNoise(rand, 64);
  for (let j = 0; j < L.n; j++)
    for (let i = 0; i < L.n; i++) {
      const e = -half + i * L.spacingM;
      const no = half - j * L.spacingM;
      const w = fade(Math.hypot(e, no));
      h[j * L.n + i] += w * ((n1(e / 40, no / 40) - 0.5) * 1.2 + (n2(e / 12, no / 12) - 0.5) * 0.35);
    }
  for (let c = 0; c < 140; c++) {
    const r = 8 + Math.pow(rand(), 2.2) * 45;
    const dist = 15 + Math.sqrt(rand()) * 850;
    const ang = rand() * Math.PI * 2;
    const ce = Math.sin(ang) * dist;
    const cn = Math.cos(ang) * dist;
    const reach = r * 1.7;
    const i0 = Math.max(0, Math.floor((ce - reach + half) / L.spacingM));
    const i1 = Math.min(L.n - 1, Math.ceil((ce + reach + half) / L.spacingM));
    const j0 = Math.max(0, Math.floor((half - cn - reach) / L.spacingM));
    const j1 = Math.min(L.n - 1, Math.ceil((half - cn + reach) / L.spacingM));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const e = -half + i * L.spacingM;
        const no = half - j * L.spacingM;
        const q = Math.hypot(e - ce, no - cn) / r;
        if (q > 1.7) continue;
        const bowl = q < 1 ? -(1 - q * q) * 0.18 * r : 0;
        const rim = 0.035 * r * Math.exp(-(((q - 1) / 0.28) ** 2));
        h[j * L.n + i] += (bowl + rim) * fade(Math.hypot(e, no));
      }
  }
  return { ...L, heights: h };
}

function gridGeometry(L, { groundM, stride = 1, hole = 0, holeDrop = 0, uvScale = 0 }) {
  const m = Math.floor((L.n - 1) / stride) + 1;
  const pos = new Float32Array(m * m * 3);
  const uv = uvScale ? new Float32Array(m * m * 2) : null;
  const half = L.sizeM / 2;
  for (let j = 0; j < m; j++)
    for (let i = 0; i < m; i++) {
      const e = -half + i * stride * L.spacingM;
      const no = half - j * stride * L.spacingM;
      let y = L.heights[j * stride * L.n + i * stride] - groundM - (e * e + no * no) / (2 * R_M);
      if (hole && Math.abs(e) < hole && Math.abs(no) < hole) y -= holeDrop;
      const k = j * m + i;
      pos.set([e, y, -no], k * 3);
      if (uv) uv.set([e / uvScale, no / uvScale], k * 2);
    }
  const idx = new Uint32Array((m - 1) * (m - 1) * 6);
  let p = 0;
  for (let j = 0; j < m - 1; j++)
    for (let i = 0; i < m - 1; i++) {
      const a = j * m + i;
      idx.set([a, a + m, a + 1, a + 1, a + m, a + m + 1], p);
      p += 6;
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (uv) g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  return g;
}

/** Uint8 visibility grid -> linear-filtered texture. */
function visTexture(n, data = new Uint8Array(n * n).fill(255)) {
  const t = new THREE.DataTexture(data, n, n, THREE.RedFormat, THREE.UnsignedByteType);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** Distant-ridge shadows: per-vertex lookup of the worker's Sun visibility grids. Shadow maps handle rocks. */
function addTerrainShadow(material, shared) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uVisMid; uniform sampler2D uVisFar;
        uniform float uMidSize; uniform float uFarSize; uniform float uVisMidN; uniform float uVisFarN;
        varying float vSunVis;
        // Texel-centre aligned lookup: grid node j sits at texture coord (j + 0.5) / n.
        vec2 hz_uv(vec2 en, float size, float n){
          vec2 g = vec2(en.x / size + 0.5, 0.5 - en.y / size) * (n - 1.0);
          return (g + 0.5) / n;
        }`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec3 wp = (modelMatrix * vec4(transformed, 1.0)).xyz;
          vec2 en = vec2(wp.x, -wp.z);
          vSunVis = max(abs(en.x), abs(en.y)) < uMidSize * 0.499
            ? texture2D(uVisMid, hz_uv(en, uMidSize, uVisMidN)).r
            : texture2D(uVisFar, hz_uv(en, uFarSize, uVisFarN)).r;
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vSunVis;')
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        reflectedLight.directDiffuse *= vSunVis; reflectedLight.directSpecular *= vSunVis;`,
      );
  };
}

/** Rocks sit at the viewer, so they share the viewer's Sun visibility. */
function addViewerShadow(material, shared) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uViewerSunVis = shared.uViewerSunVis;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uViewerSunVis;')
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        reflectedLight.directDiffuse *= uViewerSunVis; reflectedLight.directSpecular *= uViewerSunVis;`,
      );
  };
}

function makeRocks(nearDetailed, groundM, rand, count, shared) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#86827b', roughness: 0.95, flatShading: true });
  addViewerShadow(mat, shared);
  const variants = 4;
  for (let v = 0; v < variants; v++) {
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const p = geo.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const s = 0.7 + rand() * 0.6;
      p.setXYZ(k, p.getX(k) * s, p.getY(k) * s * 0.65, p.getZ(k) * s);
    }
    geo.computeVertexNormals();
    const mesh = new THREE.InstancedMesh(geo, mat, Math.ceil(count / variants));
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (let k = 0; k < mesh.count; k++) {
      const r = 3 + Math.sqrt(rand()) * 300;
      const a = rand() * Math.PI * 2;
      const e = Math.sin(a) * r;
      const no = Math.cos(a) * r;
      const s = Math.min(1.4, 0.06 * Math.pow(rand() + 0.02, -0.75));
      const y = sampleLayer(nearDetailed, e, no) - groundM - s * 0.3;
      q.setFromEuler(new THREE.Euler((rand() - 0.5) * 0.4, rand() * Math.PI * 2, (rand() - 0.5) * 0.4));
      m4.compose(new THREE.Vector3(e, y, -no), q, new THREE.Vector3(s, s, s));
      mesh.setMatrixAt(k, m4);
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

function makeEarthTexture(rand) {
  const W = 512;
  const H = 256;
  const land = tileNoise(rand, 8);
  const land2 = tileNoise(rand, 32);
  const cloud = tileNoise(rand, 16);
  const cloud2 = tileNoise(rand, 64);
  const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const v = y / H;
      const lat = Math.abs(v - 0.5) * 2;
      const l = land(u * 8, v * 4) * 0.7 + land2(u * 32, v * 16) * 0.3;
      const c = cloud(u * 16, v * 8) * 0.6 + cloud2(u * 64, v * 32) * 0.4;
      let col = [18, 52, 110];
      if (l > 0.58) col = l > 0.68 ? [150, 128, 90] : [70, 105, 60];
      if (lat > 0.85) col = [235, 240, 245];
      const cl = Math.max(0, Math.min(1, (c - 0.55) * 4));
      const k = (y * W + x) * 4;
      for (let ch = 0; ch < 3; ch++) data[k + ch] = col[ch] * (1 - cl) + 245 * cl;
      data[k + 3] = 255;
    }
  const t = new THREE.DataTexture(data, W, H);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, 'rgba(255,255,250,1)');
  grd.addColorStop(0.08, 'rgba(255,250,235,0.55)');
  grd.addColorStop(0.3, 'rgba(255,240,210,0.08)');
  grd.addColorStop(1, 'rgba(255,240,210,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class HorizonScene {
  constructor(container, { mobile = false } = {}) {
    this.container = container;
    this.mobile = mobile;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.maxPixelRatio = Math.min(window.devicePixelRatio, mobile ? 1.5 : 2);
    this.pixelRatio = this.maxPixelRatio;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false; // re-rendered only when the Sun moves
    this.renderer.autoClear = false;
    container.appendChild(this.renderer.domElement);

    // Two depth ranges instead of a logarithmic depth buffer (keeps early-z):
    // pass 1 draws mid/far terrain (layer 1), pass 2 draws near terrain + rocks (layer 0).
    // Valid because everything on layer 0 lies within ~1.5 km and is always in front of layer 1.
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.05, 4000);
    this.camera.position.set(0, 2, 0);
    this.farCamera = new THREE.PerspectiveCamera(60, 1, 20, 400000);
    this.farCamera.layers.set(1);
    this.skyCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    this.scene = new THREE.Scene();
    this.sky = new THREE.Scene();
    this.sky.background = new THREE.Color('#000');

    this.sunLight = new THREE.DirectionalLight(0xffffff, SUN_INTENSITY);
    this.sunLight.castShadow = true;
    const sc = this.sunLight.shadow.camera;
    sc.left = sc.bottom = -180;
    sc.right = sc.top = 180;
    sc.near = 10;
    sc.far = 8000;
    this.sunLight.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
    this.sunLight.shadow.bias = -0.0004;
    this.sunLight.shadow.normalBias = 0.06;
    this.sunLight.layers.enableAll();
    this.scene.add(this.sunLight, this.sunLight.target);
    this.earthLight = new THREE.DirectionalLight(0xbcd4ff, 0.02);
    this.earthLight.layers.enableAll();
    this.scene.add(this.earthLight, this.earthLight.target);
    // Very faint fill so shadowed ground isn't pure black (stand-in for scattered light).
    const fill = new THREE.HemisphereLight(0x9aa6b8, 0x000000, 0.09);
    fill.layers.enableAll();
    this.scene.add(fill);
    this.shadowUniforms = {
      uVisMid: { value: visTexture(1) },
      uVisFar: { value: visTexture(1) },
      uVisMidN: { value: 1 },
      uVisFarN: { value: 1 },
      uMidSize: { value: 16000 },
      uFarSize: { value: 300000 },
      uViewerSunVis: { value: 0 },
    };
    this.worker = new Worker(new URL('./sunVisibility.worker.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e) => this.#onVisibility(e.data);
    this.visState = { inFlight: false, az: null, el: null, id: 0 };
    this.dirty = true;
    this.stats = { fps: 0, pixelRatio: this.pixelRatio, visMs: 0, rendering: false };
    this._perf = { acc: 0, frames: 0, lastCheck: 0 };
    this._lastQuat = new THREE.Quaternion(2, 0, 0, 0);
    this._lastFov = 0;
    this._shadowAt = null;

    this.#buildSky();

    // View state: azimuth/elevation in degrees (drag) or device quaternion (motion).
    this.yaw = 180;
    this.pitch = 2;
    this.fov = 60;
    this.yawOffset = 0; // added to the device yaw in motion mode
    this.deviceQuat = null;
    this.follow = null; // 'sun' | 'earth' | null
    this.bodies = { sun: dirFromAzEl(0, -10), earth: dirFromAzEl(0, -10) };
    this.onFrame = null;
    this._targetQuat = new THREE.Quaternion();

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    this.timer = new THREE.Timer();
    this.renderer.setAnimationLoop(() => this.#tick());
  }

  #buildSky() {
    const rand = mulberry32(42);
    const N = 5000;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    for (let k = 0; k < N; k++) {
      const u = rand() * 2 - 1;
      const a = rand() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      pos.set([s * Math.cos(a) * 50, u * 50, s * Math.sin(a) * 50], k * 3);
      const b = 0.25 + Math.pow(rand(), 4) * 0.9;
      const tint = rand();
      col.set([b * (tint > 0.8 ? 1 : 0.85), b * 0.9, b * (tint < 0.3 ? 1 : 0.85)], k * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, toneMapped: false }));
    this.sky.add(this.stars);

    const sunR = SKY_DIST * Math.tan(SUN_RADIUS_DEG * D2R);
    this.sunDisk = new THREE.Mesh(new THREE.SphereGeometry(sunR, 32, 16), new THREE.MeshBasicMaterial({ color: '#fffdf6', toneMapped: false }));
    this.sunGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffffff', blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    const bodyScale = this.mobile ? MOBILE_BODY_SCALE : { sun: 1, earth: 1 };
    this.sunDisk.scale.setScalar(bodyScale.sun);
    this.sunGlow.scale.setScalar(SKY_DIST * Math.tan(9 * D2R) * Math.sqrt(bodyScale.sun));
    this.sky.add(this.sunDisk, this.sunGlow);

    this.earthUniforms = { map: { value: makeEarthTexture(mulberry32(7)) }, sunDir: { value: new THREE.Vector3(1, 0, 0) } };
    const earthMat = new THREE.ShaderMaterial({
      uniforms: this.earthUniforms,
      vertexShader: `varying vec3 vN; varying vec2 vUv;
        void main(){ vN = normalize(mat3(modelMatrix) * normal); vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform sampler2D map; uniform vec3 sunDir; varying vec3 vN; varying vec2 vUv;
        void main(){ vec3 c = texture2D(map, vUv).rgb; float l = max(dot(normalize(vN), sunDir), 0.0);
          vec3 col = c * (l * 1.6 + 0.015); gl_FragColor = vec4(pow(col, vec3(1.0/2.2)), 1.0); }`,
    });
    this.earth = new THREE.Mesh(new THREE.SphereGeometry(SKY_DIST * Math.tan(EARTH_RADIUS_DEG * D2R), 48, 24), earthMat);
    this.earth.rotation.z = 0.4;
    this.earth.scale.setScalar(bodyScale.earth);
    this.sky.add(this.earth);
  }

  /** Build terrain meshes from getHorizonTerrain() output. */
  setTerrain(terrain) {
    if (this.terrainGroup) {
      this.scene.remove(this.terrainGroup);
      this.terrainGroup.traverse((o) => {
        o.geometry?.dispose();
        o.material?.dispose?.();
      });
    }
    const rand = mulberry32(hashStr(terrain.siteId));
    const { near, mid, far } = terrain.layers;
    const groundM = terrain.groundM;
    const tex = makeRegolithTextures(rand);
    const nearDetailed = addNearDetail(near, rand);

    const group = new THREE.Group();
    const nearMat = new THREE.MeshStandardMaterial({ color: REGOLITH, roughness: 1, metalness: 0, map: tex.map, normalMap: tex.normalMap });
    nearMat.normalScale.set(1.2, 1.2);
    const midMat = new THREE.MeshStandardMaterial({ color: REGOLITH, roughness: 1, metalness: 0, map: tex.map, normalMap: tex.normalMap });
    midMat.normalScale.set(0.6, 0.6);
    const farMat = new THREE.MeshStandardMaterial({ color: REGOLITH, roughness: 1, metalness: 0 });
    const shared = this.shadowUniforms;
    shared.uMidSize.value = mid.sizeM;
    shared.uFarSize.value = far.sizeM;
    for (const m of [nearMat, midMat, farMat]) addTerrainShadow(m, shared);
    // Hand heights to the visibility worker (copies; the main thread keeps its own).
    this.worker.postMessage({ type: 'terrain', mid: { ...mid, heights: Float32Array.from(mid.heights) }, far: { ...far, heights: Float32Array.from(far.heights) } });
    this.visState.az = null;

    const nearMesh = new THREE.Mesh(gridGeometry(nearDetailed, { groundM, uvScale: 6 }), nearMat);
    nearMesh.receiveShadow = true; // ground does not cast: grazing Sun makes ground self-shadow acne; ridges handled in shader
    const midMesh = new THREE.Mesh(
      gridGeometry(mid, { groundM, stride: this.mobile ? 2 : 1, hole: near.sizeM / 2 - 0.5 * mid.spacingM, holeDrop: 6, uvScale: 90 }),
      midMat,
    );
    midMesh.layers.set(1);
    const farMesh = new THREE.Mesh(gridGeometry(far, { groundM, hole: mid.sizeM / 2 - 0.5 * far.spacingM, holeDrop: 400 }), farMat);
    farMesh.layers.set(1);
    group.add(nearMesh, midMesh, farMesh, makeRocks(nearDetailed, groundM, rand, this.mobile ? 900 : 2000, shared));
    this.scene.add(group);
    this.terrainGroup = group;
    this.camera.position.set(0, sampleLayer(nearDetailed, 0, 0) - groundM + terrain.eyeHeightM, 0);
    this.farCamera.position.copy(this.camera.position);
    this.renderer.shadowMap.needsUpdate = true;
    this.dirty = true;
    this.#requestVisibility();
  }

  /** Ask the worker for a new visibility grid if the Sun moved and none is in flight. */
  #requestVisibility() {
    const v = this.visState;
    const b = this.bodies;
    if (v.inFlight || b.sunAz == null || !this.terrainGroup) return;
    if (v.az != null && Math.abs(((b.sunAz - v.az + 540) % 360) - 180) < 0.05 && Math.abs(b.sunEl - v.el) < 0.01) return;
    v.inFlight = true;
    v.sentAt = performance.now();
    this.worker.postMessage({ type: 'sun', id: ++v.id, az: b.sunAz, el: b.sunEl, midStride: 2, farStride: 2 });
  }

  #onVisibility({ az, el, mid, far }) {
    const v = this.visState;
    Object.assign(v, { inFlight: false, az, el });
    this.stats.visMs = Math.round(performance.now() - v.sentAt);
    const u = this.shadowUniforms;
    for (const [key, grid] of [['Mid', mid], ['Far', far]]) {
      const tex = u['uVis' + key].value;
      if (tex.image.width === grid.n) {
        tex.image.data.set(grid.data);
        tex.needsUpdate = true;
      } else {
        tex.dispose();
        u['uVis' + key].value = visTexture(grid.n, grid.data);
        u['uVis' + key + 'N'].value = grid.n;
      }
    }
    this.dirty = true;
    this.#requestVisibility(); // catch up if the Sun moved meanwhile
  }

  /** @param {{sunAz, sunEl, sunFrac, earthAz, earthEl}} s positions (deg) and visible Sun fraction */
  setBodies({ sunAz, sunEl, sunFrac, earthAz, earthEl }) {
    const b = this.bodies;
    if (b.sunAz === sunAz && b.sunEl === sunEl && b.earthAz === earthAz && b.earthEl === earthEl) return;
    this.dirty = true;
    const sun = dirFromAzEl(sunAz, sunEl);
    const earth = dirFromAzEl(earthAz, earthEl);
    this.bodies = { sun, earth, sunAz, sunEl, earthAz, earthEl };
    this.sunDisk.position.copy(sun).multiplyScalar(SKY_DIST);
    this.sunGlow.position.copy(this.sunDisk.position);
    this.earth.position.copy(earth).multiplyScalar(SKY_DIST);
    this.earthUniforms.sunDir.value.copy(sun);
    this.sunLight.position.copy(sun).multiplyScalar(4000);
    // Terrain shadowing is per-vertex in the shader; rocks use the viewer's visibility.
    this.sunLight.intensity = SUN_INTENSITY; // visibility (incl. below-0° Sun over a dipped horizon) comes from the march
    this.shadowUniforms.uViewerSunVis.value = sunFrac;
    const s0 = this._shadowAt;
    if (!s0 || Math.abs(sunAz - s0.az) + Math.abs(sunEl - s0.el) > 0.02) {
      this._shadowAt = { az: sunAz, el: sunEl };
      this.renderer.shadowMap.needsUpdate = true;
    }
    this.#requestVisibility();
    this.earthLight.position.copy(earth).multiplyScalar(4000);
    const earthPhase = (1 - sun.dot(earth)) / 2; // ~1 when Earth is "full" seen from the Moon
    this.earthLight.intensity = 0.04 * earthPhase * (earthEl > -1 ? 1 : 0);
  }

  setDeviceQuaternion(q) {
    this.deviceQuat = q;
  }

  /** Motion on: keep the current view azimuth by offsetting device yaw. */
  enableMotion(q) {
    this.deviceQuat = q;
    this.yawOffset = this.yaw - this.#deviceYaw(q);
  }

  disableMotion() {
    if (this.deviceQuat) {
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      this.yaw = (Math.atan2(fwd.x, -fwd.z) / D2R + 360) % 360;
      this.pitch = Math.asin(THREE.MathUtils.clamp(fwd.y, -1, 1)) / D2R;
    }
    this.deviceQuat = null;
  }

  #deviceYaw(q) {
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    return Math.atan2(fwd.x, -fwd.z) / D2R;
  }

  /** Drag: dx/dy in pixels. */
  drag(dx, dy) {
    const k = this.fov / this.container.clientHeight;
    this.follow = null;
    if (this.deviceQuat) this.yawOffset -= dx * k;
    else {
      this.yaw = (this.yaw - dx * k + 360) % 360;
      this.pitch = THREE.MathUtils.clamp(this.pitch + dy * k, -60, 85);
    }
  }

  zoom(factor) {
    this.fov = THREE.MathUtils.clamp(this.fov * factor, 15, 90);
  }

  setFollow(body) {
    this.follow = body;
    this._followStartDeviceYaw = this.deviceQuat ? this.#deviceYaw(this.deviceQuat) : null;
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    for (const c of [this.camera, this.farCamera, this.skyCamera]) {
      c.aspect = w / h;
      c.updateProjectionMatrix();
    }
    this.dirty = true;
  }

  /** Screen position (px) of a direction, plus whether it is in front/in view. */
  project(dir) {
    const { clientWidth: w, clientHeight: h } = this.container;
    const v = dir.clone().multiplyScalar(SKY_DIST).project(this.skyCamera);
    const camSpace = dir.clone().applyQuaternion(this.skyCamera.quaternion.clone().invert());
    const front = camSpace.z < 0;
    const x = (v.x * 0.5 + 0.5) * w;
    const y = (-v.y * 0.5 + 0.5) * h;
    return { x, y, front, inView: front && x >= 0 && x <= w && y >= 0 && y <= h, camX: camSpace.x, camY: camSpace.y };
  }

  #tick() {
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.1);
    this.onBeforeFrame?.(dt);
    const lerp = 1 - Math.pow(0.0005, dt); // frame-rate independent smoothing

    if (this.follow && this.bodies[this.follow + 'Az'] != null) {
      const az = this.bodies[this.follow + 'Az'];
      const el = this.bodies[this.follow + 'El'];
      if (this.deviceQuat) {
        const dy = this.#deviceYaw(this.deviceQuat);
        if (Math.abs(((dy - this._followStartDeviceYaw + 540) % 360) - 180) > 25) this.follow = null;
        else this.yawOffset = az - dy;
      } else {
        const d = ((az - this.yaw + 540) % 360) - 180;
        this.yaw = (this.yaw + d * lerp + 360) % 360;
        this.pitch += (el - this.pitch) * lerp;
      }
    }

    if (this.deviceQuat) {
      const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -this.yawOffset * D2R);
      this._targetQuat.copy(yawQ).multiply(this.deviceQuat);
      this.camera.quaternion.slerp(this._targetQuat, 1 - Math.pow(0.002, dt));
    } else {
      this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch * D2R, -this.yaw * D2R, 0, 'YXZ'));
    }
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.farCamera.fov = this.skyCamera.fov = this.fov;
      this.camera.updateProjectionMatrix();
      this.farCamera.updateProjectionMatrix();
      this.skyCamera.updateProjectionMatrix();
    }
    this.skyCamera.quaternion.copy(this.camera.quaternion);
    this.farCamera.quaternion.copy(this.camera.quaternion);

    // Render on demand: skip the frame when neither the view nor the scene changed.
    const moved = this.camera.quaternion.angleTo(this._lastQuat) > 2e-4 || this.fov !== this._lastFov;
    if (!moved && !this.dirty) {
      this.stats.rendering = false;
      this._perf.lastCheck = 0;
      return;
    }
    this._lastQuat.copy(this.camera.quaternion);
    this._lastFov = this.fov;
    this.dirty = false;
    this.stats.rendering = true;

    this.renderer.clear();
    this.renderer.render(this.sky, this.skyCamera);
    this.renderer.clearDepth();
    const shadowUpdate = this.renderer.shadowMap.needsUpdate;
    this.renderer.shadowMap.needsUpdate = false; // shadow casters (rocks) are only in the near pass
    this.renderer.render(this.scene, this.farCamera);
    this.renderer.clearDepth();
    this.renderer.shadowMap.needsUpdate = shadowUpdate;
    this.renderer.render(this.scene, this.camera);
    this.#adaptResolution(dt);

    if (this.onFrame) {
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      this.onFrame({
        az: (Math.atan2(fwd.x, -fwd.z) / D2R + 360) % 360,
        el: Math.asin(THREE.MathUtils.clamp(fwd.y, -1, 1)) / D2R,
        fov: this.fov,
        sun: this.project(this.bodies.sun),
        earth: this.project(this.bodies.earth),
        follow: this.follow,
      });
    }
  }

  /** Lower pixel density when frames are slow (continuous rendering only), raise it back when fast. */
  #adaptResolution(dt) {
    const p = this._perf;
    const now = performance.now();
    if (!p.lastCheck) {
      Object.assign(p, { lastCheck: now, acc: 0, frames: 0 });
      return;
    }
    p.acc += dt;
    p.frames++;
    if (now - p.lastCheck < 1000) return;
    const frameMs = (p.acc / p.frames) * 1000;
    this.stats.fps = Math.round(1000 / frameMs);
    let pr = this.pixelRatio;
    if (frameMs > 26 && pr > 0.75) pr = Math.max(0.75, pr - 0.25);
    else if (frameMs < 17.5 && pr < this.maxPixelRatio) pr = Math.min(this.maxPixelRatio, pr + 0.25);
    if (pr !== this.pixelRatio) {
      this.pixelRatio = pr;
      this.renderer.setPixelRatio(pr);
      this.resize();
    }
    this.stats.pixelRatio = pr;
    Object.assign(p, { lastCheck: now, acc: 0, frames: 0 });
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.worker.terminate();
    this.ro.disconnect();
    this.scene.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose?.();
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}

/** DeviceOrientation (deg) + screen angle → camera quaternion (y up, −z = device "north"). */
export function deviceQuaternion(alpha, beta, gamma, screenDeg) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(beta * D2R, alpha * D2R, -gamma * D2R, 'YXZ'));
  q.multiply(new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5))); // camera looks out the back of the device
  q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -screenDeg * D2R));
  return q;
}
