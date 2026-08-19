import * as THREE from 'three';

export type ItcSceneHandle = {
  setScroll: (t: number) => void;
  setPointer: (nx: number, ny: number) => void;
  setGyro: (beta: number, gamma: number) => void;
  destroy: () => void;
};

type Opts = { reduced: boolean; mobile: boolean };

export function createItcScene(canvas: HTMLCanvasElement, opts: Opts): ItcSceneHandle {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !opts.mobile,
    alpha: true,
    powerPreference: opts.mobile ? 'low-power' : 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, opts.mobile ? 1.25 : 1.75));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x07090d, 0.045);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 80);
  camera.position.set(0, 1.4, 9);

  const root = new THREE.Group();
  scene.add(root);

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x121821,
    metalness: 0.42,
    roughness: 0.48,
  });
  const goldMat = new THREE.LineBasicMaterial({
    color: 0xb89a6a,
    transparent: true,
    opacity: 0.55,
  });
  const occupiedMat = new THREE.MeshBasicMaterial({
    color: 0xc4ae86,
    transparent: true,
    opacity: 0.0,
  });
  const vacantMat = new THREE.MeshBasicMaterial({
    color: 0x8ab4c8,
    transparent: true,
    opacity: 0.0,
  });

  const floors = opts.mobile ? 8 : 12;
  const slabs: THREE.Object3D[] = [];

  const podium = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.18, 2.1), bodyMat);
  podium.position.y = -1.72;
  root.add(podium);
  addEdges(podium, goldMat);

  for (let i = 0; i < floors; i++) {
    const w = 1.55 - (i > 8 ? 0.12 : 0);
    const d = 1.15 - (i % 3 === 0 ? 0.08 : 0);
    const h = 0.22;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bodyMat);
    mesh.position.y = -1.45 + i * 0.26;
    root.add(mesh);
    addEdges(mesh, goldMat);
    slabs.push(mesh);

    const winGeo = new THREE.PlaneGeometry(0.12, 0.09);
    const cols = opts.mobile ? 3 : 4;
    for (let c = 0; c < cols; c++) {
      const occupied = (i * cols + c) % 8 !== 0;
      const pane = new THREE.Mesh(winGeo, occupied ? occupiedMat : vacantMat);
      pane.position.set(-w / 2 + 0.28 + c * 0.32, 0, d / 2 + 0.012);
      mesh.add(pane);
    }
  }

  const coreMat = new THREE.MeshStandardMaterial({
    color: 0xb89a6a,
    emissive: 0xb89a6a,
    emissiveIntensity: 0.35,
    metalness: 0.8,
    roughness: 0.25,
    transparent: true,
    opacity: 0.15,
  });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), coreMat);
  core.position.y = 0.2;
  root.add(core);

  const hemi = new THREE.HemisphereLight(0x8aa0b8, 0x08090d, 0.55);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xf0ebe3, 1.15);
  key.position.set(4, 6, 5);
  scene.add(key);
  const gold = new THREE.PointLight(0xc4ae86, 1.4, 18, 2);
  gold.position.set(-2.4, 2.2, 3.2);
  scene.add(gold);
  const rim = new THREE.PointLight(0x4a6280, 0.8, 16);
  rim.position.set(3, -1, -4);
  scene.add(rim);

  let scroll = 0;
  let px = 0;
  let py = 0;
  let gx = 0;
  let gy = 0;
  let raf = 0;
  let running = true;

  const resize = () => {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);

  const tick = () => {
    if (!running) return;
    const t = scroll;
    const explode = smooth(clamp((t - 0.28) / 0.16));
    const intel = smooth(clamp((t - 0.46) / 0.16));
    const control = smooth(clamp((t - 0.64) / 0.14));
    const finale = smooth(clamp((t - 0.8) / 0.16));

    slabs.forEach((s, i) => {
      s.position.y = -1.45 + i * 0.26 + explode * i * 0.055;
    });

    const winOp = 0.05 + explode * 0.72;
    occupiedMat.opacity = winOp;
    vacantMat.opacity = winOp * 0.9;

    coreMat.opacity = 0.12 + intel * 0.75;
    coreMat.emissiveIntensity = 0.3 + intel * 1.8;
    core.rotation.y += opts.reduced ? 0 : 0.006 + intel * 0.01;

    const dist = 9.2 - t * 2.4 - explode * 0.8 + finale * 1.6;
    const yaw = t * 0.9 + px * 0.35 + gx * 0.4;
    const pitch = 0.18 - t * 0.12 + py * 0.2 + gy * 0.25;
    camera.position.x = Math.sin(yaw) * dist;
    camera.position.z = Math.cos(yaw) * dist;
    camera.position.y = 1.15 + pitch * 2.2 + intel * 0.4;
    camera.lookAt(0, -0.1 + explode * 0.4, 0);

    gold.intensity = 1.1 + intel * 1.6 + Math.sin(performance.now() * 0.0012) * 0.15;
    gold.position.x = -2.2 + Math.sin(t * 6) * 1.4;
    root.rotation.y = opts.reduced ? 0.35 : 0.15 + t * 0.25 + control * 0.2;

    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return {
    setScroll: (t) => {
      scroll = clamp(t);
    },
    setPointer: (nx, ny) => {
      px += (nx - px) * 0.08;
      py += (ny - py) * 0.08;
    },
    setGyro: (beta, gamma) => {
      gx = clamp(gamma / 45) * 0.6;
      gy = clamp(beta / 45) * 0.4;
    },
    destroy: () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      renderer.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const m = obj.material;
          if (Array.isArray(m)) m.forEach((x) => x.dispose());
          else m.dispose();
        }
      });
    },
  };
}

function addEdges(mesh: THREE.Mesh, mat: THREE.LineBasicMaterial) {
  const lines = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 18), mat);
  mesh.add(lines);
}

function clamp(n: number) {
  return Math.min(1, Math.max(0, n));
}

function smooth(n: number) {
  return n * n * (3 - 2 * n);
}
