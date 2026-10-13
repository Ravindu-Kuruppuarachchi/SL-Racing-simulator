// 3D landmarks for SL Racing: one beside each town on a route (the towns' landmarks in
// maps.js, drawn in 2D for Tuk Tuk Climb in landmarks.js). Each builder returns a group
// standing on y = 0, its front facing +z (the road side), in metres.
import * as THREE from 'three';

const mat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
const mesh = (geo, color, x = 0, y = 0, z = 0, extra) => {
  const m = new THREE.Mesh(geo, typeof color === 'number' ? mat(color, extra) : color);
  m.position.set(x, y, z);
  m.castShadow = false;
  return m;
};
const group = (...parts) => {
  const g = new THREE.Group();
  g.add(...parts);
  return g;
};

// ---- kits -----------------------------------------------------------------------------
// a granite outcrop: a lumpy dome or a sheer-sided column
function rock({ w = 50, h = 40, color = 0x9a8676, column = false, garden = false }) {
  const geo = column ? new THREE.CylinderGeometry(w * 0.42, w * 0.55, h, 9, 3) : new THREE.SphereGeometry(w / 2, 10, 7, 0, Math.PI * 2, 0, Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const k = 1 + Math.sin(pos.getX(i) * 0.37 + pos.getZ(i) * 0.51) * 0.06;
    pos.setX(i, pos.getX(i) * k);
    pos.setZ(i, pos.getZ(i) * k);
  }
  geo.computeVertexNormals();
  const r = mesh(geo, color, 0, column ? h / 2 : 0, 0);
  if (!column) r.scale.y = h / (w / 2);
  const g = group(r);
  if (garden) g.add(mesh(new THREE.CylinderGeometry(w * 0.43, w * 0.43, 1.5, 9), 0x6f9a48, 0, h + 0.6, 0));
  return g;
}

function stupa(r = 8, color = 0xf3f0e8) {
  const white = mat(color);
  return group(
    mesh(new THREE.CylinderGeometry(r * 1.2, r * 1.25, r * 0.25, 24), white, 0, r * 0.12, 0),
    mesh(new THREE.SphereGeometry(r, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), white, 0, r * 0.25, 0),
    mesh(new THREE.BoxGeometry(r * 0.4, r * 0.25, r * 0.4), white, 0, r * 1.35, 0),
    mesh(new THREE.ConeGeometry(r * 0.13, r * 0.9, 12), 0xd9c58a, 0, r * 1.9, 0),
  );
}

function waterfall({ h = 40, w = 8, twin = false, cliff = 0x4f7a52 }) {
  const g = group(mesh(new THREE.BoxGeometry(w * 6, h, 18), cliff, 0, h / 2, -6));
  const water = new THREE.MeshBasicMaterial({ color: 0xeef6f7, transparent: true, opacity: 0.9 });
  const falls = twin ? [-w * 0.9, w * 0.9] : [0];
  for (const x of falls) {
    g.add(mesh(new THREE.PlaneGeometry(w, h), water, x, h / 2, 3.1));
    g.add(mesh(new THREE.SphereGeometry(w * 0.9, 10, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }), x, 1, 4)); // spray
  }
  g.add(mesh(new THREE.CylinderGeometry(w * 2.5, w * 2.5, 0.4, 20), new THREE.MeshLambertMaterial({ color: 0x5d93a6 }), 0, 0.2, 8));
  return g;
}

function peak(h = 120, color = 0x6f8f8a, shrine = false) {
  const g = group(mesh(new THREE.ConeGeometry(h * 0.8, h, 7), color, 0, h / 2, 0));
  if (shrine) g.add(mesh(new THREE.BoxGeometry(4, 3, 4), 0xf3f0e8, 0, h - 1, 0));
  return g;
}

function tower({ h = 60, r = 3, color = 0xf7f7f2, cap = 0x2d2d2d }) {
  return group(mesh(new THREE.CylinderGeometry(r * 0.7, r, h, 12), color, 0, h / 2, 0), mesh(new THREE.CylinderGeometry(r * 0.9, r * 0.9, 3, 12), cap, 0, h + 1.5, 0));
}

function building({ w = 30, h = 12, d = 14, wall = 0xf3efe6, roof = 0xa8503a }) {
  return group(mesh(new THREE.BoxGeometry(w, h, d), wall, 0, h / 2, 0), mesh(new THREE.ConeGeometry(Math.hypot(w, d) / 2, h * 0.45, 4).rotateY(Math.PI / 4).scale(w / Math.hypot(w, d), 1, d / Math.hypot(w, d)), roof, 0, h + h * 0.22, 0));
}

function boats(n = 4, sail = 0xf0e6d0) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const b = group(mesh(new THREE.BoxGeometry(6, 0.8, 1.4), 0x5b3b22, 0, 0.4, 0), mesh(new THREE.ConeGeometry(2.4, 6, 3).scale(1, 1, 0.08), sail, 0.5, 3.6, 0));
    b.position.set((i - n / 2) * 12, 0, Math.sin(i * 2.3) * 8);
    b.rotation.y = i * 0.7;
    g.add(b);
  }
  return g;
}

const waterDisc = (r, color = 0x5d93a6) => mesh(new THREE.CylinderGeometry(r, r, 0.3, 24), new THREE.MeshLambertMaterial({ color }), 0, 0.15, 0);

// ---- the landmarks ----------------------------------------------------------------------
// dist: metres from the road; sea: stands out at sea on the coast
export const LANDMARKS3D = {
  bibleRock: { dist: 140, build: () => group(peak(60, 0x6f958c), (() => { const s = mesh(new THREE.BoxGeometry(70, 10, 30), 0x8ea8a6, 0, 62, 0); s.rotation.z = 0.06; return s; })()) },
  ambuluwawa: { dist: 120, build: () => group(peak(55, 0x5c8a4a), (() => { const t = tower({ h: 30, r: 2.4, color: 0xf6f3ea, cap: 0xf6f3ea }); t.position.y = 54; return t; })()) },
  rambodaFalls: { dist: 80, build: () => waterfall({ h: 60, w: 9 }) },
  postOffice: { dist: 45, build: () => group(building({ w: 28, h: 10, d: 12, wall: 0xb5523b, roof: 0x5a3a2e }), (() => { const t = tower({ h: 22, r: 2.6, color: 0xb5523b, cap: 0x5a3a2e }); t.position.set(0, 0, 3); return t; })()) },
  hakgalaRock: { dist: 160, build: () => rock({ w: 110, h: 90, color: 0x7f8a80 }) },
  harbour: { dist: 70, sea: true, build: () => {
    const g = group(mesh(new THREE.BoxGeometry(40, 8, 12), 0x3b5f8a, 0, 2, 20), mesh(new THREE.BoxGeometry(12, 6, 10), 0xf2f2ee, -10, 9, 20));
    for (const x of [-25, 0, 25]) g.add(mesh(new THREE.BoxGeometry(2, 30, 2), 0xd9a92a, x, 15, 0), mesh(new THREE.BoxGeometry(22, 2, 2), 0xd9a92a, x, 30, 6));
    return g;
  } },
  mulkirigala: { dist: 130, build: () => group(rock({ w: 70, h: 60, color: 0x8b8a7a }), (() => { const s = stupa(3.5); s.position.y = 58; return s; })()) },
  blowhole: { dist: 60, sea: true, build: () => group(rock({ w: 30, h: 8, color: 0x7a7068 }), mesh(new THREE.CylinderGeometry(1.5, 4, 26, 10), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }), 0, 18, 0)) },
  dondraLighthouse: { dist: 70, sea: true, build: () => group(rock({ w: 26, h: 5, color: 0x6f7a5a }), (() => { const t = tower({ h: 48, r: 3.2 }); t.position.y = 4; return t; })()) },
  paraviDuwa: { dist: 80, sea: true, build: () => group(rock({ w: 28, h: 4, color: 0x7a7068 }), (() => { const s = stupa(9); s.position.y = 3.5; return s; })()) },
  whale: { dist: 120, sea: true, build: () => {
    const tail = mesh(new THREE.ConeGeometry(5, 14, 4).scale(1, 1, 0.25), 0x3d4a5a, 0, 7, 0);
    return group(tail, mesh(new THREE.BoxGeometry(14, 1.5, 3).rotateZ(0.1), 0x3d4a5a, 0, 14, 0), mesh(new THREE.SphereGeometry(4, 10, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }), 6, 1, 0));
  } },
  taprobane: { dist: 110, sea: true, build: () => group(rock({ w: 36, h: 14, color: 0x5f7a4a }), (() => { const b = building({ w: 12, h: 6, d: 8, wall: 0xf3efe6, roof: 0xb5523b }); b.position.y = 13; return b; })()) },
  negomboLagoon: { dist: 70, build: () => group(waterDisc(45), (() => { const b = boats(5); b.position.y = 0.3; return b; })()) },
  muthurajawela: { dist: 60, build: () => {
    const g = group(waterDisc(40, 0x6f9a8a));
    for (let i = 0; i < 18; i++) g.add(mesh(new THREE.IcosahedronGeometry(3 + (i % 3), 0), 0x3f6a3a, Math.cos(i * 1.7) * 30, 3, Math.sin(i * 2.3) * 30));
    return g;
  } },
  kelaniBridge: { dist: 60, build: () => {
    const g = group(mesh(new THREE.BoxGeometry(110, 2, 12), 0xb9b9b2, 0, 10, 0), mesh(new THREE.BoxGeometry(3, 46, 3), 0xe8e8e2, 0, 23, 0));
    const cable = new THREE.LineBasicMaterial({ color: 0xffffff });
    for (const x of [-50, -35, -20, 20, 35, 50]) g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 45, 0), new THREE.Vector3(x, 11, 0)]), cable));
    return g;
  } },
  redMosque: { dist: 40, build: () => {
    const g = building({ w: 22, h: 16, d: 14, wall: 0xc0392b, roof: 0xc0392b });
    for (const x of [-9, 9]) g.add(mesh(new THREE.CylinderGeometry(1.4, 1.4, 26, 10), 0xf2f2ee, x, 13, 7), mesh(new THREE.SphereGeometry(2, 10, 6), 0xc0392b, x, 27, 7));
    return g;
  } },
  twinTowers: { dist: 70, build: () => group(...[-14, 14].map((x) => mesh(new THREE.BoxGeometry(18, 150, 18), 0x6f8fa8, x, 75, 0))) },
  lotusTower: { dist: 80, build: () => group(mesh(new THREE.CylinderGeometry(1.4, 3, 90, 12), 0x6a4c93, 0, 45, 0), mesh(new THREE.SphereGeometry(6, 16, 12).scale(1, 1.4, 1), 0xd873a6, 0, 95, 0), mesh(new THREE.ConeGeometry(0.4, 18, 6), 0xd9d4e0, 0, 112, 0)) },
  galleFace: { dist: 50, build: () => group(building({ w: 40, h: 14, d: 16, wall: 0xf5f1e6, roof: 0xd9d1c0 }), mesh(new THREE.BoxGeometry(0.4, 18, 0.4), 0xe8e8e2, 22, 9, 8)) },
  templeOfTooth: { dist: 55, build: () => group(building({ w: 34, h: 9, d: 14 }), (() => { const o = building({ w: 10, h: 14, d: 10 }); o.position.set(20, 0, 2); return o; })(), mesh(new THREE.ConeGeometry(3, 5, 8), 0xd9a92a, -6, 13, 0), waterDisc(14)) },
  victoriaDam: { dist: 120, build: () => {
    const wall = mesh(new THREE.CylinderGeometry(60, 60, 50, 24, 1, true, -0.6, 1.2), mat(0xcfccc4, { side: THREE.DoubleSide }), 0, 25, -60);
    return group(wall, peak(70, 0x4f7f55), (() => { const p = peak(80, 0x4f7f55); p.position.x = 90; return p; })(), mesh(new THREE.PlaneGeometry(8, 50), new THREE.MeshBasicMaterial({ color: 0xeef6f7, transparent: true, opacity: 0.8 }), 0, 25, 1));
  } },
  knucklesPeaks: { dist: 220, build: () => group(...[-90, -45, 0, 45, 90].map((x, i) => { const p = peak(110 + (i % 2) * 40, 0x7f97a2); p.position.x = x; return p; })) },
  corbettsGap: { dist: 200, build: () => group(...[-60, 60].map((x) => { const p = peak(130, 0x6d8a82); p.position.x = x; return p; })) },
  lakegala: { dist: 180, build: () => peak(170, 0x6f8f8a) },
  rafting: { dist: 50, build: () => group(mesh(new THREE.BoxGeometry(120, 0.3, 16), new THREE.MeshLambertMaterial({ color: 0x6f9e94 }), 0, 0.2, 0), ...[-20, 10].map((x) => mesh(new THREE.BoxGeometry(5, 0.9, 2.2), 0xe8701e, x, 0.8, 0))) },
  beliLena: { dist: 90, build: () => group(rock({ w: 70, h: 40, color: 0x5e7a5c }), mesh(new THREE.SphereGeometry(10, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0x1d1b19, 0, 0, 30)) },
  aberdeenFalls: { dist: 80, build: () => waterfall({ h: 55, w: 7 }) },
  carolinaFalls: { dist: 80, build: () => waterfall({ h: 45, w: 14, cliff: 0x557a54 }) },
  adamsPeak: { dist: 260, build: () => peak(240, 0x8aa1b0, true) },
  devonFalls: { dist: 90, build: () => waterfall({ h: 65, w: 6 }) },
  stClairs: { dist: 80, build: () => waterfall({ h: 35, w: 12, twin: true, cliff: 0x5a8a58 }) },
  dambullaTemple: { dist: 110, build: () => group(rock({ w: 110, h: 45, color: 0x8a7f72 }), mesh(new THREE.BoxGeometry(60, 6, 4), 0xf3efe4, 0, 18, 46), mesh(new THREE.SphereGeometry(7, 12, 8).scale(1, 1.4, 1), 0xe0b23a, 50, 9, 40)) },
  kandalama: { dist: 110, build: () => group(rock({ w: 80, h: 45, color: 0x8b8a7a }), ...[0, 1, 2, 3].map((k) => mesh(new THREE.BoxGeometry(50 - k * 8, 4, 6), 0xe8e4d6, -10 + k * 4, 2 + k * 5, 34 - k * 4))) },
  sigiriya: { dist: 170, build: () => group(rock({ w: 90, h: 100, column: true, garden: true }), mesh(new THREE.BoxGeometry(14, 6, 6), 0xc3a98c, 0, 3, 40)) },
  pidurangala: { dist: 150, build: () => rock({ w: 110, h: 60, color: 0x8f8270 }) },
  elephants: { dist: 45, build: () => {
    const g = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const e = group(mesh(new THREE.SphereGeometry(1, 8, 6).scale(1.9, 1.25, 1.2), 0x6d6762, 0, 2.1, 0), mesh(new THREE.SphereGeometry(0.75, 8, 6), 0x6d6762, 1.9, 2.5, 0));
      e.position.set((i - 3) * 9, 0, Math.sin(i * 1.9) * 10);
      e.rotation.y = i * 1.3;
      e.scale.setScalar(0.7 + (i % 3) * 0.2);
      g.add(e);
    }
    return g;
  } },
  tankStumps: { dist: 50, build: () => {
    const g = group(waterDisc(40));
    for (let i = 0; i < 12; i++) g.add(mesh(new THREE.CylinderGeometry(0.3, 0.5, 8 + (i % 4) * 2, 5), 0x6b6258, Math.cos(i * 2.1) * 28, 4, Math.sin(i * 1.7) * 28));
    return g;
  } },
};
