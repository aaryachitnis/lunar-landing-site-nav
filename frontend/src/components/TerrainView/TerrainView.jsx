import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './TerrainView.css';

const VERTICAL_EXAGGERATION = 2;
// Single-hue ramp (dark navy → pale ice blue) so relief reads as magnitude in the blue theme.
const LOW = new THREE.Color('#0d1a2b');
const HIGH = new THREE.Color('#d6e9ff');

/**
 * Bird's-eye 3D view of a local terrain patch (see data/SCHEMA.md → TerrainPatch).
 * Local frame: x = east, y = up, -z = north. Units: km.
 * @param {{ patch: object|null, sunAzimuth: number|null, loading: boolean }} props
 */
export default function TerrainView({ patch, sunAzimuth, loading }) {
  const hostRef = useRef(null);
  const ctxRef = useRef(null);
  const [showMesh, setShowMesh] = useState(true);

  // Renderer lifecycle
  useEffect(() => {
    const host = hostRef.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#000000');
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000);
    camera.position.set(0, 75, 55);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.6;
    controls.enablePan = false;
    controls.minDistance = 30;
    controls.maxDistance = 180;
    controls.maxPolarAngle = Math.PI * 0.45;
    controls.addEventListener('start', () => (controls.autoRotate = false));

    const sun = new THREE.DirectionalLight(0xffffff, 2.6);
    scene.add(sun, new THREE.HemisphereLight(0xffffff, 0x222222, 0.35));

    const group = new THREE.Group();
    scene.add(group);

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = host;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    renderer.setAnimationLoop(() => {
      controls.update();
      renderer.render(scene, camera);
    });

    ctxRef.current = { renderer, scene, camera, controls, sun, group };
    return () => {
      renderer.setAnimationLoop(null);
      ro.disconnect();
      controls.dispose();
      disposeGroup(group);
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      ctxRef.current = null;
    };
  }, []);

  // Rebuild mesh when the patch changes
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx || !patch) return;
    disposeGroup(ctx.group);
    const { n, sizeKm, heights, centerElevationM, minM, maxM } = patch;

    const geom = new THREE.PlaneGeometry(sizeKm, sizeKm, n - 1, n - 1);
    geom.rotateX(-Math.PI / 2); // row 0 (north edge) → -z
    const pos = geom.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const range = Math.max(maxM - minM, 1);
    for (let k = 0; k < pos.count; k++) {
      const hM = heights[k];
      pos.setY(k, ((hM - centerElevationM) / 1000) * VERTICAL_EXAGGERATION);
      c.copy(LOW).lerp(HIGH, (hM - minM) / range);
      colors.set([c.r, c.g, c.b], k * 3);
    }
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geom.computeVertexNormals();

    const surface = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }));
    const wire = new THREE.Mesh(
      geom,
      new THREE.MeshBasicMaterial({ color: 0x1ab2ff, wireframe: true, transparent: true, opacity: 0.28, depthWrite: false }),
    );
    wire.name = 'wire';
    wire.renderOrder = 1;

    // Site pin at the centre
    const pinMat = new THREE.MeshBasicMaterial({ color: 0x1ab2ff });
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 8, 8), pinMat);
    pin.position.y = 4;
    const head = new THREE.Mesh(new THREE.SphereGeometry(1.1, 16, 12), pinMat);
    head.position.y = 8.5;

    // North arrow at the north edge
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(1.6, 4, 12), new THREE.MeshBasicMaterial({ color: 0xe6f1ff }));
    arrow.rotation.x = -Math.PI / 2;
    arrow.position.set(0, (maxM - centerElevationM) / 1000 * VERTICAL_EXAGGERATION + 2, -sizeKm / 2 - 4);

    ctx.group.add(surface, wire, pin, head, arrow);
    ctx.wire = wire;
    wire.visible = showMesh;
  }, [patch]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (ctxRef.current?.wire) ctxRef.current.wire.visible = showMesh;
  }, [showMesh]);

  // Light from the current Sun azimuth (raised to 30° so relief stays readable).
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const az = THREE.MathUtils.degToRad(sunAzimuth ?? 135);
    const el = THREE.MathUtils.degToRad(30);
    ctx.sun.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).multiplyScalar(100);
  }, [sunAzimuth]);

  return (
    <div className="terrain-view">
      <div ref={hostRef} className="terrain-canvas" />
      {loading && <div className="terrain-overlay">Loading terrain…</div>}
      <div className="terrain-hud">
        <span>N ↑ arrow · {VERTICAL_EXAGGERATION}× vertical</span>
        <label>
          <input type="checkbox" checked={showMesh} onChange={(e) => setShowMesh(e.target.checked)} /> Mesh
        </label>
      </div>
    </div>
  );
}

function disposeGroup(group) {
  for (const obj of [...group.children]) {
    obj.geometry?.dispose();
    obj.material?.dispose();
    group.remove(obj);
  }
}
