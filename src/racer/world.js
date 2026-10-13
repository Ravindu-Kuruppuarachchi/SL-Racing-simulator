// The 3D scene for a route (track.js): terrain, road, barriers, water, scenery, towns,
// landmarks, item boxes, boost pads and coins. Built once per race.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ROAD_HALF, STEP, WALL } from './track.js';
import { hash, mulberry32 } from '../terrain.js';
import { LANDMARKS } from '../landmarks.js';
import { LANDMARKS3D } from './landmarks3d.js';
import { vehicleModel } from '../models3d.js';
import { getSkin } from '../vehicles.js';

// How each map looks.
const THEMES = {
  hills: { sky: ['#4f9fd8', '#d5e9f1'], fog: [0xcfe2ea, 140, 520], grass: [0x5c9638, 0x3d7429], rock: 0x8a8f86, verge: 0x8b6b45, hills: 34, rise: 0.12, rail: 0xf2f2ee, scenery: { tea: 5, pine: 3, round: 1, house: 0.4 } },
  coast: { sky: ['#2f9ae0', '#eaf5f4'], fog: [0xe2eff2, 160, 560], grass: [0xdcc68e, 0x8fae5c], rock: 0x9c9284, verge: 0xdcc38c, hills: 6, rise: 0, sea: true, rail: 0xffffff, scenery: { palm: 8, banana: 2, bush: 2, rock: 1 } },
  colombo: { sky: ['#5d9ccc', '#dde6ea'], fog: [0xd6e0e4, 130, 480], grass: [0x6f8f4f, 0x8d9184], rock: 0x8a8a84, verge: 0x9d9c96, hills: 4, rise: 0, rail: 0xc9c9c2, scenery: { building: 7, palm: 3, banana: 1, round: 1 } },
  knuckles: { sky: ['#8aa9bd', '#dde6ea'], fog: [0xd2dde2, 60, 300], grass: [0x3d7a42, 0x2b5a33], rock: 0x7f857d, verge: 0x7a5b3c, hills: 55, rise: 0.2, rail: 0xeeeeea, scenery: { pine: 6, round: 2, rock: 1.5, fern: 1 } },
  kelani: { sky: ['#6aa3c7', '#d9e8ea'], fog: [0xcfe0e0, 90, 380], grass: [0x2f7a3a, 0x24602d], rock: 0x6f756c, verge: 0x6e5a3c, hills: 40, rise: 0.14, rail: 0xe8e8e2, scenery: { round: 4, palm: 3, banana: 2, fern: 3, bamboo: 2 } },
  rajarata: { sky: ['#3f93d6', '#f1e6c9'], fog: [0xeee2c4, 170, 600], grass: [0xb59c5c, 0x8c8a48], rock: 0x9a8676, verge: 0xb8582e, hills: 7, rise: 0, tank: true, rail: 0x8a6a45, scenery: { scrub: 5, rock: 2.5, palm: 2, banana: 0.8, stupa: 0.15 } },
};

export const themeOf = (mapId) => THEMES[mapId] ?? THEMES.hills;

// Shopfronts and house fronts, painted onto the face of each building that looks at the road.
const SHOP_FACADES = [
  { name: 'PERERA STORES', wall: 0xf2d16b, sign: '#c0392b', shutter: '#5f6b73' },
  { name: 'NIMAL TEA KADE', wall: 0x9fd3c7, sign: '#1f6f4a', shutter: '#6b4a2a' },
  { name: 'SILVA HARDWARE', wall: 0xf3efe6, sign: '#1f4fd1', shutter: '#5f6b73' },
  { name: 'LANKA PHARMACY', wall: 0xffffff, sign: '#2a9d4f', shutter: '#9aa3ab' },
  { name: 'FERNANDO BAKERY', wall: 0xf6c9a8, sign: '#8a3507', shutter: '#6b4a2a' },
  { name: 'HOTEL SAMAN', wall: 0xf7e7c6, sign: '#7a1e2c', shutter: '#6b4a2a' },
  { name: 'RUWAN COMMUNICATION', wall: 0xc7d8f2, sign: '#d62828', shutter: '#5f6b73' },
  { name: 'KAMAL TEXTILES', wall: 0xf4b6c8, sign: '#6a2fb0', shutter: '#5f6b73' },
  { name: 'JAYA SALON', wall: 0xe0f0b0, sign: '#0fa39a', shutter: '#9aa3ab' },
  { name: 'SUNIL MOTORS', wall: 0xd9d4c8, sign: '#f2701c', shutter: '#3a3f48' },
];
const HOUSE_FACADES = [
  { wall: 0xf4b6c8, trim: '#ffffff', door: '#6b3a1e' },
  { wall: 0xb8e0a8, trim: '#ffffff', door: '#1f4f8a' },
  { wall: 0xf7e08a, trim: '#2a6f4a', door: '#7a1e2c' },
  { wall: 0xa8d8f0, trim: '#ffffff', door: '#6b3a1e' },
  { wall: 0xf3efe6, trim: '#2f6eb5', door: '#3d6b2a' },
];
const PEOPLE = [0xd62828, 0x1f4fd1, 0xf2c400, 0x2a9d4f, 0xffffff, 0xf2701c, 0x6a2fb0, 0xe0559a, 0x0fa39a, 0x8a3507];
const TUK_PAINTS = ['maroon', 'leaf', 'yellow', 'blue'].map((id) => getSkin('tuktuk', id));

const hexCss = (n) => `#${n.toString(16).padStart(6, '0')}`;

function facadeTexture(f, shop) {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = hexCss(f.wall);
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.06)'; // weathering
    for (let i = 0; i < 40; i++) ctx.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 20, 1 + Math.random() * 4);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; // plinth
    ctx.fillRect(0, h - 10, w, 10);
    const window = (x, y, ww, hh, frame) => {
      ctx.fillStyle = frame;
      ctx.fillRect(x - 4, y - 4, ww + 8, hh + 8);
      ctx.fillStyle = '#2b3a46';
      ctx.fillRect(x, y, ww, hh);
      ctx.fillStyle = 'rgba(190,225,245,0.45)';
      ctx.fillRect(x + 2, y + 2, ww / 2 - 3, hh - 4);
      ctx.strokeStyle = frame; // panes and grille
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + ww / 2, y);
      ctx.lineTo(x + ww / 2, y + hh);
      for (let gy = y + 8; gy < y + hh; gy += 9) {
        ctx.moveTo(x, gy);
        ctx.lineTo(x + ww, gy);
      }
      ctx.stroke();
    };
    if (shop) {
      // upstairs windows, a signboard, and the shopfront: a door between open shutters
      window(36, 26, 48, 44, '#ffffff');
      window(172, 26, 48, 44, '#ffffff');
      ctx.fillStyle = f.sign;
      ctx.fillRect(10, 92, w - 20, 40);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(f.name, w / 2, 113, w - 34);
      ctx.fillStyle = '#3a2a1e'; // the open shop: a dark interior with goods on shelves
      ctx.fillRect(18, 150, w - 36, 96);
      const goods = ['#d62828', '#f2c400', '#2a9d4f', '#1f4fd1', '#f2701c', '#ffffff'];
      for (let row = 0; row < 3; row++) for (let i = 0; i < 14; i++) {
        ctx.fillStyle = goods[(i + row * 3) % goods.length];
        ctx.fillRect(26 + i * 15, 160 + row * 26, 10, 14);
      }
      ctx.fillStyle = f.shutter; // half-rolled shutters either side
      for (const x of [18, w - 58]) {
        ctx.fillRect(x, 150, 40, 96);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        for (let y = 154; y < 246; y += 6) ctx.fillRect(x, y, 40, 2);
        ctx.fillStyle = f.shutter;
      }
    } else {
      // a house: two framed windows and a panelled door, with a little name plate
      window(26, 70, 56, 64, f.trim);
      window(174, 70, 56, 64, f.trim);
      ctx.fillStyle = f.trim;
      ctx.fillRect(98, 106, 60, 150);
      ctx.fillStyle = f.door;
      ctx.fillRect(104, 112, 48, 144);
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 2;
      ctx.strokeRect(110, 120, 36, 50);
      ctx.strokeRect(110, 180, 36, 60);
      ctx.fillStyle = '#d9c58a';
      ctx.beginPath();
      ctx.arc(146, 185, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; // a ventilation pattern under the eaves
      for (let x = 20; x < w - 20; x += 16) ctx.fillRect(x, 24, 8, 8);
    }
  }, false);
}

const CELL = 6; // terrain grid spacing (m)
const REACH = 240; // terrain drawn this far from the road

// smooth value noise in 0..1
function noise(x, z) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fz = z - zi;
  const h = (a, b) => hash(a * 157.31 + b * 311.7);
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const top = h(xi, zi) + (h(xi + 1, zi) - h(xi, zi)) * sx;
  const bottom = h(xi, zi + 1) + (h(xi + 1, zi + 1) - h(xi, zi + 1)) * sx;
  return top + (bottom - top) * sz;
}
const fbm = (x, z) => noise(x / 140, z / 140) * 0.6 + noise(x / 55, z / 55) * 0.28 + noise(x / 20, z / 20) * 0.12;
const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function canvasTexture(w, h, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

// A light speckle of blades and grit, multiplied over the ground's colour so it isn't flat.
let detail = null;
function detailTexture(strength = 0.22) {
  if (detail?.[strength]) return detail[strength];
  const t = canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 1800; i++) {
      const v = Math.round(255 * (1 - strength * Math.random()));
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      const x = Math.random() * w;
      const y = Math.random() * h;
      if (Math.random() < 0.6) ctx.fillRect(x, y, 1, 2 + Math.random() * 3); // blades
      else ctx.fillRect(x, y, 2, 2); // grit
    }
  });
  t.colorSpace = THREE.NoColorSpace;
  detail = { ...detail, [strength]: t };
  return t;
}

export class World {
  constructor(track) {
    this.track = track;
    this.theme = themeOf(track.map.id);
    this.group = new THREE.Group();
    this.rand = mulberry32(track.map.id.length * 977 + 13);
    this.buildDistance();
    this.waterLevel = this.theme.sea ? Math.min(...track.py) - 4 : this.theme.tank ? Math.min(...track.py) - 1.2 : -Infinity;
    this.buildTerrain();
    this.buildRoad();
    this.buildWater();
    this.planLandmarks();
    this.buildScenery();
    this.buildTowns();
    this.buildLandmarkViews();
    this.buildPickups();
    this.buildObstacles();
    this.buildSigns();
    this.buildKerbs();
    this.buildGorges();
    this.buildTownLife();
    this.buildSky();
  }

  // ---- distance to the road, for every terrain grid point -------------------------------
  buildDistance() {
    const t = this.track;
    const b = t.bounds;
    this.gx0 = Math.floor((b.x0 - REACH) / CELL) * CELL;
    this.gz0 = Math.floor((b.z0 - REACH) / CELL) * CELL;
    this.cols = Math.ceil((b.x1 + REACH - this.gx0) / CELL) + 1;
    this.rows = Math.ceil((b.z1 + REACH - this.gz0) / CELL) + 1;
    const count = this.cols * this.rows;
    this.dist = new Float32Array(count).fill(Infinity);
    this.near = new Int32Array(count).fill(-1); // nearest road sample
    this.side = new Float32Array(count);
    const r = Math.ceil(REACH / CELL);
    for (let i = 0; i < t.n; i += 2) {
      const ci = Math.round((t.px[i] - this.gx0) / CELL);
      const cj = Math.round((t.pz[i] - this.gz0) / CELL);
      const h = t.hdg[i];
      for (let dj = -r; dj <= r; dj++) {
        const j = cj + dj;
        if (j < 0 || j >= this.rows) continue;
        for (let di = -r; di <= r; di++) {
          const c = ci + di;
          if (c < 0 || c >= this.cols) continue;
          const x = this.gx0 + c * CELL - t.px[i];
          const z = this.gz0 + j * CELL - t.pz[i];
          const dd = x * x + z * z;
          const k = j * this.cols + c;
          if (dd < this.dist[k]) {
            this.dist[k] = dd;
            this.near[k] = i;
            this.side[k] = -Math.sin(h) * x + Math.cos(h) * z;
          }
        }
      }
    }
    for (let k = 0; k < count; k++) this.dist[k] = Math.sqrt(this.dist[k]);
  }

  /** Ground height at world (x, z) (bilinear on the terrain grid). */
  groundAt(x, z) {
    const fx = (x - this.gx0) / CELL;
    const fz = (z - this.gz0) / CELL;
    const c = Math.max(0, Math.min(this.cols - 2, Math.floor(fx)));
    const r = Math.max(0, Math.min(this.rows - 2, Math.floor(fz)));
    const tx = fx - c;
    const tz = fz - r;
    const H = this.heights;
    const a = H[r * this.cols + c];
    const b = H[r * this.cols + c + 1];
    const d = H[(r + 1) * this.cols + c];
    const e = H[(r + 1) * this.cols + c + 1];
    return a + (b - a) * tx + (d - a) * tz + (a - b - d + e) * tx * tz;
  }

  /** Distance from world (x, z) to the nearest road, from the grid. */
  distAt(x, z) {
    const c = Math.round((x - this.gx0) / CELL);
    const r = Math.round((z - this.gz0) / CELL);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return Infinity;
    return this.dist[r * this.cols + c];
  }

  // ---- terrain ----------------------------------------------------------------------
  naturalHeight(x, z, roadY, dist, side, s) {
    const th = this.theme;
    const t = this.track;
    const away = smoothstep(14, 170, dist);
    let h = roadY + (fbm(x, z) - 0.35) * th.hills * away + Math.max(0, dist - 60) * th.rise;
    if (th.sea && Math.sign(side) === t.sea) h = Math.min(h, roadY - (dist - WALL) * 0.22); // the shore falls away to the sea
    if (th.tank) h = roadY + (fbm(x, z) - 0.55) * 9 * away; // flat plain with low hollows that hold water
    if (t.inGorge(s)) h = Math.max(h, roadY + 16 * smoothstep(WALL, WALL + 14, dist)); // the gorge's walls
    if (t.onBridge(s) && dist < 90) h = Math.min(h, roadY - 22 * Math.sin((Math.PI * (s - t.bridge.s0)) / (t.bridge.s1 - t.bridge.s0)) * (1 - dist / 90)); // the valley under the viaduct
    return h;
  }

  buildTerrain() {
    const t = this.track;
    const th = this.theme;
    const { cols, rows } = this;
    const count = cols * rows;
    const heights = (this.heights = new Float32Array(count));
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const grass = [new THREE.Color(th.grass[0]), new THREE.Color(th.grass[1])];
    const verge = new THREE.Color(th.verge);
    const rock = new THREE.Color(th.rock);
    const sand = new THREE.Color(0xd8c48e);
    const tmp = new THREE.Color();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const k = r * cols + c;
        const x = this.gx0 + c * CELL;
        const z = this.gz0 + r * CELL;
        const i = this.near[k];
        const dist = this.dist[k];
        let h;
        if (i < 0) h = this.waterLevel > -Infinity ? this.waterLevel - 5 : 0;
        else {
          const roadY = t.py[i];
          const s = i * STEP;
          const blend = smoothstep(WALL + 0.5, WALL + 26, dist);
          h = roadY - 0.25 + (this.naturalHeight(x, z, roadY, dist, this.side[k], s) - roadY + 0.25) * blend;
          if (t.inCave(s) && dist < WALL + 8) h = roadY - 0.25; // the cave floor
        }
        heights[k] = h;
        pos.set([x, h, z], k * 3);
        // colour: verge near the road, grass in two shades, sand near water, rock on steep ground
        tmp.copy(grass[0]).lerp(grass[1], noise(x / 30, z / 30));
        if (dist < WALL + 4) tmp.lerp(verge, 1 - smoothstep(WALL, WALL + 4, dist));
        if (h < this.waterLevel + 1.2) tmp.lerp(sand, 0.8);
        col.set([tmp.r, tmp.g, tmp.b], k * 3);
      }
    }
    // steep slopes show rock
    for (let r = 1; r < rows - 1; r++) {
      for (let c = 1; c < cols - 1; c++) {
        const k = r * cols + c;
        const slope = Math.hypot(heights[k + 1] - heights[k - 1], heights[k + cols] - heights[k - cols]) / (2 * CELL);
        if (slope > 0.6) {
          tmp.fromArray(col, k * 3).lerp(rock, Math.min(1, (slope - 0.6) * 2));
          col.set([tmp.r, tmp.g, tmp.b], k * 3);
        }
      }
    }
    // only the squares near the road are drawn
    const index = [];
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const k = r * cols + c;
        if (this.dist[k] > REACH && this.dist[k + 1] > REACH && this.dist[k + cols] > REACH && this.dist[k + cols + 1] > REACH) continue;
        index.push(k, k + cols, k + 1, k + 1, k + cols, k + cols + 1);
      }
    }
    const uv = new Float32Array(count * 2);
    for (let k = 0; k < count; k++) uv.set([pos[k * 3] / 9, pos[k * 3 + 2] / 9], k * 2);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(index);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, map: detailTexture() }));
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  // ---- road, verges, barriers, cave and viaduct ----------------------------------------------
  buildRoad() {
    const t = this.track;
    const th = this.theme;
    const asphalt = canvasTexture(128, 256, (ctx, w, h) => {
      ctx.fillStyle = '#4a4d52';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 1600; i++) {
        ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.08})`;
        ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
      ctx.fillStyle = '#f1f1ec'; // edge lines
      ctx.fillRect(4, 0, 4, h);
      ctx.fillRect(w - 8, 0, 4, h);
      ctx.fillStyle = '#f2c230'; // dashed centre line
      ctx.fillRect(w / 2 - 2, 0, 4, h * 0.55);
    });
    const ribbon = (d0, d1, yOff, material, uvScale = 0) => {
      const pos = [];
      const uv = [];
      const index = [];
      for (let i = 0; i < t.n; i++) {
        const h = t.hdg[i];
        const nx = -Math.sin(h);
        const nz = Math.cos(h);
        for (const [d, u] of [[d0, 0], [d1, 1]]) {
          pos.push(t.px[i] + nx * d, t.py[i] + yOff, t.pz[i] + nz * d);
          uv.push(u, (i * STEP) / (uvScale || 1));
        }
        if (i > 0) {
          const a = (i - 1) * 2;
          index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); // counter-clockwise from above: facing up
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(index);
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, material);
      m.receiveShadow = true;
      this.group.add(m);
      return m;
    };
    ribbon(-ROAD_HALF, ROAD_HALF, 0.02, new THREE.MeshLambertMaterial({ map: asphalt }), 14);
    const vergeMat = new THREE.MeshLambertMaterial({ color: th.verge, map: detailTexture(0.35) });
    ribbon(-WALL, -ROAD_HALF, 0.0, vergeMat);
    ribbon(ROAD_HALF, WALL, 0.0, vergeMat);

    // barriers: a rail along each edge on posts
    const railMat = lambert(th.rail, { side: THREE.DoubleSide });
    for (const side of [-1, 1]) {
      const pos = [];
      const index = [];
      for (let i = 0; i < t.n; i++) {
        const h = t.hdg[i];
        const x = t.px[i] - Math.sin(h) * WALL * side;
        const z = t.pz[i] + Math.cos(h) * WALL * side;
        pos.push(x, t.py[i] + 0.45, z, x, t.py[i] + 0.8, z);
        if (i > 0) {
          const a = (i - 1) * 2;
          index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(index);
      geo.computeVertexNormals();
      this.group.add(new THREE.Mesh(geo, railMat));
    }
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), lambert(0x6b6b66), Math.ceil(t.n / 2) * 2);
    const m = new THREE.Matrix4();
    let k = 0;
    for (let i = 0; i < t.n; i += 2) {
      for (const side of [-1, 1]) {
        const p = t.point(i * STEP, WALL * side);
        posts.setMatrixAt(k++, m.makeTranslation(p.x, p.y + 0.45, p.z));
      }
    }
    posts.count = k;
    this.group.add(posts);

    // Kelani's caves: a rock vault over the road
    for (const cave of t.caves) {
      const pos = [];
      const index = [];
      const segs = 10;
      const i0 = Math.floor(cave.s0 / STEP);
      const i1 = Math.ceil(cave.s1 / STEP);
      for (let i = i0; i <= i1; i++) {
        const h = t.hdg[i];
        for (let a = 0; a <= segs; a++) {
          const ang = (a / segs) * Math.PI;
          const d = Math.cos(ang) * (WALL + 1);
          const up = Math.sin(ang) * 7 + 0.5 * hash(i * 13 + a);
          pos.push(t.px[i] - Math.sin(h) * d, t.py[i] + up, t.pz[i] + Math.cos(h) * d);
        }
        if (i > i0) {
          const b = (i - i0 - 1) * (segs + 1);
          for (let a = 0; a < segs; a++) index.push(b + a, b + a + 1, b + a + segs + 1, b + a + 1, b + a + segs + 2, b + a + segs + 1);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(index);
      geo.computeVertexNormals();
      this.group.add(new THREE.Mesh(geo, lambert(0x5a5650, { side: THREE.DoubleSide, flatShading: true })));
    }

    // a viaduct: stone arches under the road across the valley (the Nine Arch Bridge, or a flyover)
    if (t.bridge) {
      const stone = lambert(t.map.id === 'colombo' ? 0xb9b9b2 : 0x9a7d62);
      for (let s = t.bridge.s0 + 6; s < t.bridge.s1 - 4; s += 12) {
        const p = t.point(s);
        const ground = Math.min(this.groundAt(p.x, p.z), p.y - 2);
        const height = p.y - ground + 2;
        const pier = new THREE.Mesh(new THREE.BoxGeometry(2.2, height, WALL * 2), stone);
        pier.position.set(p.x, ground + height / 2 - 2, p.z);
        pier.rotation.y = -p.heading;
        this.group.add(pier);
      }
      const deck = new THREE.Mesh(new THREE.BoxGeometry(t.bridge.s1 - t.bridge.s0, 1.6, WALL * 2 + 1), stone);
      const mid = t.point((t.bridge.s0 + t.bridge.s1) / 2);
      deck.position.set(mid.x, mid.y - 0.85, mid.z);
      deck.rotation.y = -mid.heading;
      this.group.add(deck);
    }
  }

  // ---- water: sea, tanks and fords ----------------------------------------------------------
  buildWater() {
    const t = this.track;
    const water = new THREE.MeshLambertMaterial({ color: this.theme.sea ? 0x2b8fc0 : 0x5d93a6, transparent: true, opacity: 0.88 });
    if (this.waterLevel > -Infinity) {
      const b = t.bounds;
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(b.x1 - b.x0 + REACH * 3, b.z1 - b.z0 + REACH * 3), water);
      plane.rotation.x = -Math.PI / 2;
      plane.position.set((b.x0 + b.x1) / 2, this.waterLevel, (b.z0 + b.z1) / 2);
      this.group.add(plane);
    }
    for (const f of t.fords) {
      for (let s = f.s0; s < f.s1; s += 8) {
        const p = t.point(s + 4);
        const w = new THREE.Mesh(new THREE.PlaneGeometry(9, 60), water);
        w.rotation.set(-Math.PI / 2, 0, -p.heading);
        w.position.set(p.x, f.level, p.z);
        this.group.add(w);
      }
    }
  }

  // ---- scenery ---------------------------------------------------------------------------
  buildScenery() {
    const t = this.track;
    const kinds = this.sceneryKinds();
    const weights = Object.entries(this.theme.scenery);
    const total = weights.reduce((a, [, w]) => a + w, 0);
    const placed = Object.fromEntries(weights.map(([k]) => [k, []]));
    const rand = this.rand;
    const tries = Math.round(t.length * 2.2);
    for (let n = 0; n < tries; n++) {
      const i = Math.floor(rand() * t.n);
      const side = rand() < 0.5 ? -1 : 1;
      let pick = rand() * total;
      let kind = weights[0][0];
      for (const [k, w] of weights) if ((pick -= w) < 0) {
        kind = k;
        break;
      }
      const clear = kind === 'building' ? 11 : kind === 'house' ? 6 : 3; // big things stand further back
      const d = side * (WALL + clear + rand() ** 1.6 * (kind === 'building' ? 60 : 170));
      const p = t.point(i * STEP, d);
      p.x += (rand() - 0.5) * 6;
      p.z += (rand() - 0.5) * 6;
      if (this.distAt(p.x, p.z) < WALL + clear) continue; // on (or beside) another stretch of road
      if (this.onLandmark(p.x, p.z)) continue;
      const y = this.groundAt(p.x, p.z);
      if (y < this.waterLevel + 0.4) continue;
      placed[kind].push({ x: p.x, y, z: p.z, s: 0.75 + rand() * 0.6, r: rand() * Math.PI * 2, face: p.heading });
    }
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    for (const [kind, list] of Object.entries(placed)) {
      if (!list.length) continue;
      for (const part of kinds[kind]) {
        const inst = new THREE.InstancedMesh(part.geo, part.mat, list.length);
        list.forEach((p, k) => {
          const sy = kind === 'building' ? 0.6 + hash(k * 3.1) * 2.4 : 1;
          q.setFromAxisAngle(up, kind === 'building' || kind === 'house' ? -p.face : p.r);
          m.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(p.s, p.s * sy, p.s));
          inst.setMatrixAt(k, m);
        });
        inst.castShadow = part.shadow ?? false;
        this.group.add(inst);
      }
    }
  }

  sceneryKinds() {
    const g = (geo, color, opts = {}) => ({ geo, mat: lambert(color, { flatShading: true }), ...opts });
    const at = (geo, x, y, z) => geo.translate(x, y, z);
    const palmFronds = mergeGeometries(
      Array.from({ length: 7 }, (_, i) => {
        const leaf = new THREE.ConeGeometry(0.35, 3, 4);
        leaf.translate(0, 1.5, 0);
        leaf.scale(1, 1, 0.2);
        leaf.rotateZ(-1.9);
        leaf.rotateY((i / 7) * Math.PI * 2);
        leaf.translate(0.6, 7, 0);
        return leaf;
      }),
    );
    const windows = canvasTexture(64, 128, (ctx, w, h) => {
      ctx.fillStyle = '#a7b4bd';
      ctx.fillRect(0, 0, w, h);
      for (let y = 4; y < h; y += 12) for (let x = 4; x < w; x += 12) {
        ctx.fillStyle = Math.random() < 0.3 ? '#f3e2a8' : '#5d7383';
        ctx.fillRect(x, y, 7, 7);
      }
    });
    const building = new THREE.BoxGeometry(12, 14, 12);
    building.translate(0, 7, 0);
    return {
      pine: [g(at(new THREE.CylinderGeometry(0.25, 0.35, 3, 6), 0, 1.5, 0), 0x5b3a1e), g(at(new THREE.ConeGeometry(2.4, 7, 7), 0, 6, 0), 0x2f5e30, { shadow: true })],
      round: [g(at(new THREE.CylinderGeometry(0.3, 0.45, 4, 6), 0, 2, 0), 0x5b4128), g(at(new THREE.IcosahedronGeometry(3, 0), 0, 5.5, 0), 0x3f7a35, { shadow: true })],
      scrub: [g(at(new THREE.CylinderGeometry(0.2, 0.3, 2.6, 5), 0, 1.3, 0), 0x5a4a3a), g(at(new THREE.SphereGeometry(2.4, 7, 4).scale(1, 0.4, 1), 0, 3, 0), 0x6b7a38, { shadow: true })],
      tea: [g(at(new THREE.SphereGeometry(0.9, 6, 4).scale(1.6, 0.7, 1), 0, 0.4, 0), 0x3f7a2a)],
      banana: [
        g(at(new THREE.CylinderGeometry(0.16, 0.22, 3, 6), 0, 1.5, 0), 0x7a8a3a),
        g(
          mergeGeometries(
            Array.from({ length: 6 }, (_, i) => {
              const leaf = new THREE.SphereGeometry(1, 6, 4).scale(1.6, 0.08, 0.45);
              leaf.translate(1.3, 0, 0);
              leaf.rotateZ(0.35);
              leaf.rotateY((i / 6) * Math.PI * 2);
              leaf.translate(0, 3.1, 0);
              return leaf;
            }),
          ),
          0x5aa83a,
          { shadow: true },
        ),
      ],
      bush: [g(at(new THREE.IcosahedronGeometry(1.2, 0), 0, 0.7, 0), 0x5f8a3a)],
      fern: [g(at(new THREE.ConeGeometry(1.6, 1.6, 6), 0, 0.8, 0), 0x3d7a44)],
      bamboo: [
        g(
          mergeGeometries(
            Array.from({ length: 7 }, (_, i) => {
              const cane = new THREE.CylinderGeometry(0.08, 0.11, 8 + (i % 3), 5);
              cane.translate(0, 4.5, 0);
              cane.rotateZ(((i % 2 ? 1 : -1) * (0.08 + i * 0.03)));
              cane.rotateY((i / 7) * Math.PI * 2);
              return cane;
            }),
          ),
          0x8fae4a,
        ),
        g(at(new THREE.IcosahedronGeometry(2.2, 0).scale(1, 1.4, 1), 0, 8.5, 0), 0x6f9a3a, { shadow: true }),
      ],
      palm: [g(at(new THREE.CylinderGeometry(0.18, 0.28, 7, 6), 0.3, 3.5, 0).rotateZ(-0.05), 0x8a7355), g(palmFronds, 0x3f8a3c, { shadow: true })],
      rock: [g(at(new THREE.DodecahedronGeometry(1.6, 0).scale(1.3, 0.8, 1), 0, 0.5, 0), this.theme.rock)],
      house: [g(at(new THREE.BoxGeometry(6, 3.2, 5), 0, 1.6, 0), 0xe8dcc4), g(at(new THREE.ConeGeometry(4.6, 2.2, 4).rotateY(Math.PI / 4).scale(1, 1, 0.85), 0, 4.3, 0), 0xa8503a)],
      building: [{ geo: building, mat: new THREE.MeshLambertMaterial({ map: windows }) }],
      stupa: [g(at(new THREE.SphereGeometry(4, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0.5, 0), 0xf3f0e8), g(at(new THREE.ConeGeometry(0.6, 4, 8), 0, 6, 0), 0xd9c58a)],
    };
  }

  // ---- towns: a banner over the road at every checkpoint, houses beside it ------------------
  buildTowns() {
    const t = this.track;
    t.towns.forEach((town, idx) => {
      const last = idx === t.towns.length - 1;
      const p = t.point(town.s);
      const banner = canvasTexture(512, 96, (ctx, w, h) => {
        if (last) {
          for (let x = 0; x < w; x += 24) for (let y = 0; y < h; y += 24) {
            ctx.fillStyle = (x + y) / 24 % 2 ? '#111' : '#fff';
            ctx.fillRect(x, y, 24, 24);
          }
          ctx.fillStyle = 'rgba(214, 40, 40, 0.92)';
          ctx.fillRect(60, 18, w - 120, h - 36);
        } else {
          ctx.fillStyle = '#17603a';
          ctx.fillRect(0, 0, w, h);
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 6;
          ctx.strokeRect(8, 8, w - 16, h - 16);
        }
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 54px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(last ? `FINISH · ${town.name}` : town.name, w / 2, h / 2 + 3);
      }, false);
      const gantry = new THREE.Group();
      const post = new THREE.BoxGeometry(0.5, 7, 0.5);
      const postMat = lambert(0x3a3d42);
      for (const side of [-1, 1]) {
        const m = new THREE.Mesh(post, postMat);
        m.position.set(0, 3.5, side * (WALL + 0.4));
        gantry.add(m);
      }
      // the banner on the faces that look along the road (box faces: +x, -x, +y, -y, +z, -z)
      const face = new THREE.MeshBasicMaterial({ map: banner });
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.6, WALL * 2 + 1), [face, face, postMat, postMat, postMat, postMat]);
      board.position.y = 6.4;
      gantry.add(board);
      gantry.position.set(p.x, p.y, p.z);
      gantry.rotation.y = -p.heading;
      this.group.add(gantry);
    });
  }

  // ---- landmarks --------------------------------------------------------------------------
  buildLandmarks() {
    const t = this.track;
    const id = t.map.id;
    const beside = (s, d) => {
      const p = t.point(s, d);
      return new THREE.Vector3(p.x, this.groundAt(p.x, p.z), p.z);
    };
    const add = (obj, at) => {
      obj.position.copy(at);
      obj.traverse((o) => (o.castShadow = false));
      this.group.add(obj);
    };
    if (id === 'colombo') {
      const tower = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.6, 70, 12), lambert(0x6a4c93));
      shaft.position.y = 35;
      const bud = new THREE.Mesh(new THREE.SphereGeometry(5, 16, 12), lambert(0xd873a6));
      bud.scale.y = 1.4;
      bud.position.y = 74;
      const sepal = new THREE.Mesh(new THREE.ConeGeometry(6, 4, 10, 1, true), lambert(0x4e9a5a, { side: THREE.DoubleSide }));
      sepal.rotation.x = Math.PI;
      sepal.position.y = 70;
      const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.5, 16, 6), lambert(0xd9d4e0));
      spire.position.y = 88;
      tower.add(shaft, bud, sepal, spire);
      add(tower, beside(t.finish * 0.62, 70));
    } else if (id === 'coast') {
      const lh = new THREE.Group();
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.2, 22, 12), lambert(0xf7f7f2));
      tower.position.y = 11;
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 2, 12), lambert(0x2d2d2d));
      lamp.position.y = 23;
      lh.add(tower, lamp);
      add(lh, beside(t.finish * 0.55, t.sea * 45));
    } else if (id === 'rajarata') {
      const rock = new THREE.Mesh(new THREE.CylinderGeometry(28, 36, 90, 10), lambert(0x9a8676, { flatShading: true }));
      rock.position.y = 45;
      const top = new THREE.Mesh(new THREE.CylinderGeometry(28.2, 28, 2, 10), lambert(0x7d9a58));
      top.position.y = 90.5;
      const g = new THREE.Group();
      g.add(rock, top);
      g.scale.z = 0.8;
      add(g, beside(t.towns[3]?.s ?? t.finish / 2, -190));
    } else if (id === 'knuckles') {
      for (const [s, d, h] of [[0.3, -260, 160], [0.55, 280, 190], [0.8, -300, 150]]) {
        const peak = new THREE.Mesh(new THREE.ConeGeometry(110, h, 7), lambert(0x6f8f8a, { flatShading: true }));
        peak.position.y = h / 2 - 20;
        const g = new THREE.Group();
        g.add(peak);
        add(g, beside(t.finish * s, d));
      }
    } else if (id === 'kelani') {
      // a waterfall down a hillside
      const s = t.finish * 0.45;
      const at = beside(s, 80);
      const fall = new THREE.Mesh(new THREE.PlaneGeometry(10, 60), new THREE.MeshBasicMaterial({ color: 0xeef6f7, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
      fall.position.set(0, 30, 0);
      fall.rotation.y = -t.headingAt(s);
      const cliff = new THREE.Mesh(new THREE.BoxGeometry(30, 70, 20), lambert(0x4c6f50, { flatShading: true }));
      cliff.position.set(0, 25, -12);
      cliff.rotation.y = -t.headingAt(s);
      const g = new THREE.Group();
      g.add(cliff, fall);
      add(g, at);
    }
  }

  // ---- item boxes, boost pads, coins ------------------------------------------------------
  buildPickups() {
    const t = this.track;
    const q = canvasTexture(64, 64, (ctx, w, h) => {
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#ff8a3d');
      grad.addColorStop(1, '#d6283c');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 4;
      ctx.strokeRect(3, 3, w - 6, h - 6);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 44px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', w / 2, h / 2 + 2);
    }, false);
    this.boxMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), new THREE.MeshLambertMaterial({ map: q, transparent: true, opacity: 0.92 }), t.boxes.length);
    this.group.add(this.boxMesh);

    const chevron = canvasTexture(64, 128, (ctx, w, h) => {
      ctx.fillStyle = 'rgba(30, 30, 40, 0.0)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#35d6ff';
      for (let y = 8; y < h; y += 40) {
        ctx.beginPath();
        ctx.moveTo(8, y + 28);
        ctx.lineTo(w / 2, y);
        ctx.lineTo(w - 8, y + 28);
        ctx.lineTo(w - 8, y + 38);
        ctx.lineTo(w / 2, y + 12);
        ctx.lineTo(8, y + 38);
        ctx.fill();
      }
    }, false);
    const padMat = new THREE.MeshBasicMaterial({ map: chevron, transparent: true });
    for (const pad of t.pads) {
      const p = t.point(pad.s, pad.d);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 4.4), padMat);
      m.rotation.set(-Math.PI / 2, 0, -p.heading - Math.PI / 2);
      m.position.set(p.x, p.y + 0.05, p.z);
      this.group.add(m);
    }

    this.coinMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.45, 0.45, 0.12, 14).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xf2b705, emissive: 0x6b4500 }), t.coins.length);
    this.group.add(this.coinMesh);
  }

  /** Spin and hide item boxes and coins to match the race. */
  updatePickups(race, time) {
    this.updateObstacles(race, time);
    const t = this.track;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    race.boxes.forEach((b, k) => {
      const p = t.point(b.s, b.d);
      const shown = b.gone <= 0 ? 1 : 0.0001;
      q.setFromEuler(e.set(time * 0.9, time * 1.3, 0));
      m.compose(new THREE.Vector3(p.x, p.y + 1 + Math.sin(time * 2 + k) * 0.15, p.z), q, new THREE.Vector3(shown, shown, shown));
      this.boxMesh.setMatrixAt(k, m);
    });
    this.boxMesh.instanceMatrix.needsUpdate = true;
    race.coins.forEach((c, k) => {
      const p = t.point(c.s, c.d);
      const shown = c.taken ? 0.0001 : 1;
      q.setFromEuler(e.set(0, time * 3 + k * 0.4, 0));
      m.compose(new THREE.Vector3(p.x, p.y + 0.9, p.z), q, new THREE.Vector3(shown, shown, shown));
      this.coinMesh.setMatrixAt(k, m);
    });
    this.coinMesh.instanceMatrix.needsUpdate = true;
  }

  // Where each town's 3D landmark stands: well ahead of the town and off to one side, so it's
  // in view all the way in (sea ones out in the water). Scenery keeps off that ground.
  planLandmarks() {
    const t = this.track;
    this.landmarkSpots = [];
    t.towns.forEach((town, idx) => {
      const kit = LANDMARKS3D[t.map.landmarks?.[town.name]];
      if (!kit) return;
      const side = kit.sea && t.sea ? t.sea : t.sea ? -t.sea : idx % 2 ? 1 : -1;
      const s = Math.min(t.length - 1, town.s + Math.min(320, kit.dist * 1.6 + 70));
      const p = t.point(s, side * kit.dist);
      this.landmarkSpots.push({ town, p, side, r: Math.min(90, kit.dist * 0.45 + 25) });
    });
  }

  onLandmark(x, z) {
    return this.landmarkSpots.some((l) => Math.hypot(x - l.p.x, z - l.p.z) < l.r);
  }

  // ---- each town's landmark, from Tuk Tuk Climb's drawings, standing out in the distance ---
  buildLandmarkViews() {
    const t = this.track;
    const PX = 48; // canvas pixels per landmark unit
    const UNIT = 7; // metres per landmark unit
    t.towns.forEach((town, idx) => {
      const key = t.map.landmarks?.[town.name];
      const kit = LANDMARKS3D[key];
      if (kit) {
        const { p, side } = this.landmarkSpots.find((l) => l.town === town);
        const h = p.heading;
        const g = kit.build();
        const ground = kit.sea ? this.waterLevel : this.groundAt(p.x, p.z);
        g.position.set(p.x, (Number.isFinite(ground) ? ground : this.groundAt(p.x, p.z)) - 0.5, p.z);
        g.rotation.y = Math.atan2(side * Math.sin(h), -side * Math.cos(h));
        this.group.add(g);
        return;
      }
      const lm = LANDMARKS[key];
      if (!lm) return;
      const w = 14 * PX;
      const h = Math.ceil((lm.height + 1) * PX);
      const tex = canvasTexture(w, h, (ctx) => {
        ctx.translate(w / 2, h - 2);
        ctx.scale(PX, PX);
        ctx.lineJoin = 'round';
        lm.draw(ctx);
      }, false);
      // the drawings are already hazy (they were painted as distant scenery), so no extra fog
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
      sprite.center.set(0.5, 0.01);
      sprite.scale.set(14 * UNIT, (lm.height + 1) * UNIT, 1);
      // ahead of the town and off to one side, so it rises into view as you approach
      const side = t.sea ? -t.sea : idx % 2 ? 1 : -1; // on the coast, inland
      const p = t.point(Math.min(t.length - 1, town.s + 260), side * 105);
      sprite.position.set(p.x, Math.max(this.groundAt(p.x, p.z), this.waterLevel) - 2, p.z);
      this.group.add(sprite);
    });
  }

  // ---- obstacles ------------------------------------------------------------------------
  buildObstacles() {
    const t = this.track;
    const th = this.theme;
    this.movers = []; // elephants: placed every frame
    const rockMat = lambert(th.rock, { flatShading: true });
    const coralMat = lambert(0xf1b6a8, { flatShading: true });
    const rust = lambert(0x8a4a2a, { flatShading: true });
    const glassMat = lambert(0x1f2a33);
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x1d1b19, transparent: true, opacity: 0.85 });
    const puddleMat = new THREE.MeshLambertMaterial({ color: 0x7fa9c0, transparent: true, opacity: 0.75 });
    const bark = lambert(0x5b3f28, { flatShading: true });
    for (const o of t.obstacles) {
      const p = t.point(o.s, o.d);
      let m;
      if (o.kind === 'boulder' || o.kind === 'coral') {
        m = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), o.kind === 'coral' ? coralMat : rockMat);
        m.scale.set(o.hs * 1.1, o.h * 0.75, o.hd * 1.1);
        m.position.y = o.h * 0.35;
        m.rotation.y = hash(o.s) * 6;
        m.castShadow = true;
      } else if (o.kind === 'wreck') {
        m = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(o.hs * 2, 0.9, o.hd * 2), rust);
        body.position.y = 0.55;
        const cab = new THREE.Mesh(new THREE.BoxGeometry(o.hs * 1.1, 0.7, o.hd * 1.8), glassMat);
        cab.position.set(-0.2, 1.3, 0);
        m.add(body, cab);
        m.rotation.set(0, o.tilt ?? 0, 0.12);
        m.traverse((c) => (c.castShadow = true));
      } else if (o.kind === 'log') {
        m = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, o.hd * 2, 8).rotateX(Math.PI / 2), bark);
        m.position.y = 0.45;
        m.castShadow = true;
      } else if (o.kind === 'pothole' || o.kind === 'puddle') {
        m = new THREE.Mesh(new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2), o.kind === 'pothole' ? holeMat : puddleMat);
        m.scale.set(o.hs, 1, o.hd);
        m.position.y = 0.04;
      } else if (o.kind === 'elephant') {
        m = this.elephant();
        this.movers.push({ o, m });
      }
      if (!m) continue;
      const holder = new THREE.Group();
      holder.add(m);
      holder.position.set(p.x, p.y, p.z);
      holder.rotation.y = -p.heading;
      this.group.add(holder);
      if (o.kind === 'elephant') this.movers.at(-1).holder = holder;
    }
  }

  elephant() {
    const g = new THREE.Group();
    const skin = lambert(0x6d6762, { flatShading: true });
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), skin);
    body.scale.set(1.9, 1.25, 1.2);
    body.position.y = 2.1;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.75, 10, 8), skin);
    head.position.set(1.9, 2.5, 0);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, 1.8, 6), skin);
    trunk.position.set(2.45, 1.6, 0);
    trunk.rotation.z = 0.25;
    g.add(body, head, trunk);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.CircleGeometry(0.7, 10), lambert(0x5d5853, { side: THREE.DoubleSide }));
      ear.position.set(1.6, 2.6, side * 0.65);
      ear.rotation.y = side * 0.5;
      g.add(ear);
      const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.6, 5), lambert(0xf2eee2));
      tusk.position.set(2.4, 2.05, side * 0.3);
      tusk.rotation.z = -1.9;
      g.add(tusk);
    }
    g.userData.legs = [];
    for (const [x, z] of [[1.1, 0.6], [1.1, -0.6], [-1.1, 0.6], [-1.1, -0.6]]) {
      const leg = new THREE.Group();
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 1.6, 7), skin);
      m.position.y = -0.8;
      leg.add(m);
      leg.position.set(x, 1.6, z);
      g.add(leg);
      g.userData.legs.push(leg);
    }
    g.traverse((c) => (c.castShadow = true));
    g.scale.setScalar(0.85);
    return g;
  }

  /** Move the elephants to where the race says they are, legs swinging. */
  updateObstacles(race, time) {
    const t = this.track;
    for (const { o, m, holder } of this.movers) {
      const d = t.obstacleD(o, race.time);
      const p = t.point(o.s, d);
      holder.position.set(p.x, p.y, p.z);
      const dir = Math.cos(race.time * o.speed + o.phase); // which way it's walking across
      holder.rotation.y = -(p.heading + (dir >= 0 ? Math.PI / 2 : -Math.PI / 2));
      const swing = Math.sin(time * 5 + o.phase) * 0.35 * Math.min(1, Math.abs(dir) * 3);
      m.userData.legs.forEach((leg, i) => (leg.rotation.z = i % 3 === 0 ? swing : -swing));
    }
  }

  // ---- warning signs before each section (as in Tuk Tuk Climb) ------------------------------
  buildSigns() {
    const t = this.track;
    const postMat = lambert(0x6b6b66);
    for (const sign of t.signs) {
      const tex = canvasTexture(256, 320, (ctx, w, h) => {
        ctx.translate(w / 2, 120);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = '#111';
        ctx.fillRect(-82, -82, 164, 164);
        ctx.fillStyle = '#f7c600';
        ctx.fillRect(-74, -74, 148, 148);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#111';
        ctx.font = 'bold 120px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('!', w / 2, 128);
        ctx.fillStyle = '#f7c600';
        ctx.fillRect(10, 250, w - 20, 60);
        ctx.fillStyle = '#111';
        ctx.font = 'bold 38px sans-serif';
        ctx.fillText(sign.label.toUpperCase(), w / 2, 282, w - 30);
      }, false);
      const g = new THREE.Group();
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 3.2, 0.15), postMat);
      post.position.y = 1.6;
      const board = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3), new THREE.MeshLambertMaterial({ map: tex, transparent: true, side: THREE.DoubleSide }));
      board.position.y = 3.6;
      board.rotation.y = -Math.PI / 2; // facing the oncoming cars
      g.add(post, board);
      const p = t.point(sign.s, WALL + 1.3);
      g.position.set(p.x, p.y, p.z);
      g.rotation.y = -p.heading;
      this.group.add(g);
    }
  }

  // ---- red and white kerbs on the inside of tight bends -------------------------------------
  buildKerbs() {
    const t = this.track;
    const tex = canvasTexture(16, 64, (ctx, w, h) => {
      ctx.fillStyle = '#d62828';
      ctx.fillRect(0, 0, w, h / 2);
      ctx.fillStyle = '#f4f4f0';
      ctx.fillRect(0, h / 2, w, h / 2);
    });
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    const pos = [];
    const uv = [];
    const index = [];
    for (let i = 1; i < t.n; i++) {
      const k = t.kappa[i];
      if (Math.abs(k) < 1 / 110) continue;
      const side = Math.sign(k); // the inside of the bend
      const v0 = pos.length / 3;
      for (const j of [i - 1, i]) {
        const h = t.hdg[j];
        for (const d of [ROAD_HALF - 0.7, ROAD_HALF + 0.3]) {
          pos.push(t.px[j] - Math.sin(h) * d * side, t.py[j] + 0.04, t.pz[j] + Math.cos(h) * d * side);
          uv.push(d > ROAD_HALF ? 1 : 0, (j * STEP) / 4);
        }
      }
      index.push(...(side > 0 ? [v0, v0 + 1, v0 + 2, v0 + 1, v0 + 3, v0 + 2] : [v0, v0 + 2, v0 + 1, v0 + 1, v0 + 2, v0 + 3]));
    }
    if (!index.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(index);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    this.group.add(m);
  }

  // ---- the Knuckles gorge: jagged rock walls rising either side of the road ------------------
  buildGorges() {
    const t = this.track;
    const mat = lambert(this.theme.rock, { flatShading: true, side: THREE.DoubleSide });
    for (const g of t.gorges) {
      for (const side of [-1, 1]) {
        const pos = [];
        const index = [];
        const i0 = Math.floor(g.s0 / STEP);
        const i1 = Math.ceil(g.s1 / STEP);
        for (let i = i0; i <= i1; i++) {
          const h = t.hdg[i];
          const edge = Math.min(1, (i - i0) / 8, (i1 - i) / 8); // the walls taper in and out
          const d = side * (WALL + 0.6 + hash(i * 3.7) * 0.8);
          const top = (6 + 10 * edge) * (0.8 + hash(i * 1.3) * 0.4);
          const x = t.px[i] - Math.sin(h) * d;
          const z = t.pz[i] + Math.cos(h) * d;
          pos.push(x, t.py[i] - 0.5, z, x - Math.sin(h) * side * 3, t.py[i] + top, z + Math.cos(h) * side * 3);
          if (i > i0) {
            const a = (i - i0 - 1) * 2;
            index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
          }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setIndex(index);
        geo.computeVertexNormals();
        const m = new THREE.Mesh(geo, mat);
        m.receiveShadow = true;
        this.group.add(m);
      }
    }
  }

  // ---- towns: houses and shops along the road, lamp posts ------------------------------------
  buildTownLife() {
    const t = this.track;
    const rand = mulberry32(t.map.id.length * 31 + 7);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
    // facing the road from side `side` at road heading h: the building's +z points at the road
    const face = (side, h) => Math.atan2(side * Math.sin(h), -side * Math.cos(h));
    const clearAt = (p, r) => this.distAt(p.x, p.z) >= WALL + r && !this.onLandmark(p.x, p.z);

    // ---- where buildings go: rows along the road in every town (all along the road in Colombo)
    const shops = SHOP_FACADES.map(() => []);
    const houses = HOUSE_FACADES.map(() => []);
    const spots = [];
    const stretches = t.map.id === 'colombo' ? [[60, t.finish + 40]] : t.towns.map((town) => [town.s - 75, town.s + 75]);
    for (const [s0, s1] of stretches) {
      for (const side of [-1, 1]) {
        for (let s = s0; s < s1; ) {
          const w = 6 + rand() * 3;
          const shop = rand() < (t.map.id === 'colombo' ? 0.85 : 0.6);
          const depth = shop ? 7 : 8;
          const p = t.point(s, side * (WALL + 2.5 + depth / 2));
          s += w + 0.6 + (rand() < 0.15 ? 6 : 0);
          if (!clearAt(p, depth / 2 + 1.5) || t.inCave(s) || t.inGorge(s) || t.onBridge(s)) continue;
          const y = this.groundAt(p.x, p.z);
          const spot = { x: p.x, y, z: p.z, a: face(side, p.heading), w, depth, h: shop ? 5 + rand() * 2.5 : 4 + rand(), side, s, heading: p.heading };
          (shop ? shops : houses)[Math.floor(rand() * (shop ? SHOP_FACADES : HOUSE_FACADES).length)].push(spot);
          spots.push({ ...spot, shop });
        }
      }
    }
    const boxGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const place = (inst, list, scale) => {
      list.forEach((b, k) => {
        q.setFromAxisAngle(up, b.a);
        m.compose(v3(b.x, b.y, b.z), q, scale(b));
        inst.setMatrixAt(k, m);
      });
      inst.castShadow = true;
      inst.receiveShadow = true;
      this.group.add(inst);
    };
    // box faces: +x, -x, +y, -y, +z (front, the facade), -z
    SHOP_FACADES.forEach((f, i) => {
      if (!shops[i].length) return;
      const wall = lambert(f.wall);
      const front = new THREE.MeshLambertMaterial({ map: facadeTexture(f, true) });
      place(new THREE.InstancedMesh(boxGeo, [wall, wall, lambert(0x8f8a82), wall, front, wall], shops[i].length), shops[i], (b) => v3(b.w, b.h, b.depth));
    });
    HOUSE_FACADES.forEach((f, i) => {
      if (!houses[i].length) return;
      const wall = lambert(f.wall);
      const front = new THREE.MeshLambertMaterial({ map: facadeTexture(f, false) });
      place(new THREE.InstancedMesh(boxGeo, [wall, wall, wall, wall, front, wall], houses[i].length), houses[i], (b) => v3(b.w, b.h, b.depth));
    });
    const allHouses = houses.flat();
    const allShops = shops.flat();
    // terracotta hip roofs on the houses, flat-roofed shops get a parapet
    const roof = new THREE.ConeGeometry(0.75, 0.32, 4).rotateY(Math.PI / 4).translate(0, 0.16, 0);
    const roofs = new THREE.InstancedMesh(roof, lambert(0xb5523b, { flatShading: true }), allHouses.length);
    allHouses.forEach((b, k) => {
      q.setFromAxisAngle(up, b.a);
      m.compose(v3(b.x, b.y + b.h, b.z), q, v3(b.w * 1.25, b.h * 0.9, b.depth * 1.25));
      roofs.setMatrixAt(k, m);
    });
    roofs.castShadow = true;
    this.group.add(roofs);
    // verandas: a lean-to roof on two pillars in front of each house
    const offset = (b, fwd, x = 0) => v3(b.x + Math.sin(b.a) * fwd + Math.cos(b.a) * x, b.y, b.z + Math.cos(b.a) * fwd - Math.sin(b.a) * x);
    const verandaRoof = new THREE.InstancedMesh(boxGeo, lambert(0xa8503a), allHouses.length);
    const pillars = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.12, 1, 8).translate(0, 0.5, 0), lambert(0xf3efe6), allHouses.length * 2);
    allHouses.forEach((b, k) => {
      q.setFromAxisAngle(up, b.a);
      const front = offset(b, b.depth / 2 + 1);
      m.compose(v3(front.x, b.y + 2.7, front.z), q, v3(b.w * 0.9, 0.15, 2.2));
      verandaRoof.setMatrixAt(k, m);
      for (const [j, x] of [[0, -b.w * 0.38], [1, b.w * 0.38]]) {
        const p = offset(b, b.depth / 2 + 1.9, x);
        m.compose(p, q, v3(1, 2.7, 1));
        pillars.setMatrixAt(k * 2 + j, m);
      }
    });
    this.group.add(verandaRoof, pillars);
    // striped awnings over the shopfronts
    const awnings = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.08, 1).translate(0, 0, 0.5), new THREE.MeshLambertMaterial(), allShops.length);
    const awningColors = [0xd62828, 0x1f6fd1, 0x2a9d4f, 0xf4a300, 0x7a1e9c, 0x0fa39a];
    allShops.forEach((b, k) => {
      const p = offset(b, b.depth / 2);
      q.setFromEuler(new THREE.Euler(0.35, b.a, 0, 'YXZ'));
      m.compose(v3(p.x, b.y + 2.9, p.z), q, v3(b.w * 0.92, 1, 1.8));
      awnings.setMatrixAt(k, m);
      awnings.setColorAt(k, new THREE.Color(awningColors[k % awningColors.length]));
    });
    awnings.castShadow = true;
    this.group.add(awnings);

    // ---- people by the shops: shirts, saris and sarongs in bright colours
    const people = [];
    for (const b of spots) {
      if (rand() < 0.45) continue;
      const n = 1 + Math.floor(rand() * 3);
      for (let i = 0; i < n; i++) people.push({ p: offset(b, b.depth / 2 + 1.2 + rand() * 1.5, (rand() - 0.5) * b.w * 0.8), a: b.a + (rand() - 0.5) * 1.5, c: PEOPLE[Math.floor(rand() * PEOPLE.length)], h: 0.85 + rand() * 0.25 });
    }
    // and a crowd at the start and the finish
    for (const s of [24, t.finish]) {
      for (let i = 0; i < 60; i++) {
        const side = i % 2 ? 1 : -1;
        const p = t.point(s - 15 + rand() * 30, side * (WALL + 1.2 + rand() * 3));
        people.push({ p: v3(p.x, this.groundAt(p.x, p.z), p.z), a: face(side, p.heading), c: PEOPLE[Math.floor(rand() * PEOPLE.length)], h: 0.85 + rand() * 0.25 });
      }
    }
    const bodies = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.22, 0.75, 3, 8).translate(0, 0.6, 0), new THREE.MeshLambertMaterial(), people.length);
    const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.15, 8, 6).translate(0, 1.32, 0), lambert(0x8d5a3b), people.length);
    people.forEach((pp, k) => {
      q.setFromAxisAngle(up, pp.a);
      m.compose(pp.p, q, v3(pp.h, pp.h, pp.h));
      bodies.setMatrixAt(k, m);
      bodies.setColorAt(k, new THREE.Color(pp.c));
      heads.setMatrixAt(k, m);
    });
    bodies.castShadow = true;
    this.group.add(bodies, heads);

    // ---- across the road in town: strings of Buddhist flags, with Vesak lanterns
    const flagColors = [0x1f4fd1, 0xf2c400, 0xd62828, 0xffffff, 0xf2701c];
    const flags = [];
    const lanterns = [];
    const ropePts = [];
    for (const town of t.towns) {
      for (const off of [-40, -12, 18]) {
        const s = town.s + off;
        if (t.inCave(s) || t.onBridge(s)) continue;
        const a = t.point(s, -WALL - 1);
        const b = t.point(s, WALL + 1);
        const y0 = t.heightAt(s) + 6.5;
        let prev = v3(a.x, y0, a.z);
        for (let i = 1; i <= 30; i++) {
          const u = i / 30;
          const sag = Math.sin(Math.PI * u) * 1.2; // the string droops in the middle
          const here = v3(a.x + (b.x - a.x) * u, y0 - sag, a.z + (b.z - a.z) * u);
          ropePts.push(prev, here);
          prev = here;
          if (i < 30) flags.push({ p: v3(here.x, here.y - 0.25, here.z), h: a.heading, c: flagColors[i % 5] });
          if (i === 10 || i === 20) lanterns.push(v3(here.x, here.y - 1.1, here.z));
        }
      }
      // poles with the Buddhist flag at the town board
      for (const side of [-1, 1]) {
        const p = t.point(town.s + 6, side * (WALL + 1.5));
        this.group.add(this.flagPole(p, this.groundAt(p.x, p.z)));
      }
    }
    const flagInst = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.42, 0.5), new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), flags.length);
    flags.forEach((f, k) => {
      q.setFromAxisAngle(up, -f.h);
      m.compose(f.p, q, v3(1, 1, 1));
      flagInst.setMatrixAt(k, m);
      flagInst.setColorAt(k, new THREE.Color(f.c));
    });
    this.group.add(flagInst);
    const kudu = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.45, 0), new THREE.MeshLambertMaterial({ emissive: 0x553300 }), lanterns.length); // Vesak lanterns
    lanterns.forEach((p, k) => {
      m.makeTranslation(p.x, p.y, p.z);
      kudu.setMatrixAt(k, m);
      kudu.setColorAt(k, new THREE.Color([0xff4f6a, 0xffd23a, 0x4fc3ff, 0x7fe07a][k % 4]));
    });
    this.group.add(kudu);

    // ---- a shrine, a king coconut stall, a bus halt and parked tuk tuks in every town
    t.towns.forEach((town, i) => {
      const side = i % 2 ? 1 : -1;
      const shrineAt = t.point(town.s - 58, side * (WALL + 3.5));
      if (clearAt(shrineAt, 3)) this.addAt(this.shrine(), shrineAt, this.groundAt(shrineAt.x, shrineAt.z), face(side, shrineAt.heading));
      const stallAt = t.point(town.s + 30, -side * (WALL + 2.5));
      if (clearAt(stallAt, 2)) this.addAt(this.coconutStall(), stallAt, this.groundAt(stallAt.x, stallAt.z), face(-side, stallAt.heading));
      const haltAt = t.point(town.s - 25, -side * (WALL + 2.8));
      if (i % 2 === 0 && clearAt(haltAt, 2)) this.addAt(this.busHalt(town.name), haltAt, this.groundAt(haltAt.x, haltAt.z), face(-side, haltAt.heading));
      for (const k of [0, 1]) {
        const at = t.point(town.s + 50 + k * 7, side * (WALL + 1.6));
        if (!clearAt(at, 1)) continue;
        const tuk = vehicleModel('tuktuk', TUK_PAINTS[(i + k) % TUK_PAINTS.length]).clone();
        this.addAt(tuk, at, this.groundAt(at.x, at.z), -at.heading);
      }
    });

    // lamp posts in town
    const lamps = [];
    for (const town of t.towns) for (let s = town.s - 50; s < town.s + 50; s += 14) for (const side of [-1, 1]) lamps.push(t.point(s, side * (WALL + 0.9)));
    const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.09, 6, 5).translate(0, 3, 0), lambert(0x4a4d52), lamps.length);
    const light = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.18, 0.35).translate(0, 6, 0), new THREE.MeshBasicMaterial({ color: 0xfff2c4 }), lamps.length);
    lamps.forEach((p, k) => {
      m.makeTranslation(p.x, p.y, p.z);
      pole.setMatrixAt(k, m);
      light.setMatrixAt(k, m);
    });
    this.group.add(pole, light);
    if (ropePts.length) this.group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(ropePts), new THREE.LineBasicMaterial({ color: 0x333333 })));
  }

  addAt(obj, p, y, angle) {
    obj.position.set(p.x, y, p.z);
    obj.rotation.y = angle;
    this.group.add(obj);
  }

  flagPole(p, y) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 6, 6).translate(0, 3, 0), lambert(0xe8e8e2)));
    const tex = canvasTexture(150, 100, (ctx, w, h) => {
      const c = ['#1f4fd1', '#f2c400', '#d62828', '#ffffff', '#f2701c'];
      c.forEach((col, i) => {
        ctx.fillStyle = col;
        ctx.fillRect((i * w) / 6, 0, w / 6 + 1, h * 0.6);
      });
      c.forEach((col, i) => {
        ctx.fillStyle = col;
        ctx.fillRect((5 * w) / 6, (i * h) / 5, w / 6 + 1, h / 5 + 1);
        ctx.fillRect(0, h * 0.6 + (i * h * 0.4) / 5, (5 * w) / 6, (h * 0.4) / 5 + 1);
      });
    }, false);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
    flag.position.set(0.75, 5.4, 0);
    g.add(flag);
    g.position.set(p.x, y, p.z);
    return g;
  }

  // a roadside shrine: a glass case on a plinth, a white Buddha inside, a bo tree behind
  shrine() {
    const g = new THREE.Group();
    const white = lambert(0xf6f3ea);
    const add = (geo, mat, x, y, z) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      g.add(mesh);
      return mesh;
    };
    add(new THREE.BoxGeometry(2.4, 1.2, 2.4), white, 0, 0.6, 0);
    add(new THREE.BoxGeometry(2, 2.2, 2), new THREE.MeshPhysicalMaterial({ color: 0xbfe2f2, transparent: true, opacity: 0.35, roughness: 0.05 }), 0, 2.3, 0);
    add(new THREE.ConeGeometry(1.7, 0.9, 4).rotateY(Math.PI / 4), lambert(0xd9a92a), 0, 3.85, 0);
    add(new THREE.SphereGeometry(0.42, 12, 8).scale(1, 0.75, 0.8), white, 0, 1.55, 0); // seated, in meditation
    add(new THREE.SphereGeometry(0.28, 12, 8), white, 0, 2.1, 0);
    add(new THREE.SphereGeometry(0.2, 10, 8), white, 0, 2.55, 0);
    add(new THREE.CylinderGeometry(0.35, 0.5, 3, 7), lambert(0x6b5136), 0, 1.5, -3.5); // the bo tree
    add(new THREE.IcosahedronGeometry(3.4, 1), lambert(0x3f7a35, { flatShading: true }), 0, 5, -3.5);
    for (const x of [-0.9, 0.9]) add(new THREE.SphereGeometry(0.22, 8, 6), lambert(x > 0 ? 0xffd23a : 0xff4f6a), x, 1.35, 1.1); // flowers
    return g;
  }

  // a king coconut stall: orange thambili piled on a table under an umbrella
  coconutStall() {
    const g = new THREE.Group();
    const add = (geo, mat, x, y, z) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      g.add(mesh);
    };
    add(new THREE.BoxGeometry(2.2, 0.9, 1.1), lambert(0x7a5230), 0, 0.45, 0);
    const nut = new THREE.SphereGeometry(0.2, 8, 6);
    const orange = lambert(0xf28a1c);
    for (let i = 0; i < 18; i++) add(nut, orange, -0.8 + (i % 6) * 0.32, 1.05 + Math.floor(i / 6) * 0.25, -0.25 + (Math.floor(i / 6) % 2) * 0.25);
    add(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 6), lambert(0x444444), 0, 1.2, 0);
    add(new THREE.ConeGeometry(1.6, 0.6, 8), lambert(0xd62828), 0, 2.5, 0);
    return g;
  }

  busHalt(name) {
    const g = new THREE.Group();
    const concrete = lambert(0xd8d4c8);
    const add = (geo, mat, x, y, z) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      g.add(mesh);
    };
    add(new THREE.BoxGeometry(4, 2.6, 0.25), concrete, 0, 1.3, -0.9);
    add(new THREE.BoxGeometry(4.4, 0.2, 2.2), lambert(0xc0392b), 0, 2.7, 0);
    add(new THREE.BoxGeometry(3.4, 0.45, 0.6), concrete, 0, 0.45, -0.55);
    for (const x of [-1.9, 1.9]) add(new THREE.BoxGeometry(0.2, 2.6, 0.2), concrete, x, 1.3, 0.9);
    const sign = canvasTexture(256, 64, (ctx, w, h) => {
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 30px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${name} Bus Halt`, w / 2, h / 2, w - 16);
    }, false);
    add(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshBasicMaterial({ map: sign }), 0, 3.1, 1.01);
    return g;
  }

  // ---- sky: clouds, the sun, and mountains on the horizon --------------------------------------
  buildSky() {
    const t = this.track;
    const th = this.theme;
    const b = t.bounds;
    const cx = (b.x0 + b.x1) / 2;
    const cz = (b.z0 + b.z1) / 2;
    const top = Math.max(...t.py);
    const cloudTex = canvasTexture(256, 128, (ctx, w, h) => {
      for (let i = 0; i < 14; i++) {
        const x = 40 + Math.random() * (w - 80);
        const y = 50 + Math.random() * 40;
        const r = 20 + Math.random() * 30;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(255,255,255,0.95)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }, false);
    const cloudMat = new THREE.SpriteMaterial({ map: cloudTex, fog: false, transparent: true, depthWrite: false, opacity: 0.9 });
    const span = Math.max(b.x1 - b.x0, b.z1 - b.z0) + 600;
    for (let i = 0; i < 26; i++) {
      const c = new THREE.Sprite(cloudMat);
      const s = 90 + hash(i * 7.3) * 120;
      c.scale.set(s, s * 0.45, 1);
      c.position.set(cx + (hash(i * 3.1) - 0.5) * span, top + 110 + hash(i * 5.7) * 90, cz + (hash(i * 9.9) - 0.5) * span);
      this.group.add(c);
    }
    // mountains on the horizon, hazy blue, past the fog
    if (th.hills > 10 || th.tank) {
      const haze = new THREE.Color(th.fog[0]).lerp(new THREE.Color(th.tank ? 0x9a8676 : 0x5c7a8a), 0.45);
      const mat = new THREE.MeshBasicMaterial({ color: haze, fog: false });
      const ring = Math.max(b.x1 - b.x0, b.z1 - b.z0) / 2 + 520;
      const count = th.tank ? 10 : 30;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + hash(i) * 0.2;
        const h = th.tank ? 50 + hash(i * 2.2) * 60 : 120 + hash(i * 2.2) * (th.hills * 4);
        const mtn = new THREE.Mesh(th.tank ? new THREE.CylinderGeometry(h * 0.5, h * 0.8, h, 8) : new THREE.ConeGeometry(h * 1.5, h, 6), mat);
        mtn.position.set(cx + Math.cos(a) * ring, Math.min(...t.py) - 10 + h / 2, cz + Math.sin(a) * ring);
        mtn.rotation.y = hash(i * 4.4) * 3;
        this.group.add(mtn);
      }
    }
    // the sun: placed by the view, always far off in the light's direction
    this.sun = new THREE.Sprite(new THREE.SpriteMaterial({
      map: canvasTexture(128, 128, (ctx, w, h) => {
        const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
        g.addColorStop(0, 'rgba(255,255,240,1)');
        g.addColorStop(0.25, 'rgba(255,248,210,0.95)');
        g.addColorStop(1, 'rgba(255,240,200,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }, false),
      fog: false,
      transparent: true,
      depthWrite: false,
    }));
    this.sun.scale.set(120, 120, 1);
    this.group.add(this.sun);
  }

  /** A gradient sky texture for the scene background. */
  skyTexture() {
    const [top, bottom] = this.theme.sky;
    return canvasTexture(4, 256, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, top);
      g.addColorStop(0.7, bottom);
      g.addColorStop(1, bottom);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }, false);
  }
}
