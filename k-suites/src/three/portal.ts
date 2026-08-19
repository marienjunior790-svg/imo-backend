import * as THREE from 'three';

export type PortalHandle = {
  setScroll: (t: number) => void;
  setPointer: (x: number, y: number) => void;
  destroy: () => void;
};

export function createPortal(canvas: HTMLCanvasElement, opts: { reduced: boolean; mobile: boolean }): PortalHandle {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !opts.mobile, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, opts.mobile ? 1.2 : 1.6));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 40);
  camera.position.set(0, 1.2, 6);

  const mat = new THREE.MeshStandardMaterial({
    color: 0x9c8158,
    metalness: 0.72,
    roughness: 0.32,
  });
  const group = new THREE.Group();
  const mk = (w: number, h: number, d: number, x: number, y: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, 0);
    group.add(m);
  };
  mk(0.12, 3.2, 0.12, -1.15, 0.4);
  mk(0.12, 3.2, 0.12, 1.15, 0.4);
  mk(2.42, 0.12, 0.12, 0, 2.06);
  mk(2.5, 0.08, 0.35, 0, -1.22);
  scene.add(group);

  scene.add(new THREE.HemisphereLight(0xf4ece0, 0x1a1612, 0.7));
  const key = new THREE.DirectionalLight(0xfff6e8, 1.2);
  key.position.set(3, 4, 5);
  scene.add(key);
  const warm = new THREE.PointLight(0xc4a574, 1.3, 12);
  warm.position.set(-2, 1.5, 3);
  scene.add(warm);

  let scroll = 0;
  let px = 0;
  let py = 0;
  let raf = 0;
  let live = true;

  const resize = () => {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);

  const loop = () => {
    if (!live) return;
    const t = scroll;
    const z = 6 - t * 5.2;
    camera.position.z = Math.max(0.8, z);
    camera.position.x = px * 0.4;
    camera.position.y = 1.15 + py * 0.25;
    camera.lookAt(0, 0.4, 0);
    group.rotation.y = opts.reduced ? 0 : px * 0.15;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  return {
    setScroll: (t) => {
      scroll = Math.min(1, Math.max(0, t));
    },
    setPointer: (x, y) => {
      px += (x - px) * 0.08;
      py += (y - py) * 0.08;
    },
    destroy: () => {
      live = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      renderer.dispose();
    },
  };
}
