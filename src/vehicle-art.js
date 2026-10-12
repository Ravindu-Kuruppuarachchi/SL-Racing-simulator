// Vehicle artwork. Everything is drawn in chassis-local metres with y pointing up,
// so the same code draws the in-game vehicle and the garage thumbnails.
//
// Each ART entry has:
//   bounds         sprite bounds [x0, y0, x1, y1] for the static body parts
//   back(ctx)      static parts behind the driver (cached as a sprite)
//   front(ctx)     static parts in front of the driver (cached as a sprite)
//   under/over     moving parts drawn behind/in front of the wheels (suspension)
//   live(ctx, L)   small animated details
//   driver         pose for paintDriver
//   wheel          wheel style for paintWheel
//   exhaust, half  smoke origin and half-length (for the ground shadow)

import { getSkin } from './vehicles.js';

const TAU = Math.PI * 2;

// Current paint skin { body, light, dark }; paintVehicle sets it before drawing.
let P = getSkin('tuktuk');

// ---- helpers ---------------------------------------------------------------
const poly = (ctx, pts) => {
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
};

const fillPoly = (ctx, pts, style) => {
  ctx.fillStyle = style;
  ctx.beginPath();
  poly(ctx, pts);
  ctx.fill();
};

const vgrad = (ctx, y0, y1, stops) => {
  const g = ctx.createLinearGradient(0, y1, 0, y0); // top to bottom
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  return g;
};

const line = (ctx, pts, width, style) => {
  ctx.strokeStyle = style;
  ctx.lineWidth = width;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
};

const glassStyle = (ctx, x0, y0, x1, y1) => {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, 'rgba(40, 60, 80, 0.45)');
  g.addColorStop(0.45, 'rgba(200, 225, 240, 0.4)');
  g.addColorStop(0.55, 'rgba(60, 85, 105, 0.4)');
  g.addColorStop(1, 'rgba(40, 60, 80, 0.5)');
  return g;
};

// Car body with see-through windows: the outline minus the window holes,
// then tinted glass over the holes so the driver shows through.
function carBody(ctx, outline, windows, paint, edge) {
  ctx.beginPath();
  outline(ctx);
  for (const w of windows) poly(ctx, w);
  ctx.fillStyle = paint;
  ctx.fill('evenodd');
  ctx.beginPath();
  outline(ctx);
  ctx.strokeStyle = edge;
  ctx.lineWidth = 0.02;
  ctx.stroke();
  for (const w of windows) {
    const xs = w.map((p) => p[0]);
    ctx.fillStyle = glassStyle(ctx, Math.min(...xs), 1.2, Math.max(...xs), 0.4);
    ctx.beginPath();
    poly(ctx, w);
    ctx.fill();
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 0.025;
    ctx.stroke();
  }
}

// The dark hollow behind each wheel, centred on the wheel wherever the suspension has
// put it (at rest the springs settle a little, so the design position would show a
// crescent of shadow under the tyre).
const wheelWells = (ctx, wheels, gap) => {
  ctx.fillStyle = '#121212';
  ctx.beginPath();
  for (const w of wheels) {
    ctx.moveTo(w.x + w.r + gap, w.y);
    ctx.arc(w.x, w.y, w.r + gap, 0, TAU);
  }
  ctx.fill();
};

// Coil spring between two points.
function coil(ctx, [ax, ay], [bx, by], width, color, turns = 8) {
  const nx = -(by - ay);
  const ny = bx - ax;
  const len = Math.hypot(nx, ny) || 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  for (let i = 0; i <= turns; i++) {
    const t = i / turns;
    const side = (i % 2 ? 1 : -1) * 0.06;
    const x = ax + (bx - ax) * t + (nx / len) * side;
    const y = ay + (by - ay) * t + (ny / len) * side;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.stroke();
}

// ---- people ----------------------------------------------------------------
// pose: hip, shoulder, hand (+ knee, foot for visible legs), optional helmet colour.
export function paintDriver(ctx, pose, L) {
  const skin = '#8d5a3b';
  const skinDark = '#6e4329';
  const shirt = pose.shirt ?? ['#3d6fb8', '#5d8fd6'];
  const sleeve = pose.sleeve ?? '#4a7fc8';
  const [hx, hy] = pose.hip;
  const shoulder = [pose.shoulder[0] + L.x, pose.shoulder[1] + L.y];
  const [sx, sy] = shoulder;

  if (pose.knee) {
    line(ctx, [pose.hip, pose.knee, pose.foot], 0.15, pose.pants ?? '#2d3442');
    if (pose.boots) {
      ctx.fillStyle = pose.boots;
      ctx.beginPath();
      ctx.roundRect(pose.foot[0] - 0.06, pose.foot[1] - 0.06, 0.2, 0.1, 0.03);
      ctx.fill();
    }
  }

  // torso
  const g = ctx.createLinearGradient(hx - 0.12, 0, hx + 0.28, 0);
  g.addColorStop(0, shirt[0]);
  g.addColorStop(1, shirt[1]);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(hx - 0.12, hy);
  ctx.quadraticCurveTo(hx - 0.14, hy + (sy - hy) * 0.6, sx - 0.12, sy);
  ctx.quadraticCurveTo(sx, sy + 0.06, sx + 0.1, sy - 0.02);
  ctx.quadraticCurveTo(hx + 0.2, hy + (sy - hy) * 0.48, hx + 0.14, hy);
  ctx.closePath();
  ctx.fill();

  const head = [sx + 0.04 + L.x * 0.5, sy + 0.15 + L.y * 0.5];
  const [px, py] = head;
  ctx.fillStyle = skinDark;
  ctx.fillRect(sx - 0.02, sy, 0.07, 0.08);

  if (pose.helmet) {
    // full-face helmet with a dark visor
    const hg = ctx.createRadialGradient(px + 0.03, py + 0.05, 0.01, px, py, 0.15);
    hg.addColorStop(0, '#ffffff');
    hg.addColorStop(0.25, pose.helmet);
    hg.addColorStop(1, '#0b0b0b');
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.ellipse(px, py + 0.01, 0.135, 0.14, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.moveTo(px + 0.02, py + 0.04);
    ctx.quadraticCurveTo(px + 0.15, py + 0.05, px + 0.135, py - 0.03);
    ctx.lineTo(px + 0.02, py - 0.02);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(px + 0.05, py + 0.02, 0.06, 0.012);
  } else {
    if (pose.collar !== false) {
      ctx.fillStyle = '#e8eef7';
      ctx.beginPath();
      ctx.moveTo(sx - 0.02, sy + 0.03);
      ctx.lineTo(sx + 0.08, sy - 0.04);
      ctx.lineTo(sx + 0.05, sy + 0.04);
      ctx.fill();
    }
    const face = ctx.createRadialGradient(px + 0.03, py + 0.02, 0.01, px, py, 0.12);
    face.addColorStop(0, '#a46d4a');
    face.addColorStop(1, skin);
    ctx.fillStyle = face;
    ctx.beginPath();
    ctx.ellipse(px, py, 0.1, 0.115, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath(); // nose
    ctx.moveTo(px + 0.09, py + 0.02);
    ctx.lineTo(px + 0.135, py - 0.02);
    ctx.lineTo(px + 0.09, py - 0.035);
    ctx.fill();
    ctx.fillStyle = skinDark; // ear
    ctx.beginPath();
    ctx.ellipse(px - 0.02, py, 0.02, 0.035, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#141010'; // hair
    ctx.beginPath();
    ctx.moveTo(px - 0.105, py - 0.02);
    ctx.quadraticCurveTo(px - 0.12, py + 0.13, px + 0.01, py + 0.13);
    ctx.quadraticCurveTo(px + 0.1, py + 0.12, px + 0.1, py + 0.05);
    ctx.quadraticCurveTo(px + 0.02, py + 0.08, px - 0.03, py + 0.03);
    ctx.lineTo(px - 0.06, py - 0.04);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath(); // eye
    ctx.arc(px + 0.06, py + 0.025, 0.012, 0, TAU);
    ctx.fill();
    line(ctx, [[px + 0.04, py + 0.05], [px + 0.09, py + 0.055]], 0.012, '#141010'); // brow
    ctx.lineWidth = 0.022; // moustache
    ctx.beginPath();
    ctx.moveTo(px + 0.05, py - 0.05);
    ctx.quadraticCurveTo(px + 0.09, py - 0.04, px + 0.11, py - 0.06);
    ctx.stroke();
  }

  // arm: shoulder -> elbow -> hand
  const hand = pose.hand;
  const elbow = [(sx + hand[0]) / 2 + 0.02, Math.min(sy, hand[1]) - 0.1];
  line(ctx, [[sx, sy - 0.04], elbow], 0.085, sleeve);
  line(ctx, [elbow, hand], 0.065, pose.glove ?? skin);
  ctx.fillStyle = pose.glove ?? skinDark;
  ctx.beginPath();
  ctx.arc(hand[0], hand[1], 0.045, 0, TAU);
  ctx.fill();
}

// ---- wheels ----------------------------------------------------------------
const WHEELS = {
  tuktuk: { knobs: 16, depth: 0.06, rim: 0.58, style: 'steel' },
  moto: { knobs: 28, depth: 0.04, rim: 0.78, style: 'moto' },
  hubcap: { knobs: 22, depth: 0.03, rim: 0.66, style: 'hubcap' },
  alloy: { knobs: 22, depth: 0.03, rim: 0.7, style: 'alloy' },
  offroad: { knobs: 14, depth: 0.1, rim: 0.56, style: 'wolf' },
  steel: { knobs: 20, depth: 0.05, rim: 0.6, style: 'steel' },
};

function dots(ctx, count, dist, rad, phase = 0) {
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const t = (i / count) * TAU + phase;
    ctx.moveTo(Math.cos(t) * dist + rad, Math.sin(t) * dist);
    ctx.arc(Math.cos(t) * dist, Math.sin(t) * dist, rad, 0, TAU);
  }
  ctx.fill();
}

export function paintWheel(ctx, R, styleName) {
  const w = WHEELS[styleName];
  // knobbly tyre
  ctx.fillStyle = '#151515';
  ctx.beginPath();
  for (let i = 0; i < w.knobs; i++) {
    const t0 = (i / w.knobs) * TAU;
    const t1 = ((i + 0.5) / w.knobs) * TAU;
    ctx.arc(0, 0, R, t0, t1);
    ctx.arc(0, 0, R * (1 - w.depth), t1, t0 + TAU / w.knobs);
  }
  ctx.fill();
  const side = ctx.createRadialGradient(0, 0, R * w.rim, 0, 0, R * 0.95);
  side.addColorStop(0, '#2c2c2c');
  side.addColorStop(1, '#0d0d0d');
  ctx.fillStyle = side;
  ctx.beginPath();
  ctx.arc(0, 0, R * (1 - w.depth) * 0.97, 0, TAU);
  ctx.fill();

  const r = R * w.rim;
  const metal = (a, b) => {
    const g = ctx.createRadialGradient(-r * 0.25, r * 0.25, r * 0.05, 0, 0, r);
    g.addColorStop(0, a);
    g.addColorStop(1, b);
    return g;
  };
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  if (w.style === 'steel') {
    ctx.fillStyle = metal('#f2f2f2', '#8d9399');
    ctx.fill();
    ctx.fillStyle = '#3c3f43';
    dots(ctx, 4, r * 0.58, r * 0.17);
    ctx.fillStyle = '#5b6066';
    dots(ctx, 1, 0, r * 0.28);
  } else if (w.style === 'moto') {
    ctx.fillStyle = '#1b1b1b';
    ctx.fill();
    ctx.fillStyle = '#9ca3af'; // brake disc
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.55, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#4b5563';
    dots(ctx, 8, r * 0.42, r * 0.04);
    ctx.strokeStyle = '#2d2d2d'; // spokes
    ctx.lineWidth = r * 0.09;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const t = (i / 6) * TAU;
      ctx.moveTo(Math.cos(t) * r * 0.15, Math.sin(t) * r * 0.15);
      ctx.lineTo(Math.cos(t + 0.3) * r * 0.95, Math.sin(t + 0.3) * r * 0.95);
    }
    ctx.stroke();
    ctx.strokeStyle = '#c0c4c8';
    ctx.lineWidth = r * 0.06;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.97, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = '#6b7280';
    dots(ctx, 1, 0, r * 0.15);
  } else if (w.style === 'hubcap') {
    ctx.fillStyle = metal('#ffffff', '#9aa3ab');
    ctx.fill();
    ctx.strokeStyle = '#5f6870';
    ctx.lineWidth = r * 0.08;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const t = (i / 8) * TAU;
      ctx.moveTo(Math.cos(t) * r * 0.45, Math.sin(t) * r * 0.45);
      ctx.lineTo(Math.cos(t) * r * 0.82, Math.sin(t) * r * 0.82);
    }
    ctx.stroke();
    ctx.fillStyle = '#c9ced3';
    dots(ctx, 1, 0, r * 0.25);
  } else if (w.style === 'alloy') {
    ctx.fillStyle = metal('#f5f7f9', '#a8b0b8');
    ctx.fill();
    ctx.fillStyle = '#2b3036'; // dark windows between five spokes
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const t = (i / 5) * TAU;
      ctx.moveTo(Math.cos(t + 0.25) * r * 0.3, Math.sin(t + 0.25) * r * 0.3);
      ctx.arc(0, 0, r * 0.86, t + 0.25, t + TAU / 5 - 0.25);
      ctx.lineTo(Math.cos(t + TAU / 5 - 0.25) * r * 0.3, Math.sin(t + TAU / 5 - 0.25) * r * 0.3);
      ctx.closePath();
    }
    ctx.fill();
    ctx.fillStyle = '#d6dbe0';
    dots(ctx, 1, 0, r * 0.2);
  } else if (w.style === 'wolf') {
    ctx.fillStyle = metal('#ffffff', '#b9bdb6');
    ctx.fill();
    ctx.strokeStyle = '#8a8f88';
    ctx.lineWidth = r * 0.06;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.72, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = '#6b706a';
    dots(ctx, 5, r * 0.5, r * 0.08);
    ctx.fillStyle = '#3f433e';
    dots(ctx, 1, 0, r * 0.24);
  }
}

// ---- tuk tuk ---------------------------------------------------------------
const tukPaint = (ctx, y0, y1) => vgrad(ctx, y0, y1, [P.light, P.body, P.dark]);

const tuktuk = {
  bounds: [-1.6, -0.6, 1.3, 1.62],
  wheel: 'tuktuk',
  exhaust: [-1.5, -0.2],
  half: 1.4,
  driver: { hip: [0.17, 0.52], shoulder: [0.28, 1.0], hand: [0.64, 0.86], knee: [0.5, 0.56], foot: [0.56, -0.1] },

  under(ctx, [rear]) {
    // rear swing arm + coil-over shock
    line(ctx, [[-0.15, -0.2], [rear.x, rear.y]], 0.12, '#2b2b2b');
    coil(ctx, [rear.x, rear.y], [-0.75, 0.15], 0.04, '#c9a227');
  },

  over(ctx, [, front]) {
    line(ctx, [[0.92, 0.3], [front.x, front.y]], 0.1, '#3a3a3a');
    line(ctx, [[0.92, 0.3], [front.x, front.y]], 0.04, '#b5b5b5');
    // mudguard rides with the wheel
    const r = front.r + 0.08;
    ctx.strokeStyle = vgrad(ctx, front.y, front.y + r, [P.light, P.dark]);
    ctx.lineWidth = 0.1;
    ctx.beginPath();
    ctx.arc(front.x, front.y, r, 0.2, Math.PI - 0.35);
    ctx.stroke();
  },

  back(ctx) {
    line(ctx, [[-0.6, -0.2], [-1.48, -0.22]], 0.07, '#8c8c8c'); // exhaust
    // cabin interior seen through the open doorway
    const interior = ctx.createLinearGradient(-1.2, 0, 0, 0);
    interior.addColorStop(0, '#120a08');
    interior.addColorStop(1, '#2b1b16');
    ctx.fillStyle = interior;
    ctx.fillRect(-1.25, 0.4, 1.3, 0.9);
    ctx.fillStyle = '#5b2a20'; // passenger bench
    ctx.beginPath();
    ctx.roundRect(-1.18, 0.42, 0.14, 0.62, 0.05);
    ctx.fill();
    ctx.fillStyle = '#7a3a2c';
    ctx.beginPath();
    ctx.roundRect(-1.12, 0.4, 0.95, 0.16, 0.05);
    ctx.fill();
    ctx.fillStyle = '#4a2018'; // driver seat
    ctx.beginPath();
    ctx.roundRect(0.0, 0.42, 0.34, 0.1, 0.04);
    ctx.fill();
    line(ctx, [[0.82, 0.66], [0.72, 0.86], [0.62, 0.86]], 0.04, '#2a2a2a'); // steering column + bar
  },

  // little hanging decoration (every Sri Lankan tuk tuk has one); swings with the lean
  live(ctx, L) {
    line(ctx, [[-0.55, 1.26], [-0.55 + L.x * 0.6, 1.08]], 0.012, '#d4a017');
    ctx.fillStyle = '#e8b923';
    ctx.beginPath();
    ctx.arc(-0.55 + L.x * 0.6, 1.05, 0.035, 0, TAU);
    ctx.fill();
  },

  front(ctx) {
    const outline = '#2a0a10';
    ctx.lineWidth = 0.025;
    // rear tub with wheel arch
    ctx.fillStyle = tukPaint(ctx, -0.22, 0.6);
    ctx.strokeStyle = outline;
    ctx.beginPath();
    ctx.moveTo(-1.2, 0.6);
    ctx.quadraticCurveTo(-1.42, 0.58, -1.42, 0.3);
    ctx.lineTo(-1.42, -0.12);
    ctx.quadraticCurveTo(-1.42, -0.2, -1.36, -0.2);
    ctx.arc(-0.85, -0.45, 0.56, 2.66, 0.48, true);
    ctx.lineTo(0.08, -0.2);
    ctx.lineTo(0.08, 0.36);
    ctx.lineTo(-0.15, 0.4);
    ctx.lineTo(-1.15, 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#d9d9d9'; // chrome strip + sticker stripes
    ctx.fillRect(-1.4, 0.2, 1.47, 0.035);
    ctx.fillStyle = '#f2c230';
    ctx.fillRect(-1.38, 0.1, 1.45, 0.03);
    ctx.fillStyle = '#2e9e57';
    ctx.fillRect(-1.38, 0.06, 1.45, 0.02);
    ctx.fillStyle = '#e02626'; // tail light
    ctx.beginPath();
    ctx.roundRect(-1.46, 0.25, 0.06, 0.16, 0.02);
    ctx.fill();
    ctx.fillStyle = '#1a1a1a'; // mud flap
    ctx.fillRect(-1.44, -0.48, 0.04, 0.3);
    ctx.fillStyle = '#1d1d1d'; // floorboard
    ctx.fillRect(0.0, -0.22, 0.62, 0.08);

    // front cowl
    ctx.fillStyle = tukPaint(ctx, -0.2, 0.7);
    ctx.beginPath();
    ctx.moveTo(0.5, -0.18);
    ctx.lineTo(0.62, -0.18);
    ctx.quadraticCurveTo(0.68, 0.08, 0.98, 0.1);
    ctx.quadraticCurveTo(1.12, 0.28, 1.14, 0.62);
    ctx.lineTo(0.92, 0.7);
    ctx.lineTo(0.6, 0.66);
    ctx.quadraticCurveTo(0.5, 0.4, 0.5, -0.18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f2c230';
    ctx.fillRect(0.52, 0.12, 0.5, 0.03);
    ctx.fillStyle = '#c8c8c8'; // headlight
    ctx.beginPath();
    ctx.ellipse(1.13, 0.5, 0.06, 0.11, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff6c0';
    ctx.beginPath();
    ctx.ellipse(1.15, 0.5, 0.04, 0.09, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ff9a1f'; // indicator
    ctx.beginPath();
    ctx.ellipse(1.06, 0.3, 0.025, 0.04, 0, 0, TAU);
    ctx.fill();

    // windshield + mirror
    ctx.fillStyle = glassStyle(ctx, 0.65, 0.7, 0.9, 1.3);
    ctx.beginPath();
    poly(ctx, [[0.92, 0.7], [0.8, 1.28], [0.7, 1.28], [0.78, 0.68]]);
    ctx.fill();
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 0.03;
    ctx.stroke();
    line(ctx, [[0.88, 0.95], [1.02, 1.08]], 0.02, '#333');
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.ellipse(1.04, 1.12, 0.04, 0.07, 0.3, 0, TAU);
    ctx.fill();

    // black canvas canopy with a rolled-up rear curtain
    ctx.fillStyle = vgrad(ctx, 1.24, 1.52, ['#3a3a3c', '#111112']);
    ctx.beginPath();
    ctx.moveTo(-1.2, 0.6);
    ctx.quadraticCurveTo(-1.5, 0.95, -1.42, 1.32);
    ctx.quadraticCurveTo(-1.36, 1.52, -1.1, 1.53);
    ctx.lineTo(0.84, 1.53);
    ctx.quadraticCurveTo(0.96, 1.5, 0.94, 1.4);
    ctx.lineTo(0.8, 1.26);
    ctx.lineTo(-1.08, 1.26);
    ctx.quadraticCurveTo(-1.22, 1.0, -1.2, 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#1f1f20';
    ctx.beginPath();
    ctx.roundRect(-1.36, 1.15, 0.2, 0.14, 0.06);
    ctx.fill();
    line(ctx, [[-1.08, 1.27], [0.8, 1.27]], 0.02, '#bdbdbd'); // chrome roof trim
    ctx.fillStyle = '#151515'; // pillar between driver and passenger
    ctx.fillRect(-0.02, 0.36, 0.05, 0.92);
  },
};

// ---- motorbike -------------------------------------------------------------

const bike = {
  bounds: [-1.1, -0.35, 1.0, 1.25],
  wheel: 'moto',
  exhaust: [-0.95, 0.05],
  smoke: 0.35,
  half: 1.0,
  driver: {
    hip: [-0.25, 0.46],
    shoulder: [0.1, 0.9],
    hand: [0.52, 0.74],
    knee: [0.2, 0.42],
    foot: [0.0, 0.02],
    helmet: '#1d4ed8',
    shirt: ['#1f1f1f', '#3a3a3a'],
    sleeve: '#2b2b2b',
    pants: '#334155',
    boots: '#1a1a1a',
    glove: '#111111',
  },

  under(ctx, [rear]) {
    // swing arm + red mono shock
    line(ctx, [[-0.1, -0.08], [rear.x, rear.y]], 0.07, '#1f1f1f');
    const mid = [(-0.1 + rear.x) / 2, (-0.08 + rear.y) / 2];
    coil(ctx, mid, [-0.4, 0.26], 0.03, '#dc2626', 7);
  },

  over(ctx, [, front]) {
    // telescopic fork from the steering head to the axle
    line(ctx, [[0.62, 0.52], [front.x, front.y]], 0.075, '#c7ccd1');
    const t = 0.45;
    const midF = [0.62 + (front.x - 0.62) * t, 0.52 + (front.y - 0.52) * t];
    line(ctx, [[0.62, 0.52], midF], 0.09, '#1f1f1f');
    ctx.strokeStyle = vgrad(ctx, front.y, front.y + front.r, [P.light, P.dark]);
    ctx.lineWidth = 0.06;
    ctx.beginPath();
    ctx.arc(front.x, front.y, front.r + 0.06, 0.45, 2.1);
    ctx.stroke();
  },

  back(ctx) {
    // rear hugger fender
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.arc(-0.68, -0.32, 0.41, 0.9, 2.3);
    ctx.stroke();
    // exhaust header and muffler
    line(ctx, [[0.2, -0.02], [0.1, -0.22], [-0.3, -0.2], [-0.55, -0.06]], 0.05, '#9aa0a6');
    const m = ctx.createLinearGradient(0, 0.12, 0, -0.16);
    m.addColorStop(0, '#e5e7eb');
    m.addColorStop(1, '#6b7280');
    fillPoly(ctx, [[-0.45, -0.14], [-0.98, 0.04], [-0.95, 0.14], [-0.42, -0.02]], m);
    fillPoly(ctx, [[-0.98, 0.04], [-1.02, 0.06], [-0.99, 0.15], [-0.95, 0.14]], '#222');
    // frame
    line(ctx, [[0.62, 0.5], [0.05, 0.28], [-0.7, 0.36]], 0.06, '#1c1c1c');
    line(ctx, [[0.62, 0.45], [0.28, -0.04], [-0.1, -0.1], [-0.36, 0.28]], 0.06, '#1c1c1c');
    // engine with cooling fins
    ctx.fillStyle = vgrad(ctx, -0.24, 0.14, ['#9ca3af', '#4b5563']);
    ctx.beginPath();
    ctx.roundRect(-0.22, -0.24, 0.5, 0.36, 0.06);
    ctx.fill();
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 0.02;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      ctx.moveTo(0.06 + i * 0.045, -0.02);
      ctx.lineTo(0.12 + i * 0.045, 0.2);
    }
    ctx.stroke();
    ctx.fillStyle = '#d1d5db';
    ctx.beginPath();
    ctx.arc(-0.05, -0.1, 0.09, 0, TAU);
    ctx.fill();
    // tail section + light + plate
    fillPoly(ctx, [[-0.05, 0.3], [-0.84, 0.46], [-0.88, 0.4], [-0.52, 0.24], [-0.1, 0.18]], vgrad(ctx, 0.18, 0.46, [P.light, P.dark]));
    fillPoly(ctx, [[-0.84, 0.46], [-0.9, 0.44], [-0.9, 0.39], [-0.86, 0.39]], '#ef4444');
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(-0.86, 0.2, 0.05, 0.14);
    // seat
    ctx.fillStyle = '#141414';
    ctx.beginPath();
    ctx.moveTo(0.06, 0.34);
    ctx.quadraticCurveTo(-0.3, 0.46, -0.66, 0.44);
    ctx.lineTo(-0.62, 0.38);
    ctx.quadraticCurveTo(-0.3, 0.36, 0.04, 0.28);
    ctx.closePath();
    ctx.fill();
    // fuel tank
    ctx.fillStyle = vgrad(ctx, 0.26, 0.58, [P.light, P.body, P.dark]);
    ctx.beginPath();
    ctx.moveTo(0.0, 0.3);
    ctx.quadraticCurveTo(0.06, 0.52, 0.2, 0.56);
    ctx.quadraticCurveTo(0.45, 0.6, 0.6, 0.48);
    ctx.lineTo(0.5, 0.28);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(0.28, 0.5, 0.14, 0.025, -0.1, 0, TAU);
    ctx.fill();
    // headlight cowl
    fillPoly(ctx, [[0.58, 0.42], [0.78, 0.46], [0.84, 0.66], [0.72, 0.74], [0.6, 0.62]], '#1f1f1f');
    ctx.fillStyle = '#fff6c0';
    ctx.beginPath();
    ctx.ellipse(0.81, 0.55, 0.03, 0.07, 0.2, 0, TAU);
    ctx.fill();
    // handlebar + mirror
    line(ctx, [[0.66, 0.7], [0.5, 0.76]], 0.04, '#2a2a2a');
    line(ctx, [[0.64, 0.74], [0.6, 0.94]], 0.015, '#2a2a2a');
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.ellipse(0.6, 0.97, 0.05, 0.03, 0, 0, TAU);
    ctx.fill();
  },
};

// ---- Hatchback -------------------------------------------------------------

export function hatchOutline(c) {
  c.moveTo(1.68, -0.2);
  c.lineTo(1.567, -0.2);
  c.arc(1.2, -0.36, 0.4, 0.41, Math.PI - 0.41);
  c.lineTo(-0.783, -0.2);
  c.arc(-1.15, -0.36, 0.4, 0.41, Math.PI - 0.41);
  c.lineTo(-1.7, -0.2);
  c.quadraticCurveTo(-1.78, -0.18, -1.76, 0.05);
  c.lineTo(-1.72, 0.95);
  c.quadraticCurveTo(-1.7, 1.16, -1.5, 1.16);
  c.lineTo(0.5, 1.16);
  c.quadraticCurveTo(0.6, 1.15, 0.65, 1.08);
  c.lineTo(1.22, 0.52);
  c.quadraticCurveTo(1.6, 0.46, 1.7, 0.4);
  c.quadraticCurveTo(1.8, 0.3, 1.78, 0.0);
  c.quadraticCurveTo(1.78, -0.18, 1.68, -0.2);
  c.closePath();
}
const HATCH_WINDOWS = [
  [[0.04, 0.56], [1.1, 0.56], [0.62, 1.06], [0.04, 1.07]],
  [[-0.8, 0.56], [-0.06, 0.56], [-0.06, 1.07], [-0.8, 1.07]],
  [[-1.62, 0.58], [-0.9, 0.58], [-0.9, 1.07], [-1.55, 1.07]],
];

// interior seen through a car's windows: dark cabin, seats, steering wheel
function carInterior(ctx, greenhouse, seat, rearSeat, wheel) {
  fillPoly(ctx, greenhouse, '#15171c');
  ctx.fillStyle = '#34363d';
  ctx.beginPath();
  ctx.roundRect(seat[0], seat[1], 0.14, 0.5, 0.05); // driver seat back
  ctx.roundRect(seat[0] + 0.01, seat[1] + 0.48, 0.12, 0.12, 0.04); // headrest
  ctx.roundRect(rearSeat[0], rearSeat[1], 0.13, 0.12, 0.04);
  ctx.fill();
  line(ctx, [wheel[0], wheel[1]], 0.045, '#1f1f1f'); // steering wheel rim, edge on
  line(ctx, [[(wheel[0][0] + wheel[1][0]) / 2, (wheel[0][1] + wheel[1][1]) / 2], wheel[2]], 0.035, '#2a2a2a');
}

const hatchback = {
  bounds: [-1.85, -0.5, 1.9, 1.45],
  wheel: 'hubcap',
  exhaust: [-1.7, -0.22],
  half: 1.8,
  driver: { hip: [0.15, 0.32], shoulder: [0.14, 0.72], hand: [0.6, 0.7], collar: true },

  under(ctx, wheels) {
    wheelWells(ctx, wheels, 0.07);
  },

  back(ctx) {
    carInterior(ctx, [[-1.66, 0.5], [1.15, 0.5], [0.64, 1.1], [-1.66, 1.1]], [-0.12, 0.42], [-1.0, 0.86], [[0.52, 0.6], [0.66, 0.82], [0.85, 0.6]]);
  },

  front(ctx) {
    carBody(ctx, hatchOutline, HATCH_WINDOWS, vgrad(ctx, -0.2, 1.16, [P.light, P.body, P.dark]), P.dark);
    ctx.fillStyle = '#111'; // black B and C pillars
    ctx.fillRect(-0.06, 0.56, 0.1, 0.51);
    ctx.fillRect(-0.9, 0.58, 0.1, 0.49);
    // door seams, handles, beltline
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.lineWidth = 0.015;
    ctx.beginPath();
    ctx.moveTo(-0.02, 0.56);
    ctx.lineTo(-0.02, -0.12);
    ctx.moveTo(1.16, 0.5);
    ctx.lineTo(1.12, -0.05);
    ctx.moveTo(-0.84, 0.56);
    ctx.lineTo(-0.82, 0.06);
    ctx.stroke();
    line(ctx, [[-1.72, 0.52], [1.2, 0.52]], 0.012, 'rgba(255,255,255,0.35)');
    ctx.fillStyle = '#1b2b40';
    ctx.fillRect(0.22, 0.4, 0.14, 0.035);
    ctx.fillRect(-0.62, 0.4, 0.14, 0.035);
    // side skirt + bumpers
    ctx.fillStyle = '#202326';
    ctx.fillRect(-0.78, -0.2, 2.34, 0.07);
    fillPoly(ctx, [[1.55, -0.2], [1.72, -0.2], [1.79, -0.05], [1.79, 0.08], [1.6, 0.08]], '#2a2d31');
    fillPoly(ctx, [[-1.7, -0.2], [-1.77, -0.15], [-1.77, 0.08], [-1.6, 0.08], [-1.6, -0.2]], '#2a2d31');
    // lights
    fillPoly(ctx, [[1.46, 0.45], [1.7, 0.4], [1.77, 0.27], [1.56, 0.29]], vgrad(ctx, 0.27, 0.45, ['#ffffff', '#cbd5e1']));
    fillPoly(ctx, [[-1.765, 0.48], [-1.715, 0.48], [-1.69, 0.9], [-1.735, 0.9]], '#d62828');
    // mirror, roof rails, antenna
    fillPoly(ctx, [[1.02, 0.62], [1.18, 0.6], [1.2, 0.72], [1.06, 0.74]], '#111');
    line(ctx, [[-1.45, 1.2], [0.42, 1.2]], 0.03, '#b8bec4');
    line(ctx, [[-1.3, 1.16], [-1.52, 1.42]], 0.012, '#111');
  },
};

// ---- Hybrid ----------------------------------------------------------------

export function hybridOutline(c) {
  c.moveTo(1.98, -0.22);
  c.lineTo(1.752, -0.22);
  c.arc(1.35, -0.34, 0.42, 0.29, Math.PI - 0.29);
  c.lineTo(-0.898, -0.22);
  c.arc(-1.3, -0.34, 0.42, 0.29, Math.PI - 0.29);
  c.lineTo(-1.92, -0.22);
  c.quadraticCurveTo(-2.0, -0.2, -1.99, 0.05);
  c.lineTo(-1.97, 0.55);
  c.lineTo(-1.88, 0.66);
  c.quadraticCurveTo(-1.5, 0.78, -1.1, 0.9);
  c.quadraticCurveTo(-0.5, 1.04, 0.05, 1.0);
  c.lineTo(1.2, 0.52);
  c.quadraticCurveTo(1.7, 0.4, 2.0, 0.24);
  c.quadraticCurveTo(2.1, 0.15, 2.08, -0.02);
  c.quadraticCurveTo(2.06, -0.2, 1.98, -0.22);
  c.closePath();
}
const HYBRID_WINDOWS = [
  [[-0.12, 0.6], [0.98, 0.6], [0.12, 0.95], [-0.12, 0.97]],
  [[-0.98, 0.62], [-0.2, 0.6], [-0.2, 0.97], [-0.75, 0.93]],
  [[-1.6, 0.66], [-1.06, 0.63], [-1.06, 0.86]],
];

const hybrid = {
  bounds: [-2.1, -0.5, 2.2, 1.12],
  wheel: 'alloy',
  exhaust: [-1.9, -0.24],
  smoke: 0.12, // hybrid: mostly electric
  half: 2.0,
  driver: { hip: [-0.02, 0.25], shoulder: [-0.05, 0.68], hand: [0.46, 0.64], shirt: ['#7c2d12', '#9a3412'], sleeve: '#9a3412' },

  under(ctx, wheels) {
    wheelWells(ctx, wheels, 0.07);
  },

  back(ctx) {
    carInterior(ctx, [[-1.7, 0.55], [1.1, 0.55], [0.05, 1.02], [-1.1, 0.95]], [-0.32, 0.35], [-1.2, 0.72], [[0.4, 0.55], [0.52, 0.76], [0.74, 0.58]]);
  },

  front(ctx) {
    carBody(ctx, hybridOutline, HYBRID_WINDOWS, vgrad(ctx, -0.22, 1.0, [P.light, P.body, P.dark]), '#5b6670');
    ctx.fillStyle = '#16181b'; // pillars
    ctx.fillRect(-0.2, 0.6, 0.08, 0.37);
    fillPoly(ctx, [[-1.06, 0.63], [-0.98, 0.62], [-0.85, 0.92], [-1.06, 0.88]], '#16181b');
    line(ctx, [[-1.6, 0.58], [1.0, 0.57]], 0.015, '#c3c9cf'); // window chrome
    ctx.strokeStyle = 'rgba(70, 80, 90, 0.6)'; // door seams
    ctx.lineWidth = 0.015;
    ctx.beginPath();
    ctx.moveTo(-0.16, 0.6);
    ctx.lineTo(-0.14, -0.14);
    ctx.moveTo(1.08, 0.55);
    ctx.lineTo(1.0, -0.05);
    ctx.moveTo(-1.0, 0.62);
    ctx.lineTo(-0.94, 0.0);
    ctx.stroke();
    ctx.fillStyle = '#8a939b';
    ctx.fillRect(0.12, 0.42, 0.14, 0.03);
    ctx.fillRect(-0.72, 0.42, 0.14, 0.03);
    // lower black trim with the hybrid badge
    ctx.fillStyle = '#25282c';
    ctx.fillRect(-0.9, -0.22, 2.65, 0.07);
    ctx.fillStyle = '#3b82f6';
    ctx.beginPath();
    ctx.roundRect(0.45, 0.06, 0.16, 0.05, 0.02);
    ctx.fill();
    // swept headlight + wraparound taillight
    fillPoly(ctx, [[1.6, 0.43], [1.98, 0.27], [2.05, 0.17], [1.72, 0.3]], vgrad(ctx, 0.17, 0.43, ['#ffffff', '#94a3b8']));
    fillPoly(ctx, [[-1.99, 0.34], [-1.9, 0.38], [-1.87, 0.64], [-1.97, 0.58]], '#c1121f');
    fillPoly(ctx, [[-1.88, 0.66], [-1.98, 0.64], [-1.97, 0.6], [-1.87, 0.62]], '#1f2328'); // spoiler lip
    fillPoly(ctx, [[0.98, 0.6], [1.12, 0.58], [1.14, 0.68], [1.0, 0.7]], '#1f2328'); // mirror
  },
};

// ---- Jeep ------------------------------------------------------------------

export function jeepOutline(c) {
  c.moveTo(1.95, -0.1);
  c.lineTo(1.697, -0.1);
  c.arc(1.25, -0.5, 0.6, 0.73, Math.PI - 0.73);
  c.lineTo(-0.703, -0.1);
  c.arc(-1.15, -0.5, 0.6, 0.73, Math.PI - 0.73);
  c.lineTo(-1.85, -0.1);
  c.lineTo(-1.86, 1.5);
  c.quadraticCurveTo(-1.86, 1.58, -1.78, 1.58);
  c.lineTo(0.5, 1.58);
  c.lineTo(0.58, 1.55);
  c.lineTo(0.74, 0.9);
  c.lineTo(1.9, 0.86);
  c.quadraticCurveTo(2.0, 0.85, 2.0, 0.75);
  c.lineTo(2.0, -0.02);
  c.quadraticCurveTo(2.0, -0.1, 1.95, -0.1);
  c.closePath();
}
export const JEEP_WINDOWS = [
  [[-0.02, 0.95], [0.67, 0.95], [0.56, 1.42], [-0.02, 1.42]],
  [[-1.05, 0.95], [-0.14, 0.95], [-0.14, 1.42], [-1.05, 1.42]],
  [[-1.76, 0.95], [-1.17, 0.95], [-1.17, 1.42], [-1.76, 1.42]],
];

const jeep = {
  bounds: [-2.2, -0.65, 2.2, 1.8],
  wheel: 'offroad',
  exhaust: [-1.9, -0.12],
  smoke: 0.8, // old diesel
  half: 2.0,
  driver: { hip: [0.0, 0.62], shoulder: [-0.02, 1.05], hand: [0.44, 1.0], shirt: ['#57534e', '#78716c'], sleeve: '#78716c' },

  under(ctx, wheels) {
    wheelWells(ctx, wheels, 0.1);
  },

  back(ctx) {
    carInterior(ctx, [[-1.8, 0.9], [0.72, 0.9], [0.6, 1.5], [-1.8, 1.5]], [-0.3, 0.75], [-1.3, 1.22], [[0.38, 0.92], [0.5, 1.12], [0.7, 0.95]]);
    // spare wheel on the rear door, seen edge-on
    ctx.fillStyle = '#141414';
    ctx.beginPath();
    ctx.roundRect(-2.14, 0.28, 0.3, 0.92, 0.1);
    ctx.fill();
    ctx.strokeStyle = '#2e2e2e';
    ctx.lineWidth = 0.02;
    ctx.beginPath();
    for (let y = 0.36; y < 1.15; y += 0.08) {
      ctx.moveTo(-2.14, y);
      ctx.lineTo(-1.84, y);
    }
    ctx.stroke();
    ctx.fillStyle = '#d6d6cf';
    ctx.fillRect(-1.95, 0.6, 0.1, 0.28);
  },

  front(ctx) {
    carBody(ctx, jeepOutline, JEEP_WINDOWS, vgrad(ctx, -0.1, 1.58, [P.light, P.body, P.dark]), P.dark);
    // white safari roof with little alpine windows
    fillPoly(ctx, [[-1.86, 1.45], [0.6, 1.45], [0.58, 1.55], [0.5, 1.58], [-1.78, 1.58], [-1.86, 1.5]], vgrad(ctx, 1.45, 1.58, ['#ffffff', '#d8d8d2']));
    fillPoly(ctx, [[-1.3, 1.48], [-1.0, 1.48], [-1.0, 1.55], [-1.3, 1.55]], glassStyle(ctx, -1.3, 1.6, -1.0, 1.45));
    fillPoly(ctx, [[-0.7, 1.48], [-0.4, 1.48], [-0.4, 1.55], [-0.7, 1.55]], glassStyle(ctx, -0.7, 1.6, -0.4, 1.45));
    // chunky black arch flares
    ctx.strokeStyle = '#151515';
    ctx.lineWidth = 0.1;
    ctx.beginPath();
    ctx.arc(1.25, -0.5, 0.64, 0.68, Math.PI - 0.68);
    ctx.moveTo(-1.15 + 0.64 * Math.cos(0.68), -0.5 + 0.64 * Math.sin(0.68));
    ctx.arc(-1.15, -0.5, 0.64, 0.68, Math.PI - 0.68);
    ctx.stroke();
    // door seams, exposed hinges, handle
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.lineWidth = 0.015;
    ctx.beginPath();
    ctx.moveTo(-0.08, 1.45);
    ctx.lineTo(-0.08, -0.08);
    ctx.moveTo(0.72, 0.9);
    ctx.lineTo(0.72, -0.08);
    ctx.stroke();
    ctx.fillStyle = '#1b1b1b';
    ctx.fillRect(0.66, 0.2, 0.06, 0.08);
    ctx.fillRect(0.66, 0.66, 0.06, 0.08);
    ctx.fillStyle = '#9ca3af';
    ctx.fillRect(-0.02, 0.8, 0.12, 0.035);
    // side step + bumpers
    ctx.fillStyle = '#151515';
    ctx.fillRect(-0.62, -0.17, 1.2, 0.06);
    ctx.fillRect(1.96, -0.16, 0.18, 0.3);
    ctx.fillRect(-1.95, -0.16, 0.14, 0.22);
    // round headlight + indicator on the front face
    ctx.fillStyle = '#e5e7eb';
    ctx.beginPath();
    ctx.ellipse(2.01, 0.6, 0.03, 0.09, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(1.98, 0.38, 0.04, 0.06);
    fillPoly(ctx, [[-1.87, 0.55], [-1.84, 0.55], [-1.84, 0.75], [-1.87, 0.75]], '#c1121f');
    // snorkel up the A-pillar
    line(ctx, [[1.12, 0.3], [1.12, 0.84], [0.8, 0.92], [0.64, 1.62]], 0.07, '#121212');
    fillPoly(ctx, [[0.58, 1.6], [0.8, 1.62], [0.8, 1.72], [0.6, 1.71]], '#121212');
    // roof rack
    line(ctx, [[-1.8, 1.66], [0.45, 1.66]], 0.035, '#1b1b1b');
    ctx.fillStyle = '#1b1b1b';
    for (const x of [-1.7, -0.9, -0.1, 0.4]) ctx.fillRect(x, 1.58, 0.03, 0.08);
    // mirror
    fillPoly(ctx, [[0.7, 0.96], [0.86, 0.94], [0.88, 1.08], [0.72, 1.1]], '#151515');
  },
};

// ---- Mini lorry ------------------------------------------------------------
export function lorryCabOutline(c) {
  c.moveTo(1.7, -0.2);
  c.lineTo(1.517, -0.2);
  c.arc(1.15, -0.36, 0.4, 0.41, Math.PI - 0.41);
  c.lineTo(0.55, -0.2);
  c.lineTo(0.55, 1.55);
  c.quadraticCurveTo(0.56, 1.62, 0.65, 1.62);
  c.lineTo(1.35, 1.62);
  c.quadraticCurveTo(1.45, 1.61, 1.5, 1.52);
  c.lineTo(1.72, 0.8);
  c.quadraticCurveTo(1.8, 0.65, 1.8, 0.4);
  c.lineTo(1.8, 0.0);
  c.quadraticCurveTo(1.8, -0.2, 1.7, -0.2);
  c.closePath();
}
// side wall of the open cargo bed, with the rear wheel arch
export function lorryBedOutline(c) {
  c.moveTo(0.5, -0.2);
  c.lineTo(-0.733, -0.2);
  c.arc(-1.1, -0.36, 0.4, 0.41, Math.PI - 0.41);
  c.lineTo(-1.85, -0.2);
  c.lineTo(-1.85, 0.72);
  c.lineTo(0.5, 0.72);
  c.closePath();
}
export const LORRY_WINDOWS = [[[0.68, 0.88], [1.66, 0.86], [1.44, 1.5], [0.68, 1.52]]];

const lorry = {
  bounds: [-1.95, -0.5, 1.9, 1.7],
  wheel: 'steel',
  exhaust: [-0.3, -0.24],
  smoke: 0.6,
  half: 1.85,
  driver: { hip: [0.95, 0.48], shoulder: [0.92, 0.94], hand: [1.36, 0.9], shirt: ['#0f766e', '#14b8a6'], sleeve: '#14b8a6' },

  under(ctx, wheels) {
    wheelWells(ctx, wheels, 0.07);
    line(ctx, [[-1.8, -0.12], [1.6, -0.12]], 0.1, '#1d1f22'); // chassis rail
  },

  back(ctx) {
    carInterior(ctx, [[0.6, 0.84], [1.7, 0.82], [1.46, 1.56], [0.6, 1.56]], [0.7, 0.42], [0.62, 1.2], [[1.26, 0.82], [1.38, 1.02], [1.56, 0.84]]);
    // cargo: a stack of crates and a sack poking above the bed rails
    ctx.fillStyle = '#9a6b3c';
    ctx.fillRect(-1.6, 0.62, 0.5, 0.42);
    ctx.fillRect(-1.0, 0.62, 0.44, 0.3);
    ctx.strokeStyle = '#6b4523';
    ctx.lineWidth = 0.02;
    ctx.strokeRect(-1.6, 0.62, 0.5, 0.42);
    ctx.strokeRect(-1.0, 0.62, 0.44, 0.3);
    line(ctx, [[-1.6, 0.83], [-1.1, 0.83]], 0.015, '#6b4523');
    ctx.fillStyle = '#d8c9a3';
    ctx.beginPath();
    ctx.ellipse(-0.2, 0.74, 0.32, 0.16, 0, 0, TAU);
    ctx.fill();
  },

  front(ctx) {
    const paint = (y0, y1) => vgrad(ctx, y0, y1, [P.light, P.body, P.dark]);
    // bed side: painted planks between steel rails
    ctx.beginPath();
    lorryBedOutline(ctx);
    ctx.fillStyle = paint(-0.2, 0.72);
    ctx.fill();
    ctx.strokeStyle = P.dark;
    ctx.lineWidth = 0.02;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.lineWidth = 0.015;
    ctx.beginPath();
    for (const y of [0.1, 0.4]) {
      ctx.moveTo(-1.83, y);
      ctx.lineTo(0.48, y);
    }
    for (const x of [-1.2, -0.45]) {
      ctx.moveTo(x, 0.0);
      ctx.lineTo(x, 0.7);
    }
    ctx.stroke();
    line(ctx, [[-1.86, 0.72], [0.52, 0.72]], 0.05, '#d0d4d8'); // top rail
    fillPoly(ctx, [[-1.9, 0.5], [-1.85, 0.5], [-1.85, 0.66], [-1.9, 0.66]], '#e02626'); // tail light
    // cab
    carBody(ctx, lorryCabOutline, LORRY_WINDOWS, paint(-0.2, 1.62), P.dark);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)'; // door seam + handle
    ctx.lineWidth = 0.015;
    ctx.beginPath();
    ctx.moveTo(0.64, 0.86);
    ctx.lineTo(0.64, -0.15);
    ctx.moveTo(1.62, 0.84);
    ctx.lineTo(1.6, 0.0);
    ctx.stroke();
    ctx.fillStyle = '#1f2328';
    ctx.fillRect(0.72, 0.66, 0.14, 0.035);
    line(ctx, [[0.56, 0.78], [1.74, 0.76]], 0.03, 'rgba(255,255,255,0.7)'); // white stripe
    // bumper, headlight, indicator, mirror
    fillPoly(ctx, [[1.6, -0.2], [1.84, -0.2], [1.86, 0.1], [1.66, 0.1]], '#2a2d31');
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.ellipse(1.79, 0.4, 0.03, 0.09, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(1.76, 0.2, 0.04, 0.06);
    line(ctx, [[1.62, 1.1], [1.82, 1.18], [1.82, 1.32]], 0.02, '#111');
    fillPoly(ctx, [[1.78, 1.12], [1.88, 1.12], [1.88, 1.36], [1.78, 1.36]], '#111');
  },
};

// ---- Van -------------------------------------------------------------------
export function vanOutline(c) {
  c.moveTo(2.05, -0.2);
  c.lineTo(1.817, -0.2);
  c.arc(1.45, -0.36, 0.4, 0.41, Math.PI - 0.41);
  c.lineTo(-0.933, -0.2);
  c.arc(-1.3, -0.36, 0.4, 0.41, Math.PI - 0.41);
  c.lineTo(-2.05, -0.2);
  c.quadraticCurveTo(-2.12, -0.18, -2.12, 0.0);
  c.lineTo(-2.1, 1.7);
  c.quadraticCurveTo(-2.08, 1.86, -1.9, 1.86);
  c.lineTo(1.3, 1.86);
  c.quadraticCurveTo(1.5, 1.85, 1.58, 1.7);
  c.lineTo(1.98, 0.75);
  c.quadraticCurveTo(2.14, 0.6, 2.14, 0.3);
  c.lineTo(2.14, 0.0);
  c.quadraticCurveTo(2.14, -0.2, 2.05, -0.2);
  c.closePath();
}
export const VAN_WINDOWS = [
  [[1.0, 0.98], [1.9, 0.94], [1.56, 1.68], [1.0, 1.7]],
  [[-0.15, 1.0], [0.88, 1.0], [0.88, 1.7], [-0.15, 1.7]],
  [[-1.25, 1.0], [-0.25, 1.0], [-0.25, 1.7], [-1.25, 1.7]],
  [[-2.0, 1.02], [-1.35, 1.02], [-1.35, 1.7], [-1.98, 1.7]],
];

const van = {
  bounds: [-2.25, -0.5, 2.25, 2.02],
  wheel: 'hubcap',
  exhaust: [-2.0, -0.22],
  smoke: 0.5,
  half: 2.1,
  driver: { hip: [1.08, 0.58], shoulder: [1.04, 1.04], hand: [1.52, 0.98], shirt: ['#e2e8f0', '#f8fafc'], sleeve: '#f1f5f9' },

  under(ctx, wheels) {
    wheelWells(ctx, wheels, 0.04);
  },

  back(ctx) {
    carInterior(ctx, [[-2.04, 0.96], [1.95, 0.9], [1.58, 1.76], [-2.04, 1.76]], [0.82, 0.5], [-0.6, 1.36], [[1.4, 0.92], [1.54, 1.14], [1.72, 0.94]]);
    ctx.fillStyle = '#34363d'; // rows of seats seen through the sliding windows
    ctx.beginPath();
    ctx.roundRect(-0.35, 1.0, 0.13, 0.42, 0.04);
    ctx.roundRect(-1.45, 1.0, 0.13, 0.42, 0.04);
    ctx.fill();
  },

  front(ctx) {
    carBody(ctx, vanOutline, VAN_WINDOWS, vgrad(ctx, -0.2, 1.86, [P.light, P.body, P.dark]), P.dark);
    ctx.fillStyle = '#16181b'; // pillars
    ctx.fillRect(0.88, 0.98, 0.12, 0.72);
    ctx.fillRect(-0.25, 1.0, 0.1, 0.7);
    ctx.fillRect(-1.35, 1.0, 0.1, 0.7);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)'; // door seams + sliding door rail
    ctx.lineWidth = 0.015;
    ctx.beginPath();
    ctx.moveTo(0.94, 0.98);
    ctx.lineTo(0.94, -0.15);
    ctx.moveTo(1.95, 0.9);
    ctx.lineTo(1.9, 0.0);
    ctx.moveTo(-0.2, 1.0);
    ctx.lineTo(-0.2, -0.15);
    ctx.stroke();
    line(ctx, [[-1.3, 0.92], [0.9, 0.92]], 0.025, '#2b2f35');
    ctx.fillStyle = '#2b2f35';
    ctx.fillRect(1.1, 0.78, 0.14, 0.035);
    ctx.fillRect(0.66, 0.78, 0.14, 0.035);
    // lower trim, bumpers, lights, mirror
    ctx.fillStyle = '#25282c';
    ctx.fillRect(-0.95, -0.2, 2.4, 0.07);
    fillPoly(ctx, [[1.85, -0.2], [2.12, -0.2], [2.18, 0.0], [2.18, 0.14], [1.9, 0.14]], '#2a2d31');
    fillPoly(ctx, [[-2.05, -0.2], [-2.16, -0.14], [-2.16, 0.12], [-1.95, 0.12], [-1.95, -0.2]], '#2a2d31');
    fillPoly(ctx, [[1.88, 0.62], [2.08, 0.6], [2.14, 0.4], [1.92, 0.44]], vgrad(ctx, 0.4, 0.62, ['#ffffff', '#cbd5e1']));
    fillPoly(ctx, [[-2.14, 0.4], [-2.09, 0.4], [-2.08, 0.9], [-2.13, 0.9]], '#d62828');
    fillPoly(ctx, [[1.92, 0.98], [2.08, 0.96], [2.1, 1.16], [1.94, 1.18]], '#111');
    line(ctx, [[-1.9, 1.92], [1.2, 1.92]], 0.03, '#1d1f22'); // roof rails
  },
};

export const ART = { tuktuk, bike, hatchback, lorry, hybrid, van, jeep };

/**
 * Draw a whole vehicle in chassis-local metres (y up).
 * wheels: [{x, y, r, spin}] in chassis-local coordinates.
 * blit(key, bounds, paint): draws a static part (the game caches these as sprites).
 * skin: paint { id, body, light, dark } from skinsOf(); the factory paint when omitted.
 */
export function paintVehicle(ctx, id, { wheels, lean, blit, skin }) {
  const art = ART[id];
  P = skin ?? getSkin(id);
  const paintKey = P.id;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  art.under?.(ctx, wheels);
  wheels.forEach((w, i) => {
    ctx.save();
    ctx.translate(w.x, w.y);
    ctx.rotate(w.spin);
    blit(`${id}-wheel${i}`, [-w.r, -w.r, w.r, w.r], (c) => paintWheel(c, w.r, art.wheel));
    ctx.restore();
  });
  art.over?.(ctx, wheels);
  blit(`${id}-${paintKey}-back`, art.bounds, art.back);
  art.live?.(ctx, lean);
  paintDriver(ctx, art.driver, lean);
  if (art.front) blit(`${id}-${paintKey}-front`, art.bounds, art.front);
}
