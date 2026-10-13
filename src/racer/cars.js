// SL Racing's cars: definitions (handling, price, paints) and their 3D models.
// Models are built from a side profile extruded across the car (rounded edges, a narrower
// roof), with wheels, spoilers, scoops, lights and a helmeted driver added on. Axes as in
// the race: x forward, y up, z across; the wheels stand on y = 0. Built once per car and
// paint, then cached (the race clones them).
import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// rating: power and grip (1-5) drive the handling (car.js); mass: shove in collisions
export const CARS = [
  { id: 'buggy', name: 'Dune Buggy', blurb: 'Light, nimble and tough. A great starter.', price: 0, rating: { power: 2, grip: 4 }, mass: 0.8, halfWidth: 0.85 },
  { id: 'rally', name: 'Rally GT', blurb: 'Grippy all-rounder with a big wing.', price: 1500, rating: { power: 3, grip: 5 }, mass: 1, halfWidth: 0.9 },
  { id: 'roadster', name: 'Roadster', blurb: 'Open-top, quick and lively.', price: 3000, rating: { power: 4, grip: 3 }, mass: 0.95, halfWidth: 0.88 },
  { id: 'muscle', name: 'Muscle Car', blurb: 'Huge power, a handful in the bends.', price: 5000, rating: { power: 5, grip: 2 }, mass: 1.25, halfWidth: 0.95 },
  { id: 'truck', name: 'Trophy Truck', blurb: 'Off-road racer: shrugs off bumps, shoves rivals.', price: 7000, rating: { power: 4, grip: 4 }, mass: 1.5, halfWidth: 1 },
  { id: 'supercar', name: 'Supercar', blurb: 'The fastest thing on the island.', price: 12000, rating: { power: 6, grip: 5 }, mass: 1.05, halfWidth: 0.95 },
];

export const getCar = (id) => CARS.find((c) => c.id === id) ?? CARS[0];

// ---- paints: [name, body, light, dark, stripe] -------------------------------------------
const PAINTS = {
  red: ['Rosso', '#d1202f', '#ff5a5f', '#7a0d16', '#ffffff'],
  yellow: ['Sunburst', '#f2c400', '#ffe35c', '#9a7a00', '#111111'],
  blue: ['Ocean Blue', '#1f5fd1', '#5a92ff', '#0d2c6b', '#ffffff'],
  orange: ['Mango', '#f2701c', '#ffa25c', '#8a3507', '#111111'],
  green: ['Racing Green', '#1f7a43', '#4fb877', '#0d3d22', '#f2c400'],
  black: ['Midnight', '#16181d', '#3a3f48', '#050608', '#d1202f'],
  white: ['Pearl', '#eef1f4', '#ffffff', '#aab3bc', '#1f5fd1'],
  purple: ['Royal Purple', '#6a2fb0', '#9a62e0', '#33125a', '#f2c400'],
  teal: ['Lagoon', '#0fa39a', '#4fd6cc', '#065a55', '#ffffff'],
  silver: ['Silver Arrow', '#a7aeb5', '#dfe3e7', '#5f666d', '#d1202f'],
  sand: ['Desert', '#d8b26a', '#f0d59a', '#8a6a33', '#3a2a1a'],
  gold: ['Temple Gold', '#c9971f', '#f2cc5c', '#7a5608', '#111111'],
};
const SKIN_LISTS = {
  buggy: ['orange', 'sand', 'teal', 'red', 'black', 'gold'],
  rally: ['white', 'blue', 'red', 'yellow', 'green', 'gold'],
  roadster: ['red', 'silver', 'blue', 'green', 'white', 'gold'],
  muscle: ['blue', 'black', 'orange', 'red', 'purple', 'gold'],
  truck: ['sand', 'black', 'orange', 'white', 'green', 'gold'],
  supercar: ['yellow', 'red', 'green', 'black', 'purple', 'gold'],
};
const PRICES = [0, 300, 600, 1000, 1500, 2500];

export function skinsOf(id) {
  const car = getCar(id);
  return SKIN_LISTS[car.id].map((key, i) => {
    const [name, body, light, dark, stripe] = PAINTS[key];
    const tier = key === 'gold' ? PRICES.length - 1 : i;
    return { id: key, name, body, light, dark, stripe, price: Math.round((PRICES[tier] * (1 + car.price / 8000)) / 50) * 50 };
  });
}
export const getSkin = (carId, skinId) => skinsOf(carId).find((s) => s.id === skinId) ?? skinsOf(carId)[0];

// ---- materials and helpers ------------------------------------------------------------------
const mats = {};
const memo = (key, make) => (mats[key] ??= make());
const paint = () => memo('paint', () => new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: 0.35, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 }));
const plain = (hex, rough = 0.6, metal = 0) => memo(`p${hex}-${rough}-${metal}`, () => new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal }));
const glow = (hex) => memo(`g${hex}`, () => new THREE.MeshStandardMaterial({ color: hex, emissive: hex, emissiveIntensity: 1.2 }));
const glass = () => memo('glass', () => new THREE.MeshPhysicalMaterial({ color: 0x0c141c, roughness: 0.05, metalness: 0.4, clearcoat: 1, side: THREE.DoubleSide }));
const carbon = () => plain(0x15171b, 0.45, 0.3);
const chrome = () => plain(0xdfe4e8, 0.15, 1);
const col = (c) => new THREE.Color(c);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function mesh(geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}
const box = (w, h, d, material, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), material, x, y, z);
function rod(a, b, r, material) {
  const d = new THREE.Vector3().subVectors(b, a);
  const m = mesh(new THREE.CylinderGeometry(r, r, d.length(), 8), material);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
  return m;
}

/**
 * The body: a side profile (top line rear to front, over a flat underside with wheel
 * arches cut out) extruded to `width`, with a narrower roof. Colours per face: paint
 * shaded light to dark, a stripe down the middle on top, dark sills.
 */
function bodyShell({ top, bottom, arches, width, roofTaper = 0.2, belt, skin, stripe = 0 }) {
  const s = new THREE.Shape();
  const [front, ...rest] = [...arches].sort((a, b) => b.x - a.x);
  const xFront = top.at(-1)[0];
  const xRear = top[0][0];
  s.moveTo(xFront, bottom);
  for (const a of [front, ...rest]) {
    // the arch meets the underside at angle th (below the hub when the hub is above the sill)
    const th = Math.asin(Math.max(-1, Math.min(1, (bottom - a.cy) / a.r)));
    s.lineTo(a.x + a.r * Math.cos(th), bottom);
    s.absarc(a.x, a.cy, a.r, th, Math.PI - th, false);
  }
  s.lineTo(xRear, bottom);
  for (const [x, y] of top) s.lineTo(x, y);
  s.closePath();
  const bevel = 0.09;
  const geo = new THREE.ExtrudeGeometry(s, { depth: width - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 3, curveSegments: 14 });
  geo.translate(0, 0, -(width - 2 * bevel) / 2);
  // narrower towards the roof
  const p = geo.attributes.position;
  const yTop = Math.max(...top.map((t) => t[1]));
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) * (1 - roofTaper * Math.min(1, Math.max(0, (p.getY(i) - belt) / (yTop - belt)))));
  const g = geo.toNonIndexed();
  const pos = g.attributes.position;
  const out = new Float32Array(pos.count * 3);
  const body = col(skin.body);
  const light = col(skin.light);
  const dark = col(skin.dark);
  const stripeCol = col(skin.stripe);
  const sill = col(0x15171b);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), m = new THREE.Vector3();
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    n.subVectors(c, b).cross(m.subVectors(a, b)).normalize();
    m.copy(a).add(b).add(c).divideScalar(3);
    const shade = Math.min(1, Math.max(0, (m.y - bottom) / (yTop - bottom)));
    tmp.copy(dark).lerp(body, Math.min(1, shade * 1.6)).lerp(light, Math.max(0, n.y) * 0.35);
    if (stripe && Math.abs(m.z) < stripe && n.y > 0.25) tmp.copy(stripeCol);
    if (m.y < bottom + 0.12) tmp.copy(sill);
    for (let j = 0; j < 3; j++) tmp.toArray(out, (i + j) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(out, 3));
  return mesh(toCreasedNormals(g, Math.PI / 5), paint());
}

// flat glass panes on both sides (and a windscreen/rear screen across the top)
function windows(group, panes, halfWidth, taperAt) {
  for (const pts of panes) {
    for (const side of [1, -1]) {
      const g = new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))));
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, side * (halfWidth + 0.01) * taperAt(p.getY(i)));
      g.computeVertexNormals();
      group.add(mesh(g, glass()));
    }
  }
}
// a quad of glass from four corners (windscreens)
function pane(corners) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(corners.flat(), 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeVertexNormals();
  return mesh(g, glass());
}

// a sporty wheel: tyre, coloured or chrome multi-spoke rim, brake disc
function wheel({ r, w = 0.3, rim = 0xc9ced3, spokes = 5, offroad = false, front = false }) {
  const g = new THREE.Group();
  const tyre = mesh(new THREE.CylinderGeometry(r, r, w, 28).rotateX(Math.PI / 2), plain(0x141518, 0.85));
  g.add(tyre);
  if (offroad) {
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const lug = box(0.12, 0.06, w * 0.95, plain(0x141518, 0.9), Math.cos(a) * r, Math.sin(a) * r, 0);
      lug.rotation.z = a;
      g.add(lug);
    }
  }
  const rr = r * 0.66;
  const rimMat = plain(rim, 0.25, 0.85);
  for (const side of [1, -1]) {
    g.add(mesh(new THREE.CylinderGeometry(rr, rr, 0.04, 20).rotateX(Math.PI / 2), plain(0x2a2d32, 0.4, 0.6), 0, 0, side * (w / 2 - 0.02)));
    for (let i = 0; i < spokes; i++) {
      const sp = box(rr * 1.9, 0.07, 0.04, rimMat, 0, 0, side * (w / 2));
      sp.rotation.z = (i / spokes) * Math.PI;
      g.add(sp);
    }
    g.add(mesh(new THREE.TorusGeometry(rr, 0.035, 6, 24), rimMat, 0, 0, side * (w / 2)));
    g.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.05, 10).rotateX(Math.PI / 2), chrome(), 0, 0, side * (w / 2 + 0.01)));
  }
  g.name = 'wheel'; // the race spins (and steers) these
  g.userData = { r, front };
  return g;
}

function wheels(group, { x, r, track, w, ...opts }) {
  for (const [wx, wr, front] of [[x[0], r[0], false], [x[1], r[1], true]]) {
    for (const side of [1, -1]) {
      const wh = wheel({ r: wr, w, front, ...opts });
      wh.position.set(wx, wr, side * track);
      group.add(wh);
    }
  }
}

function driver(group, x, y, helmet = 0xf2f2ee) {
  group.add(mesh(new THREE.CapsuleGeometry(0.22, 0.35, 4, 8), plain(0x1f2a44, 0.8), x, y + 0.3, 0));
  const h = mesh(new THREE.SphereGeometry(0.2, 14, 10), plain(helmet, 0.2, 0.3), x + 0.02, y + 0.78, 0);
  group.add(h, box(0.06, 0.1, 0.26, glass(), x + 0.19, y + 0.78, 0));
}

function lights(group, front, back, y, z, opts = {}) {
  for (const side of [1, -1]) {
    group.add(box(0.08, opts.h ?? 0.1, opts.w ?? 0.36, glow(0xf8fbff), front, y, side * z));
    group.add(box(0.06, 0.09, opts.tw ?? 0.42, glow(0xe0182c), back, opts.ty ?? y + 0.05, side * z));
  }
}

function wing(group, x, y, span, chord = 0.42, color = carbon()) {
  group.add(box(chord, 0.06, span, color, x, y, 0));
  for (const side of [1, -1]) group.add(box(0.1, 0.32, 0.06, carbon(), x + 0.05, y - 0.18, side * span * 0.36), box(chord + 0.06, 0.24, 0.04, color, x, y + 0.06, side * (span / 2)));
}

const exhaust = (group, x, y, z) => group.add(mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.3, 12).rotateZ(Math.PI / 2), chrome(), x, y, z));

// ---- the cars --------------------------------------------------------------------------------
const BUILDERS = {
  buggy(skin) {
    const g = new THREE.Group();
    // a small tub with a sloping nose, big rear wheels, a tube roll cage
    g.add(bodyShell({
      top: [[-1.55, 0.95], [-1.0, 1.0], [-0.2, 0.75], [0.9, 0.8], [1.6, 0.62]],
      bottom: 0.38,
      arches: [{ x: -1.05, r: 0.56, cy: 0.5 }, { x: 1.15, r: 0.46, cy: 0.4 }],
      width: 1.5,
      roofTaper: 0.05,
      belt: 0.6,
      skin,
      stripe: 0.18,
    }));
    const cage = plain(0x22252b, 0.35, 0.7);
    for (const side of [1, -1]) {
      const z = side * 0.62;
      g.add(rod(V(-0.95, 0.95, z), V(-0.75, 1.75, z * 0.85), 0.045, cage), rod(V(-0.75, 1.75, z * 0.85), V(0.35, 1.7, z * 0.85), 0.045, cage), rod(V(0.35, 1.7, z * 0.85), V(0.8, 0.82, z), 0.045, cage));
    }
    g.add(rod(V(-0.75, 1.75, -0.53), V(-0.75, 1.75, 0.53), 0.045, cage), rod(V(0.35, 1.7, -0.53), V(0.35, 1.7, 0.53), 0.045, cage));
    g.add(box(0.7, 0.45, 0.7, plain(0x3a3d42, 0.4, 0.7), -1.25, 1.1, 0)); // the engine out back
    exhaust(g, -1.65, 1.0, 0.25);
    exhaust(g, -1.65, 1.0, -0.25);
    driver(g, -0.35, 0.72, 0xf2c400);
    g.add(box(0.1, 0.24, 1.0, glow(0xf8fbff), 1.55, 1.0, 0)); // light bar
    lights(g, 1.62, -1.6, 0.6, 0.45, { w: 0.2, tw: 0.2 });
    wheels(g, { x: [-1.05, 1.15], r: [0.5, 0.4], track: 0.82, w: 0.42, offroad: true, rim: 0x2a2d32, spokes: 4 });
    return g;
  },

  rally(skin) {
    const g = new THREE.Group();
    const w = 1.82;
    g.add(bodyShell({
      top: [[-2.05, 0.82], [-1.95, 1.05], [-1.2, 1.35], [0.3, 1.38], [1.0, 0.98], [2.05, 0.82], [2.15, 0.55]],
      bottom: 0.3,
      arches: [{ x: -1.3, r: 0.46, cy: 0.38 }, { x: 1.35, r: 0.46, cy: 0.38 }],
      width: w,
      belt: 0.95,
      skin,
      stripe: 0.32,
    }));
    const taper = (y) => 1 - 0.2 * Math.min(1, Math.max(0, (y - 0.95) / 0.43));
    windows(g, [[[-1.15, 1.02], [0.15, 1.02], [0.15, 1.3], [-1.05, 1.3]], [[0.25, 1.02], [0.9, 1.02], [0.32, 1.3], [0.25, 1.3]]], w / 2, taper);
    g.add(pane([[1.0, 1.0, -0.72], [1.0, 1.0, 0.72], [0.33, 1.36, 0.58], [0.33, 1.36, -0.58]]));
    wing(g, -2.0, 1.6, 1.7, 0.45, plain(col(skin.dark), 0.4));
    g.add(box(0.6, 0.1, 0.5, carbon(), 1.35, 1.0, 0)); // bonnet scoop
    g.add(box(0.6, 0.12, 0.4, carbon(), -0.3, 1.43, 0)); // roof vent
    g.add(box(0.12, 0.2, 1.1, carbon(), 2.12, 0.42, 0)); // splitter
    for (const side of [1, -1]) g.add(box(0.04, 0.35, 0.3, plain(0xd1202f, 0.7), -1.85, 0.3, side * 0.78)); // mud flaps
    for (const z of [-0.45, -0.15, 0.15, 0.45]) g.add(mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 14).rotateZ(Math.PI / 2), glow(0xfff6d8), 2.1, 0.8, z)); // rally light pod
    lights(g, 2.13, -2.06, 0.72, 0.62);
    exhaust(g, -2.1, 0.42, 0.55);
    driver(g, -0.1, 0.36);
    wheels(g, { x: [-1.3, 1.35], r: [0.36, 0.36], track: 0.84, w: 0.3, rim: 0xf2f2ee, spokes: 6 });
    return g;
  },

  roadster(skin) {
    const g = new THREE.Group();
    const w = 1.8;
    g.add(bodyShell({
      top: [[-2.05, 0.75], [-1.95, 0.95], [-0.9, 0.98], [-0.6, 0.82], [0.35, 0.82], [0.55, 0.95], [2.05, 0.8], [2.2, 0.5]],
      bottom: 0.28,
      arches: [{ x: -1.35, r: 0.44, cy: 0.35 }, { x: 1.45, r: 0.43, cy: 0.35 }],
      width: w,
      roofTaper: 0.08,
      belt: 0.7,
      skin,
      stripe: 0,
    }));
    g.add(pane([[0.58, 0.95, -0.72], [0.58, 0.95, 0.72], [0.25, 1.35, 0.66], [0.25, 1.35, -0.66]]));
    g.add(box(0.5, 0.14, 1.3, plain(0x5a2a1a, 0.7), -0.15, 0.85, 0)); // tan leather
    for (const side of [1, -1]) g.add(mesh(new THREE.TorusGeometry(0.25, 0.04, 6, 14, Math.PI), chrome(), -0.75, 0.98, side * 0.36)); // roll hoops
    g.add(box(1.4, 0.03, 0.06, chrome(), 0.8, 0.98, 0)); // bonnet line
    driver(g, -0.2, 0.62, 0xd1202f);
    lights(g, 2.17, -2.06, 0.65, 0.6, { h: 0.08, w: 0.42 });
    exhaust(g, -2.1, 0.38, 0.35);
    exhaust(g, -2.1, 0.38, -0.35);
    wheels(g, { x: [-1.35, 1.45], r: [0.35, 0.34], track: 0.82, w: 0.28, rim: 0xc9ced3, spokes: 10 });
    return g;
  },

  muscle(skin) {
    const g = new THREE.Group();
    const w = 1.95;
    g.add(bodyShell({
      top: [[-2.3, 0.85], [-2.2, 1.02], [-1.3, 1.05], [-0.8, 1.38], [0.25, 1.4], [0.85, 1.05], [2.25, 0.98], [2.35, 0.6]],
      bottom: 0.3,
      arches: [{ x: -1.5, r: 0.5, cy: 0.4 }, { x: 1.5, r: 0.47, cy: 0.38 }],
      width: w,
      belt: 1.0,
      skin,
      stripe: 0.3,
    }));
    const taper = (y) => 1 - 0.2 * Math.min(1, Math.max(0, (y - 1.0) / 0.4));
    windows(g, [[[-0.75, 1.07], [0.2, 1.07], [0.2, 1.35], [-0.65, 1.35]], [[0.3, 1.07], [0.78, 1.07], [0.32, 1.36], [0.3, 1.36]]], w / 2, taper);
    g.add(pane([[0.85, 1.05, -0.74], [0.85, 1.05, 0.74], [0.28, 1.38, 0.62], [0.28, 1.38, -0.62]]));
    g.add(box(0.8, 0.28, 0.55, chrome(), 1.2, 1.15, 0)); // the blower poking through the bonnet
    g.add(box(0.3, 0.12, 0.6, carbon(), 1.2, 1.32, 0));
    g.add(box(0.3, 0.08, 1.6, plain(col(skin.dark), 0.5), -2.2, 1.1, 0)); // ducktail
    g.add(box(0.1, 0.3, 1.6, carbon(), 2.36, 0.62, 0)); // grille
    lights(g, 2.37, -2.31, 0.8, 0.62, { w: 0.3, tw: 0.6, ty: 0.85 });
    for (const z of [0.45, 0.6, -0.45, -0.6]) exhaust(g, -2.35, 0.4, z);
    driver(g, -0.2, 0.38);
    wheels(g, { x: [-1.5, 1.5], r: [0.42, 0.38], track: 0.88, w: 0.42, rim: 0xdfe4e8, spokes: 5 });
    return g;
  },

  truck(skin) {
    const g = new THREE.Group();
    const w = 2.0;
    // cab and a short bed, high on long-travel suspension
    g.add(bodyShell({
      top: [[-2.3, 1.55], [-0.4, 1.55], [-0.3, 2.15], [0.6, 2.15], [1.15, 1.65], [2.3, 1.5], [2.4, 1.15]],
      bottom: 0.95,
      arches: [{ x: -1.5, r: 0.68, cy: 0.62 }, { x: 1.55, r: 0.68, cy: 0.62 }],
      width: w,
      roofTaper: 0.1,
      belt: 1.6,
      skin,
      stripe: 0.25,
    }));
    const taper = (y) => 1 - 0.1 * Math.min(1, Math.max(0, (y - 1.6) / 0.55));
    windows(g, [[[-0.25, 1.65], [0.55, 1.65], [0.55, 2.08], [-0.2, 2.08]], [[0.65, 1.65], [1.08, 1.65], [0.65, 2.08]]], w / 2, taper);
    g.add(pane([[1.15, 1.68, -0.86], [1.15, 1.68, 0.86], [0.62, 2.12, 0.8], [0.62, 2.12, -0.8]]));
    g.add(box(0.12, 0.22, 1.7, glow(0xf8fbff), 0.45, 2.3, 0)); // roof light bar
    g.add(mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.38, 20).rotateX(Math.PI / 2), plain(0x141518, 0.85), -1.5, 1.95, 0)); // spare in the bed
    const cage = plain(0x22252b, 0.35, 0.7);
    for (const side of [1, -1]) g.add(rod(V(-0.35, 2.1, side * 0.85), V(-2.2, 1.6, side * 0.85), 0.05, cage));
    for (const side of [1, -1]) for (const x of [-1.5, 1.55]) g.add(rod(V(x, 0.62, side * 0.85), V(x + 0.2, 1.3, side * 0.7), 0.06, plain(0xf2c400, 0.4, 0.6))); // shocks
    g.add(box(0.2, 0.3, 1.9, carbon(), 2.45, 1.0, 0));
    lights(g, 2.42, -2.31, 1.3, 0.72);
    driver(g, 0.2, 1.05, 0xff8a2a);
    wheels(g, { x: [-1.5, 1.55], r: [0.58, 0.58], track: 0.95, w: 0.45, offroad: true, rim: 0x2a2d32, spokes: 6 });
    return g;
  },

  supercar(skin) {
    const g = new THREE.Group();
    const w = 1.98;
    g.add(bodyShell({
      top: [[-2.25, 0.62], [-2.2, 0.98], [-1.2, 1.02], [-0.55, 1.18], [0.15, 1.18], [0.95, 0.84], [2.15, 0.56], [2.3, 0.38]],
      bottom: 0.22,
      arches: [{ x: -1.4, r: 0.46, cy: 0.36 }, { x: 1.4, r: 0.44, cy: 0.35 }],
      width: w,
      roofTaper: 0.28,
      belt: 0.8,
      skin,
      stripe: 0.12,
    }));
    const taper = (y) => 1 - 0.28 * Math.min(1, Math.max(0, (y - 0.8) / 0.38));
    windows(g, [[[-0.85, 0.88], [0.55, 0.86], [0.12, 1.15], [-0.5, 1.15]]], w / 2, taper);
    g.add(pane([[0.97, 0.84, -0.78], [0.97, 0.84, 0.78], [0.18, 1.16, 0.58], [0.18, 1.16, -0.58]]));
    for (const side of [1, -1]) g.add(box(0.8, 0.28, 0.06, carbon(), -0.75, 0.62, side * (w / 2 - 0.02))); // side intakes
    wing(g, -2.0, 1.25, 1.85, 0.38);
    g.add(box(0.5, 0.18, 1.7, carbon(), -2.2, 0.3, 0)); // diffuser
    g.add(box(0.2, 0.08, 1.8, carbon(), 2.2, 0.26, 0)); // splitter
    lights(g, 2.2, -2.24, 0.55, 0.66, { h: 0.06, w: 0.5, tw: 0.7, ty: 0.85 });
    exhaust(g, -2.28, 0.4, 0.12);
    exhaust(g, -2.28, 0.4, -0.12);
    driver(g, -0.25, 0.17);
    wheels(g, { x: [-1.4, 1.4], r: [0.38, 0.35], track: 0.86, w: 0.36, rim: 0x2a2d32, spokes: 10 });
    return g;
  },
};

const cache = {};
/** The car in a paint as a ready-to-place group: wheels on y = 0, centred in x. */
export function carModel(id, skin = getSkin(id)) {
  const key = `${id}:${skin.id}`;
  if (cache[key]) return cache[key];
  const body = BUILDERS[getCar(id).id](skin);
  const bounds = new THREE.Box3().setFromObject(body);
  body.position.x = -(bounds.min.x + bounds.max.x) / 2;
  const root = new THREE.Group();
  root.add(body);
  const size = bounds.getSize(new THREE.Vector3());
  root.userData = { length: size.x, height: size.y, width: size.z };
  return (cache[key] = root);
}
