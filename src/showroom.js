// 3D showroom behind the home screen and garage: the vehicle on a turntable,
// framed into a DOM "slot" element so the HTML layout decides where it sits.
// Two sets share one scene: 'home' (hill country outdoors) and 'garage' (indoor turntable).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { vehicleModel } from './models3d.js';
import { getMap } from './maps.js';

const FOV = 30;

function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#4d9fd8');
  g.addColorStop(0.55, '#bfe0ef');
  g.addColorStop(1, '#f3e6c9');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// soft round "glow" texture for the garage floor spot
function spotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,236,200,0.55)');
  g.addColorStop(1, 'rgba(255,236,200,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

const std = (color, roughness = 0.9, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });

// coconut palm: curved trunk and drooping fronds
function palmTree(height, lean, turn) {
  const t = new THREE.Group();
  const top = new THREE.Vector3(lean * height, height, 0);
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(), new THREE.Vector3(0, height * 0.6, 0), top);
  t.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.13, 6), std(0x8a7355)));
  const leaf = new THREE.ConeGeometry(0.32, 2.6, 4);
  leaf.translate(0, 1.3, 0);
  const leafMat = std(0x3f8a3c, 0.8, { flatShading: true });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const m = new THREE.Mesh(leaf, leafMat);
    m.scale.z = 0.18;
    m.position.copy(top);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(Math.cos(a), -0.35, Math.sin(a)).normalize());
    t.add(m);
  }
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), std(0x6b4f2a));
    c.position.copy(top).add(new THREE.Vector3(Math.cos(i * 2.1) * 0.15, -0.15, Math.sin(i * 2.1) * 0.15));
    t.add(c);
  }
  t.rotation.y = turn;
  t.traverse((o) => (o.castShadow = true));
  return t;
}

function hillsDecor() {
  const set = new THREE.Group();
  // rolling hills and misty mountains behind
  const hills = [
    [-14, -22, 9, 4.5, 0x4f7f2e], [6, -26, 12, 6, 0x5c8a34], [24, -24, 9, 5, 0x47752a],
    [-30, -40, 14, 9, 0x7f9fae], [0, -48, 18, 12, 0x8eaebd], [32, -44, 15, 10, 0x7f9fae],
  ];
  for (const [x, z, r, h, color] of hills) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), std(color, 1, { flatShading: true }));
    m.scale.set(r, h, r * 0.7);
    m.position.set(x, -0.5, z);
    set.add(m);
  }
  // tea bushes in rows, and a few trees
  const bush = new THREE.SphereGeometry(0.45, 8, 6);
  const bushMat = std(0x3f7a2a, 1, { flatShading: true });
  for (let row = 0; row < 5; row++) {
    for (let i = -10; i <= 10; i++) {
      const b = new THREE.Mesh(bush, bushMat);
      b.position.set(i * 1.3 + (row % 2) * 0.6, 0, -6 - row * 1.6);
      b.scale.y = 0.7;
      set.add(b);
    }
  }
  const trunk = new THREE.CylinderGeometry(0.08, 0.12, 1.4, 6);
  const crown = new THREE.ConeGeometry(0.9, 2.4, 7);
  for (const [x, z, s] of [[-7, -4, 1], [-9.5, -9, 1.3], [8, -4.5, 1.1], [11, -10, 1.4], [-4, -15, 1.2], [4.5, -16, 1.5]]) {
    const t = new THREE.Group();
    t.add(new THREE.Mesh(trunk, std(0x5b3a1e)));
    const c = new THREE.Mesh(crown, std(0x2f5e24, 1, { flatShading: true }));
    c.position.y = 1.6;
    t.add(c);
    t.position.set(x, 0.7 * s - 0.16, z);
    t.scale.setScalar(s);
    t.traverse((o) => (o.castShadow = true));
    set.add(t);
  }
  return set;
}

function coastDecor() {
  const set = new THREE.Group();
  // rough enough not to mirror the bright studio environment (it went white)
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(240, 90), std(0x2a8fbf, 0.45, { envMapIntensity: 0.25 }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.04, -55); // well above the sand, or the sand wins the depth test far away
  const surf = new THREE.Mesh(new THREE.PlaneGeometry(240, 0.6), std(0xffffff, 0.6));
  surf.rotation.x = -Math.PI / 2;
  surf.position.set(0, 0.05, -10.2);
  set.add(sea, surf);
  for (const [x, z, h, lean, turn] of [[-6.5, -4, 4.2, 0.25, 0.4], [-9, -7.5, 5, 0.18, 2], [-4.5, -8, 3.6, 0.3, 1.1], [7, -5, 4.6, -0.2, -0.3], [10, -8, 5.2, 0.22, 2.6], [5.5, -9, 3.4, 0.25, 0.9]]) {
    const p = palmTree(h, lean, turn);
    p.position.set(x, -0.16, z);
    set.add(p);
  }
  // rocks at the water's edge
  const rockMat = std(0x7a7068, 0.9, { flatShading: true });
  for (const [x, z, r] of [[-3, -10, 0.8], [-1.8, -10.6, 0.5], [3.5, -10.4, 0.9], [12, -11, 1.2]]) {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rockMat);
    m.position.set(x, -0.1, z);
    m.scale.y = 0.6;
    set.add(m);
  }
  // distant lighthouse on a headland, and a fishing boat
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), std(0x5f7a4a, 1, { flatShading: true }));
  head.scale.set(9, 2.2, 5);
  head.position.set(26, -0.5, -40);
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.7, 6, 12), std(0xf7f7f2, 0.6));
  tower.position.set(25, 4.3, -40);
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.6, 12), std(0x2d2d2d, 0.5));
  lamp.position.set(25, 7.5, -40);
  set.add(head, tower, lamp);
  const boat = new THREE.Group();
  boat.add(new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.3, 0.45), std(0x5b3b22)));
  const sail = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.4, 3), std(0xf0e6d0));
  sail.scale.z = 0.05;
  sail.position.y = 1.3;
  boat.add(sail);
  boat.position.set(-12, 0, -26);
  set.add(boat);
  return set;
}

// windows texture for city blocks: rows of lit and dark panes
function windowsTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#9fb0bd';
  ctx.fillRect(0, 0, 64, 128);
  for (let y = 4; y < 128; y += 10) {
    for (let x = 4; x < 64; x += 10) {
      ctx.fillStyle = Math.random() < 0.3 ? '#f3e2a8' : '#5d7383';
      ctx.fillRect(x, y, 6, 6);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function cityDecor() {
  const set = new THREE.Group();
  const tex = windowsTexture();
  const blocks = [
    [-14, -20, 5, 14, 0xb8c4cc], [-8, -24, 4, 22, 0x9fb0bd], [-3, -28, 6, 12, 0xc9c1b4], [9, -22, 5, 18, 0xaab8c4],
    [15, -18, 4, 10, 0xd3c6b0], [20, -26, 6, 26, 0x9fb0bd], [-20, -30, 7, 16, 0xaab8c4], [3, -34, 5, 30, 0x8fa1ae],
  ];
  for (const [x, z, w, h, color] of blocks) {
    const map = tex.clone();
    map.repeat.set(w / 4, h / 8);
    map.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), new THREE.MeshStandardMaterial({ color, map, roughness: 0.8 }));
    m.position.set(x, h / 2 - 0.16, z);
    set.add(m);
  }
  // Lotus Tower: purple shaft, green sepals, pink bud, spire
  const tower = new THREE.Group();
  tower.add(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1, 26, 12), std(0x6a4c93, 0.6)));
  const sepal = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.6, 10, 1, true), std(0x4e9a5a, 0.6, { side: THREE.DoubleSide }));
  sepal.rotation.x = Math.PI;
  sepal.position.y = 13.4;
  const bud = new THREE.Mesh(new THREE.SphereGeometry(1.9, 16, 12), std(0xd873a6, 0.5));
  bud.scale.y = 1.4;
  bud.position.y = 15.2;
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.2, 6, 6), std(0xd9d4e0));
  spire.position.y = 20;
  tower.add(sepal, bud, spire);
  tower.position.set(-6, 12.8, -36);
  set.add(tower);
  for (const [x, z, h, lean, turn] of [[-7, -6, 4, 0.2, 0.3], [8, -7, 4.6, -0.2, 2.2], [-10, -10, 5, 0.15, 1.4]]) {
    const p = palmTree(h, lean, turn);
    p.position.set(x, -0.16, z);
    set.add(p);
  }
  // lane markings on the asphalt
  for (let i = -6; i <= 6; i++) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.18), std(0xf2f2ee, 0.6));
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(i * 3.2, -0.15, -4.2);
    set.add(dash);
  }
  return set;
}

// Rajarata: a white dagoba, a granite rock like Sigiriya, the tank and scrub trees
function dryZoneDecor() {
  const set = new THREE.Group();
  const white = std(0xf3f0e8, 0.7);
  const stupa = new THREE.Group();
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.6, 0.8, 24), white);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(3.6, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), white);
  dome.position.y = 0.4;
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 1.4), white);
  box.position.y = 4.4;
  const spire = new THREE.Mesh(new THREE.ConeGeometry(0.45, 3.2, 12), std(0xd9c58a, 0.5));
  spire.position.y = 6.4;
  stupa.add(plinth, dome, box, spire);
  stupa.position.set(-11, 0.2, -24);
  set.add(stupa);
  const rock = new THREE.Mesh(new THREE.CylinderGeometry(5, 6.5, 14, 9), std(0x9a8676, 1, { flatShading: true }));
  rock.position.set(16, 6.5, -46);
  rock.scale.z = 0.8;
  const garden = new THREE.Mesh(new THREE.CylinderGeometry(5.05, 5, 0.4, 9), std(0x7d9a58));
  garden.position.set(16, 13.6, -46);
  garden.scale.z = 0.8;
  set.add(rock, garden);
  const tank = new THREE.Mesh(new THREE.PlaneGeometry(200, 26), std(0x5d93a6, 0.4, { envMapIntensity: 0.25 }));
  tank.rotation.x = -Math.PI / 2;
  tank.position.set(0, -0.12, -32);
  set.add(tank);
  const trunk = new THREE.CylinderGeometry(0.1, 0.16, 1.6, 6);
  const crown = new THREE.SphereGeometry(1.4, 8, 6);
  for (const [x, z, s] of [[-6, -6, 1], [-8.5, -10, 1.2], [7, -5.5, 1.1], [10, -11, 1.3], [3, -14, 1], [-3.5, -15, 1.2]]) {
    const t = new THREE.Group();
    t.add(new THREE.Mesh(trunk, std(0x5a4a3a)));
    const c = new THREE.Mesh(crown, std(0x6b7a38, 1, { flatShading: true }));
    c.scale.y = 0.45;
    c.position.y = 1.0;
    t.add(c);
    t.position.set(x, 0.65 * s - 0.16, z);
    t.scale.setScalar(s);
    t.traverse((o) => (o.castShadow = true));
    set.add(t);
  }
  return set;
}

function outdoorSet() {
  const set = new THREE.Group();
  const ground = new THREE.Mesh(new THREE.CircleGeometry(80, 48), std(0x6f9c3c));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.16; // below the podium top, which the vehicle stands on
  ground.receiveShadow = true;
  // stone podium with a saffron rim
  const podium = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.85, 0.16, 64), std(0xdccfb4, 0.8));
  podium.position.y = -0.08;
  podium.receiveShadow = true;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(2.72, 0.05, 8, 64), std(0xf4a300, 0.5));
  rim.rotation.x = Math.PI / 2;
  const themes = { hills: hillsDecor(), coast: coastDecor(), colombo: cityDecor(), rajarata: dryZoneDecor() };
  set.add(ground, podium, rim, ...Object.values(themes));
  const hemi = new THREE.HemisphereLight(0xd8ecff, 0x5d6b3a, 1.1);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
  sun.position.set(5, 9, 6);
  set.add(hemi, sun, sun.target);
  return { set, light: sun, themes, ground, background: skyTexture(), fog: new THREE.Fog(0xcfe3ea), fogRange: [12, 60], env: 0.55 };
}

function garageSet() {
  const set = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 48), std(0x1b1e24, 0.55, { metalness: 0.2 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.1;
  floor.receiveShadow = true;
  const glowSpot = new THREE.Mesh(new THREE.CircleGeometry(4.5, 48), new THREE.MeshBasicMaterial({ map: spotTexture(), transparent: true, depthWrite: false }));
  glowSpot.rotation.x = -Math.PI / 2;
  glowSpot.position.y = -0.095;
  const table = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.75, 0.1, 64), std(0x2b2f37, 0.35, { metalness: 0.6 }));
  table.position.y = -0.05;
  table.receiveShadow = true;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.74, 0.025, 8, 96), new THREE.MeshBasicMaterial({ color: 0xf4a300 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -0.02;
  set.add(floor, glowSpot, table, ring);
  // light strips on the back wall
  const strip = new THREE.BoxGeometry(0.12, 5, 0.12);
  const stripMat = new THREE.MeshBasicMaterial({ color: 0xffe2b0 });
  for (let i = -4; i <= 4; i++) {
    const s = new THREE.Mesh(strip, stripMat);
    s.position.set(i * 2.6, 2.5, -11 + Math.abs(i) * 0.6);
    set.add(s);
  }
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(13, 13, 9, 48, 1, true, Math.PI * 0.6, Math.PI * 0.8), std(0x22262d, 0.9, { side: THREE.BackSide }));
  wall.position.set(0, 4.5, 1);
  set.add(wall);
  const hemi = new THREE.HemisphereLight(0x9fb0c8, 0x1a1a1a, 0.7);
  const key = new THREE.SpotLight(0xfff4e0, 90, 20, 0.62, 0.6, 1.4);
  key.position.set(1.5, 8, 4);
  const rimLight = new THREE.DirectionalLight(0x8fb4ff, 1.2);
  rimLight.position.set(-6, 4, -6);
  set.add(hemi, key, key.target, rimLight);
  return { set, light: key, background: new THREE.Color(0x14161b), fog: new THREE.Fog(0x14161b), fogRange: [3, 20], env: 0.45 };
}

export class Showroom {
  constructor(canvas) {
    this.canvas = canvas;
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    } catch {
      this.renderer = null; // no WebGL: main.js falls back to 2D pictures
      return;
    }
    const r = this.renderer;
    r.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 400);

    this.sets = { home: outdoorSet(), garage: garageSet() };
    for (const s of Object.values(this.sets)) {
      s.light.castShadow = true;
      s.light.shadow.mapSize.set(1024, 1024);
      s.light.shadow.bias = -0.0005;
      s.light.shadow.normalBias = 0.02;
      const cam = s.light.shadow.camera;
      if (cam.isOrthographicCamera) Object.assign(cam, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 25 });
      this.scene.add(s.set);
    }

    this.turntable = new THREE.Group();
    this.scene.add(this.turntable);
    this.angle = -0.55; // three-quarter front view
    this.spin = 0;
    this.dragging = false;
    this.anim = 1;
    this.bounce = 0;
    this.slot = null;
    this.setScene('home');
    this.bindDrag();
  }

  get ok() {
    return !!this.renderer;
  }

  setScene(name) {
    if (!this.ok) return;
    this.sceneName = name;
    for (const [k, s] of Object.entries(this.sets)) s.set.visible = k === name;
    const s = this.sets[name];
    this.scene.background = s.background;
    this.scene.fog = s.fog;
    this.scene.environmentIntensity = s.env;
  }

  /** Home scenery for a map (its `showroom` entry in maps.js). */
  setTheme(mapId) {
    const home = this.sets.home;
    const { decor, ground, fog } = getMap(mapId).showroom;
    for (const [k, g] of Object.entries(home.themes)) g.visible = k === decor;
    home.ground.material.color.set(ground);
    home.fogRange = fog;
  }

  setSlot(el) {
    this.slot = el;
  }

  setVehicle(id, skin) {
    if (!this.ok) return;
    const key = `${id}:${skin?.id}`;
    if (key === this.vehicleKey) return;
    const repaint = id === this.vehicleId; // same vehicle, new paint: swap without the drop-in
    this.vehicleId = id;
    this.vehicleKey = key;
    this.turntable.clear();
    const model = (this.modelOf ?? vehicleModel)(id, skin); // SL Racing sets its own cars' models
    this.turntable.add(model);
    this.model = model;
    if (repaint) this.bounce = 1;
    else this.anim = 0; // drop-in animation
  }

  /** Little hop, e.g. after buying an upgrade. */
  pulse() {
    this.bounce = 1;
  }

  bindDrag() {
    let lastX = 0;
    let lastT = 0;
    addEventListener('pointerdown', (e) => {
      if (!this.slot || !this.slot.contains(e.target) || e.target.closest('button')) return;
      this.dragging = true;
      lastX = e.clientX;
      lastT = performance.now();
      this.spin = 0;
    });
    addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const now = performance.now();
      const d = (e.clientX - lastX) * 0.01;
      this.angle += d;
      this.spin = d / Math.max((now - lastT) / 1000, 0.008);
      lastX = e.clientX;
      lastT = now;
    });
    const stop = () => (this.dragging = false);
    addEventListener('pointerup', stop);
    addEventListener('pointercancel', stop);
  }

  // Place the camera so the model fills the slot rectangle.
  frame(W, H) {
    const rect = this.slot?.getBoundingClientRect();
    if (!rect || rect.width < 10 || rect.height < 10) return false;
    const { length, height, width } = this.model.userData;
    const elev = this.sceneName === 'garage' ? 0.2 : 0.26;
    const radius = Math.hypot(length, width) / 2; // footprint while it turns
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const pxPerM = Math.min((rect.width * 0.8) / (2 * radius), (rect.height * 0.72) / (height * Math.cos(elev) + radius * 2 * Math.sin(elev)));
    const dist = H / (pxPerM * 2 * tanHalf);
    const target = new THREE.Vector3(0, height * 0.5, 0);
    this.camera.position.set(0, target.y + Math.sin(elev) * dist, Math.cos(elev) * dist);
    // fog starts behind the vehicle however far back the camera sits (small slots = far camera)
    const [near, far] = this.sets[this.sceneName].fogRange;
    this.scene.fog.near = dist + near;
    this.scene.fog.far = dist + far;
    this.camera.lookAt(target);
    this.camera.aspect = W / H;
    // shift the image so the target lands in the middle of the slot
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    this.camera.setViewOffset(W, H, W / 2 - cx, H / 2 - cy, W, H);
    this.camera.updateProjectionMatrix();
    return true;
  }

  render(dt) {
    if (!this.ok || !this.model) return;
    const W = innerWidth;
    const H = innerHeight;
    const size = this.renderer.getSize(new THREE.Vector2());
    if (size.x !== W || size.y !== H) this.renderer.setSize(W, H, false);
    if (!this.frame(W, H)) return;

    if (!this.dragging) {
      this.spin *= Math.exp(-dt * 2.5); // fling decays...
      this.angle += (this.spin + 0.28) * dt; // ...back to a slow idle turn
    }
    this.turntable.rotation.y = this.angle;
    this.anim = Math.min(this.anim + dt * 2.8, 1);
    const ease = 1 - Math.pow(1 - this.anim, 3);
    this.bounce = Math.max(this.bounce - dt * 2.2, 0);
    this.model.position.y = (1 - ease) * 0.6 + Math.sin(this.bounce * Math.PI) * 0.18;
    this.model.scale.setScalar(0.9 + 0.1 * ease);
    this.renderer.render(this.scene, this.camera);
  }
}
