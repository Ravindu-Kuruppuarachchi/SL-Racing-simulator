// The 3D routes: each map's towns joined by one winding, climbing road, from the first
// town to the last (point to point). No three.js here, so it runs headless in tests.
//
// The road is a centreline sampled every STEP metres. A car's place on it is
// (s, d): s metres along the road, d metres to the right of the centre line.
// World axes are three.js's: x and z across the ground, y up; heading 0 points along +x
// and a growing heading turns right (towards +z).
import { getMap } from '../maps.js';
import { mulberry32 } from '../terrain.js';

export const STEP = 2; // metres between centreline samples
export const ROAD_HALF = 7; // half the tarmac width: room for six cars abreast-ish
export const SHOULDER = 2.5; // verge each side before the barriers
export const WALL = ROAD_HALF + SHOULDER; // |d| where the barriers stand
export const TOWN_GAP = 300; // metres between the town boards (checkpoints)
export const MAX_TOWNS = 8; // a route ends at the 8th town (~2.4 km, under two minutes)

// What each road is like. curveR: bend radii (m); bend: bend angles (rad); straight:
// lengths between bends (m); deviate: how far the road may turn from its overall
// direction; hills: how big its climbs, drops, valleys and ridges are (1 = hill country).
const ROUTES = {
  hills: { curveR: [45, 150], bend: [0.4, 1.5], straight: [30, 110], deviate: 1.3, hills: 1 },
  coast: { curveR: [140, 420], bend: [0.25, 0.8], straight: [70, 220], deviate: 0.7, hills: 0.45, sea: 1 },
  colombo: { curveR: [26, 45], bend: [1.2, 1.6], straight: [70, 170], deviate: 1.6, hills: 0.4 },
  knuckles: { curveR: [28, 70], bend: [0.6, 2], straight: [20, 70], deviate: 1.7, hills: 1.2 },
  kelani: { curveR: [40, 110], bend: [0.5, 1.6], straight: [25, 90], deviate: 1.3, hills: 0.9 },
  rajarata: { curveR: [90, 300], bend: [0.3, 1.0], straight: [90, 260], deviate: 0.9, hills: 0.4 },
};

// Section lengths (m) and whether the road must run straight through them (jumps,
// crossings and the viaduct need a straight run).
const SECTIONS = {
  rolling: { len: [60, 110] },
  climb: { len: [90, 140] },
  drop: { len: [70, 110] },
  valley: { len: [60, 90] },
  ridge: { len: [45, 65], straight: true },
  kicker: { len: [44, 44], straight: true },
  dunes: { len: [70, 80], straight: true },
  steps: { len: [60, 70] },
  rocky: { len: [60, 90] },
  wrecks: { len: [60, 80] },
  wetland: { len: [50, 70] },
  ford: { len: [46, 60], straight: true },
  lake: { len: [70, 100], straight: true },
  cave: { len: [70, 90] },
  gorge: { len: [90, 110] },
  bridge: { len: [110, 110], straight: true },
};
// sections that happen at most this many times on one route
const ONCE = { bridge: 1, cave: 2, gorge: 1 };
// every route gets its map's signature section at least once
const SIGNATURE = { hills: 'valley', coast: 'dunes', colombo: 'bridge', knuckles: 'gorge', kelani: 'cave', rajarata: 'lake' };

const smooth = (a, passes, radius) => {
  let out = a;
  for (let p = 0; p < passes; p++) {
    const next = new Float64Array(out.length);
    for (let i = 0; i < out.length; i++) {
      let sum = 0;
      let n = 0;
      for (let j = Math.max(0, i - radius); j <= Math.min(out.length - 1, i + radius); j++) {
        sum += out[j];
        n++;
      }
      next[i] = sum / n;
    }
    out = next;
  }
  return out;
};
const ease = (t) => t * t * (3 - 2 * t);

export class Track {
  constructor(mapId, seed = 1) {
    this.map = getMap(mapId);
    this.style = ROUTES[this.map.id];
    const rand = (this.rand = mulberry32(seed * 7919 + this.map.id.length * 104729));
    const r = (lo, hi) => lo + rand() * (hi - lo);

    this.towns = this.map.towns.slice(0, MAX_TOWNS).map((name, i) => ({ name, s: (i + 1) * TOWN_GAP }));
    this.length = this.towns.at(-1).s + 60; // a little run-out past the finish
    this.finish = this.towns.at(-1).s;
    const n = (this.n = Math.ceil(this.length / STEP) + 1);

    this.sea = this.style.sea ?? 0; // coast: the sea lies off this side (+1 right of the road)
    this.planSections(r);

    // ---- bends and centreline -------------------------------------------------------
    // A winding road can wander back near itself; such a layout is thrown away and drawn
    // again (with the same seed it always comes out the same).
    for (let attempt = 0; attempt < 40; attempt++) {
      this.layout(r, n);
      if (this.selfGap() > WALL * 2 + 30) break;
    }

    this.buildProfile(r);
    this.placeObstacles(r);

    const clearOfTowns = (si, gap) => this.towns.every((t) => Math.abs(t.s - si) > gap) && si > 120 && si < this.finish - 60;
    const calm = (si, gap) => !this.sections.some((sec) => sec.type !== 'rolling' && si > sec.s0 - gap && si < sec.s1 + gap);
    const straightAt = (si, span) => {
      for (let t = si - span; t <= si + span; t += STEP) if (Math.abs(this.kappaAt(t)) > 1 / 200) return false;
      return true;
    };
    const place = (count, gap, ok) => {
      const out = [];
      for (let tries = 0; out.length < count && tries < 400; tries++) {
        const si = Math.round(r(150, this.finish - 80) / STEP) * STEP;
        if (ok(si) && out.every((o) => Math.abs(o - si) > gap)) out.push(si);
      }
      return out.sort((a, b) => a - b);
    };

    // ---- things on the road ------------------------------------------------------------
    // item boxes: a row across the road every ~220 m
    this.boxes = [];
    for (let si = 170; si < this.finish - 60; si += 220) {
      const at = this.nudge(si, (t) => clearOfTowns(t, 25) && calm(t, 12));
      for (const d of [-4.5, -1.5, 1.5, 4.5]) this.boxes.push({ s: at, d });
    }
    // boost pads (chevrons on the road) on some straights
    this.pads = place(4, 80, (si) => straightAt(si, 20) && clearOfTowns(si, 30) && calm(si, 10)).map((si) => ({ s: si, d: r(-4, 4) }));
    // coin lines along a lane
    this.coins = [];
    for (let si = 110; si < this.finish - 40; si += 130) {
      const d = r(-5, 5);
      for (let k = 0; k < 6; k++) if (!this.obstacles.some((o) => Math.abs(o.s - (si + k * 4)) < o.hs + 2 && Math.abs(o.d - d) < o.hd + 1.5)) this.coins.push({ s: si + k * 4, d });
    }

    this.buildIndex();
  }

  // Bends: straights and arcs, turning back towards the route's overall direction when
  // it has wandered too far; then the centreline, integrated along them.
  layout(r, n) {
    const st = this.style;
    const kappa = new Float64Array(n);
    let s = 70; // a straight start for the grid
    let heading = 0;
    while (s < this.length - 40) {
      s += r(...st.straight);
      const radius = r(...st.curveR);
      const angle = r(...st.bend);
      const sign = Math.abs(heading) > st.deviate * 0.55 ? -Math.sign(heading) : this.rand() < 0.5 ? -1 : 1;
      const len = Math.min(angle * radius, this.length - 40 - s);
      if (len <= 0) break;
      for (let i = Math.floor(s / STEP); i < Math.min(n, (s + len) / STEP); i++) kappa[i] = sign / radius;
      heading += (sign * len) / radius;
      s += len;
    }
    // straight through jumps, crossings and the viaduct (and a little either side)
    for (const sec of this.sections) {
      if (!SECTIONS[sec.type].straight) continue;
      for (let i = Math.max(0, Math.floor((sec.s0 - 25) / STEP)); i < Math.min(n, (sec.s1 + 15) / STEP); i++) kappa[i] = 0;
    }
    this.kappa = smooth(kappa, 3, 6); // eased into and out of each bend
    this.px = new Float64Array(n);
    this.pz = new Float64Array(n);
    this.hdg = new Float64Array(n);
    let x = 0;
    let z = 0;
    let h = 0;
    for (let i = 0; i < n; i++) {
      this.px[i] = x;
      this.pz[i] = z;
      this.hdg[i] = h;
      h += this.kappa[i] * STEP;
      x += Math.cos(h) * STEP;
      z += Math.sin(h) * STEP;
    }
  }

  /** How close the road comes to a part of itself more than 150 m further along. */
  selfGap() {
    const cell = 60;
    const grid = new Map();
    for (let i = 0; i < this.n; i += 2) {
      const key = `${Math.floor(this.px[i] / cell)},${Math.floor(this.pz[i] / cell)}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(i);
    }
    let gap = Infinity;
    for (let i = 0; i < this.n; i += 2) {
      const cx = Math.floor(this.px[i] / cell);
      const cz = Math.floor(this.pz[i] / cell);
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        for (let gz = cz - 1; gz <= cz + 1; gz++) {
          for (const j of grid.get(`${gx},${gz}`) ?? []) {
            if (Math.abs(i - j) * STEP < 150) continue;
            gap = Math.min(gap, Math.hypot(this.px[i] - this.px[j], this.pz[i] - this.pz[j]));
          }
        }
      }
    }
    return gap;
  }

  // the nearest place to `si` that passes ok(), searching outwards
  nudge(si, ok) {
    for (let off = 0; off < 100; off += STEP) {
      if (ok(si + off)) return si + off;
      if (ok(si - off)) return si - off;
    }
    return si;
  }

  // ---- sampling ----------------------------------------------------------------------
  index(s) {
    const f = Math.min(Math.max(s / STEP, 0), this.n - 1.001);
    const i = Math.floor(f);
    return [i, f - i];
  }

  kappaAt(s) {
    const [i, t] = this.index(s);
    return this.kappa[i] + (this.kappa[i + 1] - this.kappa[i]) * t;
  }

  heightAt(s) {
    const [i, t] = this.index(s);
    return this.py[i] + (this.py[i + 1] - this.py[i]) * t;
  }

  gradeAt(s) {
    return (this.heightAt(s + 1) - this.heightAt(s - 1)) / 2;
  }

  headingAt(s) {
    const [i, t] = this.index(s);
    return this.hdg[i] + (this.hdg[i + 1] - this.hdg[i]) * t;
  }

  /** World position of road place (s, d), on the road surface. */
  point(s, d = 0) {
    const [i, t] = this.index(s);
    const h = this.hdg[i] + (this.hdg[i + 1] - this.hdg[i]) * t;
    const x = this.px[i] + (this.px[i + 1] - this.px[i]) * t - Math.sin(h) * d;
    const z = this.pz[i] + (this.pz[i + 1] - this.pz[i]) * t + Math.cos(h) * d;
    return { x, y: this.heightAt(s), z, heading: h };
  }

  inFord(s) {
    return this.fords.find((f) => s > f.s0 && s < f.s1) ?? null;
  }

  inCave(s) {
    return this.caves.some((c) => s > c.s0 && s < c.s1);
  }

  inGorge(s) {
    return this.gorges.find((g) => s > g.s0 && s < g.s1) ?? null;
  }

  onBridge(s) {
    return !!this.bridge && s > this.bridge.s0 && s < this.bridge.s1;
  }

  sectionAt(s) {
    return this.sections.find((sec) => s >= sec.s0 && s < sec.s1) ?? null;
  }

  // ---- the plan: which sections, where -----------------------------------------------
  // A sequence drawn from the map's own section list (maps.js), weighted as in Tuk Tuk
  // Climb and getting harder further along, with calm road around each town board.
  planSections(r) {
    // plain stretches already separate the sections, so 'rolling' is mostly left out
    const weights = this.map.sections.filter(([type]) => SECTIONS[type]).map(([t, w0, w1]) => (t === 'rolling' ? [t, w0 * 0.15, w1 * 0.15] : [t, w0, w1]));
    const signature = SIGNATURE[this.map.id];
    const counts = {};
    this.sections = [];
    let s = 90;
    let lastType = 'rolling';
    while (s < this.finish - 50) {
      const progress = s / this.finish;
      const pool = weights.filter(([type]) => (counts[type] ?? 0) < (ONCE[type] ?? Infinity) && !(type === lastType && type !== 'rolling'));
      let pick = this.rand() * pool.reduce((a, [, w0, w1]) => a + w0 + (w1 - w0) * progress, 0);
      let type = 'rolling';
      for (const [t, w0, w1] of pool) if ((pick -= w0 + (w1 - w0) * progress) < 0) {
        type = t;
        break;
      }
      if (!counts[signature] && progress > 0.3) type = signature;
      const len = Math.round(r(...SECTIONS[type].len) / STEP) * STEP;
      // keep 20 m of plain road either side of every town board
      const town = this.towns.find((t) => t.s > s - 20 && t.s < s + len + 20);
      if (town && type !== 'rolling') {
        s = town.s + 22;
        continue;
      }
      if (s + len > this.finish - 30) break;
      this.sections.push({ type, s0: s, s1: s + len, label: this.map.hard[type] ?? null });
      counts[type] = (counts[type] ?? 0) + 1;
      lastType = type;
      s += len + Math.round(r(20, 50) / STEP) * STEP; // a short plain stretch between sections
    }
  }

  // ---- the road's rise and fall, section by section ------------------------------------
  buildProfile(r) {
    const n = this.n;
    const scale = this.style.hills;
    const py = new Float64Array(n);
    const add = (sec, f) => {
      for (let i = Math.ceil(sec.s0 / STEP); i < n; i++) {
        const t = (i * STEP - sec.s0) / (sec.s1 - sec.s0);
        py[i] += f(Math.min(1, t)); // f(1) carries on past the section (climbs and drops stay)
      }
    };
    this.jumps = [];
    this.fords = [];
    this.caves = [];
    this.gorges = [];
    this.bridge = null;
    for (const sec of this.sections) {
      const len = sec.s1 - sec.s0;
      switch (sec.type) {
        case 'rolling': {
          const a = r(1.5, 4) * scale;
          add(sec, (t) => a * Math.sin(Math.PI * t) * (t < 1 ? 1 : 0));
          break;
        }
        case 'climb': {
          const rise = Math.min(len * 0.13, r(12, 22) * scale);
          add(sec, (t) => rise * ease(t));
          break;
        }
        case 'drop': {
          const fall = Math.min(len * 0.13, r(10, 20) * scale);
          add(sec, (t) => -fall * ease(t));
          break;
        }
        case 'valley': {
          // a steep-sided dip: the far crest throws you into the air
          const depth = r(6, 10) * Math.max(0.6, scale);
          add(sec, (t) => (t < 1 ? -depth * Math.sin(Math.PI * t) ** 1.4 : 0));
          break;
        }
        case 'ridge': {
          const h = r(3.5, 6) * Math.max(0.6, scale);
          add(sec, (t) => (t < 1 ? h * Math.sin(Math.PI * t) ** 2.2 : 0));
          break;
        }
        case 'kicker': {
          // a ramp, then the road drops away: a jump
          const h = r(1.8, 2.6);
          add(sec, (t) => {
            const x = t * len;
            if (t >= 1) return 0;
            if (x < 14) return h * (x / 14) ** 2;
            if (x < 17) return h * (1 - (x - 14) / 3);
            return 0;
          });
          this.jumps.push({ s: sec.s0 + 14, height: h });
          break;
        }
        case 'dunes':
          add(sec, (t) => (t < 1 ? 1.9 * Math.sin(Math.PI * t * 3) ** 2 : 0)); // three hops
          break;
        case 'steps': {
          // terraces: four drops of half a metre or so
          const drop = r(0.5, 0.75);
          add(sec, (t) => -drop * Math.min(4, Math.floor(t * 4.5)));
          break;
        }
        case 'ford':
        case 'lake':
        case 'wetland': {
          const deep = sec.type === 'wetland' ? 0.25 : 0.55;
          add(sec, (t) => (t < 1 ? -deep * Math.sin(Math.PI * t) : 0));
          this.fords.push({ s0: sec.s0, s1: sec.s1, kind: sec.type });
          break;
        }
        case 'cave':
          this.caves.push({ s0: sec.s0, s1: sec.s1 });
          add(sec, (t) => (t < 1 ? 0.8 * Math.sin(Math.PI * t * 2) : 0));
          break;
        case 'gorge': {
          // down into a narrow gorge, across the stream at the bottom, and out again
          const depth = r(8, 12) * scale;
          add(sec, (t) => (t < 1 ? -depth * ease(Math.min(1, t * 2.6)) * ease(Math.min(1, (1 - t) * 2.6)) : 0));
          this.gorges.push({ s0: sec.s0, s1: sec.s1 });
          this.fords.push({ s0: sec.s0 + len * 0.42, s1: sec.s0 + len * 0.58, kind: 'stream' });
          break;
        }
        case 'bridge':
          this.bridge = { s0: sec.s0, s1: sec.s1 };
          break;
      }
    }
    this.py = smooth(py, 1, 2);
    for (const f of this.fords) f.level = Math.max(this.heightAt(f.s0), this.heightAt(f.s1)) - 0.08;
  }

  // ---- obstacles: rows across the road, always with a way through ----------------------
  placeObstacles(r) {
    this.obstacles = [];
    const rocks = this.map.rocks; // granite, coral or rubble
    let rockyCount = 0;
    // a row of obstacles across the road with a clear gap (~4.5 m of room) somewhere in it
    const row = (s, fill, spacing = [2.8, 3.8]) => {
      const gap = r(-3.5, 3.5); // the way through
      for (let d = -ROAD_HALF + 1; d <= ROAD_HALF - 1; d += r(...spacing)) {
        if (Math.abs(d - gap) < 4.4) continue;
        if (this.rand() < 0.75) fill(s + r(-1.5, 1.5), d, gap);
      }
    };
    for (const sec of this.sections) {
      const len = sec.s1 - sec.s0;
      if (sec.type === 'rocky') {
        const elephants = this.map.id === 'rajarata' && rockyCount++ % 2 === 0; // every other rocky stretch is a herd
        if (elephants) {
          // a herd crossing: elephants amble from one side to the other and back
          sec.label = 'Elephant crossing';
          for (let k = 0; k < 2; k++) this.obstacles.push({ kind: 'elephant', s: sec.s0 + len * (0.3 + 0.4 * k), d: 0, hs: 1.9, hd: 1.2, h: 3, solid: true, phase: r(0, 6.3), speed: r(0.25, 0.4) });
          continue;
        }
        for (let s = sec.s0 + 8; s < sec.s1 - 6; s += r(13, 18)) {
          if (this.map.id === 'kelani' && this.rand() < 0.3) {
            // a fallen tree across the half of the road away from the gap
            const gap = r(-3, 3);
            const side = gap > 0 ? -1 : 1;
            this.obstacles.push({ kind: 'log', s, d: side * (ROAD_HALF - 3), hs: 0.5, hd: 3, h: 0.8, solid: true });
            continue;
          }
          row(s, (rs, d) => {
            if (rocks === 'rubble') this.obstacles.push({ kind: 'pothole', s: rs, d, hs: 1.1, hd: 1.1, h: 0, solid: false });
            else this.obstacles.push({ kind: rocks === 'coral' ? 'coral' : 'boulder', s: rs, d, hs: r(0.8, 1.1), hd: r(0.8, 1.1), h: 1.4, solid: true });
          });
        }
      } else if (sec.type === 'wrecks') {
        for (let s = sec.s0 + 10; s < sec.s1 - 8; s += r(16, 22)) row(s, (rs, d) => this.obstacles.push({ kind: 'wreck', s: rs, d, hs: 2.1, hd: 1, h: 1.5, solid: true, tilt: r(-0.5, 0.5) }), [4.8, 6]);
      } else if (sec.type === 'wetland') {
        for (let s = sec.s0 + 6; s < sec.s1 - 4; s += r(8, 12)) this.obstacles.push({ kind: 'puddle', s, d: r(-5, 5), hs: 2.2, hd: 1.8, h: 0, solid: false });
      }
    }
    this.signs = this.sections.filter((sec) => sec.label).map((sec) => ({ s: Math.max(40, sec.s0 - 22), label: sec.label }));
  }

  /** Where an obstacle is at race time `time` (elephants walk to and fro across the road). */
  obstacleD(o, time) {
    return o.kind === 'elephant' ? Math.sin(time * o.speed + o.phase) * (ROAD_HALF - 1.5) : o.d;
  }

  // ---- the ground around the road -------------------------------------------------------
  // A spatial hash of the centreline, so any ground point can find its nearest road place.
  buildIndex() {
    this.cell = 40;
    this.grid = new Map();
    for (let i = 0; i < this.n; i++) {
      const key = `${Math.floor(this.px[i] / this.cell)},${Math.floor(this.pz[i] / this.cell)}`;
      if (!this.grid.has(key)) this.grid.set(key, []);
      this.grid.get(key).push(i);
    }
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < this.n; i++) {
      x0 = Math.min(x0, this.px[i]);
      x1 = Math.max(x1, this.px[i]);
      z0 = Math.min(z0, this.pz[i]);
      z1 = Math.max(z1, this.pz[i]);
    }
    this.bounds = { x0, x1, z0, z1 };
  }

  /** The road place nearest to world (x, z) within `range` m: { i, s, dist, side } or null. */
  nearest(x, z, range = 160) {
    const c = this.cell;
    const reach = Math.ceil(range / c);
    const cx = Math.floor(x / c);
    const cz = Math.floor(z / c);
    let best = null;
    let bestD = range * range;
    for (let gx = cx - reach; gx <= cx + reach; gx++) {
      for (let gz = cz - reach; gz <= cz + reach; gz++) {
        const list = this.grid.get(`${gx},${gz}`);
        if (!list) continue;
        for (const i of list) {
          const dx = x - this.px[i];
          const dz = z - this.pz[i];
          const dd = dx * dx + dz * dz;
          if (dd < bestD) {
            bestD = dd;
            best = i;
          }
        }
      }
    }
    if (best === null) return null;
    const h = this.hdg[best];
    const side = -Math.sin(h) * (x - this.px[best]) + Math.cos(h) * (z - this.pz[best]); // + right of the road
    return { i: best, s: best * STEP, dist: Math.sqrt(bestD), side };
  }
}
