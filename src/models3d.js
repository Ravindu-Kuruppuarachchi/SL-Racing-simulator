// Low-poly 3D vehicle models for the home screen and garage (three.js).
// Car bodies are the 2D game's side profiles (vehicle-art.js) extruded to the
// car's width, so both views match. Same axes as the game: x forward, y up,
// z across the vehicle. Models are built once per vehicle and paint, and cached.
import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hatchOutline, hybridOutline, jeepOutline, JEEP_WINDOWS, lorryBedOutline, lorryCabOutline, LORRY_WINDOWS, vanOutline, VAN_WINDOWS } from './vehicle-art.js';
import { getSkin, getVehicle } from './vehicles.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const col = (hex) => new THREE.Color(hex);

// ---- materials ---------------------------------------------------------------
const mats = {};
function mat(key, make) {
  return (mats[key] ??= make());
}
const paint = () => mat('paint', () => new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: 0.25, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.12 }));
const plain = (hex, rough = 0.7, metal = 0) => mat(`p${hex}${rough}${metal}`, () => new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal }));
const glass = () => mat('glass', () => new THREE.MeshPhysicalMaterial({ color: 0x0d151d, roughness: 0.04, metalness: 0.3, clearcoat: 1, side: THREE.DoubleSide }));
const glow = (hex) => mat(`g${hex}`, () => new THREE.MeshStandardMaterial({ color: hex, emissive: hex, emissiveIntensity: 0.9, roughness: 0.3 }));
const chrome = () => plain(0xd5dade, 0.18, 1);
const rubber = () => plain(0x17181a, 0.85);
const trim = () => plain(0x1c1e21, 0.55);
const skin = () => plain(0x8d5524, 0.6);

// ---- geometry helpers --------------------------------------------------------------
// Canvas-style pen that writes into a THREE.Shape, so the 2D outline functions work as-is.
function shapeFrom(draw) {
  const s = new THREE.Shape();
  draw({
    moveTo: (x, y) => s.moveTo(x, y),
    lineTo: (x, y) => s.lineTo(x, y),
    quadraticCurveTo: (cx, cy, x, y) => s.quadraticCurveTo(cx, cy, x, y),
    arc: (x, y, r, a0, a1, ccw = false) => s.absarc(x, y, r, a0, a1, ccw),
    closePath: () => s.closePath(),
  });
  return s;
}
const polyShape = (pts) => new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));

// Side profile extruded across z, centred, with rounded (bevelled) edges.
function extrude(shape, width, bevel = 0.05, segs = 14) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: width - 2 * bevel,
    curveSegments: segs,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: 3,
  });
  g.translate(0, 0, -(width - 2 * bevel) / 2);
  return g;
}

// Per-triangle colour (vertex colours) from a function of centroid and face normal.
function colourFaces(geo, colourOf) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position;
  const out = new Float32Array(p.count * 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const n = new THREE.Vector3(), m = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    n.subVectors(c, b).cross(m.subVectors(a, b)).normalize();
    m.copy(a).add(b).add(c).divideScalar(3);
    const k = colourOf(m, n);
    for (let j = 0; j < 3; j++) k.toArray(out, (i + j) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(out, 3));
  return g;
}

// Squeeze z with a function of (x, y): narrower roofs ("tumblehome"), tapered noses.
function squeeze(geo, scaleAt) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) * scaleAt(p.getX(i), p.getY(i)));
  return geo;
}
const tumblehome = (belt, top, amount) => (x, y) => 1 - amount * THREE.MathUtils.clamp((y - belt) / (top - belt), 0, 1);

function mesh(geo, material, { pos = [0, 0, 0], rot = [0, 0, 0], shadow = true } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(...pos);
  m.rotation.set(...rot);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}
const box = (sx, sy, sz, material, pos, rot) => mesh(new THREE.BoxGeometry(sx, sy, sz), material, { pos, rot });

// A rod (capsule) between two points: frames, forks, limbs.
function rod(from, to, radius, material) {
  const d = new THREE.Vector3().subVectors(to, from);
  const m = mesh(new THREE.CapsuleGeometry(radius, Math.max(d.length() - 2 * radius, 0.001), 4, 10), material);
  m.position.copy(from).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
  return m;
}

// A disc facing +x (headlights, gauges) or along another axis via `rot`.
const disc = (r, depth, material, pos, rot = [0, 0, -Math.PI / 2]) => mesh(new THREE.CylinderGeometry(r, r, depth, 24), material, { pos, rot });

// Flat window panes on both sides of a body, bent with the body's tumblehome.
function sideWindows(group, windows, halfWidth, scaleAt) {
  for (const w of windows) {
    for (const side of [1, -1]) {
      const g = new THREE.ShapeGeometry(polyShape(w));
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, side * (halfWidth + 0.006) * scaleAt(p.getX(i), p.getY(i)));
      g.computeVertexNormals();
      group.add(mesh(g, glass(), { shadow: false }));
    }
  }
}

// ---- wheels ------------------------------------------------------------------
// Tyre from a lathed rounded cross-section; rim style per vehicle.
function wheel(r, width, style) {
  const g = new THREE.Group();
  const inner = r * (style === 'offroad' ? 0.58 : 0.66);
  const hw = width / 2;
  const pts = [];
  for (let i = 0; i <= 8; i++) {
    const a = -Math.PI / 2 + (i / 8) * Math.PI;
    pts.push(new THREE.Vector2(r - 0.06 + Math.cos(a) * 0.06, Math.sin(a) * hw)); // rounded tread
  }
  pts.unshift(new THREE.Vector2(inner, -hw * 0.92));
  pts.push(new THREE.Vector2(inner, hw * 0.92));
  const tyre = mesh(new THREE.LatheGeometry(pts, 36), rubber());
  tyre.rotation.x = Math.PI / 2;
  g.add(tyre);
  if (style === 'offroad') {
    // chunky tread blocks
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      const b = box(0.1, 0.05, width * 0.42, rubber(), [Math.cos(a) * (r - 0.005), Math.sin(a) * (r - 0.005), (i % 2 ? 1 : -1) * width * 0.24]);
      b.rotation.z = a + Math.PI / 2;
      g.add(b);
    }
  }
  const rimMat = { steel: plain(0xdfe2e5, 0.4, 0.6), tuktuk: plain(0x9a1c2c, 0.4, 0.3), moto: plain(0x222428, 0.35, 0.6), hubcap: plain(0xb9c0c6, 0.3, 0.8), alloy: chrome(), offroad: plain(0xe9e7df, 0.45, 0.2) }[style];
  const rim = disc(inner, width * 0.86, rimMat, [0, 0, 0], [Math.PI / 2, 0, 0]);
  g.add(rim);
  g.add(disc(inner * 0.32, width * 0.95, chrome(), [0, 0, 0], [Math.PI / 2, 0, 0])); // hub
  const spokes = { moto: 6, alloy: 5 }[style] ?? 0;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    for (const side of [1, -1]) {
      const s = box(inner * 0.8, 0.045, 0.03, style === 'moto' ? plain(0xc9a227, 0.35, 0.7) : chrome(), [Math.cos(a) * inner * 0.45, Math.sin(a) * inner * 0.45, side * width * 0.44]);
      s.rotation.z = a;
      g.add(s);
    }
  }
  if (style === 'offroad' || style === 'tuktuk' || style === 'hubcap' || style === 'steel') {
    // lug nuts
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      g.add(disc(0.022, width * 0.9 + 0.02, chrome(), [Math.cos(a) * inner * 0.5, Math.sin(a) * inner * 0.5, 0], [Math.PI / 2, 0, 0]));
    }
  }
  return g;
}

function addWheels(group, vehicle, style, width, zs) {
  vehicle.wheels.forEach((w, i) => {
    for (const z of zs[i]) {
      const wh = wheel(w.r, width, style);
      wh.position.set(w.x, w.y, z);
      wh.name = 'wheel'; // the 3D racer spins (and steers) these
      wh.userData = { r: w.r, front: i === vehicle.wheels.length - 1 };
      group.add(wh);
    }
  });
}

// ---- people -------------------------------------------------------------------
// A seated rider built from capsules. pose: hip/shoulder/hand/knee/foot as [x, y]; z spreads limbs.
function rider(pose, look) {
  const g = new THREE.Group();
  const shirt = plain(look.shirt, 0.8);
  const pants = plain(look.pants, 0.85);
  const hip = V(pose.hip[0], pose.hip[1], 0);
  const shoulder = V(pose.shoulder[0], pose.shoulder[1], 0);
  g.add(rod(hip, shoulder, 0.15, shirt));
  for (const s of [1, -1]) {
    const sh = V(pose.shoulder[0], pose.shoulder[1] - 0.04, s * 0.17);
    const hand = V(pose.hand[0], pose.hand[1], s * (look.handZ ?? 0.24));
    const elbow = sh.clone().lerp(hand, 0.5).add(V(-0.02, -0.08, s * 0.04));
    g.add(rod(sh, elbow, 0.05, shirt), rod(elbow, hand, 0.045, look.glove ? plain(look.glove) : skin()));
    const h = V(pose.hip[0], pose.hip[1], s * 0.1);
    const knee = V(pose.knee[0], pose.knee[1], s * 0.14);
    const foot = V(pose.foot[0], pose.foot[1], s * 0.13);
    g.add(rod(h, knee, 0.07, pants), rod(knee, foot, 0.06, pants));
    g.add(box(0.16, 0.07, 0.09, plain(look.boots ?? 0x2a1d14), [foot.x + 0.05, foot.y - 0.03, foot.z]));
  }
  const head = shoulder.clone().add(V(0.03, 0.2, 0));
  g.add(mesh(new THREE.SphereGeometry(0.06, 10, 8), skin(), { pos: [shoulder.x + 0.01, shoulder.y + 0.07, 0] })); // neck
  if (look.helmet) {
    g.add(mesh(new THREE.SphereGeometry(0.15, 20, 14), plain(look.helmet, 0.25, 0.2), { pos: head.toArray() }));
    g.add(box(0.06, 0.08, 0.22, glass(), [head.x + 0.12, head.y - 0.01, 0])); // visor
  } else {
    g.add(mesh(new THREE.SphereGeometry(0.115, 18, 14), skin(), { pos: head.toArray() }));
    const hair = mesh(new THREE.SphereGeometry(0.12, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), plain(0x15100c, 0.9), { pos: [head.x - 0.01, head.y + 0.01, 0] });
    hair.rotation.z = 0.35;
    g.add(hair);
  }
  return g;
}

// ---- tuk tuk ------------------------------------------------------------------
function buildTuktuk(v, skin) {
  const g = new THREE.Group();
  const maroon = col(skin.body);
  const tub = shapeFrom((c) => {
    c.moveTo(-1.2, 0.6);
    c.quadraticCurveTo(-1.42, 0.58, -1.42, 0.3);
    c.lineTo(-1.42, -0.12);
    c.quadraticCurveTo(-1.42, -0.2, -1.36, -0.2);
    c.arc(-0.85, -0.45, 0.56, 2.66, 0.48, true);
    c.lineTo(0.08, -0.2);
    c.lineTo(0.08, 0.36);
    c.lineTo(-0.15, 0.4);
    c.lineTo(-1.15, 0.4);
    c.closePath();
  });
  g.add(mesh(colourFaces(extrude(tub, 1.32, 0.06), () => maroon), paint()));
  // front leg shield / dashboard, narrowing towards the nose
  const cowl = polyShape([[0.45, -0.2], [0.75, -0.2], [0.86, 0.04], [1.16, 0.1], [1.22, 0.4], [1.0, 0.7], [0.55, 0.72], [0.45, 0.62]]);
  const cowlGeo = squeeze(colourFaces(extrude(cowl, 1.12, 0.06), (m) => (m.y > 0.55 && m.x > 0.6 ? col('#1d1d1f') : maroon)), (x) => 1 - 0.42 * THREE.MathUtils.clamp((x - 0.55) / 0.67, 0, 1));
  g.add(mesh(cowlGeo, paint()));
  g.add(box(0.56, 0.1, 1.12, trim(), [0.32, -0.15, 0])); // floor
  // gold side stripe
  for (const s of [1, -1]) g.add(box(1.4, 0.04, 0.01, plain(0xd4a017, 0.35, 0.6), [-0.68, 0.16, s * 0.665]));
  // canvas canopy, rear panel and posts
  const canvasMat = plain(0x1d1d1f, 0.9);
  const roof = polyShape([[-1.36, 1.25], [0.88, 1.25], [0.98, 1.32], [0.86, 1.44], [-1.22, 1.46], [-1.38, 1.36]]);
  g.add(mesh(extrude(roof, 1.36, 0.05), canvasMat));
  for (const s of [1, -1]) g.add(box(2.2, 0.035, 0.01, plain(skin.body, 0.6), [-0.24, 1.3, s * 0.682]));
  g.add(box(0.1, 0.68, 1.3, canvasMat, [-1.36, 0.92, 0]));
  g.add(box(0.012, 0.28, 0.7, glass(), [-1.418, 1.0, 0]));
  for (const s of [1, -1]) {
    g.add(box(0.4, 0.66, 0.04, canvasMat, [-1.18, 0.92, s * 0.64])); // side curtain behind the bench
    g.add(rod(V(0.05, 0.36, s * 0.63), V(0.05, 1.27, s * 0.63), 0.025, trim()));
    g.add(rod(V(0.98, 0.68, s * 0.46), V(0.82, 1.27, s * 0.5), 0.025, trim()));
  }
  // windscreen: one pane from the top of the cowl up to the roof, raked back between the front posts
  const ws = new THREE.BufferGeometry();
  ws.setAttribute('position', new THREE.Float32BufferAttribute([0.97, 0.71, -0.45, 0.97, 0.71, 0.45, 0.83, 1.25, 0.49, 0.83, 1.25, -0.49], 3));
  ws.setIndex([0, 1, 2, 0, 2, 3]);
  ws.computeVertexNormals();
  g.add(mesh(ws, glass(), { shadow: false }));
  g.add(rod(V(0.97, 0.71, -0.46), V(0.97, 0.71, 0.46), 0.018, trim())); // frame top and bottom
  g.add(rod(V(0.83, 1.25, -0.5), V(0.83, 1.25, 0.5), 0.018, trim()));
  // passenger bench and driver seat
  g.add(box(0.9, 0.14, 1.1, plain(0x7a3a2c, 0.8), [-0.66, 0.47, 0]));
  g.add(box(0.14, 0.55, 1.1, plain(0x5b2a20, 0.8), [-1.15, 0.8, 0]));
  g.add(box(0.36, 0.1, 0.5, plain(0x4a2018, 0.8), [0.17, 0.47, 0]));
  // handlebar and steering column
  g.add(rod(V(0.86, 0.62, 0), V(0.72, 0.86, 0), 0.03, trim()));
  g.add(rod(V(0.68, 0.86, -0.3), V(0.68, 0.86, 0.3), 0.022, chrome()));
  // front fork and mudguard
  const front = v.wheels[1];
  for (const s of [1, -1]) g.add(rod(V(0.92, 0.3, s * 0.1), V(front.x, front.y, s * 0.1), 0.03, chrome()));
  const guard = mesh(new THREE.TorusGeometry(front.r + 0.08, 0.05, 6, 20, Math.PI - 0.55), paint(), { pos: [front.x, front.y, 0], rot: [0, 0, 0.2] });
  guard.geometry = colourFaces(guard.geometry, () => maroon);
  guard.scale.z = 2.2;
  g.add(guard);
  // lights, indicators, exhaust, lucky charm
  g.add(disc(0.09, 0.06, glow(0xfff6d8), [1.22, 0.42, 0]));
  g.add(disc(0.11, 0.04, chrome(), [1.2, 0.42, 0]));
  for (const s of [1, -1]) {
    g.add(box(0.05, 0.05, 0.07, glow(0xf59e0b), [1.13, 0.3, s * 0.3]));
    g.add(box(0.03, 0.1, 0.1, glow(0xd62828), [-1.43, 0.25, s * 0.5]));
    g.add(mesh(new THREE.SphereGeometry(0.05, 10, 8), chrome(), { pos: [0.66, 1.02, s * 0.32] })); // mirrors
  }
  g.add(rod(V(-0.6, -0.2, 0.32), V(-1.5, -0.22, 0.32), 0.035, plain(0x8c8c8c, 0.4, 0.8)));
  g.add(rod(V(-0.55, 1.25, 0), V(-0.55, 1.08, 0), 0.006, plain(0xd4a017)));
  g.add(mesh(new THREE.SphereGeometry(0.035, 10, 8), plain(0xe8b923, 0.3, 0.7), { pos: [-0.55, 1.05, 0] }));
  g.add(rider(ART_POSE.tuktuk, { shirt: 0xe5e7eb, pants: 0x3f3f46, handZ: 0.28 }));
  addWheels(g, v, 'tuktuk', 0.17, [[-0.6, 0.6], [0]]);
  return g;
}

// rider poses, matching the 2D drivers (feet kept on the floor)
const ART_POSE = {
  tuktuk: { hip: [0.17, 0.6], shoulder: [0.24, 1.08], hand: [0.68, 0.86], knee: [0.5, 0.62], foot: [0.58, -0.05] },
  bike: { hip: [-0.25, 0.46], shoulder: [0.1, 0.9], hand: [0.52, 0.76], knee: [0.2, 0.42], foot: [0.0, 0.02] },
};

// ---- motorbike ----------------------------------------------------------------
function buildBike(v, skin) {
  const g = new THREE.Group();
  const red = col(skin.body);
  const [rear, front] = v.wheels;
  const tank = polyShape([[-0.18, 0.34], [0.38, 0.4], [0.56, 0.56], [0.28, 0.66], [-0.08, 0.6], [-0.2, 0.48]]);
  g.add(mesh(colourFaces(extrude(tank, 0.38, 0.08), () => red), paint()));
  const tail = polyShape([[-0.95, 0.36], [-0.2, 0.32], [-0.2, 0.46], [-0.85, 0.5]]);
  g.add(mesh(colourFaces(extrude(tail, 0.26, 0.05), (m) => (m.y > 0.45 ? col('#18181b') : red)), paint()));
  g.add(box(0.62, 0.06, 0.28, plain(0x18181b, 0.9), [-0.5, 0.49, 0])); // seat
  // engine, frame, swing arm
  g.add(box(0.5, 0.4, 0.32, plain(0x3a3d42, 0.4, 0.7), [0.08, 0.08, 0]));
  g.add(box(0.36, 0.26, 0.24, plain(0x18181b, 0.7), [-0.32, 0.2, 0])); // side cover under the seat
  g.add(rod(V(0.62, 0.55, 0), V(0.3, -0.1, 0), 0.04, trim())); // down tube
  for (let i = 0; i < 5; i++) g.add(box(0.44, 0.015, 0.36, plain(0x22252a, 0.4, 0.7), [0.08, 0.1 + i * 0.05, 0])); // cooling fins
  g.add(rod(V(0.62, 0.55, 0), V(0.12, 0.18, 0), 0.035, trim()));
  g.add(rod(V(0.62, 0.55, 0), V(-0.2, 0.4, 0), 0.035, trim()));
  for (const s of [1, -1]) g.add(rod(V(-0.1, -0.06, s * 0.09), V(rear.x, rear.y, s * 0.09), 0.03, trim()));
  g.add(rod(V(-0.3, 0.0, 0), V(-0.42, 0.3, 0), 0.04, plain(0xdc2626, 0.4, 0.3))); // mono shock
  // fork, headlight, bars, fenders
  for (const s of [1, -1]) g.add(rod(V(0.62, 0.62, s * 0.09), V(front.x, front.y, s * 0.09), 0.03, chrome()));
  g.add(rod(V(0.5, 0.78, -0.34), V(0.5, 0.78, 0.34), 0.02, trim()));
  g.add(mesh(colourFaces(new THREE.CylinderGeometry(0.12, 0.1, 0.12, 20), () => red), paint(), { pos: [0.74, 0.62, 0], rot: [0, 0, -Math.PI / 2] })); // headlight cowl
  g.add(disc(0.09, 0.03, glow(0xfff6d8), [0.8, 0.62, 0]));
  g.add(box(0.08, 0.04, 0.1, glow(0xd62828), [-0.96, 0.42, 0]));
  for (const [w, a0, len] of [[front, 0.3, 1.9], [rear, 1.3, 1.5]]) {
    const f = mesh(new THREE.TorusGeometry(w.r + 0.06, 0.035, 5, 16, len), paint(), { pos: [w.x, w.y, 0], rot: [0, 0, a0] });
    f.geometry = colourFaces(f.geometry, () => red);
    f.scale.z = 2.4;
    g.add(f);
  }
  // exhaust
  g.add(rod(V(0.05, -0.08, 0.17), V(-0.45, -0.05, 0.17), 0.035, chrome()));
  g.add(rod(V(-0.45, 0.0, 0.17), V(-0.98, 0.1, 0.17), 0.06, plain(0x9ca3af, 0.25, 1)));
  g.add(rider(ART_POSE.bike, { shirt: 0x2b2b2b, pants: 0x334155, helmet: 0x1d4ed8, glove: 0x111111, boots: 0x1a1a1a, handZ: 0.3 }));
  addWheels(g, v, 'moto', 0.13, [[0], [0]]);
  return g;
}

// ---- cars ---------------------------------------------------------------------
// One extruded body with glass painted onto the windscreen faces, plus side windows.
// isGlass decides which faces of the profile edge are windscreen or rear window.
const steepGlass = (belt, top) => (m, n) => m.y > belt + 0.04 && m.y < top - 0.04 && Math.abs(n.x) > 0.35 && Math.abs(n.z) < 0.6;

function carBody(g, { outline, windows, width, belt, top, taper, colourOf, isGlass = steepGlass(belt, top) }) {
  const scaleAt = tumblehome(belt, top, taper);
  const geo = colourFaces(extrude(shapeFrom(outline), width, 0.07), (m, n) => (isGlass(m, n) ? col('#0d151d') : colourOf(m, n)));
  g.add(mesh(toCreasedNormals(squeeze(geo, scaleAt), Math.PI / 5), paint()));
  sideWindows(g, windows, width / 2, scaleAt);
  return scaleAt;
}

const mirrored = (g, make) => [1, -1].forEach((s) => g.add(make(s)));

function buildHatchback(v, skin) {
  const g = new THREE.Group();
  const width = 1.62;
  const blue = col(skin.body);
  // windows as one blacked-out band (the 2D art has black pillars)
  carBody(g, { outline: hatchOutline, windows: [[[-1.62, 0.58], [1.1, 0.56], [0.62, 1.06], [-1.55, 1.07]]], width, belt: 0.52, top: 1.16, taper: 0.2, colourOf: (m) => (m.y < -0.12 ? col('#202326') : blue) });
  g.add(box(0.16, 0.3, width - 0.06, plain(0x2a2d31, 0.6), [1.71, -0.04, 0])); // bumpers
  g.add(box(0.14, 0.3, width - 0.06, plain(0x2a2d31, 0.6), [-1.7, -0.04, 0]));
  g.add(box(0.05, 0.14, 0.7, trim(), [1.77, 0.18, 0])); // grille
  g.add(box(0.03, 0.11, 0.36, plain(0xf8fafc, 0.5), [1.79, -0.06, 0])); // plates
  g.add(box(0.03, 0.11, 0.36, plain(0xf8fafc, 0.5), [-1.78, 0.1, 0]));
  mirrored(g, (s) => {
    const p = new THREE.Group();
    p.add(box(0.1, 0.1, 0.3, glow(0xf1f5f9), [1.7, 0.34, s * 0.52])); // headlight
    p.add(box(0.06, 0.4, 0.14, glow(0xd62828), [-1.74, 0.7, s * 0.66])); // tall tail light
    p.add(box(0.14, 0.11, 0.08, trim(), [1.12, 0.68, s * 0.84])); // mirror
    p.add(rod(V(-1.45, 1.21, s * 0.5), V(0.4, 1.21, s * 0.5), 0.02, plain(0xb8bec4, 0.3, 0.8))); // roof rail
    p.add(box(0.14, 0.03, 0.01, plain(0x1b2b40), [0.29, 0.42, s * 0.815])); // door handles
    p.add(box(0.14, 0.03, 0.01, plain(0x1b2b40), [-0.55, 0.42, s * 0.815]));
    return p;
  });
  g.add(rod(V(-1.3, 1.16, 0), V(-1.52, 1.42, 0), 0.008, trim())); // antenna
  addWheels(g, v, 'hubcap', 0.21, [[-0.68, 0.68], [-0.68, 0.68]]);
  return g;
}

function buildHybrid(v, skin) {
  const g = new THREE.Group();
  const width = 1.76;
  const pearl = col(skin.body);
  carBody(g, {
    outline: hybridOutline,
    windows: [[[-1.6, 0.66], [0.98, 0.6], [0.12, 0.95], [-0.75, 0.94]]],
    width,
    belt: 0.56,
    top: 1.02,
    taper: 0.24,
    colourOf: (m) => (m.y < -0.13 ? col('#25282c') : pearl),
    // the windscreen is too shallow for the default test
    isGlass: (m, n) => Math.abs(n.z) < 0.6 && ((m.x > 0.12 && m.x < 1.12 && m.y > 0.56) || (m.x < -1.15 && m.y > 0.68 && m.y < 0.92)),
  });
  mirrored(g, (s) => {
    const p = new THREE.Group();
    p.add(box(0.3, 0.06, 0.28, glow(0xf8fafc), [1.86, 0.27, s * 0.54], [0, 0, -0.42])); // swept headlight
    p.add(box(0.12, 0.2, 0.32, glow(0xc1121f), [-1.93, 0.5, s * 0.6], [0, 0, 0.25])); // wraparound tail light
    p.add(box(0.12, 0.1, 0.07, plain(0x1f2328), [1.04, 0.68, s * 0.9])); // mirror
    p.add(box(2.6, 0.012, 0.01, plain(0xc3c9cf, 0.25, 1), [-0.3, 0.585, s * 0.885])); // window chrome
    p.add(box(0.14, 0.03, 0.01, plain(0x8a939b), [0.19, 0.44, s * 0.885]));
    p.add(box(0.14, 0.03, 0.01, plain(0x8a939b), [-0.65, 0.44, s * 0.885]));
    p.add(box(0.16, 0.05, 0.01, glow(0x3b82f6), [0.53, 0.08, s * 0.885])); // hybrid badge
    return p;
  });
  g.add(box(0.1, 0.12, 1.0, trim(), [2.03, -0.05, 0])); // lower grille
  g.add(box(0.04, 0.03, 1.5, plain(0x1f2328), [-1.95, 0.67, 0])); // spoiler lip
  g.add(box(0.03, 0.11, 0.36, plain(0xf8fafc, 0.5), [2.06, 0.06, 0]));
  addWheels(g, v, 'alloy', 0.21, [[-0.74, 0.74], [-0.74, 0.74]]);
  return g;
}

function buildJeep(v, skin) {
  const g = new THREE.Group();
  const width = 1.82;
  const green = col(skin.body);
  const roofWhite = col('#ecebe4');
  carBody(g, { outline: jeepOutline, windows: JEEP_WINDOWS, width, belt: 0.9, top: 1.58, taper: 0.05, colourOf: (m) => (m.y > 1.46 ? roofWhite : m.y < -0.06 ? col('#151515') : green) });
  const [rear, front] = v.wheels;
  mirrored(g, (s) => {
    const p = new THREE.Group();
    // black arch flares around both wheels
    for (const w of [rear, front]) p.add(mesh(new THREE.TorusGeometry(0.64, 0.06, 6, 18, Math.PI - 1.36), trim(), { pos: [w.x, w.y, s * 0.9], rot: [0, 0, 0.68] }));
    p.add(disc(0.11, 0.06, glow(0xf3f4f6), [2.01, 0.6, s * 0.6])); // round headlights
    p.add(disc(0.14, 0.04, chrome(), [2.0, 0.6, s * 0.6]));
    p.add(box(0.04, 0.07, 0.1, glow(0xf59e0b), [2.01, 0.38, s * 0.62]));
    p.add(box(0.04, 0.22, 0.1, glow(0xc1121f), [-1.87, 0.65, s * 0.78]));
    p.add(box(0.16, 0.14, 0.08, trim(), [0.8, 1.02, s * 0.96])); // mirror
    p.add(box(1.2, 0.05, 0.16, trim(), [-0.02, -0.15, s * 0.92])); // side step
    p.add(box(0.06, 0.08, 0.01, plain(0x1b1b1b), [0.69, 0.24, s * 0.912])); // hinges
    p.add(box(0.06, 0.08, 0.01, plain(0x1b1b1b), [0.69, 0.7, s * 0.912]));
    p.add(box(0.12, 0.035, 0.01, plain(0x9ca3af), [0.04, 0.82, s * 0.912]));
    p.add(rod(V(-1.75, 1.68, s * 0.78), V(0.45, 1.68, s * 0.78), 0.025, trim())); // roof rack rails
    return p;
  });
  for (const x of [-1.7, -0.9, -0.1, 0.4]) g.add(rod(V(x, 1.68, -0.78), V(x, 1.68, 0.78), 0.02, trim()));
  // grille and bumpers
  g.add(box(0.05, 0.3, 0.76, trim(), [2.0, 0.6, 0]));
  for (let i = 0; i < 4; i++) g.add(box(0.06, 0.02, 0.72, plain(0x3a3a3a), [2.01, 0.5 + i * 0.07, 0]));
  g.add(box(0.2, 0.26, width + 0.04, trim(), [2.05, 0.0, 0]));
  g.add(box(0.14, 0.2, width, trim(), [-1.9, -0.04, 0]));
  // snorkel up the right A-pillar
  g.add(rod(V(1.12, 0.3, 0.95), V(1.12, 0.86, 0.95), 0.045, trim()));
  g.add(rod(V(1.12, 0.86, 0.95), V(0.66, 1.62, 0.95), 0.045, trim()));
  g.add(box(0.2, 0.12, 0.12, trim(), [0.68, 1.68, 0.95]));
  // spare wheel on the rear door
  const spare = wheel(0.42, 0.26, 'offroad');
  spare.position.set(-2.02, 0.72, 0);
  spare.rotation.y = Math.PI / 2;
  g.add(spare);
  addWheels(g, v, 'offroad', 0.32, [[-0.76, 0.76], [-0.76, 0.76]]);
  return g;
}

function buildLorry(v, skin) {
  const g = new THREE.Group();
  const width = 1.6;
  const body = col(skin.body);
  carBody(g, { outline: lorryCabOutline, windows: LORRY_WINDOWS, width, belt: 0.84, top: 1.62, taper: 0.08, colourOf: (m) => (m.y < -0.12 ? col('#202326') : body), isGlass: (m, n) => n.x > 0.35 && m.y > 0.88 && m.y < 1.58 && Math.abs(n.z) < 0.6 }); // windscreen only
  // open cargo bed: two side walls, front bulkhead, tailgate, floor
  const wall = colourFaces(extrude(shapeFrom(lorryBedOutline), 0.07, 0.02, 10), () => body);
  for (const s of [1, -1]) {
    g.add(mesh(wall.clone(), paint(), { pos: [0, 0, s * (width / 2 - 0.035)] }));
    g.add(box(2.4, 0.05, 0.1, chrome(), [-0.67, 0.73, s * (width / 2 - 0.035)])); // top rail
    for (const y of [0.1, 0.4]) g.add(box(2.3, 0.015, 0.01, plain(0x000000, 0.8), [-0.67, y, s * (width / 2 + 0.002)]));
  }
  g.add(mesh(colourFaces(new THREE.BoxGeometry(0.07, 0.92, width), () => body), paint(), { pos: [-1.815, 0.26, 0] }));
  g.add(box(0.06, 0.62, width - 0.1, plain(0x2a2d31, 0.6), [0.5, 0.42, 0]));
  g.add(box(2.3, 0.06, width - 0.12, plain(0x5b4630, 0.85), [-0.67, 0.22, 0]));
  g.add(box(3.4, 0.12, 0.7, trim(), [-0.1, -0.14, 0])); // chassis
  // cargo
  const crate = plain(0x9a6b3c, 0.85);
  g.add(box(0.5, 0.42, 0.6, crate, [-1.35, 0.46, 0.3]), box(0.44, 0.3, 0.5, crate, [-0.78, 0.4, -0.25]), box(0.5, 0.42, 0.6, crate, [-1.35, 0.46, -0.38]));
  g.add(mesh(new THREE.SphereGeometry(0.3, 14, 10), plain(0xd8c9a3, 0.95), { pos: [-0.2, 0.42, 0.15], rot: [0, 0.4, 0] }));
  g.children.at(-1).scale.set(1.1, 0.55, 0.8);
  g.add(box(0.14, 0.3, width + 0.02, plain(0x2a2d31, 0.6), [1.74, -0.05, 0])); // bumper
  g.add(box(0.03, 0.11, 0.36, plain(0xf8fafc, 0.5), [1.82, -0.06, 0]));
  mirrored(g, (s) => {
    const p = new THREE.Group();
    p.add(disc(0.09, 0.05, glow(0xf8fafc), [1.8, 0.4, s * 0.55]));
    p.add(box(0.04, 0.06, 0.1, glow(0xf59e0b), [1.79, 0.22, s * 0.68]));
    p.add(box(0.04, 0.16, 0.1, glow(0xd62828), [-1.86, 0.58, s * 0.66]));
    p.add(rod(V(1.6, 1.12, s * 0.8), V(1.78, 1.2, s * 0.92), 0.015, trim()));
    p.add(box(0.06, 0.24, 0.1, trim(), [1.8, 1.24, s * 0.94])); // tall mirror
    p.add(box(1.18, 0.03, 0.01, plain(0xffffff, 0.5), [1.15, 0.77, s * (width / 2 + 0.005)])); // stripe
    return p;
  });
  addWheels(g, v, 'steel', 0.2, [[-0.6, 0.6], [-0.62, 0.62]]);
  return g;
}

function buildVan(v, skin) {
  const g = new THREE.Group();
  const width = 1.78;
  const body = col(skin.body);
  carBody(g, { outline: vanOutline, windows: VAN_WINDOWS, width, belt: 0.92, top: 1.86, taper: 0.1, colourOf: (m) => (m.y < -0.12 ? col('#25282c') : body) });
  g.add(box(0.16, 0.32, width - 0.04, plain(0x2a2d31, 0.6), [2.1, -0.04, 0])); // bumpers
  g.add(box(0.14, 0.3, width - 0.04, plain(0x2a2d31, 0.6), [-2.08, -0.05, 0]));
  g.add(box(0.05, 0.16, 0.9, trim(), [2.14, 0.32, 0])); // grille
  g.add(box(0.03, 0.11, 0.36, plain(0xf8fafc, 0.5), [2.18, -0.06, 0]));
  g.add(box(0.03, 0.11, 0.36, plain(0xf8fafc, 0.5), [-2.15, 0.1, 0]));
  mirrored(g, (s) => {
    const p = new THREE.Group();
    p.add(box(0.12, 0.16, 0.34, glow(0xf8fafc), [2.06, 0.52, s * 0.6], [0, 0, 0.3]));
    p.add(box(0.05, 0.5, 0.12, glow(0xd62828), [-2.12, 0.65, s * 0.76]));
    p.add(box(0.14, 0.2, 0.08, trim(), [1.98, 1.06, s * 0.96])); // mirror
    p.add(box(2.2, 0.03, 0.02, plain(0x2b2f35), [-0.2, 0.92, s * (width / 2 + 0.005)])); // sliding door rail
    p.add(box(0.14, 0.03, 0.01, plain(0x2b2f35), [1.17, 0.8, s * (width / 2 + 0.005)]));
    p.add(rod(V(-1.9, 1.94, s * 0.62), V(1.2, 1.94, s * 0.62), 0.025, trim())); // roof rails
    return p;
  });
  addWheels(g, v, 'hubcap', 0.22, [[-0.74, 0.74], [-0.74, 0.74]]);
  return g;
}

const BUILDERS = { tuktuk: buildTuktuk, bike: buildBike, hatchback: buildHatchback, lorry: buildLorry, hybrid: buildHybrid, van: buildVan, jeep: buildJeep };
const cache = {};

/** The vehicle in a paint skin as a ready-to-place group: resting on y = 0, centred in x. */
export function vehicleModel(id, skin = getSkin(id)) {
  const key = `${id}:${skin.id}`;
  if (cache[key]) return cache[key];
  const v = getVehicle(id);
  const body = BUILDERS[v.id](v, skin);
  const bounds = new THREE.Box3().setFromObject(body);
  body.position.set(-(bounds.min.x + bounds.max.x) / 2, -Math.min(...v.wheels.map((w) => w.y - w.r)), 0);
  const root = new THREE.Group();
  root.add(body);
  const size = bounds.getSize(new THREE.Vector3());
  root.userData = { length: size.x, height: size.y, width: size.z };
  return (cache[key] = root);
}
