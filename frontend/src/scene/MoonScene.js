import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as C from './config.js';
import { latLonToMeshLocal } from '../utils/coords.js';

// Textures are cached across mounts so navigating away from and back to the globe route is instant.
// Each entry: { texture, ready: Promise<void> }.
const textureCache = new Map();
const textureLoader = new THREE.TextureLoader();
function loadTexture(name, srgb, anisotropy) {
  if (!textureCache.has(name)) {
    let texture;
    const ready = new Promise((resolve, reject) => {
      texture = textureLoader.load(C.TEXTURE_BASE + name, () => resolve(), undefined, () => reject(new Error(name)));
    });
    texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.anisotropy = anisotropy;
    texture.wrapS = THREE.RepeatWrapping;
    ready.catch(() => textureCache.delete(name));
    textureCache.set(name, { texture, ready });
  }
  return textureCache.get(name);
}

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * Imperative three.js globe. React owns the DOM container and marker elements;
 * this class owns WebGL and positions the registered marker elements every frame.
 */
export class MoonScene {
  constructor(container, { onLoadProgress, onLoaded, onError } = {}) {
    this.container = container;
    this.markers = new Map(); // id -> { el, local: Vector3 }
    this.flight = null;
    this.shift = { current: 0, target: 0 }; // horizontal view shift (px) so the globe centres between side panels

    const renderer = (this.renderer = new THREE.WebGLRenderer({ antialias: true }));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = C.EXPOSURE;
    container.appendChild(renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);

    this.camera = new THREE.PerspectiveCamera(35, 1, 0.01, 200);
    this.camera.position.copy(this.#viewPosition(C.DEFAULT_VIEW.lat, C.DEFAULT_VIEW.lon, C.DEFAULT_VIEW.distance));

    const controls = (this.controls = new OrbitControls(this.camera, renderer.domElement));
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 1.15;
    controls.maxDistance = 12;
    controls.zoomSpeed = 0.8;
    controls.enablePan = false;
    controls.addEventListener('change', () => {
      const d = this.camera.position.length();
      controls.rotateSpeed = THREE.MathUtils.clamp((d - 1) * 0.4, 0.03, 0.5);
    });

    // Sun — the only light; no ambient on purpose.
    const sun = new THREE.DirectionalLight(0xffffff, C.SUN_INTENSITY);
    const az = THREE.MathUtils.degToRad(C.SUN_AZIMUTH);
    const el = THREE.MathUtils.degToRad(C.SUN_ELEVATION);
    sun.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(5);
    this.scene.add(sun, sun.target);

    this.scene.add(this.#makeStars());

    // Moon
    const aniso = renderer.capabilities.getMaxAnisotropy();
    const color = loadTexture('moon_color.jpg', true, aniso);
    const normal = loadTexture('moon_normal.png', false, aniso);
    const pending = [color, normal];
    this.material = new THREE.MeshStandardMaterial({
      map: color.texture,
      normalMap: normal.texture,
      normalScale: new THREE.Vector2(C.NORMAL_STRENGTH, C.NORMAL_STRENGTH),
      roughness: 1,
      metalness: 0,
    });
    if (C.RELIEF_EXAGGERATION > 0) {
      const disp = loadTexture('moon_disp.png', false, aniso);
      pending.push(disp);
      this.material.displacementMap = disp.texture;
      fetch(C.TEXTURE_BASE + 'moon_meta.json')
        .then((r) => r.json())
        .then((m) => {
          const k = C.RELIEF_EXAGGERATION / m.radiusKm;
          this.material.displacementScale = (m.maxKm - m.minKm) * k;
          this.material.displacementBias = m.minKm * k;
        });
    }
    let done = 0;
    for (const p of pending) p.ready.then(() => !this.disposed && onLoadProgress?.(++done / pending.length));
    Promise.all(pending.map((p) => p.ready)).then(
      () => !this.disposed && onLoaded?.(),
      (e) => !this.disposed && onError?.(e.message),
    );

    this.geometry = new THREE.SphereGeometry(1, ...C.SPHERE_SEGMENTS);
    this.moon = new THREE.Mesh(this.geometry, this.material);
    this.moon.rotation.y = -Math.PI / 2; // lon 0° faces +Z
    this.scene.add(this.moon);
    this.moon.updateMatrixWorld();

    this.resizeObserver = new ResizeObserver(() => this.#resize());
    this.resizeObserver.observe(container);
    this.#resize();

    this.clock = new THREE.Clock();
    renderer.setAnimationLoop(() => this.#tick());
  }

  /** Camera position looking straight down at (lat, lon) from `distance`. */
  #viewPosition(lat, lon, distance) {
    return new THREE.Vector3(...latLonToMeshLocal(lat, lon, distance)).applyEuler(this.moon?.rotation ?? new THREE.Euler(0, -Math.PI / 2, 0));
  }

  #makeStars() {
    const n = 4000;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(90);
      pos.set([v.x, v.y, v.z], i * 3);
      const b = 0.25 + Math.random() ** 3 * 0.75;
      col.set([b, b, b * (0.9 + Math.random() * 0.2)], i * 3);
    }
    const g = (this.starGeometry = new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.starMaterial = new THREE.PointsMaterial({ size: 1.4, sizeAttenuation: false, vertexColors: true, toneMapped: false });
    return new THREE.Points(g, this.starMaterial);
  }

  #resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.shift.applied = false;
  }

  registerMarker(id, lat, lon, el) {
    if (!el) {
      this.markers.delete(id);
      return;
    }
    const local = new THREE.Vector3(...latLonToMeshLocal(lat, lon, 1.001));
    this.markers.set(id, { el, local });
  }

  /** Smoothly orbit the camera to look down on (lat, lon). */
  flyTo(lat, lon, distance = C.FOCUS_DISTANCE) {
    const from = this.camera.position.clone();
    const to = this.#viewPosition(lat, lon, distance);
    this.flight = {
      start: performance.now(),
      fromDir: from.clone().normalize(),
      toDir: to.clone().normalize(),
      fromDist: from.length(),
      toDist: distance,
    };
    this.controls.enabled = false;
  }

  /** Pixels covered by UI on the left/right; the globe's centre moves into the remaining space. */
  setInsets(left = 0, right = 0) {
    this.shift.target = (right - left) / 2;
  }

  #applyShift() {
    const s = this.shift;
    if (Math.abs(s.target - s.current) < 0.5 && s.applied) return;
    s.current += (s.target - s.current) * 0.15;
    if (Math.abs(s.target - s.current) < 0.5) s.current = s.target;
    s.applied = true;
    const { clientWidth: w, clientHeight: h } = this.container;
    const d = s.current;
    if (Math.abs(d) < 0.5) this.camera.clearViewOffset();
    else this.camera.setViewOffset(w + 2 * Math.abs(d), h, d > 0 ? 2 * d : 0, 0, w, h);
  }

  resetView() {
    this.flyTo(C.DEFAULT_VIEW.lat, C.DEFAULT_VIEW.lon, C.DEFAULT_VIEW.distance);
  }

  #tick() {
    if (this.flight) {
      const f = this.flight;
      const t = Math.min((performance.now() - f.start) / C.FLY_DURATION_MS, 1);
      const k = easeInOut(t);
      const q = new THREE.Quaternion().setFromUnitVectors(f.fromDir, f.toDir);
      const dir = f.fromDir.clone().applyQuaternion(new THREE.Quaternion().slerp(q, k));
      this.camera.position.copy(dir.multiplyScalar(THREE.MathUtils.lerp(f.fromDist, f.toDist, k)));
      this.camera.lookAt(0, 0, 0);
      if (t >= 1) {
        this.flight = null;
        this.controls.enabled = true;
      }
    }
    this.#applyShift();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.#updateMarkers();
  }

  #updateMarkers() {
    const { width, height } = this.renderer.domElement.getBoundingClientRect();
    const camPos = this.camera.position;
    const world = new THREE.Vector3();
    const toCam = new THREE.Vector3();
    for (const { el, local } of this.markers.values()) {
      world.copy(local).applyMatrix4(this.moon.matrixWorld);
      toCam.copy(camPos).sub(world).normalize();
      const facing = world.clone().normalize().dot(toCam);
      const visible = facing > 0.05;
      el.style.visibility = visible ? 'visible' : 'hidden';
      if (!visible) continue;
      world.project(this.camera);
      const x = (world.x * 0.5 + 0.5) * width;
      const y = (-world.y * 0.5 + 0.5) * height;
      el.style.transform = `translate(${x}px, ${y}px)`;
      el.style.opacity = String(Math.min(1, facing * 4));
    }
  }

  dispose() {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.geometry.dispose();
    this.material.dispose();
    this.starGeometry.dispose();
    this.starMaterial.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.markers.clear();
  }
}
