// Procedural road built from hand-shaped sections that get harder with distance.
// Heights are sampled every SAMPLE metres; physics and rendering both use these
// samples, so what you see is exactly what the wheels touch.

export const SAMPLE = 0.5;
const FLAT_START = 18;
const FULL_DIFFICULTY_AT = 3000; // metres

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cheap deterministic hash in [0,1) for decorations. */
export function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

const ease = (u) => (1 - Math.cos(Math.PI * Math.min(Math.max(u, 0), 1))) / 2;

export class Terrain {
  // map: an entry of MAPS (maps.js); decides which sections appear and the rock kind
  constructor(seed, map) {
    this.map = map;
    this.rand = mulberry32(seed);
    this.h = [0];
    this.sections = []; // {x0, x1, type}
    this.rocks = []; // {x, y, r, verts:[[x,y]...]} verts relative to (x,y)
    this.pushFlat(FLAT_START);
  }

  get end() {
    return (this.h.length - 1) * SAMPLE;
  }

  height(x) {
    if (x <= 0) return 0;
    const f = x / SAMPLE;
    const i = Math.floor(f);
    this.extendTo(i + 2);
    return this.h[i] + (this.h[i + 1] - this.h[i]) * (f - i);
  }

  extendTo(index) {
    while (this.h.length <= index) this.addSection();
  }

  // Append a section of `length` metres whose offset from the current
  // height is shape(t) for t in metres from the section start.
  push(type, length, shape) {
    const x0 = this.end;
    const h0 = this.h[this.h.length - 1];
    const n = Math.round(length / SAMPLE);
    for (let k = 1; k <= n; k++) this.h.push(h0 + shape(k * SAMPLE));
    this.sections.push({ x0, x1: this.end, type });
  }

  pushFlat(length) {
    this.push('flat', length, () => 0);
  }

  r(min, max) {
    return min + this.rand() * (max - min);
  }

  addSection() {
    const d = Math.min(this.end / FULL_DIFFICULTY_AT, 1);
    // each map section: [name, weight at start, weight at full difficulty, first appears at difficulty]
    const pick = this.weighted(this.map.sections.map(([name, w0, w1, from = 0]) => [name, d < from ? 0 : w0 + (w1 - w0) * d]));
    this[pick](d);
    // a short breather after anything nasty
    if (pick !== 'rolling') this.rest(this.r(12, 22));
  }

  weighted(options) {
    const total = options.reduce((s, [, w]) => s + w, 0);
    let x = this.rand() * total;
    for (const [name, w] of options) if ((x -= w) <= 0) return name;
    return options[0][0];
  }

  // ---- section shapes ----------------------------------------------------
  rolling(d, length = this.r(60, 110)) {
    const hills = Math.max(1, Math.round(length / this.r(28, 45)));
    const amp = this.r(1.5, 2.5 + 4.5 * d);
    const rise = this.r(-2, 4 + 4 * d);
    this.push('rolling', length, (t) => {
      const u = t / length;
      return (amp * (1 - Math.cos(2 * Math.PI * hills * u))) / 2 + rise * ease(u);
    });
  }

  // coast: big wind-blown sand waves with peaky crests
  dunes(d) {
    const length = this.r(50, 90);
    const humps = Math.max(1, Math.round(length / this.r(26, 34)));
    const amp = this.r(1.5, 2.8) + 3 * d;
    const peak = 1 + 0.5 * d; // crests sharpen further along the road
    this.push('dunes', length, (t) => amp * ((1 - Math.cos((2 * Math.PI * humps * t) / length)) / 2) ** peak);
  }

  // colombo: ramps up onto a bridge deck over a river (rendered with the gap open)
  bridge(d) {
    const rise = this.r(2.5, 3.5) + d;
    const ramp = rise * 4.6; // keeps the ramp slope under ~0.35
    const span = this.r(22, 36);
    const x0 = this.end;
    const h0 = this.h[this.h.length - 1];
    this.push('bridge', ramp * 2 + span, (t) => {
      if (t < ramp) return rise * ease(t / ramp);
      if (t < ramp + span) return rise;
      return rise * (1 - ease((t - ramp - span) / ramp));
    });
    // the river sits ~3 m under the deck so it stays on screen while you cross
    Object.assign(this.sections.at(-1), { span: [x0 + ramp, x0 + ramp + span], deck: h0 + rise, water: h0 + rise - 3.2, style: this.rand() < 0.5 ? 'arch' : 'cable' });
  }

  // colombo: a pile-up of wrecked vehicles lying on the road, to drive over
  wrecks(d) {
    const length = this.r(38, 56);
    const x0 = this.end;
    this.pushFlat(length);
    this.sections.at(-1).type = 'wrecks';
    const count = 2 + Math.floor(this.rand() * (1 + 2 * d));
    // at least 5 m of flat road between wrecks, longer than any wheelbase, so no vehicle
    // gets wedged with a wheel on each wreck
    let edge = x0 + 6;
    for (let k = 0; k < count && edge < x0 + length - 10; k++) {
      const w = this.addWreck(edge + 4, d); // place, then shift right to its real half-width
      w.x = edge + w.hw;
      w.y = this.height(w.x);
      edge = w.x + w.hw + this.r(5, 9);
    }
  }

  // A wrecked vehicle (car height, flat top as long as the car) with a ramp of debris and
  // planks at each end. Physics is one convex trapezoid: ~24 degree ramps are gentler than
  // any vehicle's breakover angle, and the flat top is longer than any wheelbase, so
  // nothing gets beached with its wheels in the air.
  addWreck(x, d) {
    const model = ['flipped', 'crushed', 'van'][Math.floor(this.rand() * 3)];
    const h = { flipped: 0.95, crushed: 0.8, van: 1.05 }[model] + 0.15 * d;
    const tw = model === 'van' ? 2.4 : 2.15; // half the vehicle's length
    const run = (h + 0.15) * 2.25;
    const hw = tw + run;
    const verts = [[-hw, -0.15], [hw, -0.15], [hw - run, h], [-hw + run, h]];
    const wreck = { x, y: this.height(x), r: hw, verts, shade: this.rand(), kind: 'wreck', model, h, hw, run };
    this.rocks.push(wreck);
    return wreck;
  }

  // colombo: dips in a low road that have filled with flood water
  wetland(d) {
    const dips = 2 + Math.floor(this.rand() * 3);
    const shapes = [];
    let length = 4;
    for (let k = 0; k < dips; k++) {
      const w = this.r(8, 12);
      shapes.push([length, w, this.r(0.7, 1.1) + 0.5 * d]);
      length += w + this.r(4, 8);
    }
    const h0 = this.h[this.h.length - 1];
    this.push('wetland', length, (t) => {
      for (const [at, w, depth] of shapes) if (t > at && t < at + w) return (-depth * (1 - Math.cos((2 * Math.PI * (t - at)) / w))) / 2;
      return 0;
    });
    this.sections.at(-1).level = h0 - 0.12; // water fills the dips up to just below the road
  }

  // knuckles: a run of sharp crests, like the knuckles of a fist, with granite on top
  ridge(d) {
    const crests = 1 + Math.floor(this.rand() * (1 + 2 * d));
    const shapes = [];
    let length = 0;
    for (let k = 0; k < crests; k++) {
      const w = this.r(24, 34);
      // keep both faces climbable: the max slope of this shape is height * PI / w
      const height = Math.min(this.r(2.2, 3.2) + 5 * d, ((0.45 + 0.5 * d) * w) / Math.PI);
      shapes.push([length, w, height]);
      length += w;
    }
    const x0 = this.end;
    this.push('ridge', length, (t) => {
      for (const [at, w, height] of shapes) if (t >= at && t <= at + w) return (height * (1 - Math.cos((2 * Math.PI * (t - at)) / w))) / 2;
      return 0;
    });
    for (const [at, w] of shapes) if (this.rand() < 0.3 + 0.5 * d) this.addRock(x0 + at + w / 2, 0.25 + this.rand() * 0.15);
  }

  // A dip that holds water deep enough to slow you down (game.js adds drag below `level`):
  // banks of `bank` metres each side of a `floor`-metre bed that undulates by `ripple`.
  wade(type, bank, floor, depth, ripple) {
    const length = bank * 2 + floor;
    const h0 = this.h[this.h.length - 1];
    const waves = Math.max(1, Math.round(floor / 9));
    this.push(type, length, (t) => {
      if (t < bank) return -depth * ease(t / bank);
      if (t > bank + floor) return -depth * (1 - ease((t - bank - floor) / bank));
      return -depth + (ripple * (1 - Math.cos((2 * Math.PI * waves * (t - bank)) / floor))) / 2;
    });
    return Object.assign(this.sections.at(-1), { level: h0 - 0.12, drag: true });
  }

  // kelani: ford a rocky river; stones on the bed
  ford(d) {
    const depth = this.r(0.6, 0.8) + 0.4 * d;
    const bank = depth * 4.5;
    const s = this.wade('ford', bank, this.r(8, 14), depth, 0.15);
    s.water = 'river';
    for (let x = s.x0 + bank + 2; x < s.x1 - bank - 1; x += this.r(3, 5)) if (this.rand() < 0.2 + 0.8 * d) this.addRock(x, 0.18 + this.rand() * 0.12);
  }

  // rajarata: wade across the shallow end of an ancient tank (reservoir)
  lake(d) {
    const s = this.wade('lake', this.r(8, 11), this.r(30, 50) + 15 * d, this.r(0.5, 0.7) + 0.35 * d, 0.3);
    s.water = 'lake';
  }

  // knuckles: plunge into a narrow gorge with a stream at the bottom and climb out
  gorge(d) {
    const side = this.r(16, 22);
    const bed = this.r(6, 10);
    const depth = Math.min(this.r(5, 7) + 5 * d, ((0.6 + 0.4 * d) * 2 * side) / Math.PI);
    const h0 = this.h[this.h.length - 1];
    const ch = 0.45; // stream channel cut into the bed
    this.push('gorge', side * 2 + bed, (t) => {
      if (t < side) return -depth * ease(t / side);
      if (t > side + bed) return -depth * (1 - ease((t - side - bed) / side));
      return -depth - ch * Math.sin((Math.PI * (t - side)) / bed);
    });
    Object.assign(this.sections.at(-1), { level: h0 - depth + 0.05, drag: true, water: 'river' });
  }

  // kelani: a cave with a solid roof. The floor rolls a little; the roof hangs clear of the
  // highest bumps by `clear` metres (minus the odd stalactite), so only a big bounce hits it.
  cave(d) {
    const length = this.r(40, 64);
    const clear = this.r(4.6, 5.2) - 0.7 * d;
    const amp = this.r(0.3, 0.6) + 0.5 * d;
    const waves = Math.max(1, Math.round(length / this.r(10, 15)));
    const tilt = this.r(-1.5, 2.5);
    const x0 = this.end;
    const h0 = this.h[this.h.length - 1];
    this.push('cave', length, (t) => {
      const u = t / length;
      return (amp * (1 - Math.cos(2 * Math.PI * waves * u))) / 2 + tilt * ease(u);
    });
    const roof = [];
    const phase = this.rand() * 10;
    for (let t = 0; t <= length; t += 1) {
      const dip = 0.4 * (1 + Math.sin(t * 0.7 + phase)) * Math.sin((Math.PI * t) / length);
      roof.push([x0 + t, h0 + tilt * ease(t / length) + amp + clear - dip]);
    }
    this.sections.at(-1).roof = roof;
  }

  rest(length) {
    const rise = this.r(-0.5, 1);
    this.push('rest', length, (t) => rise * ease(t / length));
  }

  climb(d) {
    const length = this.r(25, 45);
    const maxSlope = this.r(0.45, 0.6) + 0.55 * d; // up to ~50 degrees
    const rise = (maxSlope * 2 * length) / Math.PI;
    this.push('climb', length, (t) => rise * ease(t / length));
    this.pushFlat(this.r(4, 8));
  }

  drop(d) {
    const length = this.r(25, 40);
    const maxSlope = this.r(0.5, 0.7) + 0.5 * d;
    const fall = (maxSlope * 2 * length) / Math.PI;
    this.push('drop', length, (t) => -fall * ease(t / length));
  }

  rocky(d) {
    const length = this.r(30, 50);
    const wave = this.r(2.2, 3.5);
    const cycles = Math.round(length / wave);
    const amp = 0.18 + 0.35 * d;
    const x0 = this.end;
    this.push('rocky', length, (t) => {
      const u = t / length;
      const env = Math.sin(Math.PI * u); // fade bumps in and out
      return env * amp * (1 - Math.cos(2 * Math.PI * cycles * u)) * 0.5 + this.rand() * 0.04;
    });
    const count = 2 + Math.floor(this.rand() * (2 + 4 * d));
    for (let k = 0; k < count; k++) {
      const x = x0 + 5 + ((length - 10) * (k + this.rand() * 0.6)) / count;
      this.addRock(x, 0.25 + this.rand() * (0.1 + 0.25 * d));
    }
  }

  // Boulders are wide and half-buried so even small wheels can roll over them
  // (sticking out at most ~0.45 m at full difficulty).
  addRock(x, r) {
    const n = 8;
    const verts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = r * (0.8 + this.rand() * 0.3);
      verts.push([Math.cos(a) * rr * 1.4, Math.sin(a) * rr * 0.7]);
    }
    const kind = this.map.rocks === 'coral' ? (this.rand() < 0.6 ? 'coral' : 'granite') : this.map.rocks === 'rubble' ? 'rubble' : 'granite';
    this.rocks.push({ x, y: this.height(x), r, verts, shade: this.rand(), kind });
  }

  kicker(d) {
    const rampLen = this.r(7, 10);
    const lip = this.r(1.4, 2.2) + 1.2 * d;
    const dropLen = this.r(3, 4.5);
    const deep = this.r(1.5, 3) + 2.5 * d;
    const landLen = this.r(14, 20);
    this.push('kicker', rampLen + dropLen + landLen, (t) => {
      if (t <= rampLen) return lip * (t / rampLen) ** 2;
      if (t <= rampLen + dropLen) return lip - (lip + deep) * ease((t - rampLen) / dropLen) ** 0.6;
      return -deep * (1 - ease((t - rampLen - dropLen) / landLen));
    });
  }

  steps(d) {
    const count = 3 + Math.floor(this.rand() * (2 + 3 * d));
    const tread = this.r(3.5, 5);
    const riser = 0.35 + 0.45 * d;
    const per = tread + 1;
    this.push('steps', count * per, (t) => {
      const k = Math.floor(t / per);
      const inStep = t - k * per;
      return riser * (k + ease((inStep - tread) / 1));
    });
  }

  valley(d) {
    const length = this.r(28, 45);
    // keep the exit climbable: max slope of this shape is depth * PI / length
    const depth = Math.min(this.r(4, 6) + 6 * d, ((0.6 + 0.45 * d) * length) / Math.PI);
    this.push('valley', length, (t) => -depth * (1 - Math.cos((2 * Math.PI * t) / length)) / 2);
  }
}
