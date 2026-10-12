// Distant landmarks, painted into a far parallax layer (render.js). `name` is for
// reference only; nothing is labelled on screen.
// Each draw(ctx) works in "units" with the origin on the ground/sea line at the
// landmark's centre and y pointing DOWN (negative y is up). The caller scales
// units to pixels. Colours are hazy because these are far away.

const TAU = Math.PI * 2;

function shape(ctx, pts, fill) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}
function rect(ctx, x, y, w, h, fill) {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
}
function lines(ctx, segs, width, stroke) {
  ctx.beginPath();
  for (const pts of segs) pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.lineWidth = width;
  ctx.strokeStyle = stroke;
  ctx.stroke();
}
function circle(ctx, x, y, r, fill) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
}
// smooth hill through points (quadratic midpoints), closed along y = 0
function hill(ctx, pts, fill) {
  hillPath(ctx, pts);
  ctx.fillStyle = fill;
  ctx.fill();
}
function hillPath(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], 0.2);
  ctx.lineTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i];
    const [nx, ny] = pts[i + 1];
    ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last[0], last[1]);
  ctx.lineTo(last[0], 0.2);
  ctx.closePath();
}
// white stupa (dagoba): bell dome, square box, spire
function stupa(ctx, x, y, r, white = '#f4f1ea') {
  rect(ctx, x - r * 1.15, y - r * 0.25, r * 2.3, r * 0.25, white);
  ctx.beginPath();
  ctx.ellipse(x, y - r * 0.25, r, r * 0.95, 0, Math.PI, 0);
  ctx.fillStyle = white;
  ctx.fill();
  rect(ctx, x - r * 0.25, y - r * 1.45, r * 0.5, r * 0.3, white);
  shape(ctx, [[x - r * 0.14, y - r * 1.45], [x + r * 0.14, y - r * 1.45], [x, y - r * 2.3]], '#d9c58a');
}
// outrigger fishing boat (oruwa) with a sail
function oruwa(ctx, x, y, k = 1, sail = '#f0e6d0') {
  shape(ctx, [[x - 0.9 * k, y - 0.12 * k], [x + 0.9 * k, y - 0.12 * k], [x + 0.6 * k, y + 0.08 * k], [x - 0.65 * k, y + 0.08 * k]], '#5b3b22');
  lines(ctx, [[[x - 0.3 * k, y - 0.1 * k], [x - 0.3 * k, y + 0.25 * k]], [[x + 0.3 * k, y - 0.1 * k], [x + 0.3 * k, y + 0.25 * k]]], 0.05 * k, '#5b3b22');
  rect(ctx, x - 0.5 * k, y + 0.22 * k, 1, 0.06 * k, '#5b3b22');
  shape(ctx, [[x - 0.05 * k, y - 0.15 * k], [x - 0.05 * k, y - 1.5 * k], [x + 0.75 * k, y - 0.3 * k]], sail);
}
function palm(ctx, x, y, h, lean = 0.3) {
  lines(ctx, [[[x, y], [x + lean * h * 0.5, y - h * 0.6], [x + lean * h, y - h]]], 0.12, '#6b5a3f');
  const tx = x + lean * h;
  const ty = y - h;
  ctx.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI + (i / 6) * Math.PI;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.quadraticCurveTo(tx + Math.cos(a) * 0.7, ty + Math.sin(a) * 0.5 - 0.2, tx + Math.cos(a) * 1.1, ty + Math.sin(a) * 0.3 + 0.35);
    ctx.lineWidth = 0.12;
    ctx.strokeStyle = '#3f6b3c';
    ctx.stroke();
  }
}

// waterfall pouring off a cliff edge at (x, top) down to the ground line, with spray at the foot
function waterfall(ctx, x, top, w, spread = 1.3) {
  ctx.fillStyle = 'rgba(240, 248, 250, 0.92)';
  ctx.beginPath();
  ctx.moveTo(x - w / 2, top);
  ctx.lineTo(x + w / 2, top);
  ctx.lineTo(x + (w / 2) * spread, 0);
  ctx.lineTo(x - (w / 2) * spread, 0);
  ctx.fill();
  lines(ctx, [-0.25, 0.1, 0.35].map((f) => [[x + f * w, top + 0.2], [x + f * w * spread, -0.3]]), 0.04, 'rgba(170, 200, 210, 0.6)');
  ctx.globalAlpha = 0.6;
  for (const [dx, r] of [[-0.6, 0.5], [0, 0.7], [0.6, 0.5]]) circle(ctx, x + dx * w * spread, -0.2, r * Math.max(w, 0.6), '#f4f8f8');
  ctx.globalAlpha = 1;
}
// a granite inselberg: steep-sided dome rising from the plain
function inselberg(ctx, x, w, h, fill) {
  ctx.beginPath();
  ctx.moveTo(x - w * 0.62, 0.2);
  ctx.bezierCurveTo(x - w * 0.58, -h * 0.7, x - w * 0.45, -h, x - w * 0.1, -h);
  ctx.lineTo(x + w * 0.15, -h);
  ctx.bezierCurveTo(x + w * 0.45, -h, x + w * 0.55, -h * 0.65, x + w * 0.62, 0.2);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}
// a forested hill-shaped tree line along the ground
// a row of tree crowns standing on y = y0
function treeLine(ctx, x0, x1, h, fill, y0 = 0) {
  ctx.beginPath();
  for (let x = x0; x <= x1; x += 0.6) {
    const r = h * (0.7 + 0.3 * Math.sin(x * 3.1));
    ctx.moveTo(x + r, y0 - r * 0.6);
    ctx.arc(x, y0 - r * 0.6, r, 0, TAU);
  }
  ctx.fillStyle = fill;
  ctx.fill();
}
// a soft bank of cloud, w units wide
function wisp(ctx, x, y, w, alpha = 0.7) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#f4f7f8';
  ctx.beginPath();
  for (const [dx, dy, rx, ry] of [[-0.32, 0.04, 0.36, 0.12], [0, -0.05, 0.42, 0.17], [0.34, 0.03, 0.34, 0.11]]) {
    ctx.moveTo(x + dx * w + rx * w, y + dy * w);
    ctx.ellipse(x + dx * w, y + dy * w, rx * w, ry * w, 0, 0, TAU);
  }
  ctx.fill();
  ctx.globalAlpha = 1;
}
// draw() clipped to the shape of hill(pts), so details stay on the hillside
function onHill(ctx, pts, draw) {
  ctx.save();
  hillPath(ctx, pts);
  ctx.clip();
  draw();
  ctx.restore();
}

// ---- hill country -------------------------------------------------------------
const HILL = '#6f958c';
const HILL_DARK = '#5d8278';

export const LANDMARKS = {
  bibleRock: {
    name: 'Bible Rock',
    height: 4.6,
    draw(ctx) {
      hill(ctx, [[-6, 0], [-3.4, -2.2], [-2.4, -3.1], [0, -3.3], [2.6, -3.1], [3.8, -2], [6, 0]], HILL);
      // the flat-topped rock that looks like an open book lying on the ridge
      shape(ctx, [[-2.5, -3.1], [-2.3, -4.2], [2.2, -4.5], [2.7, -3.1]], '#8ea8a6');
      shape(ctx, [[-2.3, -4.2], [2.2, -4.5], [2.35, -4.2], [-2.1, -3.95]], '#a9bdbb');
      lines(ctx, [[[-1.5, -3.3], [-1.4, -4.1]], [[0.2, -3.25], [0.3, -4.2]], [[1.5, -3.2], [1.6, -4.3]]], 0.05, 'rgba(70,90,90,0.4)');
    },
  },
  ambuluwawa: {
    name: 'Ambuluwawa Tower',
    height: 7,
    draw(ctx) {
      hill(ctx, [[-5, 0], [-2.5, -2.2], [0, -3.1], [2.6, -2.1], [5, 0]], HILL);
      // white spiral tower on the summit
      shape(ctx, [[-0.42, -3], [0.42, -3], [0.2, -6.2], [-0.2, -6.2]], '#f1efe8');
      lines(ctx, [-3.2, -3.8, -4.4, -5, -5.6].map((y) => [[-0.4, y + 0.3], [0.4, y - 0.15]]), 0.08, '#c9c5b8');
      shape(ctx, [[-0.12, -6.2], [0.12, -6.2], [0, -6.9]], '#e8e2d0');
    },
  },
  rambodaFalls: {
    name: 'Ramboda Falls',
    height: 5,
    draw(ctx) {
      hill(ctx, [[-4, 0], [-3, -3.6], [-1.5, -4.8], [1.4, -4.9], [3, -3.8], [4, 0]], '#5b7f73');
      shape(ctx, [[-0.5, -4.85], [0.5, -4.85], [0.7, -2.4], [-0.6, -2.4]], '#4a6a62'); // gorge
      // two-tier fall
      shape(ctx, [[-0.3, -4.85], [0.25, -4.85], [0.35, -2.6], [-0.35, -2.6]], '#eef6f7');
      shape(ctx, [[-0.45, -2.5], [0.45, -2.5], [0.6, -0.2], [-0.6, -0.2]], '#e6f1f3');
      ctx.globalAlpha = 0.6;
      circle(ctx, 0, -0.3, 0.9, '#f4f8f8');
      circle(ctx, 0, -2.5, 0.5, '#f4f8f8');
      ctx.globalAlpha = 1;
    },
  },
  postOffice: {
    name: 'Nuwara Eliya Post Office',
    height: 4.4,
    draw(ctx) {
      hill(ctx, [[-4, 0], [-2, -0.9], [2, -1], [4, 0]], '#7da489');
      const brick = '#b0685a';
      rect(ctx, -2.6, -2.5, 5.2, 1.6, brick);
      shape(ctx, [[-2.8, -2.5], [-1.8, -3.4], [-0.8, -2.5]], '#5e5a5c'); // gables
      shape(ctx, [[0.8, -2.5], [1.8, -3.4], [2.8, -2.5]], '#5e5a5c');
      lines(ctx, [[[-2.6, -1.7], [2.6, -1.7]], [[-1.8, -2.5], [-1.8, -0.9]], [[1.8, -2.5], [1.8, -0.9]]], 0.07, '#efe7da');
      rect(ctx, -0.45, -3.9, 0.9, 3, brick); // clock tower
      shape(ctx, [[-0.6, -3.9], [0.6, -3.9], [0, -4.4]], '#5e5a5c');
      circle(ctx, 0, -3.4, 0.26, '#f6f1e6');
      for (const x of [-2.1, -1.2, 1.2, 2.1]) rect(ctx, x - 0.15, -2.3, 0.3, 0.45, '#f1eadc');
    },
  },
  hakgalaRock: {
    name: 'Hakgala Rock',
    height: 6,
    draw(ctx) {
      hill(ctx, [[-6, 0], [-4, -2], [-2.5, -4.2], [-1.4, -5.8], [-0.2, -5.4], [0.4, -4.7], [1.4, -5.1], [2.6, -3.4], [4.5, -1.2], [6, 0]], '#7b958f');
      lines(ctx, [[[-1.8, -5], [-2.3, -2.5]], [[-0.8, -5.3], [-1.1, -2.8]], [[1.2, -4.8], [1.6, -2.4]]], 0.08, 'rgba(60,80,75,0.35)');
    },
  },
  nineArch: {
    name: 'Nine Arch Bridge',
    height: 4.2,
    draw(ctx) {
      hill(ctx, [[-6.5, 0], [-6, -3.6], [-4.4, -3.2], [-4, 0]], '#4f7f55');
      hill(ctx, [[4, 0], [4.4, -3.2], [6, -3.7], [6.5, 0]], '#4f7f55');
      // stone viaduct with nine arches, cut out with even-odd fill
      ctx.beginPath();
      ctx.rect(-4.6, -3.1, 9.2, 3.1);
      const span = 9.2 / 9;
      for (let i = 0; i < 9; i++) {
        const cx = -4.6 + span * (i + 0.5);
        const r = span * 0.36;
        ctx.moveTo(cx - r, 0);
        ctx.lineTo(cx - r, -2.2);
        ctx.arc(cx, -2.2, r, Math.PI, 0);
        ctx.lineTo(cx + r, 0);
        ctx.closePath();
      }
      ctx.fillStyle = '#c2b39a';
      ctx.fill('evenodd');
      rect(ctx, -4.6, -3.25, 9.2, 0.15, '#a89880');
      // blue train crossing
      for (let i = 0; i < 4; i++) {
        const x = -3.2 + i * 1.35;
        rect(ctx, x, -3.85, 1.25, 0.6, i === 0 ? '#c0392b' : '#2f5d9e');
        for (let k = 0; k < 3; k++) rect(ctx, x + 0.15 + k * 0.37, -3.72, 0.22, 0.18, '#d9e6f2');
      }
    },
  },
  adamsPeak: {
    name: "Adam's Peak (Sri Pada)",
    height: 7,
    draw(ctx) {
      hill(ctx, [[-6, 0], [-3.6, -2.4], [-1, -5.6], [0, -6.6], [1, -5.6], [3.8, -2.2], [6, 0]], '#9ab3c2');
      shape(ctx, [[-0.35, -6.45], [0.35, -6.45], [0.25, -6.75], [-0.25, -6.75]], '#f4f2ec'); // summit temple
      lines(ctx, [[[-0.1, -6.4], [-0.6, -5.2], [-0.4, -4.4], [-1, -3.4]]], 0.05, 'rgba(255,240,190,0.8)'); // pilgrim lights
    },
  },
  worldsEnd: {
    name: "World's End",
    height: 4.6,
    draw(ctx) {
      shape(ctx, [[-6, 0], [-6, -4], [-2, -4.2], [1.2, -4.3], [1.4, -3.9], [1.7, -1.5], [2.4, 0]], '#7e8f86');
      lines(ctx, [[[-6, -4], [1.2, -4.3]]], 0.25, '#7ea36d'); // grassland on top
      lines(ctx, [[[1.3, -4], [1.5, -1.6]], [[0.8, -3.8], [1, -1]], [[0.2, -3.9], [0.5, -0.8]]], 0.07, 'rgba(60,70,65,0.4)');
      // a hiker at the edge
      lines(ctx, [[[0.9, -4.3], [0.9, -4.75]]], 0.1, '#3b3b3b');
      circle(ctx, 0.9, -4.85, 0.1, '#3b3b3b');
    },
  },
  pidurutalagala: {
    name: 'Pidurutalagala',
    height: 7.2,
    draw(ctx) {
      hill(ctx, [[-6.5, 0], [-3, -3.4], [0, -4.6], [3, -3.6], [6.5, 0]], HILL_DARK);
      // transmitter masts and radar dome on Sri Lanka's highest peak
      const mast = (x, h) => {
        lines(ctx, [[[x - 0.18, -4.5], [x, -4.5 - h], [x + 0.18, -4.5]]], 0.06, '#d8d8d4');
        lines(ctx, [0.3, 0.6, 0.9].map((t) => [[x - 0.18 * (1 - t), -4.5 - h * t], [x + 0.18 * (1 - t), -4.5 - h * t]]), 0.04, '#d8d8d4');
        circle(ctx, x, -4.5 - h, 0.06, '#e74c3c');
      };
      mast(-0.6, 2.4);
      mast(0.7, 1.8);
      ctx.beginPath();
      ctx.arc(0.05, -4.55, 0.4, Math.PI, 0);
      ctx.fillStyle = '#f2f2ee';
      ctx.fill();
    },
  },

  // ---- Galle Road (sea landmarks sit on the sea line) ---------------------------
  harbour: {
    name: 'Hambantota Port',
    height: 5,
    draw(ctx) {
      rect(ctx, -6, -0.5, 12, 0.5, '#8d8f8e'); // quay
      // container ship
      shape(ctx, [[-1.5, -0.3], [4.5, -0.3], [4.1, 0.3], [-1.2, 0.3]], '#2c3e50');
      const colours = ['#c0392b', '#2f6db5', '#e67e22', '#27ae60', '#8e44ad'];
      for (let r = 0; r < 3; r++) for (let c = 0; c < 8; c++) rect(ctx, -1.1 + c * 0.6, -0.65 - r * 0.32, 0.55, 0.3, colours[(r * 3 + c) % 5]);
      rect(ctx, 3.6, -1.9, 0.6, 1.6, '#ecf0f1');
      // gantry cranes
      for (const x of [-5, -3.2]) {
        lines(ctx, [[[x - 0.6, -0.5], [x - 0.3, -3.6]], [[x + 0.6, -0.5], [x + 0.3, -3.6]], [[x - 0.4, -2], [x + 0.4, -2]]], 0.14, '#d35400');
        lines(ctx, [[[x - 1.2, -3.6], [x + 3.2, -3.6]]], 0.2, '#d35400');
        lines(ctx, [[[x, -3.6], [x + 0.5, -4.9], [x + 3.2, -3.6]]], 0.07, '#d35400');
      }
    },
  },
  mulkirigala: {
    name: 'Mulkirigala Rock Temple',
    height: 5.6,
    draw(ctx) {
      hill(ctx, [[-4.5, 0], [-3.4, -1.5], [-2, -3.6], [-0.5, -4.2], [1.2, -3.9], [2.6, -2.4], [4.5, 0]], '#7d8c74');
      hill(ctx, [[-4.5, 0], [-3, -1.2], [0, -1.8], [3, -1.1], [4.5, 0]], '#4e7a45');
      stupa(ctx, -0.3, -4.15, 0.5);
      rect(ctx, 0.6, -4.1, 0.8, 0.35, '#f1ece0');
      shape(ctx, [[0.5, -4.1], [1.5, -4.1], [1, -4.45]], '#a0522d');
    },
  },
  blowhole: {
    name: 'Hummanaya Blowhole',
    height: 6,
    draw(ctx) {
      hill(ctx, [[-3.5, 0], [-2.6, -1.2], [-0.6, -1.5], [1.4, -1.1], [3.5, 0]], '#5d5a55');
      // the sea spout, up to ~25 m in real life
      ctx.fillStyle = 'rgba(240, 250, 252, 0.9)';
      ctx.beginPath();
      ctx.moveTo(-0.3, -1.4);
      ctx.quadraticCurveTo(-0.6, -4, -0.2, -5.4);
      ctx.quadraticCurveTo(0.3, -5.9, 0.6, -5.2);
      ctx.quadraticCurveTo(0.8, -3.5, 0.35, -1.4);
      ctx.fill();
      ctx.globalAlpha = 0.55;
      for (const [x, y, r] of [[-0.5, -5.3, 0.6], [0.6, -5.6, 0.5], [1.2, -4.8, 0.45], [-1, -4.4, 0.4]]) circle(ctx, x, y, r, '#f6fbfc');
      ctx.globalAlpha = 1;
    },
  },
  dondraLighthouse: {
    name: 'Dondra Head Lighthouse',
    height: 7,
    draw(ctx) {
      hill(ctx, [[-4, 0], [-3, -0.8], [0, -1.1], [3, -0.7], [4, 0]], '#6a6560');
      palm(ctx, -2.6, -0.8, 1.6, -0.25);
      palm(ctx, 2.3, -0.7, 1.4, 0.3);
      // tall white tower, gallery and lantern
      shape(ctx, [[-0.5, -1], [0.5, -1], [0.3, -5.6], [-0.3, -5.6]], '#f7f7f2');
      rect(ctx, -0.45, -5.75, 0.9, 0.15, '#2d2d2d');
      rect(ctx, -0.22, -6.3, 0.44, 0.55, '#f6e7a1');
      shape(ctx, [[-0.3, -6.3], [0.3, -6.3], [0, -6.8]], '#c0392b');
      rect(ctx, 0.9, -1.6, 1, 0.6, '#efe9dc');
      shape(ctx, [[0.8, -1.6], [2, -1.6], [1.4, -2]], '#a0522d');
    },
  },
  paraviDuwa: {
    name: 'Paravi Duwa Temple',
    height: 3.4,
    draw(ctx) {
      // footbridge from the shore to the little island
      lines(ctx, [[[-5, -0.6], [-1.2, -0.6]]], 0.12, '#e9e4d8');
      for (const x of [-4.4, -1.8]) lines(ctx, [[[x, -0.6], [x, -1.7]]], 0.12, '#e9e4d8');
      ctx.beginPath();
      ctx.moveTo(-5, -1.2);
      ctx.quadraticCurveTo(-3.1, 0.1, -1.2, -1.2);
      ctx.lineWidth = 0.05;
      ctx.strokeStyle = '#d9d3c4';
      ctx.stroke();
      hill(ctx, [[-1.6, 0], [-1, -0.9], [0.6, -1.1], [1.8, 0]], '#6d675e');
      stupa(ctx, 0.1, -1, 0.55);
      palm(ctx, 1.2, -0.7, 1.3, 0.3);
    },
  },
  whale: {
    name: 'Whales off Mirissa',
    height: 3,
    draw(ctx) {
      // blue whale fluke and a spout further out
      ctx.fillStyle = '#34495e';
      ctx.beginPath();
      ctx.moveTo(-0.25, 0);
      ctx.quadraticCurveTo(-0.2, -1, -0.05, -1.5);
      ctx.quadraticCurveTo(-1.2, -1.6, -1.6, -2.3);
      ctx.quadraticCurveTo(-0.6, -2, 0, -1.7);
      ctx.quadraticCurveTo(0.6, -2, 1.6, -2.3);
      ctx.quadraticCurveTo(1.2, -1.6, 0.05, -1.5);
      ctx.quadraticCurveTo(0.2, -1, 0.25, 0);
      ctx.fill();
      ctx.globalAlpha = 0.7;
      for (const [x, y, r] of [[3, -1, 0.35], [3.2, -1.6, 0.3], [2.8, -1.7, 0.25]]) circle(ctx, x, y, r, '#f4f9fb');
      ctx.globalAlpha = 1;
      shape(ctx, [[2.6, -0.1], [3.6, -0.1], [3.4, 0.1], [2.75, 0.1]], '#34495e');
      oruwa(ctx, -4, 0, 0.9, '#f5f0e6');
    },
  },
  taprobane: {
    name: 'Taprobane Island',
    height: 3.6,
    draw(ctx) {
      hill(ctx, [[-2.2, 0], [-1.8, -1], [0, -1.5], [1.8, -1], [2.2, 0]], '#5f6b4f');
      palm(ctx, -1.5, -0.9, 1.6, -0.3);
      palm(ctx, 1.4, -0.9, 1.8, 0.25);
      // octagonal white villa with a terracotta roof
      rect(ctx, -0.8, -2.3, 1.6, 0.9, '#f5f1e8');
      shape(ctx, [[-1, -2.3], [1, -2.3], [0.5, -2.9], [-0.5, -2.9]], '#b5543a');
      for (const x of [-0.5, 0, 0.5]) rect(ctx, x - 0.1, -2.05, 0.2, 0.35, '#7a6a55');
    },
  },
  stiltFishermen: {
    name: 'Stilt Fishermen',
    height: 3,
    draw(ctx) {
      // poles in the surf, each with a crossbar and a fisherman perched on it
      for (const [x, h] of [[-3, 2], [-1.4, 2.3], [0.4, 1.9], [2.2, 2.2]]) {
        lines(ctx, [[[x, 0.3], [x + 0.25, -h]], [[x - 0.4, -h * 0.55], [x + 0.6, -h * 0.6]]], 0.1, '#4a3a2a');
        const px = x + 0.18;
        const py = -h * 0.6;
        lines(ctx, [[[px, py], [px - 0.05, py - 0.55]]], 0.18, '#2e2a26'); // body
        circle(ctx, px - 0.05, py - 0.72, 0.13, '#2e2a26');
        lines(ctx, [[[px, py - 0.4], [px + 1.1, py - 1.2]]], 0.03, '#2e2a26'); // rod
      }
    },
  },
  peacePagoda: {
    name: 'Japanese Peace Pagoda',
    height: 5,
    draw(ctx) {
      hill(ctx, [[-5, 0], [-3, -1.8], [-0.5, -2.6], [2, -2.3], [5, 0]], '#4a7a46');
      stupa(ctx, -0.4, -2.55, 1.1);
    },
  },
  galleFort: {
    name: 'Galle Fort',
    height: 5.4,
    draw(ctx) {
      // ramparts and a bastion
      shape(ctx, [[-6, 0], [-6, -1], [-1.5, -1], [-1.2, -1.5], [0.8, -1.5], [1.1, -1], [6, -1], [6, 0]], '#a39a86');
      lines(ctx, [[[-6, -1], [6, -1]]], 0.08, '#8a826f');
      // red roofs inside the walls
      for (const [x, w] of [[-5, 1.2], [-3.5, 1], [2, 1.3], [3.8, 1]]) {
        rect(ctx, x, -1.7, w, 0.7, '#efe7d6');
        shape(ctx, [[x - 0.1, -1.7], [x + w + 0.1, -1.7], [x + w / 2, -2.2]], '#b5543a');
      }
      // lighthouse on Point Utrecht bastion
      shape(ctx, [[-0.35, -1.5], [0.35, -1.5], [0.22, -4.6], [-0.22, -4.6]], '#fbfaf5');
      rect(ctx, -0.32, -4.72, 0.64, 0.12, '#333');
      rect(ctx, -0.16, -5.1, 0.32, 0.38, '#f6e7a1');
      shape(ctx, [[-0.22, -5.1], [0.22, -5.1], [0, -5.4]], '#333');
      // clock tower
      rect(ctx, -2.7, -3.2, 0.6, 2.2, '#efe7d6');
      circle(ctx, -2.4, -2.8, 0.18, '#ffffff');
      shape(ctx, [[-2.8, -3.2], [-2, -3.2], [-2.4, -3.6]], '#8a826f');
      palm(ctx, 4.8, -1, 1.6, 0.3);
    },
  },

  // ---- Colombo & Western Province -------------------------------------------------
  negomboLagoon: {
    name: 'Negombo Lagoon',
    height: 3.6,
    draw(ctx) {
      rect(ctx, -6, -0.15, 12, 0.3, 'rgba(90, 150, 170, 0.6)');
      oruwa(ctx, -3.6, 0, 1.6, '#e9c98b');
      oruwa(ctx, 0.2, 0.05, 2, '#f3ead8');
      oruwa(ctx, 3.6, 0, 1.3, '#d9a35a');
      // fishing nets drying on poles
      lines(ctx, [[[4.8, 0], [4.8, -1.4]], [[5.8, 0], [5.8, -1.4]]], 0.06, '#5b3b22');
      ctx.globalAlpha = 0.5;
      rect(ctx, 4.8, -1.35, 1, 0.9, '#6b5a40');
      ctx.globalAlpha = 1;
    },
  },
  muthurajawela: {
    name: 'Muthurajawela Marsh',
    height: 3.2,
    draw(ctx) {
      // mangroves on arching roots, reeds, and egrets flying over
      for (const [x, k] of [[-4, 1], [-1.2, 1.3], [2.6, 1.1]]) {
        lines(ctx, [-0.5, -0.2, 0.2, 0.5].map((dx) => [[x + dx * k, 0], [x + dx * 0.4 * k, -0.6 * k]]), 0.06, '#5a4a36');
        ctx.beginPath();
        for (const [cx, cy, r] of [[0, -1.1, 0.7], [-0.6, -0.8, 0.5], [0.6, -0.85, 0.5]]) {
          ctx.moveTo(x + (cx + r) * k, cy * k);
          ctx.arc(x + cx * k, cy * k, r * k, 0, TAU);
        }
        ctx.fillStyle = '#3f6b3a';
        ctx.fill();
      }
      lines(ctx, [-5.5, -5.2, -2.6, -2.4, 0.6, 1, 4.6, 5, 5.3].map((x) => [[x, 0], [x + 0.1, -0.9]]), 0.05, '#6b8a3a');
      for (const [x, y] of [[-2, -2.6], [-1.2, -2.9], [0.4, -2.4], [3.8, -3]]) lines(ctx, [[[x - 0.35, y - 0.15], [x, y], [x + 0.35, y - 0.15]]], 0.08, '#ffffff');
    },
  },
  kelaniBridge: {
    name: 'New Kelani Bridge',
    height: 5.2,
    draw(ctx) {
      rect(ctx, -6.5, -0.2, 13, 0.4, 'rgba(90, 140, 150, 0.6)'); // the river
      rect(ctx, -6.5, -1.6, 13, 0.25, '#c9cdd1'); // deck
      for (const x of [-5, -1.5, 1.5, 5]) rect(ctx, x - 0.15, -1.4, 0.3, 1.4, '#b5babf');
      // two pylons with fans of stay cables
      for (const px of [-2.6, 2.6]) {
        shape(ctx, [[px - 0.45, -1.6], [px - 0.12, -5.2], [px + 0.12, -5.2], [px + 0.45, -1.6]], '#e7e9eb');
        const fan = [];
        for (let i = 1; i <= 5; i++) {
          fan.push([[px, -4.9 + i * 0.12], [px - i * 0.55, -1.6]]);
          fan.push([[px, -4.9 + i * 0.12], [px + i * 0.55, -1.6]]);
        }
        lines(ctx, fan, 0.035, '#f1f2f3');
      }
    },
  },
  redMosque: {
    name: 'Jami Ul-Alfar (Red Mosque)',
    height: 5,
    draw(ctx) {
      // red and white candy stripes, a central tower and little domed turrets
      rect(ctx, -3, -2.6, 6, 2.6, '#c0392b');
      for (let y = -2.4; y < 0; y += 0.4) rect(ctx, -3, y, 6, 0.18, '#f4ede2');
      rect(ctx, -0.7, -3.9, 1.4, 1.3, '#c0392b');
      for (let y = -3.7; y < -2.6; y += 0.4) rect(ctx, -0.7, y, 1.4, 0.18, '#f4ede2');
      const dome = (x, y, r) => {
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * 1.2, 0, Math.PI, 0);
        ctx.fillStyle = '#c0392b';
        ctx.fill();
        lines(ctx, [[[x, y - r * 1.2], [x, y - r * 1.2 - 0.35]]], 0.05, '#e3c26a');
      };
      dome(0, -3.9, 0.6);
      for (const x of [-2.8, -1.6, 1.6, 2.8]) {
        rect(ctx, x - 0.18, -3.2, 0.36, 0.6, '#f4ede2');
        dome(x, -3.2, 0.24);
      }
      for (const x of [-2.2, -1.2, 1.2, 2.2]) {
        ctx.beginPath();
        ctx.moveTo(x - 0.25, -0.2);
        ctx.lineTo(x - 0.25, -1.1);
        ctx.arc(x, -1.1, 0.25, Math.PI, 0);
        ctx.lineTo(x + 0.25, -0.2);
        ctx.fillStyle = '#5a1d18';
        ctx.fill();
      }
    },
  },
  twinTowers: {
    name: 'World Trade Center, Colombo',
    height: 8.2,
    draw(ctx) {
      // the twin towers and the round Bank of Ceylon tower beside them
      for (const x of [-1.2, 0.4]) {
        rect(ctx, x, -7.6, 1.2, 7.6, '#7f9db3');
        rect(ctx, x + 0.75, -7.6, 0.45, 7.6, '#6a879d');
        for (let y = -7.3; y < 0; y += 0.35) rect(ctx, x + 0.08, y, 1.04, 0.05, 'rgba(220, 235, 245, 0.5)');
      }
      rect(ctx, -3.4, -5.6, 1.5, 5.6, '#a6b1b8');
      ctx.beginPath();
      ctx.ellipse(-2.65, -5.6, 0.75, 0.28, 0, Math.PI, 0);
      ctx.fillStyle = '#c1c9ce';
      ctx.fill();
      lines(ctx, [[[-2.65, -5.85], [-2.65, -6.6]]], 0.06, '#8d969c');
      for (let y = -5.3; y < 0; y += 0.45) rect(ctx, -3.3, y, 1.3, 0.12, 'rgba(60, 75, 85, 0.45)');
      rect(ctx, 2.2, -3, 2.4, 3, '#b8a98f'); // Hilton-era block
      for (let y = -2.7; y < 0; y += 0.4) rect(ctx, 2.3, y, 2.2, 0.12, 'rgba(70, 60, 50, 0.4)');
    },
  },
  lotusTower: {
    name: 'Lotus Tower',
    height: 10.5,
    draw(ctx) {
      rect(ctx, -2.2, -0.9, 4.4, 0.9, '#8f86a0'); // podium
      shape(ctx, [[-0.5, -0.9], [0.5, -0.9], [0.28, -7.2], [-0.28, -7.2]], '#6a4c93'); // shaft
      lines(ctx, [[[0, -0.9], [0, -7.2]]], 0.05, 'rgba(255, 255, 255, 0.25)');
      // green sepals, then the pink lotus bud
      shape(ctx, [[-0.3, -7.1], [-1.1, -7.5], [-0.5, -7.6], [0, -7.3], [0.5, -7.6], [1.1, -7.5], [0.3, -7.1]], '#4e9a5a');
      ctx.beginPath();
      ctx.moveTo(-0.9, -7.6);
      ctx.quadraticCurveTo(-1.05, -8.6, 0, -9.3);
      ctx.quadraticCurveTo(1.05, -8.6, 0.9, -7.6);
      ctx.closePath();
      ctx.fillStyle = '#d873a6';
      ctx.fill();
      lines(ctx, [[[-0.45, -7.6], [-0.25, -9]], [[0.45, -7.6], [0.25, -9]]], 0.05, '#b6588a');
      lines(ctx, [[[0, -9.3], [0, -10.5]]], 0.08, '#d9d4e0');
    },
  },
  galleFace: {
    name: 'Galle Face Green',
    height: 4.6,
    draw(ctx) {
      rect(ctx, -6, -0.35, 12, 0.35, '#6fa04a');
      // the old hotel at the south end
      rect(ctx, 2.4, -1.8, 3.4, 1.45, '#f2ece0');
      shape(ctx, [[2.2, -1.8], [6, -1.8], [5.6, -2.2], [2.6, -2.2]], '#a8503a');
      for (let x = 2.6; x < 5.6; x += 0.45) rect(ctx, x, -1.5, 0.22, 0.6, '#9aa4a8');
      // kites on long strings
      const kite = (x, y, c) => {
        shape(ctx, [[x, y - 0.4], [x + 0.3, y], [x, y + 0.45], [x - 0.3, y]], c);
        ctx.beginPath();
        ctx.moveTo(x, y + 0.45);
        ctx.quadraticCurveTo(x + 0.3, y + 1, x - 0.1, y + 1.5);
        ctx.lineWidth = 0.04;
        ctx.strokeStyle = c;
        ctx.stroke();
      };
      kite(-4, -3.6, '#e74c3c');
      kite(-2.2, -4.2, '#f1c40f');
      kite(-0.4, -3.4, '#3498db');
      kite(1, -4, '#2ecc71');
      lines(ctx, [[[-4, -3.15], [-4.6, -0.35]], [[-2.2, -3.75], [-2.4, -0.35]], [[-0.4, -2.95], [-1, -0.35]], [[1, -3.55], [0.6, -0.35]]], 0.02, 'rgba(255,255,255,0.7)');
    },
  },
  independenceHall: {
    name: 'Independence Memorial Hall',
    height: 4.4,
    draw(ctx) {
      // Kandyan-style open pavilion on a stepped plinth
      shape(ctx, [[-4.4, 0], [4.4, 0], [4, -0.4], [-4, -0.4]], '#d8d2c4');
      rect(ctx, -3.8, -0.8, 7.6, 0.4, '#e6e0d2');
      for (let x = -3.4; x <= 3.4; x += 0.85) rect(ctx, x - 0.12, -2.5, 0.24, 1.7, '#f4f1ea');
      ctx.beginPath(); // two-tier swept roof
      ctx.moveTo(-4.4, -2.4);
      ctx.quadraticCurveTo(-3, -2.7, -2.6, -3.3);
      ctx.lineTo(2.6, -3.3);
      ctx.quadraticCurveTo(3, -2.7, 4.4, -2.4);
      ctx.closePath();
      ctx.fillStyle = '#6b4a3a';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-2.8, -3.3);
      ctx.quadraticCurveTo(-1.8, -3.6, -1.4, -4.4);
      ctx.lineTo(1.4, -4.4);
      ctx.quadraticCurveTo(1.8, -3.6, 2.8, -3.3);
      ctx.closePath();
      ctx.fill();
    },
  },
  mountLavinia: {
    name: 'Mount Lavinia Hotel',
    height: 4.6,
    draw(ctx) {
      hill(ctx, [[-5, 0], [-3, -1.1], [0, -1.4], [3, -1], [5, 0]], '#7d8c66');
      rect(ctx, -2.6, -3.4, 5.2, 2.1, '#f6f2e8');
      shape(ctx, [[-2.8, -3.4], [2.8, -3.4], [2.3, -3.9], [-2.3, -3.9]], '#a8503a');
      rect(ctx, -0.5, -4.4, 1, 1, '#f6f2e8');
      shape(ctx, [[-0.6, -4.4], [0.6, -4.4], [0, -4.8]], '#a8503a');
      for (let x = -2.3; x < 2.4; x += 0.5) {
        rect(ctx, x, -3.1, 0.25, 0.45, '#8c9aa0');
        rect(ctx, x, -2.2, 0.25, 0.45, '#8c9aa0');
      }
      palm(ctx, -4, -0.6, 1.8, -0.3);
      palm(ctx, 3.8, -0.7, 2, 0.3);
    },
  },
  kalutaraStupa: {
    name: 'Kalutara Bodhiya',
    height: 6.4,
    draw(ctx) {
      rect(ctx, -4, -0.6, 8, 0.6, '#e6e1d6'); // terrace
      stupa(ctx, 0, -0.6, 2.4);
      // the sacred bo tree beside it
      lines(ctx, [[[4.4, 0], [4.3, -1.8]]], 0.18, '#6b5a3f');
      ctx.beginPath();
      for (const [cx, cy, r] of [[4.3, -2.5, 0.9], [3.6, -2.1, 0.6], [5, -2.1, 0.6]]) {
        ctx.moveTo(cx + r, cy);
        ctx.arc(cx, cy, r, 0, TAU);
      }
      ctx.fillStyle = '#4e7d3c';
      ctx.fill();
    },
  },

  // ---- Knuckles -------------------------------------------------------------------
  templeOfTooth: {
    name: 'Temple of the Sacred Tooth Relic, Kandy',
    height: 4.6,
    draw(ctx) {
      const pts = [[-6.5, 0], [-5.2, -2.8], [-2.6, -3.6], [0.4, -3.1], [3.6, -4], [6.5, 0]];
      hill(ctx, pts, '#6f9a80'); // Udawattakele forest
      // Kandy Lake in front, edged with its white "cloud wall"
      onHill(ctx, pts, () => {
        rect(ctx, -6.5, -1.8, 13, 0.45, 'rgba(120, 160, 175, 0.9)');
        lines(ctx, [[[-6.5, -1.82], [6.5, -1.82]]], 0.07, '#f2eee4');
      });
      // the long white temple front on its terrace above the lake
      rect(ctx, -4.2, -2.75, 5.2, 0.93, '#f3efe6');
      shape(ctx, [[-4.4, -2.75], [1.2, -2.75], [0.8, -3.15], [-4, -3.15]], '#a8503a');
      for (let x = -3.9; x < 0.8; x += 0.55) rect(ctx, x, -2.55, 0.22, 0.38, '#8c7a6a');
      // the golden canopy over the relic chamber, behind the roof line
      shape(ctx, [[-2, -3.15], [-0.9, -3.15], [-1.15, -3.55], [-1.75, -3.55]], '#d9a92a');
      shape(ctx, [[-1.75, -3.55], [-1.15, -3.55], [-1.45, -3.95]], '#e8bf3c');
      // the octagonal Pattirippuwa
      rect(ctx, 1.2, -3.3, 1.7, 1.48, '#f3efe6');
      shape(ctx, [[1, -3.3], [3.1, -3.3], [2.7, -3.75], [1.4, -3.75]], '#a8503a');
      shape(ctx, [[1.5, -3.75], [2.6, -3.75], [2.05, -4.15]], '#a8503a');
      for (const x of [1.4, 1.93, 2.46]) rect(ctx, x, -3.05, 0.24, 0.36, '#8c7a6a');
      // reflections in the lake
      rect(ctx, -4.2, -1.74, 5.2, 0.14, 'rgba(243, 239, 230, 0.45)');
      rect(ctx, 1.2, -1.74, 1.7, 0.22, 'rgba(243, 239, 230, 0.45)');
    },
  },
  victoriaDam: {
    name: 'Victoria Dam',
    height: 4.4,
    draw(ctx) {
      // the reservoir brimming over the crest, and the curved concrete arch (drawn
      // before the valley walls so they overlap its abutments)
      rect(ctx, -3.2, -3.5, 6.4, 0.2, 'rgba(110, 160, 185, 0.9)');
      ctx.beginPath();
      ctx.moveTo(-3.1, -3.32);
      ctx.quadraticCurveTo(0, -2.95, 3.1, -3.32);
      ctx.lineTo(1.5, 0);
      ctx.lineTo(-1.5, 0);
      ctx.closePath();
      ctx.fillStyle = '#d3d0c8';
      ctx.fill();
      lines(ctx, [-2.2, -1.1, 1.1, 2.2].map((x) => [[x, -3.1 - Math.abs(x) * 0.04], [x * 0.48, 0]]), 0.035, 'rgba(120, 115, 105, 0.45)');
      lines(ctx, [[[-3.1, -3.34], [-1.5, -3.18], [0, -3.12], [1.5, -3.18], [3.1, -3.34]]], 0.06, '#9b968c'); // crest road
      // spillway plume down the middle
      ctx.globalAlpha = 0.8;
      shape(ctx, [[-0.35, -3.12], [0.35, -3.12], [0.65, 0], [-0.65, 0]], '#eef6f7');
      ctx.globalAlpha = 1;
      // steep, forested walls of the Mahaweli gorge
      hill(ctx, [[-6.5, 0], [-6.3, -3.3], [-4.6, -4.3], [-2.8, -3.8], [-2, -2], [-1.3, 0]], '#4f7f55');
      hill(ctx, [[1.3, 0], [2, -2], [2.8, -3.9], [4.6, -4.4], [6.3, -3.2], [6.5, 0]], '#4f7f55');
    },
  },
  knucklesPeaks: {
    name: 'Knuckles Range',
    height: 6.2,
    draw(ctx) {
      // five rounded summits like the knuckles of a clenched fist
      hill(ctx, [[-6.5, 0], [-5, -3.2], [-4, -4.6], [-3.2, -4], [-2.2, -5.4], [-1.2, -4.6], [0, -5.9], [1.2, -4.8], [2.2, -5.5], [3.2, -4.2], [4.2, -4.8], [5.5, -2.6], [6.5, 0]], '#7f97a2');
      hill(ctx, [[-6.5, 0], [-4.5, -2.6], [-2, -3.1], [1, -2.7], [3.8, -3], [6.5, 0]], '#6a8a82');
      // cloud caught in the saddles between the summits
      wisp(ctx, -3.3, -4.05, 2.4);
      wisp(ctx, 1.3, -4.45, 2.2);
      wisp(ctx, 3.9, -3.9, 1.8, 0.6);
      wisp(ctx, -0.8, -2.95, 3.2, 0.55);
    },
  },
  corbettsGap: {
    name: "Corbett's Gap",
    height: 5.4,
    draw(ctx) {
      hill(ctx, [[-6.5, 0], [-5, -3.4], [-3, -5], [-1.4, -4.6], [-0.6, -2.4], [0, -2], [0.6, -2.4], [1.6, -4.8], [3.4, -5.2], [5.2, -3.4], [6.5, 0]], '#6d8a82');
      // the road climbing to the saddle in hairpins
      const road = [[2.6, -1.4], [-0.4, -1.55], [1.4, -1.8], [-0.2, -2.05], [0.1, -2.2]];
      lines(ctx, [road], 0.18, '#8d8470');
      lines(ctx, [road], 0.1, '#d8ccb2');
    },
  },
  lakegala: {
    name: 'Lakegala and Meemure',
    height: 6.4,
    draw(ctx) {
      const pts = [[-6.5, 0], [-4, -2.2], [-1.8, -3.6], [-0.6, -6], [0.2, -6.2], [0.9, -4.4], [2.6, -2.8], [6.5, 0]];
      hill(ctx, pts, '#6f8f8a');
      // Meemure's paddy terraces stepping up the foot of the peak
      onHill(ctx, pts, () => {
        for (let i = 0; i < 4; i++) rect(ctx, -6 + i * 0.45, -1.5 - i * 0.3, 5.4 - i * 0.7, 0.3, i % 2 ? '#9cc65a' : '#b4d66a');
      });
      // a village hut on the shoulder, with areca palms
      ctx.beginPath();
      ctx.ellipse(3.4, -1.75, 1.3, 0.25, 0, 0, TAU);
      ctx.fillStyle = '#7fa36a';
      ctx.fill();
      rect(ctx, 2.9, -2.35, 1, 0.6, '#d8c7a4');
      shape(ctx, [[2.7, -2.35], [4.1, -2.35], [3.4, -2.9]], '#8a6a3a');
      rect(ctx, 3.3, -2.1, 0.22, 0.35, '#6b5236');
      palm(ctx, 4.5, -1.75, 1.3, 0.1);
      palm(ctx, 2.3, -1.75, 1.1, -0.15);
    },
  },

  // ---- Kelani Valley ----------------------------------------------------------------
  rafting: {
    name: 'White-water rafting on the Kelani',
    height: 3.6,
    draw(ctx) {
      const pts = [[-6.5, 0], [-5.2, -3], [-3, -3.6], [-1, -2.6], [1.2, -2.5], [3.8, -3.4], [6.5, 0]];
      hill(ctx, pts, '#4f8256'); // valley walls
      // the river along the valley floor, white round the rocks
      onHill(ctx, pts, () => {
        rect(ctx, -6.5, -2.5, 13, 0.6, 'rgba(110, 150, 140, 0.95)');
        for (const x of [-4.6, -2.9, -0.5, 2.1, 4.4]) lines(ctx, [[[x, -2.25], [x + 0.8, -2.32]]], 0.06, '#f4f8f8');
      });
      for (const x of [-3.6, 3.2]) {
        ctx.beginPath();
        ctx.ellipse(x, -2.05, 0.35, 0.2, 0, Math.PI, 0);
        ctx.fillStyle = '#7d7a70';
        ctx.fill();
      }
      // orange rafts with paddlers in yellow helmets
      for (const [x, k] of [[-1.8, 1], [1.6, 0.85]]) {
        const y = -1.95;
        shape(ctx, [[x - 0.9 * k, y - 0.32 * k], [x + 0.9 * k, y - 0.32 * k], [x + 0.7 * k, y], [x - 0.7 * k, y]], '#e8701e');
        for (const dx of [-0.5, 0, 0.5]) {
          circle(ctx, x + dx * k, y - 0.66 * k, 0.12 * k, '#f3c41c');
          lines(ctx, [[[x + dx * k, y - 0.54 * k], [x + dx * k, y - 0.3 * k]], [[x + (dx - 0.3) * k, y - 0.1], [x + (dx + 0.25) * k, y - 0.6 * k]]], 0.05, '#2e2a26');
        }
      }
      // the near bank hides the bottom of the rafts, so they sit in the water
      onHill(ctx, pts, () => shape(ctx, [[-6.5, 0], [-6.5, -1.98], [-3.2, -1.9], [0, -1.97], [3.2, -1.9], [6.5, -1.98], [6.5, 0]], '#5c9a5e'));
    },
  },
  beliLena: {
    name: 'Belilena Cave',
    height: 4.6,
    draw(ctx) {
      hill(ctx, [[-6, 0], [-4.4, -3], [-2, -4.2], [1, -4.4], [3.6, -3.4], [6, 0]], '#5e7a5c');
      // the great overhanging mouth where 30,000-year-old human remains were found
      ctx.beginPath();
      ctx.moveTo(-2.6, 0);
      ctx.quadraticCurveTo(-2.8, -2.6, 0, -2.8);
      ctx.quadraticCurveTo(2.6, -2.6, 2.4, 0);
      ctx.closePath();
      ctx.fillStyle = '#2b2a26';
      ctx.fill();
      ctx.beginPath(); // the rock lip over the mouth
      ctx.moveTo(-2.75, -1.6);
      ctx.quadraticCurveTo(-2.9, -3.1, 0, -3.2);
      ctx.quadraticCurveTo(2.7, -3.05, 2.55, -1.4);
      ctx.lineWidth = 0.14;
      ctx.strokeStyle = 'rgba(70, 72, 62, 0.55)';
      ctx.stroke();
      // vines and a drip curtain over the lip
      lines(ctx, [-2, -1.2, -0.4, 0.6, 1.5].map((x) => [[x, -2.75], [x + 0.1, -2.2 + Math.sin(x * 4) * 0.3]]), 0.05, '#4f8a3a');
      lines(ctx, [-1.6, 0.2, 1.1].map((x) => [[x, -2.7], [x, -1.5]]), 0.025, 'rgba(220, 235, 240, 0.6)');
    },
  },
  aberdeenFalls: {
    name: 'Aberdeen Falls',
    height: 5.2,
    draw(ctx) {
      hill(ctx, [[-5.5, 0], [-4, -3.8], [-1.2, -4.8], [1.4, -4.8], [4, -3.6], [5.5, 0]], '#4c7356');
      // the dark cleft the river has cut, with the fall dropping down it
      shape(ctx, [[-0.55, -4.5], [0.55, -4.5], [0.8, -2.4], [0.7, 0], [-0.7, 0], [-0.85, -2.4]], '#344f40');
      waterfall(ctx, 0, -4.45, 0.62, 1.5);
    },
  },
  carolinaFalls: {
    name: 'Carolina Falls, Watawala',
    height: 4.6,
    draw(ctx) {
      const pts = [[-6, 0], [-4, -3.4], [-1.5, -4.3], [1.6, -4], [4, -2.8], [6, 0]];
      hill(ctx, pts, '#557a54');
      // tea on the slopes either side, clipped to the hillside
      onHill(ctx, pts, () => {
        for (let r = 0; r < 6; r++) lines(ctx, [[[-6, -0.6 - r * 0.55], [-1.9, -1 - r * 0.55]], [[2, -0.9 - r * 0.45], [6, -0.5 - r * 0.45]]], 0.18, '#5f9a4c');
      });
      // a wide stepped fall in several ribbons, over a dark rock face
      shape(ctx, [[-1.7, -3.55], [-0.6, -3.75], [0.6, -3.7], [1.6, -3.45], [1.9, 0], [-2, 0]], '#3f5f4a');
      for (const [x, top, w] of [[-1.15, -3.5, 0.35], [-0.4, -3.68], [0.45, -3.62, 0.4], [1.15, -3.4, 0.3]].map(([x, t, w = 0.45]) => [x, t, w])) waterfall(ctx, x, top, w, 1.2);
    },
  },
  devonFalls: {
    name: 'Devon Falls',
    height: 5.4,
    draw(ctx) {
      const pts = [[-6, 0], [-3.6, -3.6], [-0.6, -5.2], [1.4, -5], [4.2, -3], [6, 0]];
      hill(ctx, pts, '#4d7a50');
      onHill(ctx, pts, () => {
        for (let r = 0; r < 7; r++) lines(ctx, [[[-6, -0.4 - r * 0.6], [-1.4, -0.8 - r * 0.7]], [[1.4, -0.8 - r * 0.65], [6, -0.4 - r * 0.45]]], 0.16, '#64a050'); // tea rows
      });
      // the narrow gorge the fall plunges into
      shape(ctx, [[-0.6, -4.7], [0.65, -4.7], [1.15, -2.6], [1, 0], [-1, 0], [-1.25, -2.5]], '#3c5a48');
      waterfall(ctx, 0, -4.65, 0.55, 1.6);
    },
  },
  stClairs: {
    name: "St. Clair's Falls",
    height: 4.2,
    draw(ctx) {
      const pts = [[-6.5, 0], [-4, -2.6], [-1, -3.6], [2, -3.4], [4.6, -2.4], [6.5, 0]];
      hill(ctx, pts, '#5a8a58');
      onHill(ctx, pts, () => {
        for (let r = 0; r < 6; r++) lines(ctx, [[[-6.5, -0.4 - r * 0.45], [-2.4, -0.6 - r * 0.5]], [[2.2, -0.6 - r * 0.5], [6.5, -0.4 - r * 0.4]]], 0.16, '#6aa654');
      });
      // the "Little Niagara": two broad curtains side by side over a dark ledge
      shape(ctx, [[-2, -3], [0, -3.15], [1.6, -3], [1.8, 0], [-2.2, 0]], '#3f5f4a');
      waterfall(ctx, -1.05, -3, 1.2, 1.2);
      waterfall(ctx, 0.85, -3.05, 0.85, 1.25);
      // the tea factory on the ridge, on its own levelled ground
      shape(ctx, [[1.6, -3.1], [3.6, -3.1], [3.9, -2.4], [1.3, -2.4]], '#5a8a58');
      rect(ctx, 1.8, -3.95, 1.8, 0.85, '#e9e4d6');
      shape(ctx, [[1.6, -3.95], [3.8, -3.95], [2.7, -4.4]], '#7a8a8e');
      for (let x = 2; x < 3.5; x += 0.38) rect(ctx, x, -3.75, 0.2, 0.25, '#6b7a80');
    },
  },

  // ---- Rajarata (the dry-zone kingdoms) -------------------------------------------
  dambullaTemple: {
    name: 'Dambulla Cave Temple',
    height: 5,
    draw(ctx) {
      inselberg(ctx, -1, 9, 3.6, '#8a7f72');
      lines(ctx, [[[-4.4, -2.3], [2.4, -2.5]]], 0.18, '#f3efe4'); // the white cave-temple frontage under the overhang
      for (let x = -4; x < 2.4; x += 0.6) rect(ctx, x, -2.25, 0.3, 0.45, '#f3efe4');
      // the Golden Temple's seated Buddha below
      rect(ctx, 2.6, -0.9, 3.4, 0.9, '#c9a24a');
      ctx.beginPath();
      ctx.ellipse(4.3, -1.6, 1, 0.75, 0, 0, TAU);
      ctx.fillStyle = '#e0b23a';
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(4.3, -2.7, 0.55, 0.62, 0, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(4.3, -3.6, 0.6, 0.38, 0, 0, TAU); // head
      ctx.fill();
      shape(ctx, [[4.15, -3.9], [4.45, -3.9], [4.3, -4.3]], '#e9c24a');
    },
  },
  kandalama: {
    name: 'Kandalama Wewa',
    height: 3.8,
    draw(ctx) {
      inselberg(ctx, 2.4, 6.4, 3.5, '#8b8a7a'); // the rock the hotel is built along
      // Bawa's hotel: long floors stepping along the rock face, half swallowed by creepers
      for (let f = 0; f < 4; f++) {
        const x = -3.6 + f * 0.55;
        const y = -0.6 - f * 0.62;
        rect(ctx, x, y, 5.8 - f * 1.1, 0.5, '#e8e4d6');
        rect(ctx, x + 0.1, y + 0.18, 5.6 - f * 1.1, 0.13, '#5c6a6a'); // window band
      }
      ctx.beginPath();
      for (const [x, y, r] of [[-3.4, -0.7, 0.45], [-2.2, -1.3, 0.4], [-1.2, -0.55, 0.5], [0.3, -1.95, 0.42], [1.2, -1.2, 0.45], [-0.6, -2.5, 0.35], [1.9, -2.6, 0.4], [2.2, -0.6, 0.5]]) {
        ctx.moveTo(x + r, y);
        ctx.ellipse(x, y, r, r * 0.75, 0, 0, TAU);
      }
      ctx.fillStyle = '#5a8040';
      ctx.fill();
      treeLine(ctx, -6.4, 6.4, 0.5, '#5f7c3c'); // forest down to the water
    },
  },
  sigiriya: {
    name: 'Sigiriya (Lion Rock)',
    height: 6.6,
    draw(ctx) {
      // the flat-topped column of rock, overhanging on the west face
      ctx.beginPath();
      ctx.moveTo(-3, 0);
      ctx.bezierCurveTo(-3.2, -2.4, -2.9, -5.4, -2.1, -6);
      ctx.lineTo(1.6, -6.1);
      ctx.bezierCurveTo(2.6, -5.6, 2.9, -3, 2.9, 0);
      ctx.closePath();
      ctx.fillStyle = '#9a8676';
      ctx.fill();
      shape(ctx, [[1.6, -6.1], [2.2, -5.7], [2.75, -3.5], [2.9, 0], [1.9, 0], [1.9, -3.6]], 'rgba(70, 56, 46, 0.22)'); // shaded east face
      lines(ctx, [[[-2.4, -5.6], [-2.7, -2.6]], [[-1, -5.8], [-1.2, -3]], [[1.4, -5.7], [1.6, -3.2]]], 0.07, 'rgba(80, 66, 56, 0.35)');
      rect(ctx, -2.1, -6.25, 3.7, 0.2, '#7d9a58'); // the palace gardens on top
      // the Lion Gate: a terrace with two giant paws, the stair climbing the face above
      rect(ctx, -0.9, -2.3, 2.2, 0.28, '#c3a98c');
      for (const x of [-0.65, 0.65]) {
        ctx.beginPath();
        ctx.roundRect(x, -2.85, 0.55, 0.6, [0.25, 0.25, 0.04, 0.04]);
        ctx.fillStyle = '#b39477';
        ctx.fill();
        lines(ctx, [0.14, 0.27, 0.4].map((dx) => [[x + dx, -2.32], [x + dx, -2.5]]), 0.035, '#8a6d55');
      }
      lines(ctx, [[[0.1, -2.35], [0.3, -2.9], [-0.2, -3.6], [0.5, -4.3], [-0.1, -5], [0.5, -5.7], [0.2, -6.05]]], 0.06, '#e8dcc6');
      // the mirror wall gallery along the west face
      lines(ctx, [[[-2.95, -2.6], [-1.2, -2.2]]], 0.12, '#e8dcc6');
      treeLine(ctx, -6.4, 6.4, 0.6, '#6f8a4a'); // the water gardens' trees at the foot
    },
  },
  pidurangala: {
    name: 'Pidurangala Rock',
    height: 4.6,
    draw(ctx) {
      inselberg(ctx, -0.5, 8, 3.9, '#8f8270');
      lines(ctx, [[[-3.6, -2.6], [-2.6, -3.5]], [[1.4, -3.6], [2.6, -2.4]]], 0.08, 'rgba(70, 60, 50, 0.4)');
      // brick reclining Buddha under the summit, and a white temple at the foot
      shape(ctx, [[-1.8, -3.15], [0.9, -3.15], [0.8, -3.4], [-1.6, -3.4]], '#c2774c');
      circle(ctx, -1.85, -3.35, 0.2, '#c2774c');
      treeLine(ctx, -6, 5, 0.55, '#6f8a48');
      stupa(ctx, 3.8, -0.6, 0.55);
    },
  },
  elephants: {
    name: 'The Gathering at Minneriya',
    height: 2.8,
    draw(ctx) {
      rect(ctx, -6.5, -0.4, 13, 0.4, '#a6b65a'); // fresh grass on the dried tank bed
      treeLine(ctx, -6.5, 6.5, 0.42, '#5d7a3c', -0.35);
      const elephant = (x, k, flip = 1) => {
        ctx.save();
        ctx.translate(x, -0.05);
        ctx.scale(k * flip, k);
        ctx.beginPath();
        ctx.ellipse(0, -1.2, 1.05, 0.72, 0, 0, TAU); // body
        ctx.moveTo(1.55, -1.45);
        ctx.ellipse(1.15, -1.45, 0.42, 0.45, 0, 0, TAU); // head
        ctx.fillStyle = '#5d5853';
        ctx.fill();
        for (const lx of [-0.7, -0.3, 0.35, 0.7]) rect(ctx, lx - 0.13, -0.8, 0.26, 0.8, '#5d5853');
        ctx.beginPath(); // trunk
        ctx.moveTo(1.5, -1.4);
        ctx.quadraticCurveTo(1.85, -0.8, 1.6, -0.15);
        ctx.lineWidth = 0.18;
        ctx.strokeStyle = '#5d5853';
        ctx.stroke();
        ctx.beginPath(); // ear
        ctx.ellipse(0.95, -1.4, 0.25, 0.35, 0.2, 0, TAU);
        ctx.fillStyle = '#4e4945';
        ctx.fill();
        ctx.restore();
      };
      // a herd on the grass, calves among the adults
      for (const [x, k, f] of [[-5, 0.5, 1], [-3.7, 0.32, 1], [-2.4, 0.55, -1], [-0.9, 0.48, 1], [0.1, 0.3, 1], [1.3, 0.56, -1], [2.8, 0.46, 1], [3.9, 0.3, -1], [5.1, 0.52, -1]]) elephant(x, k * 1.4, f);
    },
  },
  tankStumps: {
    name: 'Giritale Wewa',
    height: 3.4,
    draw(ctx) {
      hill(ctx, [[-6.5, 0], [-4, -1.6], [-1, -2.2], [2, -1.8], [6.5, 0]], '#7d8c5a');
      treeLine(ctx, -6, 6, 0.4, '#68804a');
      // the drowned trees standing in every old tank, with a cormorant drying its wings
      for (const [x, h] of [[-4.4, 2.2], [-2.6, 1.6], [-0.8, 2.6], [1.4, 1.8], [3.4, 2.4], [5, 1.4]]) {
        lines(ctx, [[[x, 0.2], [x + 0.1, -h]], [[x + 0.05, -h * 0.6], [x + 0.6, -h * 0.85]], [[x + 0.08, -h * 0.75], [x - 0.4, -h * 0.95]]], 0.12, '#6b6258');
      }
      lines(ctx, [[[-0.95, -2.75], [-0.7, -2.95], [-0.45, -2.75]]], 0.08, '#222');
    },
  },
  galVihara: {
    name: 'Gal Vihara, Polonnaruwa',
    height: 3.6,
    draw(ctx) {
      // one long granite outcrop, cut into a seated, a standing and a reclining Buddha
      hill(ctx, [[-6.2, 0], [-6, -2.6], [-4.8, -3.3], [-2.6, -3.4], [-1, -2.6], [1.5, -2.1], [4.2, -1.9], [6, -1.2], [6.2, 0]], '#a59886');
      const niche = '#8f8373';
      const stone = '#c9bdab';
      ctx.beginPath();
      ctx.roundRect(-5.2, -2.75, 1.9, 2.75, [0.9, 0.9, 0, 0]);
      ctx.roundRect(-2.8, -3.05, 1.1, 3.05, [0.5, 0.5, 0, 0]);
      ctx.roundRect(-1.3, -1.45, 6.6, 1.45, [0.5, 0.5, 0, 0]);
      ctx.fillStyle = niche;
      ctx.fill();
      // seated, in meditation
      ctx.beginPath();
      ctx.ellipse(-4.25, -0.75, 0.7, 0.62, 0, 0, TAU);
      ctx.ellipse(-4.25, -1.75, 0.32, 0.4, 0, 0, TAU);
      ctx.fillStyle = stone;
      ctx.fill();
      rect(ctx, -5, -0.3, 1.5, 0.3, stone);
      // standing, arms crossed
      rect(ctx, -2.5, -2.5, 0.5, 2.5, stone);
      circle(ctx, -2.25, -2.62, 0.24, stone);
      // reclining, entering parinirvana
      shape(ctx, [[-0.5, -0.12], [5, -0.12], [5, -0.62], [-0.2, -0.72]], stone);
      circle(ctx, -0.55, -0.78, 0.34, stone);
      rect(ctx, -1.05, -0.45, 0.85, 0.3, '#b6a994'); // pillow
      lines(ctx, [[[0.5, -0.66], [4.8, -0.6]]], 0.04, 'rgba(110, 100, 88, 0.5)');
      treeLine(ctx, 5.4, 6.4, 0.45, '#6f8a48');
    },
  },
};

// tallest landmark, so layers know how much room to leave above the base line
export const LANDMARK_MAX_HEIGHT = Math.max(...Object.values(LANDMARKS).map((l) => l.height));

export { oruwa, palm, waterfall, inselberg };
