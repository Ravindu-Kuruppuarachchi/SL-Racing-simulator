// Canvas renderer. Reads game state, never mutates it.
import { LANDMARKS, LANDMARK_MAX_HEIGHT, inselberg, oruwa, palm } from './landmarks.js';
import { hash } from './terrain.js';
import { TOWN_EVERY } from './maps.js';
import { ART, paintVehicle } from './vehicle-art.js';

const SIGN_EVERY = TOWN_EVERY;
const LANDMARK_PARALLAX = 0.1;
const POLE_EVERY = 38;
const TAU = Math.PI * 2;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = { x: 0, y: 0 };
    this.smoke = [];
    this.lean = { x: 0, y: 0, vx: 0, vy: 0 }; // driver's body lag (metres)
    this.prevVel = null;
    this.quality = 1; // render-resolution scale, lowered automatically on slow devices
    this.slowTime = 0;
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = (this.dpr = Math.min(devicePixelRatio || 1, 2) * this.quality);
    this.layers = {};
    this.sprites = {};
    this.w = innerWidth;
    this.h = innerHeight;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // show ~14m of height, but never fewer than ~22m of width on portrait phones
    this.ppm = Math.min(this.h / 14, this.w / 22);
  }

  reset(game) {
    if (this.mapId !== game.map.id) {
      this.mapId = game.map.id;
      this.layers = {};
      this.canvas.className = game.map.sky ?? ''; // sky colours live in CSS
    }
    const p = game.chassis.getPosition();
    this.cam.x = p.x;
    this.cam.y = p.y;
    this.smoke = [];
    this.prevVel = null;
    Object.assign(this.lean, { x: 0, y: 0, vx: 0, vy: 0 });
  }

  // world -> screen
  sx(x) {
    return (x - this.cam.x) * this.ppm + this.w * 0.35;
  }
  sy(y) {
    return this.h * 0.58 - (y - this.cam.y) * this.ppm;
  }

  // If frames keep taking longer than ~1/45 s, render fewer pixels (CSS scales
  // the canvas back up). Only ever steps down, so it can't oscillate.
  adaptQuality(dt) {
    if (dt <= 0 || this.quality <= 0.5) return;
    this.slowTime = dt > 1 / 45 ? this.slowTime + dt : Math.max(0, this.slowTime - dt);
    if (this.slowTime > 1.5) {
      this.quality = Math.max(0.5, this.quality - 0.25);
      this.slowTime = 0;
      this.resize();
    }
  }

  /** race: the race in progress (race.js), if any, for the rivals and the checkpoint flags. */
  draw(game, input, dt, race = null) {
    this.adaptQuality(dt);
    const p = game.chassis.getPosition();
    const v = game.chassis.getLinearVelocity();
    const k = 1 - Math.pow(0.002, dt);
    this.cam.x += (p.x + v.x * 0.35 - this.cam.x) * k;
    this.cam.y += (p.y - this.cam.y) * k;
    this.time = game.time;
    this.updateLean(game, dt);

    this.drawSky();
    this.drawClouds();
    this.drawBackground(game.map);
    this.drawPoles(game);
    this.mapGround = game.map.ground;
    this.drawTerrain(game);
    if (race) this.drawRaceMarks(game, race);
    this.drawSigns(game);
    this.drawRocks(game);
    this.drawPickups(game);
    this.drawShadow(game);
    this.updateSmoke(game, input, dt);
    this.drawNitroFlame(game);
    if (race) this.drawRivals(race);
    this.drawVehicle(game);
    this.drawWater(game);
    this.drawCaveDark(game);
    this.drawForeground(game.map);
  }

  // ---- background ----------------------------------------------------------
  // Sky, sun and vignette are CSS (see style.css), so the canvas just clears.
  drawSky() {
    this.ctx.clearRect(0, 0, this.w, this.h);
  }

  drawClouds() {
    const { ctx, w, h } = this;
    const span = w + 400;
    for (let i = 0; i < 6; i++) {
      const drift = this.cam.x * this.ppm * 0.03 + this.time * (6 + i * 2);
      const x = ((hash(i) * span - drift) % span + span) % span - 200;
      const y = h * (0.06 + hash(i + 9) * 0.22);
      const s = 0.6 + hash(i + 20) * 0.8;
      ctx.fillStyle = `rgba(255, 255, 255, ${0.55 + hash(i + 3) * 0.3})`;
      ctx.beginPath();
      for (const [dx, dy, rr] of [[0, 0, 28], [30, -12, 34], [64, 0, 26], [32, 8, 30]]) {
        ctx.moveTo(x + dx * s + rr * s, y + dy * s);
        ctx.arc(x + dx * s, y + dy * s, rr * s, 0, TAU);
      }
      ctx.fill();
    }
  }

  // ---- cached parallax layers ----------------------------------------------
  // Each layer is painted once into an offscreen canvas twice the screen width
  // and slid into place every frame; it is repainted only when we scroll off it.
  // Blitting is far cheaper than re-filling big shapes on low-end phones.
  // `top` is the highest screen y the layer can paint; everything above is cropped.
  layer(key, parallax, top, paint) {
    const { w, h, dpr } = this;
    const off = this.cam.x * this.ppm * parallax;
    let L = this.layers[key];
    if (!L || off < L.start || off + w > L.start + L.width) {
      const width = w * 2;
      const start = off - w * 0.5;
      // crop to the painted band: the sky above each layer is empty
      top = Math.max(0, Math.floor(top));
      const canvas = new OffscreenCanvas(Math.ceil(width * dpr), Math.ceil((h - top) * dpr));
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, -top * dpr);
      paint(ctx, start, width);
      L?.image.close();
      // an ImageBitmap blits much faster than drawing one canvas onto another
      L = this.layers[key] = { image: canvas.transferToImageBitmap(), start, width, top };
    }
    // whole-pixel offsets keep this a straight copy instead of a resample
    const sx = Math.round((off - L.start) * dpr);
    const sh = L.image.height;
    this.ctx.drawImage(L.image, sx, 0, Math.round(w * dpr), sh, 0, L.top, w, sh / dpr);
  }

  // A ridge line; fy(x) gives its y at layer-local x, scrolled by `off` pixels.
  ridge(off, base, amp, freq, seed) {
    const h = this.h;
    return (x) => {
      const t = (x + off) * freq + seed;
      return h * base - (Math.sin(t) + 0.5 * Math.sin(t * 2.3 + 1) + 0.25 * Math.sin(t * 5.1 + 2)) * amp;
    };
  }

  fillRidge(ctx, fy, width, top, bottom) {
    const h = this.h;
    const g = ctx.createLinearGradient(0, h * 0.25, 0, h);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= width + 8; x += 8) ctx.lineTo(x, fy(x));
    ctx.lineTo(width, h);
    ctx.fill();
  }

  drawBackground(map) {
    if (map.id === 'coast') return this.drawCoast(map);
    if (map.id === 'colombo') return this.drawCity(map);
    if (map.id === 'knuckles') return this.drawKnuckles(map);
    if (map.id === 'kelani') return this.drawKelani(map);
    if (map.id === 'rajarata') return this.drawDryZone(map);
    const { h } = this;
    // tops = ridge base - max ridge swing (1.75 x amp) - tallest tree
    this.layer('far', 0.04, h * 0.42 - 145, (ctx, off, width) => {
      this.fillRidge(ctx, this.ridge(off, 0.42, 80, 0.0035, 0), width, '#a9c3d6', '#d5e3e8');
    });
    const landmarkBase = h * 0.45;
    this.layer('near', LANDMARK_PARALLAX, Math.min(h * 0.48 - 110, this.landmarkTop(landmarkBase)), (ctx, off, width) => {
      // landmarks rise behind the misty ridge, high enough to clear the tea and forest in front
      this.paintLandmarks(ctx, off, width, map, () => landmarkBase);
      this.fillRidge(ctx, this.ridge(off, 0.48, 60, 0.006, 3), width, '#86a9a0', '#c6d8d0');
      // mist settling in the valleys
      const mist = ctx.createLinearGradient(0, h * 0.4, 0, h * 0.58);
      mist.addColorStop(0, 'rgba(240, 245, 245, 0)');
      mist.addColorStop(1, 'rgba(240, 245, 245, 0.7)');
      ctx.fillStyle = mist;
      ctx.fillRect(0, h * 0.4, width, h * 0.6);
    });
    this.layer('tea', 0.25, h * 0.52 - 72 - 100, (ctx, off, width) => this.paintTeaHills(ctx, off, width));
    this.layer('forest', 0.5, h * 0.58 - 55 - 150, (ctx, off, width) => this.paintForest(ctx, off, width));
  }

  // ---- landmarks ------------------------------------------------------------
  get landmarkScale() {
    return this.ppm * ({ coast: 0.55, colombo: 0.5, rajarata: 0.58 }[this.mapId] ?? 0.62); // pixels per landmark unit
  }

  // highest screen y a landmark standing at baseY can reach
  landmarkTop(baseY) {
    return baseY - (LANDMARK_MAX_HEIGHT + 0.3) * this.landmarkScale;
  }

  // Landmarks hang off the town boards: the one for a town drifts past in the
  // distance while you drive towards its board. Positions are in layer pixels.
  landmarkAt(d) {
    return (d - 130) * this.ppm * LANDMARK_PARALLAX + this.w * 0.62;
  }

  // The ridge in front of landmarks standing at baseY: in front of each one it never
  // dips below the landmark's foot (which would leave it floating) or rises high enough
  // to bury it; it settles 0.4-1.4 landmark units above the foot.
  ridgeAround(fy, placed, baseY) {
    const s = this.landmarkScale;
    const lo = baseY - 0.4 * s;
    const hi = baseY - 1.4 * s;
    return (x) => {
      const y = fy(x);
      let t = 0;
      for (const lx of placed) t = Math.max(t, Math.min(1, Math.max(0, (9.5 * s - Math.abs(x - lx)) / (3 * s))));
      if (t === 0) return y;
      const k = t * t * (3 - 2 * t);
      return y + (Math.min(lo, Math.max(hi, y)) - y) * k;
    };
  }

  // Returns the layer-local x of each landmark drawn, so nearer scenery can leave gaps.
  paintLandmarks(ctx, off, width, map, baseAt) {
    const s = this.landmarkScale;
    const placed = [];
    const k = this.ppm * LANDMARK_PARALLAX;
    // boards whose landmark could overlap this strip (landmarks are up to ~13 units wide)
    const pad = 7 * s;
    const d0 = Math.max(SIGN_EVERY, Math.floor((off - pad - this.w * 0.62) / k / SIGN_EVERY) * SIGN_EVERY);
    const d1 = (off + width + pad - this.w * 0.62) / k + 130;
    for (let d = d0; d <= d1; d += SIGN_EVERY) {
      const town = map.towns[(d / SIGN_EVERY - 1) % map.towns.length];
      const lm = LANDMARKS[map.landmarks[town]];
      if (!lm) continue;
      const x = this.landmarkAt(d) - off;
      const y = baseAt(x, 5 * s);
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s, s);
      ctx.lineJoin = 'round';
      lm.draw(ctx);
      ctx.restore();
      placed.push(x);
    }
    return placed;
  }

  // ---- Galle Road scenery ---------------------------------------------------
  drawCoast(map) {
    const { h } = this;
    const horizon = h * 0.47;
    // open sea to the horizon, with sun glitter
    this.layer('coast-sea', 0.04, horizon - 4, (ctx, off, width) => {
      const g = ctx.createLinearGradient(0, horizon, 0, h * 0.62);
      g.addColorStop(0, '#2c7fb0');
      g.addColorStop(0.5, '#39a5c4');
      g.addColorStop(1, '#69cfd0');
      ctx.fillStyle = g;
      ctx.fillRect(0, horizon, width, h - horizon);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      for (let i = Math.floor(off / 23); i < (off + width) / 23; i++) {
        const y = horizon + 3 + hash(i * 1.3) * (h * 0.15);
        const len = 6 + hash(i + 7) * 18 * (1 + (y - horizon) / 60);
        ctx.fillRect(i * 23 - off + hash(i) * 20, y, len, 1.2);
      }
    });
    // landmarks out at sea and on headlands, plus fishing boats
    const seaLine = horizon + h * 0.06;
    this.layer('coast-landmarks', LANDMARK_PARALLAX, this.landmarkTop(seaLine), (ctx, off, width) => {
      const s = this.landmarkScale;
      for (let i = Math.floor(off / 260); i < (off + width) / 260 + 1; i++) {
        if (hash(i * 4.1) < 0.4) continue;
        const bx = i * 260 - off + hash(i) * 160;
        const by = horizon + 8 + hash(i + 3) * (seaLine - horizon - 10);
        ctx.save();
        ctx.translate(bx, by);
        ctx.scale(s * 0.45, s * 0.45);
        oruwa(ctx, 0, 0, 1, hash(i + 9) < 0.5 ? '#f3ead8' : '#e9b25a');
        ctx.restore();
      }
      this.paintLandmarks(ctx, off, width, map, () => seaLine);
    });
    // beach: shallow turquoise water, surf, wet and dry sand
    this.layer('coast-beach', 0.25, h * 0.56 - 30, (ctx, off, width) => {
      const fy = this.ridge(off, 0.575, 7, 0.009, 2);
      ctx.fillStyle = 'rgba(120, 220, 210, 0.75)';
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= width + 8; x += 8) ctx.lineTo(x, fy(x) - 16);
      ctx.lineTo(width, h);
      ctx.fill();
      this.fillRidge(ctx, fy, width, '#e9d29f', '#d9bb82');
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let x = 0; x <= width + 8; x += 8) ctx.lineTo(x, fy(x) - 1 + Math.sin((x + off) * 0.08) * 1.5);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(160, 130, 80, 0.35)'; // wet sand
      ctx.lineWidth = 6;
      ctx.beginPath();
      for (let x = 0; x <= width + 8; x += 8) ctx.lineTo(x, fy(x) + 5);
      ctx.stroke();
      // boats pulled up on the sand
      const s = this.landmarkScale * 0.6;
      for (let i = Math.floor(off / 180); i < (off + width) / 180 + 1; i++) {
        if (hash(i * 2.7) < 0.55) continue;
        const bx = i * 180 - off + hash(i) * 90;
        ctx.save();
        ctx.translate(bx, fy(bx) + 12);
        ctx.scale(s, s);
        oruwa(ctx, 0, 0, 1, hash(i + 1) < 0.5 ? '#e74c3c' : '#2e86c1');
        ctx.restore();
      }
    });
    // dunes with scrub and coconut palms, just behind the road
    this.layer('coast-palms', 0.5, h * 0.6 - 22 * 1.75 - 190, (ctx, off, width) => {
      const fy = this.ridge(off, 0.6, 22, 0.007, 11);
      this.fillRidge(ctx, fy, width, '#f0d9a4', '#d6b577');
      const spacing = 44;
      const scrub = new Path2D();
      for (let i = Math.floor(off / 14) - 1; i < (off + width) / 14 + 1; i++) {
        if (hash(i * 1.9) < 0.5) continue;
        const x = i * 14 - off;
        const r = 6 + hash(i) * 8;
        scrub.moveTo(x + r, fy(x) + 4);
        scrub.ellipse(x, fy(x) + 4, r, r * 0.55, 0, 0, TAU);
      }
      ctx.fillStyle = '#5f8a3a';
      ctx.fill(scrub);
      const u = 46; // px per palm unit
      for (let i = Math.floor(off / spacing) - 1; i < (off + width) / spacing + 2; i++) {
        if (hash(i * 3.3) < 0.55) continue; // gaps, so the sea and landmarks show through
        const x = i * spacing - off + hash(i) * 20;
        ctx.save();
        ctx.translate(x, fy(x) + 6);
        ctx.scale(u, u);
        palm(ctx, 0, 0, 2.2 + hash(i + 4) * 1.6, (hash(i + 8) - 0.35) * 0.5);
        ctx.restore();
      }
    });
  }

  // ---- Colombo scenery ------------------------------------------------------
  drawCity(map) {
    const { h } = this;
    // hazy skyline far away
    this.layer('city-far', 0.04, h * 0.47 - 170, (ctx, off, width) => {
      const base = h * 0.47;
      const spacing = 18;
      for (let i = Math.floor(off / spacing) - 3; i < (off + width) / spacing + 1; i++) {
        if (hash(i * 1.37) < 0.3) continue;
        const x = i * spacing - off;
        const w = 14 + hash(i + 2) * 30;
        // taller clusters come and go along the skyline
        const ht = 20 + hash(i + 5) * 60 + Math.max(0, Math.sin(i * 0.11)) * 90 * hash(i + 9);
        ctx.fillStyle = hash(i + 3) < 0.5 ? '#aebdca' : '#a3b3c1';
        ctx.fillRect(x, base - ht, w, ht + 4);
        ctx.fillStyle = 'rgba(235, 242, 248, 0.35)';
        for (let y = base - ht + 5; y < base - 4; y += 7) ctx.fillRect(x + 2, y, w - 4, 2);
      }
      ctx.fillStyle = '#b7c5cf';
      ctx.fillRect(0, base, width, h - base);
    });
    // landmarks, with mid-rise blocks that leave a gap around each one
    const base = h * 0.49;
    this.layer('city-near', LANDMARK_PARALLAX, this.landmarkTop(base), (ctx, off, width) => {
      const placed = this.paintLandmarks(ctx, off, width, map, () => base);
      const clear = 6.5 * this.landmarkScale;
      const spacing = 30;
      for (let i = Math.floor(off / spacing) - 3; i < (off + width) / spacing + 1; i++) {
        const x = i * spacing - off + hash(i * 2.1) * 10;
        const w = 22 + hash(i + 1) * 30;
        if (hash(i * 0.91) < 0.25 || placed.some((p) => x + w > p - clear && x < p + clear)) continue;
        const ht = 25 + hash(i + 4) * 70;
        const top = h * 0.52 - ht;
        ctx.fillStyle = hash(i + 6) < 0.5 ? '#8fa1ae' : '#9cadb8';
        ctx.fillRect(x, top, w, ht + h * 0.1);
        ctx.fillStyle = 'rgba(230, 238, 244, 0.45)';
        for (let y = top + 5; y < h * 0.52; y += 8) for (let wx = x + 3; wx < x + w - 5; wx += 7) ctx.fillRect(wx, y, 4, 3);
      }
      const haze = ctx.createLinearGradient(0, h * 0.4, 0, h * 0.56);
      haze.addColorStop(0, 'rgba(235, 238, 240, 0)');
      haze.addColorStop(1, 'rgba(235, 238, 240, 0.65)');
      ctx.fillStyle = haze;
      ctx.fillRect(0, h * 0.4, width, h * 0.6);
    });
    // canal and wetland: reeds, lotus, egrets and palms on the bank
    this.layer('city-canal', 0.25, h * 0.585 - 6 * 1.75 - 140, (ctx, off, width) => {
      const g = ctx.createLinearGradient(0, h * 0.53, 0, h * 0.6);
      g.addColorStop(0, '#5d8f95');
      g.addColorStop(1, '#4a7a6e');
      ctx.fillStyle = g;
      ctx.fillRect(0, h * 0.535, width, h);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      for (let i = Math.floor(off / 17); i < (off + width) / 17; i++) ctx.fillRect(i * 17 - off + hash(i) * 12, h * 0.54 + hash(i + 1) * h * 0.035, 8 + hash(i + 2) * 12, 1.2);
      const fy = this.ridge(off, 0.585, 6, 0.01, 4);
      // lotus pads and flowers on the water
      for (let i = Math.floor(off / 23); i < (off + width) / 23 + 1; i++) {
        if (hash(i * 3.7) < 0.55) continue;
        const x = i * 23 - off + hash(i) * 15;
        const y = h * 0.548 + hash(i + 4) * (fy(x) - h * 0.555);
        ctx.fillStyle = '#5c9a4a';
        ctx.beginPath();
        ctx.ellipse(x, y, 6, 2.2, 0, 0, TAU);
        ctx.fill();
        if (hash(i + 7) < 0.4) {
          ctx.fillStyle = '#f2a7c3';
          ctx.beginPath();
          ctx.ellipse(x + 1, y - 3, 2.6, 3.2, 0, 0, TAU);
          ctx.fill();
        }
      }
      this.fillRidge(ctx, fy, width, '#7fa85a', '#5f8a45');
      ctx.strokeStyle = '#6f8f3a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = Math.floor(off / 5); i < (off + width) / 5 + 1; i++) {
        if (hash(i * 1.3) < 0.5) continue;
        const x = i * 5 - off;
        ctx.moveTo(x, fy(x) + 2);
        ctx.lineTo(x + (hash(i) - 0.5) * 6, fy(x) - 8 - hash(i + 1) * 12);
      }
      ctx.stroke();
      // egrets wading at the water's edge
      for (let i = Math.floor(off / 150); i < (off + width) / 150 + 1; i++) {
        if (hash(i * 5.3) < 0.5) continue;
        const x = i * 150 - off + hash(i) * 100;
        const y = fy(x) - 2;
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - 1, y);
        ctx.lineTo(x - 1, y - 7);
        ctx.moveTo(x + 1, y);
        ctx.lineTo(x + 1, y - 7);
        ctx.stroke();
        ctx.fillStyle = '#fafafa';
        ctx.beginPath();
        ctx.ellipse(x, y - 10, 5, 3, -0.3, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = '#fafafa';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x + 3, y - 11);
        ctx.quadraticCurveTo(x + 6, y - 18, x + 5, y - 19);
        ctx.stroke();
        ctx.strokeStyle = '#e0b030';
        ctx.beginPath();
        ctx.moveTo(x + 5, y - 19);
        ctx.lineTo(x + 9, y - 18);
        ctx.stroke();
      }
      for (let i = Math.floor(off / 90); i < (off + width) / 90 + 1; i++) {
        if (hash(i * 2.9) < 0.6) continue;
        const x = i * 90 - off + hash(i) * 50;
        ctx.save();
        ctx.translate(x, fy(x) + 4);
        ctx.scale(40, 40);
        palm(ctx, 0, 0, 2.4 + hash(i + 3), (hash(i + 5) - 0.4) * 0.5);
        ctx.restore();
      }
    });
    // street frontage: colourful shophouses with signboards and water tanks, and rain trees
    this.layer('city-street', 0.5, h * 0.62 - 6 * 1.75 - 150, (ctx, off, width) => {
      const fy = this.ridge(off, 0.62, 6, 0.008, 8);
      const paints = ['#e8c07d', '#d98b6a', '#9cc5a1', '#a7c4e0', '#e3a6b4', '#f0e2c0', '#c9b7e0', '#f2f0ea'];
      const signs = ['#c0392b', '#1f6fb2', '#f1c40f', '#27ae60', '#8e44ad', '#e67e22'];
      // one building (or tree) per fixed 100 px cell, so repaints line up exactly
      const cell = 100;
      for (let i = Math.floor(off / cell) - 1; i < (off + width) / cell + 1; i++) {
        const x = i * cell - off;
        const w = 66 + hash(i) * 34;
        if (hash(i * 1.7) < 0.22) {
          // a rain tree instead of a building
          const cx = x + w / 2;
          const by = fy(cx);
          ctx.strokeStyle = '#5a4a3a';
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.moveTo(cx, by);
          ctx.lineTo(cx, by - 60);
          ctx.stroke();
          ctx.fillStyle = '#3e6e3a';
          ctx.beginPath();
          for (let k = 0; k < 5; k++) {
            const tx = cx + (k - 2) * 18;
            const ty = by - 70 - Math.sin((k / 4) * Math.PI) * 14;
            ctx.moveTo(tx + 24, ty);
            ctx.ellipse(tx, ty, 24, 15, 0, 0, TAU);
          }
          ctx.fill();
          continue;
        }
        const floors = 2 + Math.floor(hash(i + 2) * 2);
        const ht = floors * 34;
        const by = fy(x + w / 2) + 4;
        const top = by - ht;
        ctx.fillStyle = paints[Math.floor(hash(i + 3) * paints.length)];
        ctx.fillRect(x, top, w - 3, ht);
        ctx.fillStyle = 'rgba(40, 50, 60, 0.55)'; // upper windows
        for (let f = 1; f < floors; f++) for (let wx = x + 7; wx < x + w - 14; wx += 15) ctx.fillRect(wx, top + (f - 1) * 34 + 9, 9, 13);
        // shop front: shutter, striped awning, signboard
        ctx.fillStyle = '#6c6f73';
        ctx.fillRect(x + 5, by - 26, w - 13, 26);
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        for (let sy = by - 24; sy < by; sy += 4) ctx.fillRect(x + 5, sy, w - 13, 1);
        const sc = signs[Math.floor(hash(i + 4) * signs.length)];
        ctx.fillStyle = sc;
        ctx.fillRect(x + 2, by - 40, w - 7, 11);
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fillRect(x + 8, by - 36, (w - 20) * 0.6, 3);
        for (let ax = x + 2; ax < x + w - 5; ax += 10) {
          ctx.fillStyle = (ax / 10) % 2 < 1 ? sc : '#f4f1ea';
          ctx.fillRect(ax, by - 29, 5, 4);
        }
        if (hash(i + 5) < 0.45) {
          // black water tank on the roof
          ctx.fillStyle = '#222';
          ctx.fillRect(x + w * 0.6, top - 12, 12, 12);
        } else if (hash(i + 5) < 0.75) {
          ctx.fillStyle = '#a8503a'; // tiled roof
          ctx.beginPath();
          ctx.moveTo(x - 3, top);
          ctx.lineTo(x + w / 2, top - 16);
          ctx.lineTo(x + w, top);
          ctx.fill();
        }
      }
      this.fillRidge(ctx, (xx) => fy(xx) + 4, width, '#a19d94', '#8b877e'); // pavement
    });
  }

  // ---- Knuckles scenery -----------------------------------------------------
  // A ridge of knobbly summits: like ridge(), but each bump is rounded on top and pinched between.
  knuckleRidge(off, base, amp, freq, seed) {
    const h = this.h;
    return (x) => {
      const t = (x + off) * freq + seed;
      return h * base - (Math.abs(Math.sin(t)) ** 0.7 * 1.1 + 0.45 * Math.abs(Math.sin(t * 0.37 + 2)) + 0.15 * Math.sin(t * 4.3)) * amp;
    };
  }

  drawKnuckles(map) {
    const { h } = this;
    this.layer('kn-far', 0.04, h * 0.42 - 100 * 1.7, (ctx, off, width) => {
      this.fillRidge(ctx, this.knuckleRidge(off, 0.42, 100, 0.006, 0), width, '#9fb1c2', '#d3dee4');
    });
    const landmarkBase = h * 0.46;
    this.layer('kn-near', LANDMARK_PARALLAX, Math.min(h * 0.5 - 70 * 1.7, this.landmarkTop(landmarkBase)), (ctx, off, width) => {
      const placed = this.paintLandmarks(ctx, off, width, map, () => landmarkBase);
      this.fillRidge(ctx, this.ridgeAround(this.knuckleRidge(off, 0.5, 70, 0.009, 4), placed, landmarkBase), width, '#7d9b95', '#bcd0cb');
      this.paintMist(ctx, off, width, h * 0.44, 0.75);
    });
    this.layer('kn-terraces', 0.25, h * 0.54 - 40 * 1.75 - 70, (ctx, off, width) => this.paintTerraces(ctx, off, width));
    this.layer('kn-forest', 0.5, h * 0.59 - 30 * 1.75 - 110, (ctx, off, width) => this.paintCloudForest(ctx, off, width));
  }

  // banks of cloud lying in the valleys
  paintMist(ctx, off, width, y, alpha) {
    const { h } = this;
    const mist = ctx.createLinearGradient(0, y - h * 0.06, 0, y + h * 0.12);
    mist.addColorStop(0, 'rgba(240, 244, 246, 0)');
    mist.addColorStop(1, `rgba(240, 244, 246, ${alpha})`);
    ctx.fillStyle = mist;
    ctx.fillRect(0, y - h * 0.06, width, h);
    ctx.fillStyle = `rgba(245, 248, 250, ${alpha * 0.8})`;
    ctx.beginPath();
    for (let i = Math.floor(off / 120) - 1; i < (off + width) / 120 + 1; i++) {
      if (hash(i * 2.2) < 0.4) continue;
      const x = i * 120 - off + hash(i) * 60;
      const cy = y + hash(i + 3) * h * 0.05;
      for (let k = 0; k < 4; k++) {
        const r = 22 + hash(i + k) * 26;
        ctx.moveTo(x + k * 34 + r, cy);
        ctx.ellipse(x + k * 34, cy, r, r * 0.45, 0, 0, TAU);
      }
    }
    ctx.fill();
  }

  // Meemure-style paddy terraces stepping down the hill, with huts and areca palms
  paintTerraces(ctx, off, width) {
    const { h } = this;
    const fy = this.ridge(off, 0.54, 40, 0.005, 9);
    this.fillRidge(ctx, fy, width, '#7fae55', '#5f9442');
    for (let row = 0; row < 9; row++) {
      ctx.strokeStyle = row % 2 ? 'rgba(200, 225, 120, 0.7)' : 'rgba(70, 110, 45, 0.55)';
      ctx.lineWidth = row % 2 ? 5 : 2;
      ctx.beginPath();
      for (let x = 0; x <= width + 8; x += 8) {
        // contour lines flatten into terraces: step the hill's height
        const y = fy(x) + 10 + row * 12;
        ctx.lineTo(x, Math.round(y / 9) * 9);
      }
      ctx.stroke();
    }
    for (let i = Math.floor(off / 210) - 1; i < (off + width) / 210 + 1; i++) {
      if (hash(i * 4.4) < 0.5) continue;
      const x = i * 210 - off + hash(i) * 120;
      const y = fy(x) + 14;
      ctx.fillStyle = '#e2d3b0';
      ctx.fillRect(x - 12, y - 14, 24, 14);
      ctx.fillStyle = '#8a6a3a';
      ctx.beginPath();
      ctx.moveTo(x - 16, y - 13);
      ctx.lineTo(x, y - 26);
      ctx.lineTo(x + 16, y - 13);
      ctx.fill();
    }
    const trunks = new Path2D();
    const fronds = new Path2D();
    for (let i = Math.floor(off / 40) - 1; i < (off + width) / 40 + 1; i++) {
      if (hash(i * 1.7) < 0.6) continue;
      const x = i * 40 - off + hash(i) * 20;
      const base = fy(x) + 8;
      const ht = 45 + hash(i + 2) * 25;
      trunks.moveTo(x, base);
      trunks.lineTo(x + 2, base - ht);
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI + (k / 4) * Math.PI;
        fronds.moveTo(x + 2, base - ht);
        fronds.quadraticCurveTo(x + 2 + Math.cos(a) * 9, base - ht - 8, x + 2 + Math.cos(a) * 15, base - ht + Math.abs(Math.cos(a)) * 8);
      }
    }
    ctx.strokeStyle = '#6b5f4a';
    ctx.lineWidth = 2;
    ctx.stroke(trunks);
    ctx.strokeStyle = '#3f7a3a';
    ctx.lineWidth = 3;
    ctx.stroke(fronds);
    this.paintMist(ctx, off, width, h * 0.6, 0.35);
  }

  // stunted, moss-hung montane forest with tree ferns
  paintCloudForest(ctx, off, width) {
    const fy = this.ridge(off, 0.59, 30, 0.008, 13);
    this.fillRidge(ctx, fy, width, '#3a6a48', '#2b5236');
    const crowns = new Path2D();
    const trunks = new Path2D();
    const ferns = new Path2D();
    for (let i = Math.floor(off / 22) - 1; i < (off + width) / 22 + 2; i++) {
      const x = i * 22 - off + hash(i * 1.3) * 12;
      const base = fy(x) + 8;
      if (hash(i + 0.7) < 0.3) {
        // tree fern: thin trunk, a fan of drooping fronds
        const ht = 40 + hash(i + 1) * 30;
        trunks.moveTo(x, base);
        trunks.lineTo(x, base - ht);
        for (let k = 0; k < 7; k++) {
          const a = -Math.PI + (k / 6) * Math.PI;
          ferns.moveTo(x, base - ht);
          ferns.quadraticCurveTo(x + Math.cos(a) * 16, base - ht - 10, x + Math.cos(a) * 26, base - ht + 6 + Math.abs(Math.cos(a)) * 10);
        }
        continue;
      }
      const ht = 50 + hash(i + 2) * 55;
      trunks.moveTo(x, base);
      trunks.quadraticCurveTo(x - 6, base - ht * 0.5, x + 3, base - ht * 0.8);
      for (let j = 0; j < 4; j++) {
        const cx = x + (hash(i * 5 + j) - 0.5) * 34;
        const cy = base - ht + j * 7;
        const r = 14 + hash(i + j) * 8;
        crowns.moveTo(cx + r, cy);
        crowns.ellipse(cx, cy, r, r * 0.6, 0, 0, TAU);
      }
    }
    ctx.strokeStyle = '#4a4036';
    ctx.lineWidth = 3;
    ctx.stroke(trunks);
    ctx.fillStyle = '#2f5a3a';
    ctx.fill(crowns);
    ctx.strokeStyle = '#3d7a44';
    ctx.lineWidth = 2.5;
    ctx.stroke(ferns);
  }

  // ---- Kelani Valley scenery --------------------------------------------------
  drawKelani(map) {
    const { h } = this;
    this.layer('kv-far', 0.04, h * 0.42 - 110 * 1.75, (ctx, off, width) => {
      this.fillRidge(ctx, this.ridge(off, 0.42, 110, 0.0045, 2), width, '#8fa7b8', '#cfdde2');
    });
    const landmarkBase = h * 0.47;
    this.layer('kv-near', LANDMARK_PARALLAX, Math.min(h * 0.5 - 60 * 1.75, this.landmarkTop(landmarkBase)), (ctx, off, width) => {
      const placed = this.paintLandmarks(ctx, off, width, map, () => landmarkBase);
      const fy = this.ridgeAround(this.ridge(off, 0.5, 60, 0.007, 6), placed, landmarkBase);
      this.fillRidge(ctx, fy, width, '#5f8a68', '#9fbea4');
      // thin falls streaking down the valley wall
      for (let i = Math.floor(off / 260) - 1; i < (off + width) / 260 + 1; i++) {
        if (hash(i * 3.9) < 0.5) continue;
        const x = i * 260 - off + hash(i) * 160;
        const top = fy(x) + 6;
        ctx.strokeStyle = 'rgba(240, 248, 250, 0.85)';
        ctx.lineWidth = 2 + hash(i + 1) * 2;
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.quadraticCurveTo(x + 4, top + 30, x + 2, h * 0.56);
        ctx.stroke();
      }
      this.paintMist(ctx, off, width, h * 0.5, 0.5);
    });
    this.layer('kv-river', 0.25, h * 0.55 - 30 * 1.75 - 60, (ctx, off, width) => this.paintRiver(ctx, off, width));
    this.layer('kv-forest', 0.5, h * 0.6 - 25 * 1.75 - 190, (ctx, off, width) => this.paintRainforest(ctx, off, width));
  }

  // the Kelani river: far bank, rapids round the boulders, the odd raft
  paintRiver(ctx, off, width) {
    const { h } = this;
    const bank = this.ridge(off, 0.55, 30, 0.006, 3);
    this.fillRidge(ctx, bank, width, '#4f8a52', '#3f7444');
    const top = h * 0.585;
    const g = ctx.createLinearGradient(0, top, 0, h * 0.66);
    g.addColorStop(0, '#6f9e94');
    g.addColorStop(1, '#4d7c74');
    ctx.fillStyle = g;
    ctx.fillRect(0, top, width, h - top);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    for (let i = Math.floor(off / 19); i < (off + width) / 19; i++) ctx.fillRect(i * 19 - off + hash(i) * 12, top + 3 + hash(i + 1) * h * 0.05, 6 + hash(i + 2) * 14, 1.5);
    for (let i = Math.floor(off / 70) - 1; i < (off + width) / 70 + 1; i++) {
      if (hash(i * 2.6) < 0.45) continue;
      const x = i * 70 - off + hash(i) * 40;
      const y = top + 6 + hash(i + 5) * h * 0.04;
      const r = 6 + hash(i + 3) * 10;
      ctx.fillStyle = '#7d7a70';
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.55, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.fillRect(x - r - 4, y - 1, r * 2 + 10, 2);
    }
    for (let i = Math.floor(off / 400) - 1; i < (off + width) / 400 + 1; i++) {
      if (hash(i * 7.1) < 0.5) continue;
      const x = i * 400 - off + hash(i) * 250;
      const y = top + 10;
      ctx.fillStyle = '#e8701e';
      ctx.beginPath();
      ctx.roundRect(x - 18, y - 6, 36, 7, 3);
      ctx.fill();
      ctx.fillStyle = '#f3c41c';
      for (const dx of [-10, 0, 10]) {
        ctx.beginPath();
        ctx.arc(x + dx, y - 11, 3, 0, TAU);
        ctx.fill();
      }
    }
  }

  // wet-zone rainforest: tall emergents, kitul (fishtail) palms and bamboo
  paintRainforest(ctx, off, width) {
    const fy = this.ridge(off, 0.6, 25, 0.008, 17);
    this.fillRidge(ctx, fy, width, '#2f6a3a', '#24532d');
    const trunks = new Path2D();
    const crowns = new Path2D();
    const under = new Path2D();
    const bamboo = new Path2D();
    const fronds = new Path2D();
    for (let i = Math.floor(off / 30) - 1; i < (off + width) / 30 + 2; i++) {
      const x = i * 30 - off + hash(i * 1.9) * 16;
      const base = fy(x) + 8;
      const kind = hash(i + 0.3);
      // understorey everywhere
      const r = 16 + hash(i + 4) * 10;
      under.moveTo(x + r, base - 10);
      under.ellipse(x, base - 10, r, r * 0.7, 0, 0, TAU);
      if (kind < 0.25) {
        // kitul palm: straight trunk, drooping fishtail fronds
        const ht = 70 + hash(i + 1) * 40;
        trunks.moveTo(x, base);
        trunks.lineTo(x + 3, base - ht);
        for (let k = 0; k < 6; k++) {
          const a = -Math.PI + (k / 5) * Math.PI;
          fronds.moveTo(x + 3, base - ht);
          fronds.quadraticCurveTo(x + 3 + Math.cos(a) * 18, base - ht - 12, x + 3 + Math.cos(a) * 28, base - ht + 14);
        }
      } else if (kind < 0.4) {
        for (let k = -3; k <= 3; k++) {
          bamboo.moveTo(x + k * 2.5, base);
          bamboo.quadraticCurveTo(x + k * 5, base - 60, x + k * 12, base - 95 - hash(i + k) * 20);
        }
      } else if (kind < 0.62) {
        // emergent tree: tall clean trunk, broad flat crown
        const ht = 110 + hash(i + 2) * 70;
        trunks.moveTo(x, base);
        trunks.lineTo(x + 1, base - ht);
        for (let j = 0; j < 5; j++) {
          const cx = x + (j - 2) * 14;
          const cy = base - ht - Math.sin((j / 4) * Math.PI) * 10;
          crowns.moveTo(cx + 20, cy);
          crowns.ellipse(cx, cy, 20, 12, 0, 0, TAU);
        }
      }
    }
    ctx.fillStyle = '#2d6036';
    ctx.fill(under);
    ctx.strokeStyle = '#5c5246';
    ctx.lineWidth = 4;
    ctx.stroke(trunks);
    ctx.strokeStyle = '#7f9a3e';
    ctx.lineWidth = 3;
    ctx.stroke(bamboo);
    ctx.fillStyle = '#2a5a32';
    ctx.fill(crowns);
    ctx.strokeStyle = '#2f6d36';
    ctx.lineWidth = 4;
    ctx.stroke(fronds);
  }

  // ---- Rajarata scenery --------------------------------------------------------
  drawDryZone(map) {
    const { h } = this;
    const plain = h * 0.46;
    // a flat, hazy plain broken by lone granite rocks
    this.layer('rr-far', 0.04, plain - 110, (ctx, off, width) => {
      ctx.fillStyle = '#c9c2ad';
      ctx.fillRect(0, plain, width, h - plain);
      for (let i = Math.floor(off / 300) - 1; i < (off + width) / 300 + 1; i++) {
        if (hash(i * 1.4) < 0.35) continue;
        ctx.save();
        ctx.translate(i * 300 - off + hash(i) * 200, plain + 2);
        ctx.scale(12, 12);
        inselberg(ctx, 0, 6 + hash(i + 2) * 6, 3 + hash(i + 3) * 5, '#b3ad9e');
        ctx.restore();
      }
      ctx.fillStyle = '#9fa588';
      ctx.beginPath();
      for (let x = 0; x <= width; x += 10) {
        const r = 5 + hash(Math.floor((x + off) / 10)) * 5;
        ctx.moveTo(x + r, plain);
        ctx.ellipse(x, plain, r, r * 0.6, 0, Math.PI, 0);
      }
      ctx.fill();
    });
    // landmarks standing beyond a great tank (wewa), drowned trees in the water
    const base = h * 0.505; // just under the water's edge, so no plain shows beneath a landmark
    this.layer('rr-tank', LANDMARK_PARALLAX, this.landmarkTop(base), (ctx, off, width) => {
      this.paintLandmarks(ctx, off, width, map, () => base);
      const top = h * 0.5;
      const g = ctx.createLinearGradient(0, top, 0, h * 0.56);
      g.addColorStop(0, '#7fb0c4');
      g.addColorStop(1, '#5d93a6');
      ctx.fillStyle = g;
      ctx.fillRect(0, top, width, h - top);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      for (let i = Math.floor(off / 21); i < (off + width) / 21; i++) ctx.fillRect(i * 21 - off + hash(i) * 14, top + 3 + hash(i + 1) * h * 0.04, 6 + hash(i + 2) * 12, 1.2);
      ctx.strokeStyle = '#6b6258';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = Math.floor(off / 37) - 1; i < (off + width) / 37 + 1; i++) {
        if (hash(i * 2.9) < 0.55) continue;
        const x = i * 37 - off + hash(i) * 20;
        const y = top + 4 + hash(i + 4) * h * 0.03;
        const ht = 14 + hash(i + 5) * 16;
        ctx.moveTo(x, y);
        ctx.lineTo(x + 1, y - ht);
        ctx.moveTo(x + 1, y - ht * 0.6);
        ctx.lineTo(x + 7, y - ht * 0.85);
        ctx.moveTo(x + 1, y - ht * 0.75);
        ctx.lineTo(x - 5, y - ht * 0.95);
      }
      ctx.stroke();
    });
    this.layer('rr-paddy', 0.25, h * 0.555 - 8 * 1.75 - 90, (ctx, off, width) => this.paintPaddy(ctx, off, width));
    this.layer('rr-scrub', 0.5, h * 0.6 - 18 * 1.75 - 110, (ctx, off, width) => this.paintScrub(ctx, off, width));
  }

  // the tank bund, paddy below it, little white dagobas and palmyra palms
  paintPaddy(ctx, off, width) {
    const fy = this.ridge(off, 0.555, 8, 0.006, 5);
    this.fillRidge(ctx, fy, width, '#9cc457', '#7fae45');
    ctx.strokeStyle = 'rgba(120, 90, 50, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let row = 1; row < 5; row++) {
      for (let x = 0; x <= width + 8; x += 8) ctx.lineTo(x, fy(x) + row * 9);
      ctx.moveTo(0, fy(0) + (row + 1) * 9);
    }
    ctx.stroke();
    for (let i = Math.floor(off / 330) - 1; i < (off + width) / 330 + 1; i++) {
      if (hash(i * 5.5) < 0.5) continue;
      const x = i * 330 - off + hash(i) * 200;
      ctx.save();
      ctx.translate(x, fy(x) + 4);
      ctx.scale(14, 14);
      // little dagoba (stupa) on a plinth
      ctx.fillStyle = '#f4f1ea';
      ctx.fillRect(-1.3, -0.3, 2.6, 0.3);
      ctx.beginPath();
      ctx.ellipse(0, -0.3, 1, 0.95, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(-0.25, -1.55, 0.5, 0.3);
      ctx.fillStyle = '#d9c58a';
      ctx.beginPath();
      ctx.moveTo(-0.14, -1.55);
      ctx.lineTo(0.14, -1.55);
      ctx.lineTo(0, -2.4);
      ctx.fill();
      ctx.restore();
    }
    for (let i = Math.floor(off / 60) - 1; i < (off + width) / 60 + 1; i++) {
      if (hash(i * 3.1) < 0.55) continue;
      const x = i * 60 - off + hash(i) * 30;
      const base = fy(x) + 4;
      const ht = 55 + hash(i + 1) * 30;
      ctx.strokeStyle = '#4f463a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, base);
      ctx.lineTo(x, base - ht);
      ctx.stroke();
      // palmyra: a round fan-leaf head
      ctx.fillStyle = '#4c6a32';
      ctx.beginPath();
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * TAU;
        const fx = x + Math.cos(a) * 9;
        const fy2 = base - ht + Math.sin(a) * 7;
        ctx.moveTo(fx + 7, fy2);
        ctx.arc(fx, fy2, 7, 0, TAU);
      }
      ctx.fill();
    }
  }

  // dry scrub jungle: thorny bushes, flat-topped trees and the odd wild elephant
  paintScrub(ctx, off, width) {
    const fy = this.ridge(off, 0.6, 18, 0.007, 21);
    this.fillRidge(ctx, fy, width, '#a39a5a', '#857b44');
    const bush = new Path2D();
    const crowns = new Path2D();
    const trunks = new Path2D();
    for (let i = Math.floor(off / 18) - 1; i < (off + width) / 18 + 2; i++) {
      const x = i * 18 - off + hash(i * 1.1) * 10;
      const base = fy(x) + 6;
      const r = 10 + hash(i + 2) * 10;
      if (hash(i * 0.9) < 0.6) {
        bush.moveTo(x + r, base - r * 0.4);
        bush.ellipse(x, base - r * 0.4, r, r * 0.6, 0, 0, TAU);
      }
      if (hash(i * 2.3) < 0.18) {
        const ht = 60 + hash(i + 3) * 40;
        trunks.moveTo(x, base);
        trunks.lineTo(x - 2, base - ht * 0.7);
        trunks.lineTo(x - 14, base - ht * 0.9);
        trunks.moveTo(x - 2, base - ht * 0.7);
        trunks.lineTo(x + 12, base - ht * 0.95);
        for (let j = 0; j < 4; j++) {
          const cx = x + (j - 1.5) * 16;
          crowns.moveTo(cx + 18, base - ht);
          crowns.ellipse(cx, base - ht, 18, 8, 0, 0, TAU);
        }
      }
    }
    ctx.fillStyle = '#6f7a3a';
    ctx.fill(bush);
    ctx.strokeStyle = '#5a4a3a';
    ctx.lineWidth = 3;
    ctx.stroke(trunks);
    ctx.fillStyle = '#5d7034';
    ctx.fill(crowns);
    for (let i = Math.floor(off / 700) - 1; i < (off + width) / 700 + 1; i++) {
      if (hash(i * 6.6) < 0.5) continue;
      const x = i * 700 - off + hash(i) * 400;
      const y = fy(x) + 4;
      ctx.fillStyle = '#5d5853';
      ctx.beginPath();
      ctx.ellipse(x, y - 30, 30, 21, 0, 0, TAU);
      ctx.moveTo(x + 46, y - 38);
      ctx.ellipse(x + 34, y - 38, 13, 14, 0, 0, TAU);
      ctx.fill();
      for (const lx of [-20, -9, 10, 20]) ctx.fillRect(x + lx - 4, y - 20, 8, 22);
      ctx.strokeStyle = '#5d5853';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(x + 44, y - 36);
      ctx.quadraticCurveTo(x + 54, y - 18, x + 47, y);
      ctx.stroke();
    }
  }

  // tea estate: rows of bushes following the hill contour, with silver oak shade trees
  paintTeaHills(ctx, off, width) {
    const fy = this.ridge(off, 0.52, 40, 0.005, 7);
    this.fillRidge(ctx, fy, width, '#6aa860', '#4f8f4a');
    const gap = 16;
    for (let row = 0; row < 8; row++) {
      ctx.fillStyle = row % 2 ? '#3f7d3c' : '#468a43';
      const shift = (((row * 7 + off) % gap) + gap) % gap;
      ctx.beginPath();
      for (let x = -shift; x < width + gap; x += gap) {
        const y = fy(x) + 6 + row * 11;
        ctx.moveTo(x + 8, y);
        ctx.ellipse(x, y, 8, 4.5, 0, 0, TAU);
      }
      ctx.fill();
    }
    // silver oak trees: trunks in one stroke, crowns in one fill
    const spacing = 70;
    const trunks = new Path2D();
    const crowns = new Path2D();
    for (let i = Math.floor(off / spacing) - 1; i < (off + width) / spacing + 1; i++) {
      if (hash(i * 3.1) < 0.35) continue;
      const x = i * spacing - off + hash(i) * 40;
      const base = fy(x) + 10;
      const ht = 50 + hash(i + 5) * 40;
      trunks.moveTo(x, base);
      trunks.lineTo(x + 2, base - ht);
      for (let j = 0; j < 4; j++) {
        const cx = x + (hash(i + j) - 0.5) * 18;
        const cy = base - ht * (0.45 + j * 0.17);
        crowns.moveTo(cx + 13 - j * 2, cy);
        crowns.ellipse(cx, cy, 13 - j * 2, 9, 0, 0, TAU);
      }
    }
    ctx.strokeStyle = '#5a5246';
    ctx.lineWidth = 3;
    ctx.stroke(trunks);
    ctx.fillStyle = '#5c7f4a';
    ctx.fill(crowns);
  }

  // nearer ridge of eucalyptus and pine
  paintForest(ctx, off, width) {
    const fy = this.ridge(off, 0.58, 30, 0.008, 11);
    this.fillRidge(ctx, fy, width, '#3e6e46', '#2f5838');
    const spacing = 26;
    const pines = new Path2D();
    const trunks = new Path2D();
    const crowns = new Path2D();
    for (let i = Math.floor(off / spacing) - 1; i < (off + width) / spacing + 2; i++) {
      const x = i * spacing - off + hash(i * 1.7) * 14;
      const base = fy(x) + 6;
      const ht = 60 + hash(i + 2) * 70;
      if (hash(i + 0.5) < 0.5) {
        // pine: stacked triangles
        for (let j = 0; j < 3; j++) {
          const yy = base - ht * (0.35 + j * 0.25);
          const ww = 22 - j * 5;
          pines.moveTo(x - ww, yy + 22);
          pines.lineTo(x, yy - 18);
          pines.lineTo(x + ww, yy + 22);
          pines.closePath();
        }
      } else {
        // eucalyptus: pale trunk, loose crown
        trunks.moveTo(x, base);
        trunks.quadraticCurveTo(x + 6, base - ht * 0.5, x + 2, base - ht);
        for (let j = 0; j < 5; j++) {
          const cx = x + (hash(i * 7 + j) - 0.5) * 30;
          const cy = base - ht + 10 + j * 9;
          crowns.moveTo(cx + 15, cy);
          crowns.ellipse(cx, cy, 15, 10, 0, 0, TAU);
        }
      }
    }
    ctx.strokeStyle = '#cfc6b4';
    ctx.lineWidth = 3;
    ctx.stroke(trunks);
    ctx.fillStyle = '#35603c';
    ctx.fill(crowns);
    ctx.fillStyle = '#26492f';
    ctx.fill(pines);
  }

  // concrete CEB poles with sagging wires, standing right behind the road
  drawPoles(game) {
    const { ctx, ppm } = this;
    const x0 = Math.floor(this.viewLeft() / POLE_EVERY) - 1;
    const x1 = Math.ceil(this.viewRight() / POLE_EVERY) + 1;
    const tops = [];
    const caves = game.terrain.sections.filter((s) => s.roof);
    for (let i = x0; i <= x1; i++) {
      const x = i * POLE_EVERY + 6;
      if (caves.some((s) => x > s.x0 - 3 && x < s.x1 + 3)) continue; // no poles through the rock
      const gy = game.height(x);
      tops.push([this.sx(x), this.sy(gy + 7.5)]);
      const bx = this.sx(x);
      const g = ctx.createLinearGradient(bx - ppm * 0.15, 0, bx + ppm * 0.15, 0);
      g.addColorStop(0, '#9b9b95');
      g.addColorStop(1, '#6d6d68');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(bx - ppm * 0.16, this.sy(gy - 1));
      ctx.lineTo(bx - ppm * 0.08, this.sy(gy + 7.6));
      ctx.lineTo(bx + ppm * 0.08, this.sy(gy + 7.6));
      ctx.lineTo(bx + ppm * 0.16, this.sy(gy - 1));
      ctx.fill();
      ctx.fillStyle = '#5a5a55';
      ctx.fillRect(bx - ppm * 0.6, this.sy(gy + 7.2), ppm * 1.2, ppm * 0.12);
    }
    ctx.strokeStyle = 'rgba(30, 30, 30, 0.6)';
    ctx.lineWidth = 1.2;
    for (const dy of [-ppm * 0.45, ppm * 0.45]) {
      ctx.beginPath();
      for (let i = 0; i < tops.length - 1; i++) {
        const [ax, ay] = tops[i];
        const [bx, by] = tops[i + 1];
        ctx.moveTo(ax + dy, ay);
        ctx.quadraticCurveTo((ax + bx) / 2 + dy, Math.max(ay, by) + ppm * 1.4, bx + dy, by);
      }
      ctx.stroke();
    }
  }

  viewLeft() {
    return this.cam.x - (this.w * 0.35) / this.ppm - 2;
  }
  viewRight() {
    return this.cam.x + (this.w * 0.65) / this.ppm + 2;
  }

  // ---- road ----------------------------------------------------------------
  drawTerrain(game) {
    const { ctx, ppm, h } = this;
    const x0 = Math.floor(this.viewLeft());
    const x1 = Math.ceil(this.viewRight());
    // bridge spans are open underneath: the ground is drawn as separate runs around them
    const spans = game.terrain.sections.filter((s) => s.span && s.span[1] > x0 && s.span[0] < x1);
    const open = (x) => spans.some((s) => x > s.span[0] && x < s.span[1]);
    const xs = [];
    for (let x = x0; x <= x1; x += 0.5) xs.push(x);
    for (const s of spans) xs.push(...s.span.filter((x) => x > x0 && x < x1));
    xs.sort((a, b) => a - b);
    const runs = [];
    let run = null;
    let minY = h;
    for (const x of xs) {
      if (open(x)) {
        run = null;
        continue;
      }
      if (!run) runs.push((run = []));
      const p = [this.sx(x), this.sy(game.height(x))];
      minY = Math.min(minY, p[1]);
      run.push(p);
    }
    const path = (dy) => {
      ctx.beginPath();
      for (const pts of runs) pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y + dy) : ctx.moveTo(x, y + dy)));
    };

    for (const s of spans) this.drawRiver(game, s);
    const caves = game.terrain.sections.filter((s) => s.roof && s.x1 + 12 > x0 && s.x0 - 12 < x1);
    for (const s of caves) this.drawCave(game, s);

    // soil body, darker with depth
    const G = game.map.ground;
    const soil = ctx.createLinearGradient(0, minY, 0, minY + ppm * 9);
    soil.addColorStop(0, G.soil[0]);
    soil.addColorStop(0.35, G.soil[1]);
    soil.addColorStop(1, G.soil[2]);
    ctx.fillStyle = soil;
    ctx.beginPath();
    for (const pts of runs) {
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.lineTo(pts[pts.length - 1][0], h + 10);
      ctx.lineTo(pts[0][0], h + 10);
      ctx.closePath();
    }
    ctx.fill();

    // strata bands
    ctx.lineJoin = 'bevel';
    for (const [dy, color, width] of [
      [1.0, G.strata[0], 0.7],
      [2.6, G.strata[1], 1.2],
      [4.4, G.strata[2], 0.6],
    ]) {
      ctx.strokeStyle = color;
      ctx.lineWidth = ppm * width;
      path(ppm * dy);
      ctx.stroke();
    }

    // embedded stones
    const near = new Path2D();
    const deep = new Path2D();
    for (let i = x0; i <= x1; i++) {
      for (let j = 0; j < 2; j++) {
        const n = i * 2 + j;
        if (hash(n) > 0.35) continue;
        const x = i + hash(n + 0.3);
        if (open(x)) continue;
        const depth = 0.7 + hash(n + 0.7) * 5;
        const r = (0.1 + hash(n + 0.9) * 0.22) * ppm;
        const px = this.sx(x);
        const py = this.sy(game.height(x) - depth);
        const path = depth > 3 ? deep : near;
        path.moveTo(px + r * 1.3, py);
        path.ellipse(px, py, r * 1.3, r, 0, 0, TAU);
      }
    }
    ctx.fillStyle = G.stones[0];
    ctx.fill(near);
    ctx.fillStyle = G.stones[1];
    ctx.fill(deep);

    // verge: grass in the hills, packed sand on the coast
    ctx.strokeStyle = G.verge[0];
    ctx.lineWidth = ppm * 0.42;
    path(ppm * 0.2);
    ctx.stroke();
    ctx.strokeStyle = G.verge[1];
    ctx.lineWidth = ppm * 0.14;
    path(ppm * 0.05);
    ctx.stroke();
    if (G.lanes) this.laneLine(() => path(ppm * 0.22));

    // grass tufts
    ctx.strokeStyle = G.tuft;
    ctx.lineWidth = Math.max(1, ppm * 0.04);
    ctx.beginPath();
    for (let i = x0 * 2; i <= x1 * 2; i++) {
      if (hash(i * 0.77) > G.tufts) continue;
      const x = i / 2 + hash(i) * 0.4;
      if (open(x)) continue;
      const px = this.sx(x);
      const py = this.sy(game.height(x));
      for (let b = -1; b <= 1; b++) {
        ctx.moveTo(px + b * ppm * 0.05, py + 1);
        ctx.lineTo(px + b * ppm * 0.12, py - ppm * (0.18 + hash(i + b) * 0.15));
      }
    }
    ctx.stroke();

    for (const s of spans) this.drawBridge(s);
    for (const s of caves) this.drawStalactites(s);
  }

  // A cave cut through a hillside: the rock above the roof (sloping down to the road
  // either side of the mouths) and the dark back wall inside. Drawn before the road.
  drawCave(game, s) {
    const { ctx, ppm } = this;
    const roof = s.roof;
    const [ax, ay] = roof[0];
    const [bx, by] = roof.at(-1);
    const flank = 10;
    ctx.beginPath();
    ctx.moveTo(this.sx(ax - flank), this.sy(game.height(ax - flank) - 1));
    ctx.quadraticCurveTo(this.sx(ax - 3), this.sy(ay + 1.5), this.sx(ax - 1.2), this.sy(ay + 0.2));
    for (const [x, y] of roof) ctx.lineTo(this.sx(x), this.sy(y));
    ctx.lineTo(this.sx(bx + 1.2), this.sy(by + 0.2));
    ctx.quadraticCurveTo(this.sx(bx + 3), this.sy(by + 1.5), this.sx(bx + flank), this.sy(game.height(bx + flank) - 1));
    // back over the hilltop: shoulders above each mouth, a lumpy crest between
    ctx.quadraticCurveTo(this.sx(bx + 3), this.sy(by + 9), this.sx(bx - 2), this.sy(by + 10));
    for (let x = bx - 4; x > ax + 2; x -= 4) ctx.lineTo(this.sx(x), this.sy(roof[Math.round(x - ax)][1] + 10 + hash(x * 0.7) * 3));
    ctx.lineTo(this.sx(ax + 2), this.sy(ay + 10));
    ctx.quadraticCurveTo(this.sx(ax - 3), this.sy(ay + 9), this.sx(ax - flank), this.sy(game.height(ax - flank) - 1));
    ctx.closePath();
    const rock = ctx.createLinearGradient(0, this.sy(ay + 11), 0, this.sy(ay));
    rock.addColorStop(0, '#4f6a40');
    rock.addColorStop(0.5, '#6b6152');
    rock.addColorStop(1, '#4a4238');
    ctx.fillStyle = rock;
    ctx.fill();
    // strata cracks and moss on the hillside above
    ctx.strokeStyle = 'rgba(30, 26, 20, 0.35)';
    ctx.lineWidth = Math.max(1, ppm * 0.06);
    ctx.beginPath();
    for (let x = Math.ceil(ax); x < bx; x += 3) {
      const y = roof[Math.min(roof.length - 1, Math.round(x - ax))][1];
      ctx.moveTo(this.sx(x), this.sy(y + 1 + hash(x) * 2));
      ctx.lineTo(this.sx(x + 2.2), this.sy(y + 1.4 + hash(x + 1) * 2.4));
    }
    ctx.stroke();
    ctx.fillStyle = '#3f6b38';
    ctx.beginPath();
    for (const [x, y] of [[ax - 1, ay + 0.6], [bx + 1, by + 0.6]]) {
      for (let k = -2; k <= 2; k++) {
        const px = this.sx(x + k * 0.5);
        const py = this.sy(y + 0.2 + Math.abs(k) * 0.35);
        ctx.moveTo(px + ppm * 0.5, py);
        ctx.ellipse(px, py, ppm * 0.5, ppm * 0.3, 0, 0, TAU);
      }
    }
    ctx.fill();
    ctx.fillStyle = '#2f5a32'; // forest on the hilltop
    ctx.beginPath();
    for (let x = Math.ceil(ax); x < bx; x += 1.5) {
      const px = this.sx(x);
      const py = this.sy(roof[Math.round(x - ax)][1] + 10 + hash(Math.floor(x / 4) * 4 * 0.7) * 3);
      const r = ppm * (0.7 + hash(x * 1.7) * 0.6);
      ctx.moveTo(px + r, py);
      ctx.arc(px, py, r, 0, TAU);
    }
    ctx.fill();
    // inside: the back wall, darkest in the middle
    const wall = ctx.createLinearGradient(this.sx(ax), 0, this.sx(bx), 0);
    wall.addColorStop(0, '#3a342c');
    wall.addColorStop(0.15, '#1d1a16');
    wall.addColorStop(0.85, '#1d1a16');
    wall.addColorStop(1, '#3a342c');
    ctx.fillStyle = wall;
    ctx.beginPath();
    for (const [x, y] of roof) ctx.lineTo(this.sx(x), this.sy(y));
    for (let x = bx; x >= ax; x -= 1) ctx.lineTo(this.sx(x), this.sy(game.height(x) - 0.5));
    ctx.closePath();
    ctx.fill();
  }

  // stalactites and drips hanging from a cave roof
  drawStalactites(s) {
    const { ctx, ppm } = this;
    const roof = s.roof;
    ctx.fillStyle = '#5a5246';
    ctx.beginPath();
    for (let i = 2; i < roof.length - 2; i++) {
      if (hash(roof[i][0] * 1.3) < 0.45) continue;
      const [x, y] = roof[i];
      const len = 0.3 + hash(x * 2.1) * 0.6;
      const px = this.sx(x + hash(x) * 0.6);
      ctx.moveTo(px - ppm * 0.18, this.sy(y) - 1);
      ctx.lineTo(px, this.sy(y - len));
      ctx.lineTo(px + ppm * 0.18, this.sy(y) - 1);
    }
    ctx.fill();
    ctx.fillStyle = 'rgba(190, 220, 235, 0.7)';
    for (let i = 3; i < roof.length - 3; i += 4) {
      const [x, y] = roof[i];
      const t = (this.time * 0.8 + hash(x)) % 1;
      ctx.fillRect(this.sx(x + 0.3), this.sy(y - 0.4 - t * 3), Math.max(1, ppm * 0.05), Math.max(2, ppm * 0.12));
    }
  }

  // Inside a cave it gets dark, except for a pool of light around the vehicle.
  drawCaveDark(game) {
    const p = game.chassis.getPosition();
    const s = game.terrain.sections.findLast((c) => c.roof && p.x > c.x0 - 2 && p.x < c.x1 + 2);
    if (!s) return;
    const depth = Math.min(1, Math.max(0, Math.min(p.x - s.x0, s.x1 - p.x) / 8));
    if (depth <= 0) return;
    const { ctx, w, h, ppm } = this;
    const cx = this.sx(p.x);
    const cy = this.sy(p.y);
    const g = ctx.createRadialGradient(cx + ppm, cy, ppm * 2, cx + ppm, cy, ppm * 9);
    g.addColorStop(0, 'rgba(8, 6, 4, 0)');
    g.addColorStop(1, `rgba(8, 6, 4, ${0.6 * depth})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  // dashed white line along the road; tracePath() builds the path to stroke
  laneLine(tracePath) {
    const { ctx, ppm } = this;
    ctx.save();
    ctx.setLineDash([ppm * 1.2, ppm * 1.4]);
    ctx.lineDashOffset = this.cam.x * ppm; // dashes stay put on the road
    ctx.strokeStyle = 'rgba(245, 245, 240, 0.85)';
    ctx.lineWidth = Math.max(1, ppm * 0.06);
    tracePath();
    ctx.stroke();
    ctx.restore();
  }

  // the river under a bridge, and the concrete abutments either side
  drawRiver(game, s) {
    const { ctx, ppm, h } = this;
    const [a, b] = s.span;
    const top = this.sy(s.water);
    const left = this.sx(a - 1);
    const right = this.sx(b + 1);
    // looking under the deck: hazy sky, then the far river bank with trees
    const deckBottom = this.sy(s.deck) + ppm * 0.8;
    const sky = ctx.createLinearGradient(0, deckBottom, 0, top);
    sky.addColorStop(0, '#c9dbe2');
    sky.addColorStop(1, '#dfe8e6');
    ctx.fillStyle = sky;
    ctx.fillRect(left, deckBottom, right - left, top - deckBottom);
    const bank = top - ppm * 0.6;
    ctx.fillStyle = '#58824f';
    ctx.beginPath();
    ctx.moveTo(left, top);
    for (let x = Math.floor(a) - 1; x <= b + 1; x += 0.8) {
      const px = this.sx(x);
      ctx.lineTo(px, bank - ppm * (0.2 + hash(x * 1.7) * 0.9));
    }
    ctx.lineTo(right, top);
    ctx.fill();
    const g = ctx.createLinearGradient(0, top, 0, top + ppm * 6);
    g.addColorStop(0, '#4f8f9a');
    g.addColorStop(1, '#2d5d63');
    ctx.fillStyle = g;
    ctx.fillRect(left, top, right - left, h - top);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    for (let x = Math.floor(a); x < b; x += 1.3) {
      const wob = Math.sin(this.time * 1.5 + x) * ppm * 0.15;
      ctx.fillRect(this.sx(x) + wob, top + ppm * (0.15 + hash(x) * 1.2), ppm * (0.4 + hash(x + 1) * 0.6), 1.5);
    }
  }

  drawBridge(s) {
    const { ctx, ppm, h } = this;
    const [a, b] = s.span;
    const deck = this.sy(s.deck);
    const xa = this.sx(a);
    const xb = this.sx(b);
    const slab = ppm * 0.8;
    // piers down into the river
    ctx.fillStyle = '#a29e95';
    const n = Math.max(1, Math.round((b - a) / 11));
    for (let k = 1; k < n; k++) {
      const px = this.sx(a + ((b - a) * k) / n);
      ctx.fillRect(px - ppm * 0.45, deck + slab, ppm * 0.9, h - deck);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillRect(px - ppm * 0.6, this.sy(s.water) - 1, ppm * 1.2, 2);
      ctx.fillStyle = '#a29e95';
    }
    // abutments and the deck slab
    for (const x of [xa - ppm * 1.2, xb]) {
      const g = ctx.createLinearGradient(x, 0, x + ppm * 1.2, 0);
      g.addColorStop(0, '#9c988f');
      g.addColorStop(0.5, '#bdb9b0');
      g.addColorStop(1, '#8f8b83');
      ctx.fillStyle = g;
      ctx.fillRect(x, deck, ppm * 1.2, h - deck);
    }
    ctx.fillStyle = '#c4c0b7';
    ctx.fillRect(xa - ppm * 0.2, deck, xb - xa + ppm * 0.4, slab);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.fillRect(xa, deck + slab - ppm * 0.15, xb - xa, ppm * 0.15);
    // asphalt surface and lane line on the deck
    ctx.fillStyle = this.mapGround.verge[0];
    ctx.fillRect(xa - ppm * 0.2, deck, xb - xa + ppm * 0.4, ppm * 0.22);
    this.laneLine(() => {
      ctx.beginPath();
      ctx.moveTo(xa, deck + ppm * 0.22);
      ctx.lineTo(xb, deck + ppm * 0.22);
    });
    // superstructure behind the railing
    ctx.strokeStyle = '#3d5a73';
    ctx.lineCap = 'butt';
    if (s.style === 'arch') {
      const rise = (b - a) * 0.22 * ppm;
      ctx.lineWidth = ppm * 0.3;
      ctx.beginPath();
      ctx.moveTo(xa + ppm, deck);
      ctx.quadraticCurveTo((xa + xb) / 2, deck - rise * 2, xb - ppm, deck);
      ctx.stroke();
      ctx.lineWidth = Math.max(1, ppm * 0.06);
      ctx.beginPath();
      for (let x = a + 3; x < b - 2.5; x += 2) {
        const t = (this.sx(x) - xa - ppm) / (xb - xa - 2 * ppm);
        const y = deck - rise * 4 * t * (1 - t);
        ctx.moveTo(this.sx(x), y);
        ctx.lineTo(this.sx(x), deck);
      }
      ctx.stroke();
    } else {
      const mid = (xa + xb) / 2;
      const top = deck - ppm * 9;
      ctx.fillStyle = '#e4e2dc';
      ctx.fillRect(mid - ppm * 0.3, top, ppm * 0.6, deck - top);
      ctx.strokeStyle = 'rgba(80, 90, 100, 0.8)';
      ctx.lineWidth = Math.max(1, ppm * 0.04);
      ctx.beginPath();
      for (let k = 1; k <= 5; k++) {
        const y = top + ppm * 0.3 * k;
        const reach = ((xb - xa) / 2 - ppm) * (k / 5);
        ctx.moveTo(mid, y);
        ctx.lineTo(mid - reach, deck);
        ctx.moveTo(mid, y);
        ctx.lineTo(mid + reach, deck);
      }
      ctx.stroke();
    }
    // railing
    ctx.strokeStyle = '#d9d6cf';
    ctx.lineWidth = Math.max(1, ppm * 0.07);
    ctx.beginPath();
    ctx.moveTo(xa - ppm * 0.2, deck - ppm * 0.9);
    ctx.lineTo(xb + ppm * 0.2, deck - ppm * 0.9);
    for (let x = a; x <= b; x += 1.5) {
      ctx.moveTo(this.sx(x), deck);
      ctx.lineTo(this.sx(x), deck - ppm * 0.9);
    }
    ctx.stroke();
  }

  // Water standing in dips (flooded roads, river fords, tanks, gorge streams). Drawn over
  // the vehicle, see-through, so whatever wades in looks half under water.
  drawWater(game) {
    const x0 = this.viewLeft();
    const x1 = this.viewRight();
    for (const s of game.terrain.sections) {
      if (s.level === undefined || s.x1 < x0 || s.x0 > x1) continue;
      this.drawPools(game, s, Math.max(s.x0, x0), Math.min(s.x1, x1));
    }
  }

  drawPools(game, s, from, to) {
    const { ctx, ppm } = this;
    const level = s.level;
    const top = this.sy(level);
    let start = null;
    const pools = [];
    for (let x = from; x <= to + 0.25; x += 0.25) {
      const wet = x <= to && game.height(x) < level;
      if (wet && start === null) start = x;
      if (!wet && start !== null) {
        pools.push([start, x - 0.25]);
        start = null;
      }
    }
    const river = s.water === 'river';
    const lake = s.water === 'lake';
    for (const [a, b] of pools) {
      ctx.fillStyle = river ? 'rgba(96, 150, 150, 0.72)' : lake ? 'rgba(84, 140, 160, 0.74)' : 'rgba(78, 132, 126, 0.78)';
      ctx.beginPath();
      ctx.moveTo(this.sx(a), top);
      ctx.lineTo(this.sx(b), top);
      for (let x = b; x >= a; x -= 0.25) ctx.lineTo(this.sx(x), this.sy(game.height(x)));
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.fillRect(this.sx(a), top - 1, this.sx(b) - this.sx(a), 2);
      if (river) {
        // current streaks and white water where the bed is shallow
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        for (let x = Math.ceil(a); x < b - 0.5; x += 0.9) {
          const t = (this.time * 0.6 + hash(x)) % 1;
          ctx.fillRect(this.sx(x + t * 0.9), top + ppm * (0.1 + hash(x + 2) * 0.5), ppm * (0.3 + hash(x + 1) * 0.4), Math.max(1, ppm * 0.04));
        }
        continue;
      }
      // floating lotus pads, a pink flower or two, and reeds at the edges
      for (let x = Math.ceil(a); x < b - 0.5; x += 1.4) {
        if (hash(x * 1.9) < 0.4) continue;
        const px = this.sx(x + hash(x) * 0.5);
        ctx.fillStyle = '#5c9a4a';
        ctx.beginPath();
        ctx.ellipse(px, top, ppm * 0.3, ppm * 0.08, 0, 0, TAU);
        ctx.fill();
        if (hash(x + 3) < 0.3) {
          ctx.fillStyle = lake ? '#8f9be8' : '#f2a7c3'; // blue water lilies (nil manel) in the tanks
          ctx.beginPath();
          ctx.ellipse(px + ppm * 0.08, top - ppm * 0.12, ppm * 0.1, ppm * 0.13, 0, 0, TAU);
          ctx.fill();
        }
      }
      ctx.strokeStyle = '#6f8f3a';
      ctx.lineWidth = Math.max(1, ppm * 0.04);
      ctx.beginPath();
      for (const ex of [a + 0.3, a + 0.6, b - 0.3, b - 0.6]) {
        const px = this.sx(ex);
        ctx.moveTo(px, top + ppm * 0.1);
        ctx.lineTo(px + ppm * 0.05, top - ppm * (0.5 + hash(ex) * 0.3));
      }
      ctx.stroke();
    }
  }

  drawSigns(game) {
    const { ctx, ppm } = this;
    const left = this.viewLeft();
    const right = this.viewRight() + 4;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // hazard warnings before tough sections
    const hard = game.map.hard;
    for (const s of game.terrain.sections) {
      if (!hard[s.type]) continue;
      const x = s.x0 - 6;
      if (x < left || x > right) continue;
      const gx = this.sx(x);
      const gy = this.sy(game.height(x));
      ctx.fillStyle = '#6b6b66';
      ctx.fillRect(gx - ppm * 0.05, gy - ppm * 2.2, ppm * 0.1, ppm * 2.2);
      const d = ppm * 0.62;
      const cy = gy - ppm * 2.5;
      ctx.beginPath();
      ctx.moveTo(gx, cy - d);
      ctx.lineTo(gx + d, cy);
      ctx.lineTo(gx, cy + d);
      ctx.lineTo(gx - d, cy);
      ctx.closePath();
      ctx.fillStyle = '#f7c600';
      ctx.fill();
      ctx.lineWidth = ppm * 0.07;
      ctx.strokeStyle = '#111';
      ctx.stroke();
      ctx.fillStyle = '#111';
      ctx.font = `900 ${Math.round(ppm * 0.6)}px system-ui, sans-serif`;
      ctx.fillText('!', gx, cy + 1);
      ctx.font = `800 ${Math.round(ppm * 0.28)}px "Baloo 2", system-ui, sans-serif`;
      const label = hard[s.type].toUpperCase();
      const tw = ctx.measureText(label).width + ppm * 0.3;
      ctx.fillStyle = '#f7c600';
      ctx.fillRect(gx - tw / 2, cy + d + ppm * 0.08, tw, ppm * 0.4);
      ctx.fillStyle = '#111';
      ctx.fillText(label, gx, cy + d + ppm * 0.29);
    }

    // town boards
    const first = Math.max(SIGN_EVERY, Math.ceil((left - 3) / SIGN_EVERY) * SIGN_EVERY);
    for (let d = first; d + 3 < right; d += SIGN_EVERY) {
      const x = d + 3;
      const gx = this.sx(x);
      const gy = this.sy(game.height(x));
      const towns = game.map.towns;
      const town = towns[(d / SIGN_EVERY - 1) % towns.length];
      ctx.font = `700 ${Math.round(ppm * 0.38)}px "Baloo 2", system-ui, sans-serif`;
      const label = `${town}  ${d} m`;
      const bw = ctx.measureText(label).width + ppm * 0.6;
      ctx.fillStyle = '#4a4a46';
      for (const px of [-bw * 0.35, bw * 0.35]) ctx.fillRect(gx + px - ppm * 0.05, gy - ppm * 2.6, ppm * 0.1, ppm * 2.6);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(gx - bw / 2 + 3, gy - ppm * 3.25 + 3, bw, ppm * 0.9);
      const g = ctx.createLinearGradient(0, gy - ppm * 3.25, 0, gy - ppm * 2.35);
      g.addColorStop(0, '#2a8a4c');
      g.addColorStop(1, '#17603a');
      ctx.fillStyle = g;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(gx - bw / 2, gy - ppm * 3.25, bw, ppm * 0.9, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.fillText(label, gx, gy - ppm * 2.8);
    }
  }

  drawRocks(game) {
    const { ctx, ppm } = this;
    for (const r of game.terrain.rocks) {
      const cx = this.sx(r.x);
      if (cx < -100 || cx > this.w + 100) continue;
      const cy = this.sy(r.y);
      if (r.kind === 'wreck') {
        this.drawWreck(r, cx, cy);
        continue;
      }
      const coral = r.kind === 'coral';
      const rubble = r.kind === 'rubble';
      const g = ctx.createLinearGradient(cx - r.r * ppm, cy - r.r * ppm, cx + r.r * ppm, cy + r.r * ppm);
      if (coral) {
        // sun-bleached coral rock: pink-orange to sandy
        g.addColorStop(0, r.shade < 0.5 ? '#f6b49a' : '#f3d3b0');
        g.addColorStop(1, r.shade < 0.5 ? '#b5614c' : '#a88560');
      } else if (rubble) {
        g.addColorStop(0, '#c9c5bc'); // broken concrete
        g.addColorStop(1, '#7d7970');
      } else {
        const base = 120 + r.shade * 30;
        g.addColorStop(0, `rgb(${base + 40}, ${base + 35}, ${base + 30})`);
        g.addColorStop(1, `rgb(${base - 50}, ${base - 55}, ${base - 55})`);
      }
      if (coral) {
        // knobbly crown (drawing only; physics uses the plain outline)
        ctx.fillStyle = r.shade < 0.5 ? '#e48f74' : '#dcb994';
        ctx.beginPath();
        for (let k = 0; k < 4; k++) {
          const kx = cx + (k - 1.5) * r.r * ppm * 0.5;
          const ky = cy - r.r * ppm * (0.5 + hash(r.x + k) * 0.2);
          const kr = r.r * ppm * (0.22 + hash(r.x * 3 + k) * 0.12);
          ctx.moveTo(kx + kr, ky);
          ctx.arc(kx, ky, kr, 0, TAU);
        }
        ctx.fill();
      }
      ctx.fillStyle = g;
      ctx.strokeStyle = coral ? 'rgba(110, 50, 35, 0.6)' : 'rgba(40, 35, 30, 0.7)';
      ctx.lineWidth = Math.max(1, ppm * 0.04);
      ctx.beginPath();
      r.verts.forEach(([vx, vy], i) => {
        const px = cx + vx * ppm;
        const py = cy - vy * ppm;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.beginPath();
      ctx.ellipse(cx - r.r * ppm * 0.3, cy - r.r * ppm * 0.4, r.r * ppm * 0.35, r.r * ppm * 0.15, -0.4, 0, TAU);
      ctx.fill();
      if (rubble) {
        // rusty rebar poking out
        ctx.strokeStyle = '#8a4b2a';
        ctx.lineWidth = Math.max(1, ppm * 0.035);
        ctx.beginPath();
        for (let k = 0; k < 3; k++) {
          const px = cx + (k - 1) * r.r * ppm * 0.6;
          ctx.moveTo(px, cy - r.r * ppm * 0.2);
          ctx.lineTo(px + (hash(r.x + k) - 0.5) * ppm * 0.4, cy - r.r * ppm * (0.7 + hash(r.x * 2 + k) * 0.5));
        }
        ctx.stroke();
      }
      if (coral) {
        // polyp pits
        ctx.fillStyle = 'rgba(120, 60, 40, 0.35)';
        ctx.beginPath();
        for (let k = 0; k < 9; k++) {
          const px = cx + (hash(r.x * 7 + k) - 0.5) * r.r * ppm * 2;
          const py = cy - (hash(r.x * 5 + k) - 0.3) * r.r * ppm * 0.7;
          const pr = Math.max(1, r.r * ppm * 0.05);
          ctx.moveTo(px + pr, py);
          ctx.arc(px, py, pr, 0, TAU);
        }
        ctx.fill();
      }
    }
  }

  // Wrecked vehicles, drawn in metres around the physics trapezoid (y up): the vehicle
  // fills the flat top (x within +-tw, y up to h), debris and planks fill the ramps.
  drawWreck(r, cx, cy) {
    const { ctx, ppm } = this;
    const { hw, h, run, model } = r;
    const tw = hw - run;
    const colours = ['#c0392b', '#ecf0f1', '#2c3e50', '#2f6db5', '#95a5a6', '#d4ac0d'];
    const paint = model === 'van' ? '#f1f1ec' : colours[Math.floor(r.shade * colours.length)];
    const lw = 1 / ppm;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(ppm, -ppm);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const poly = (pts, fill, edge = 'rgba(0, 0, 0, 0.45)') => {
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      if (edge) {
        ctx.strokeStyle = edge;
        ctx.lineWidth = lw * 1.5;
        ctx.stroke();
      }
    };
    const box = (x0, y0, x1, y1, rad, fill) => {
      ctx.beginPath();
      ctx.roundRect(x0, y0, x1 - x0, y1 - y0, rad);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.lineWidth = lw * 1.5;
      ctx.stroke();
    };
    const wheel = (x, y, rad = 0.3) => {
      ctx.fillStyle = '#18191b';
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#9aa1a7';
      ctx.beginPath();
      ctx.arc(x, y, rad * 0.45, 0, TAU);
      ctx.fill();
    };
    const lights = (yFront, yBack, size = 0.14) => {
      ctx.fillStyle = '#f5f0d8';
      ctx.fillRect(tw - 0.06, yFront - size / 2, 0.08, size);
      ctx.fillStyle = '#c1121f';
      ctx.fillRect(-tw - 0.02, yBack - size / 2, 0.08, size);
    };

    // debris ramps: rubble heaped under two leaning planks at each end
    for (const side of [-1, 1]) {
      poly([[side * hw, -0.15], [side * tw, -0.15], [side * tw, h]], '#6b6259', null);
      ctx.fillStyle = 'rgba(160, 150, 138, 0.9)';
      for (let k = 0; k < 6; k++) {
        const t = hash(r.x * 3 + k + side);
        const x = side * (tw + run * t * 0.85);
        const y = (1 - t) * h * 0.6 * hash(r.x + k * 7 + side);
        ctx.beginPath();
        ctx.arc(x, y, 0.07 + hash(k + r.x) * 0.08, 0, TAU);
        ctx.fill();
      }
      // an old tyre in the heap
      ctx.strokeStyle = '#1c1c1e';
      ctx.lineWidth = 0.09;
      ctx.beginPath();
      ctx.arc(side * (tw + run * 0.55), 0.13, 0.17, 0, TAU);
      ctx.stroke();
      for (const [off, c] of [[0, '#9a7448'], [0.12, '#7d5c37']]) {
        ctx.strokeStyle = c;
        ctx.lineWidth = 0.1;
        ctx.beginPath();
        ctx.moveTo(side * (hw + 0.05), -0.03 + off * 0.3);
        ctx.lineTo(side * (tw - 0.05), h - 0.04 - off);
        ctx.stroke();
      }
    }

    if (model === 'flipped') {
      // on its roof: crushed cabin at the bottom, underside on top, wheels in the air
      poly([[-tw + 0.75, -0.15], [tw - 1, -0.15], [tw - 0.6, 0.35], [-tw + 0.45, 0.35]], '#1b2630');
      ctx.strokeStyle = 'rgba(210, 225, 235, 0.7)';
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(-0.6, -0.1);
      ctx.lineTo(-0.3, 0.25);
      ctx.lineTo(0.1, 0.0);
      ctx.moveTo(0.5, 0.3);
      ctx.lineTo(0.8, -0.05);
      ctx.stroke();
      for (const x of [-tw + 1.4, 0.05, tw - 1.45]) poly([[x - 0.07, -0.15], [x + 0.07, -0.15], [x + 0.07, 0.35], [x - 0.07, 0.35]], paint); // pillars
      box(-tw, 0.3, tw, h - 0.08, 0.18, paint);
      ctx.fillStyle = '#2d2f33'; // underside: floor pan and exhaust
      ctx.fillRect(-tw + 0.2, h - 0.12, tw * 2 - 0.4, 0.12);
      ctx.strokeStyle = '#7d8187';
      ctx.lineWidth = 0.05;
      ctx.beginPath();
      ctx.moveTo(-tw + 0.3, h - 0.02);
      ctx.lineTo(tw - 0.9, h - 0.02);
      ctx.stroke();
      for (const x of [-tw + 0.75, tw - 0.75]) wheel(x, h - 0.2, 0.28);
      lights(0.55, 0.55);
    } else if (model === 'crushed') {
      // upright but pancaked: the roof is squashed down onto the doors
      for (const x of [-tw + 0.7, tw - 0.75]) wheel(x, 0.12, 0.27);
      box(-tw, 0.15, tw, h - 0.12, 0.16, paint);
      for (const x of [-tw + 0.7, tw - 0.75]) {
        ctx.fillStyle = '#18191b'; // wheel arches
        ctx.beginPath();
        ctx.arc(x, 0.12, 0.33, 0, Math.PI);
        ctx.fill();
        wheel(x, 0.12, 0.27);
      }
      poly([[-tw + 0.35, h - 0.14], [tw - 0.6, h - 0.14], [tw - 0.85, h], [-tw + 0.55, h]], paint); // flattened roof
      ctx.fillStyle = '#1b2630';
      ctx.fillRect(-tw + 0.55, h - 0.12, tw * 2 - 1.3, 0.09); // windows squashed to slits
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.lineWidth = lw * 1.3;
      ctx.beginPath(); // crumpled bonnet and door seams
      ctx.moveTo(tw - 0.1, h - 0.2);
      for (let k = 1; k < 6; k++) ctx.lineTo(tw - 0.1 - k * 0.15, h - 0.2 - (k % 2) * 0.1);
      ctx.moveTo(-0.1, 0.2);
      ctx.lineTo(-0.1, h - 0.15);
      ctx.moveTo(-tw + 1.3, 0.2);
      ctx.lineTo(-tw + 1.3, h - 0.15);
      ctx.stroke();
      lights(0.45, 0.45);
    } else {
      // a delivery van, crushed and dented
      for (const x of [-tw + 0.75, tw - 0.8]) wheel(x, 0.12, 0.3);
      box(-tw, 0.15, tw - 0.75, h, 0.12, paint);
      poly([[tw - 0.8, 0.15], [tw, 0.15], [tw, 0.55], [tw - 0.45, h], [tw - 0.8, h]], paint); // cab
      poly([[tw - 0.7, 0.62], [tw - 0.08, 0.58], [tw - 0.45, h - 0.08], [tw - 0.7, h - 0.08]], '#1b2630');
      ctx.fillStyle = '#2f6db5';
      ctx.fillRect(-tw + 0.1, 0.42, tw * 2 - 0.95, 0.1);
      for (const x of [-tw + 0.75, tw - 0.8]) {
        ctx.fillStyle = '#18191b';
        ctx.beginPath();
        ctx.arc(x, 0.12, 0.36, 0, Math.PI);
        ctx.fill();
        wheel(x, 0.12, 0.3);
      }
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.lineWidth = lw * 1.3;
      ctx.beginPath(); // a big dent in the side
      ctx.moveTo(-0.6, h - 0.1);
      ctx.quadraticCurveTo(-0.2, 0.55, 0.3, h - 0.15);
      ctx.stroke();
      lights(0.35, 0.6, 0.18);
    }

    ctx.fillStyle = 'rgba(200, 230, 250, 0.85)'; // broken glass on the road
    for (let k = 0; k < 7; k++) ctx.fillRect(-hw - 0.6 + hash(r.x + k) * (hw * 2 + 1.2), -0.03, 0.06, 0.04);
    // traffic cone on the approach
    if (r.shade > 0.4) {
      const x = -hw - 1;
      ctx.fillStyle = '#f26b1d';
      ctx.beginPath();
      ctx.moveTo(x - 0.18, 0);
      ctx.lineTo(x, 0.6);
      ctx.lineTo(x + 0.18, 0);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(x - 0.1, 0.25, 0.2, 0.08);
      ctx.fillStyle = '#222';
      ctx.fillRect(x - 0.25, -0.02, 0.5, 0.05);
    }
    // a thin trail of smoke from the engine end
    if (r.shade < 0.6) {
      for (let k = 0; k < 3; k++) {
        const t = (this.time * 0.35 + k / 3 + r.shade) % 1;
        ctx.fillStyle = `rgba(90, 90, 95, ${(1 - t) * 0.3})`;
        ctx.beginPath();
        ctx.arc(tw - 0.5 - t * 0.6, h + 0.2 + t * 2.4, 0.18 + t * 0.55, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  drawPickups(game) {
    const { ctx, ppm } = this;
    const bob = Math.sin(game.time * 4) * 0.08;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const c of game.coins) {
      if (c.taken) continue;
      const x = this.sx(c.x);
      const y = this.sy(c.y + bob);
      if (x < -50 || x > this.w + 50) continue;
      const r = ppm * 0.32;
      const squash = Math.abs(Math.cos(game.time * 3 + c.x));
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
      g.addColorStop(0, '#fff3a0');
      g.addColorStop(0.5, '#f2b705');
      g.addColorStop(1, '#b07d00');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, r * (0.35 + 0.65 * squash), r, 0, 0, TAU);
      ctx.fill();
      if (squash > 0.5) {
        ctx.fillStyle = '#7a5200';
        ctx.font = `800 ${Math.round(ppm * 0.26)}px system-ui, sans-serif`;
        ctx.fillText('Rs', x, y + 1);
      }
    }
    for (const f of game.fuels) {
      if (f.taken) continue;
      const x = this.sx(f.x);
      const y = this.sy(f.y + bob);
      if (x < -50 || x > this.w + 50) continue;
      const s = ppm * 0.45;
      const g = ctx.createLinearGradient(x - s, 0, x + s, 0);
      g.addColorStop(0, '#ff5a4f');
      g.addColorStop(1, '#a01818');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(x - s, y - s * 1.1, s * 2, s * 2.2, s * 0.3);
      ctx.fill();
      ctx.fillStyle = '#222';
      ctx.fillRect(x + s * 0.2, y - s * 1.45, s * 0.6, s * 0.4);
      ctx.strokeStyle = '#222';
      ctx.lineWidth = s * 0.18;
      ctx.beginPath();
      ctx.moveTo(x - s * 0.6, y - s * 1.1);
      ctx.lineTo(x - s * 0.6, y - s * 1.4);
      ctx.lineTo(x, y - s * 1.4);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = `800 ${Math.round(s * 1.1)}px system-ui, sans-serif`;
      ctx.fillText('F', x, y + 2);
    }
    this.drawNitros(game, bob);
  }

  // Nitro bottle: blue cylinder with a chrome valve and a flame badge.
  drawNitros(game, bob) {
    const { ctx, ppm } = this;
    for (const n of game.nitros) {
      if (n.taken) continue;
      const x = this.sx(n.x);
      const y = this.sy(n.y + bob);
      if (x < -50 || x > this.w + 50) continue;
      const s = ppm * 0.3;
      const tilt = Math.sin(game.time * 3 + n.x) * 0.15;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(tilt);
      const glow = ctx.createRadialGradient(0, 0, s * 0.5, 0, 0, s * 3);
      glow.addColorStop(0, 'rgba(80, 200, 255, 0.45)');
      glow.addColorStop(1, 'rgba(80, 200, 255, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, s * 3, 0, TAU);
      ctx.fill();
      const g = ctx.createLinearGradient(-s, 0, s, 0);
      g.addColorStop(0, '#0b4fb3');
      g.addColorStop(0.35, '#4fb6ff');
      g.addColorStop(1, '#083a85');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(-s, -s * 1.5, s * 2, s * 3.1, s * 0.8);
      ctx.fill();
      ctx.fillStyle = '#d5dade'; // valve
      ctx.fillRect(-s * 0.35, -s * 2.05, s * 0.7, s * 0.6);
      ctx.fillRect(-s * 0.7, -s * 2.2, s * 1.4, s * 0.25);
      ctx.fillStyle = '#ff9f1c'; // flame badge
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.85);
      ctx.quadraticCurveTo(s * 0.75, -s * 0.1, s * 0.4, s * 0.6);
      ctx.quadraticCurveTo(0, s * 0.95, -s * 0.4, s * 0.6);
      ctx.quadraticCurveTo(-s * 0.75, -s * 0.1, 0, -s * 0.85);
      ctx.fill();
      ctx.fillStyle = '#fff3b0';
      ctx.beginPath();
      ctx.ellipse(0, s * 0.35, s * 0.2, s * 0.3, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  // Blue-white jet out of the exhaust while nitro is burning.
  drawNitroFlame(game) {
    if (game.boost <= 0 || game.over) return;
    const { ctx, ppm } = this;
    const [ex, ey] = ART[game.vehicle.id].exhaust;
    const p = game.chassis.getWorldPoint({ x: ex, y: ey });
    const a = game.chassis.getAngle();
    const fade = Math.min(1, game.boost / 0.4); // shrinks as the boost runs out
    const len = ppm * (1.4 + Math.random() * 0.6) * fade;
    const w = ppm * 0.22 * fade;
    ctx.save();
    ctx.translate(this.sx(p.x), this.sy(p.y));
    ctx.rotate(-a);
    ctx.globalCompositeOperation = 'lighter';
    for (const [l, ww, c0, c1] of [[len, w, 'rgba(60, 140, 255, 0.9)', 'rgba(60, 140, 255, 0)'], [len * 0.55, w * 0.55, 'rgba(255, 255, 255, 0.95)', 'rgba(160, 220, 255, 0)']]) {
      const g = ctx.createLinearGradient(0, 0, -l, 0);
      g.addColorStop(0, c0);
      g.addColorStop(1, c1);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, -ww);
      ctx.quadraticCurveTo(-l * 0.5, -ww * 0.9, -l, 0);
      ctx.quadraticCurveTo(-l * 0.5, ww * 0.9, 0, ww);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  drawShadow(game) {
    const { ctx, ppm } = this;
    const p = game.chassis.getPosition();
    const ground = game.height(p.x);
    const above = Math.max(0, p.y - ground - 0.5);
    const alpha = Math.max(0, 0.35 - above * 0.05);
    if (alpha <= 0) return;
    ctx.fillStyle = `rgba(20, 10, 5, ${alpha})`;
    ctx.beginPath();
    ctx.ellipse(this.sx(p.x), this.sy(ground) + 2, ppm * (ART[game.vehicle.id].half + above * 0.1), ppm * 0.18, 0, 0, TAU);
    ctx.fill();
  }

  updateSmoke(game, input, dt) {
    const { ctx, ppm } = this;
    const art = ART[game.vehicle.id];
    if (input.gas && game.fuel > 0 && !game.over && Math.random() < (art.smoke ?? 0.55)) {
      const [ex, ey] = art.exhaust;
      const p = game.chassis.getWorldPoint({ x: ex, y: ey });
      this.smoke.push({ x: p.x, y: p.y, r: 0.1, life: 1 });
    }
    for (const s of this.smoke) {
      s.life -= dt * 1.3;
      s.r += dt * 0.7;
      s.y += dt * 0.9;
      s.x -= dt * 0.6;
    }
    this.smoke = this.smoke.filter((s) => s.life > 0);
    for (const s of this.smoke) {
      ctx.fillStyle = `rgba(110, 110, 115, ${s.life * 0.3})`;
      ctx.beginPath();
      ctx.arc(this.sx(s.x), this.sy(s.y), s.r * ppm, 0, TAU);
      ctx.fill();
    }
  }

  // Driver's upper body lags behind the vehicle's acceleration (damped spring).
  updateLean(game, dt) {
    if (dt <= 0) return;
    const v = game.chassis.getLinearVelocity();
    const a = game.chassis.getAngle();
    if (!this.prevVel) this.prevVel = { x: v.x, y: v.y };
    const ax = (v.x - this.prevVel.x) / dt;
    const ay = (v.y - this.prevVel.y) / dt;
    this.prevVel = { x: v.x, y: v.y };
    // acceleration in the tuk tuk's local frame
    const lx = Math.cos(a) * ax + Math.sin(a) * ay;
    const ly = -Math.sin(a) * ax + Math.cos(a) * ay;
    const L = this.lean;
    const stiff = 120;
    const damp = 14;
    L.vx += (-stiff * L.x - damp * L.vx - lx * 0.9) * dt;
    L.vy += (-stiff * L.y - damp * L.vy - ly * 0.9) * dt;
    L.x = Math.max(-0.08, Math.min(0.08, L.x + L.vx * dt));
    L.y = Math.max(-0.06, Math.min(0.06, L.y + L.vy * dt));
  }

  // ---- foreground ----------------------------------------------------------
  drawForeground(map) {
    const { ctx, w, h } = this;
    const off = this.cam.x * this.ppm * 1.3;
    const spacing = 90;
    for (let i = Math.floor(off / spacing) - 1; i < (off + w) / spacing + 1; i++) {
      if (hash(i * 2.3) < 0.45) continue;
      const x = i * spacing - off + hash(i) * 50;
      const ht = h * (0.08 + hash(i + 1) * 0.08);
      ctx.fillStyle = map.foreground;
      for (let f = -3; f <= 3; f++) {
        const tipX = x + f * ht * 0.22;
        ctx.beginPath();
        ctx.moveTo(x - 6, h + 4);
        ctx.quadraticCurveTo(x + f * ht * 0.08, h - ht * 0.6, tipX, h - ht * (1 - Math.abs(f) * 0.15));
        ctx.quadraticCurveTo(x + f * ht * 0.12 + 6, h - ht * 0.5, x + 6, h + 4);
        ctx.fill();
      }
    }
  }

  // ---- the vehicle ---------------------------------------------------------
  drawVehicle(game) {
    const p = game.chassis.getPosition();
    this.paintPose(game.vehicle.id, game.skin, p.x, p.y, game.chassis.getAngle(), wheelPoses(game), this.lean);
  }

  paintPose(id, skin, x, y, angle, wheels, lean) {
    const { ctx, ppm } = this;
    ctx.save();
    ctx.translate(this.sx(x), this.sy(y));
    ctx.rotate(-angle);
    ctx.scale(ppm, -ppm); // draw in metres, y up
    paintVehicle(ctx, id, { skin, wheels, lean, blit: (key, bounds, paint) => this.sprite(key, bounds, paint) });
    ctx.restore();
  }

  // ---- race ------------------------------------------------------------------
  // Rivals: bots from their own physics copy of the road, the ghost from its recorded run.
  drawRivals(race) {
    const { ctx } = this;
    const left = this.viewLeft() - 3;
    const right = this.viewRight() + 3;
    const still = { x: 0, y: 0 };
    for (const r of race.rivals) {
      if (r.left) continue; // a friend who dropped out of an online race
      let x, y, angle, wheels;
      if (r.game) {
        ({ x, y } = r.game.chassis.getPosition());
        angle = r.game.chassis.getAngle();
        wheels = wheelPoses(r.game);
      } else {
        ({ x, y, angle } = r.pose);
        wheels = r.vehicle.wheels.map((w) => ({ ...w, spin: -x / w.r })); // at rest on the springs
      }
      if (x < left || x > right) continue;
      ctx.globalAlpha = r.kind === 'ghost' ? 0.55 : 0.92;
      this.paintPose(r.vehicle.id, r.skin, x, y, angle, wheels, still);
      ctx.globalAlpha = 1;
    }
  }

  // A pennant beside each checkpoint board (green once you're through), and a
  // chequered gantry over the finish line.
  drawRaceMarks(game, race) {
    const { ctx, ppm } = this;
    const left = this.viewLeft() - 6;
    const right = this.viewRight() + 6;
    const last = race.checkpoints.length - 1;
    race.checkpoints.forEach((c, i) => {
      if (c.x < left || c.x > right) return;
      if (i < last) {
        const gx = this.sx(c.x + 3.2);
        const gy = this.sy(game.height(c.x + 3.2));
        ctx.fillStyle = '#d9d9d4';
        ctx.fillRect(gx - ppm * 0.04, gy - ppm * 3.4, ppm * 0.08, ppm * 3.4);
        ctx.fillStyle = race.player.cp >= i ? '#2fbf6b' : '#f4a300';
        ctx.beginPath();
        ctx.moveTo(gx + ppm * 0.04, gy - ppm * 3.4);
        ctx.lineTo(gx + ppm * 1.1, gy - ppm * 3.05);
        ctx.lineTo(gx + ppm * 0.04, gy - ppm * 2.7);
        ctx.fill();
        return;
      }
      // finish: two posts either side of the line, a chequered beam and a FINISH banner
      const x0 = this.sx(c.x - 2.5);
      const x1 = this.sx(c.x + 2.5);
      const top = Math.min(this.sy(game.height(c.x - 2.5)), this.sy(game.height(c.x + 2.5))) - ppm * 4.6;
      ctx.fillStyle = '#2b2b2e';
      for (const px of [c.x - 2.5, c.x + 2.5]) {
        const gx = this.sx(px);
        ctx.fillRect(gx - ppm * 0.1, top, ppm * 0.2, this.sy(game.height(px)) - top);
      }
      const sq = ppm * 0.25;
      for (let k = 0; x0 + k * sq < x1; k++) {
        for (let row = 0; row < 2; row++) {
          ctx.fillStyle = (k + row) % 2 ? '#111' : '#fff';
          ctx.fillRect(x0 + k * sq, top + row * sq, Math.min(sq, x1 - x0 - k * sq), sq);
        }
      }
      ctx.fillStyle = '#d62828';
      ctx.fillRect(x0 + ppm * 0.6, top + sq * 2, x1 - x0 - ppm * 1.2, ppm * 0.6);
      ctx.fillStyle = '#fff';
      ctx.font = `800 ${Math.round(ppm * 0.45)}px "Baloo 2", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('FINISH', (x0 + x1) / 2, top + sq * 2 + ppm * 0.31);
      // chequered line across the road
      const gy = this.sy(game.height(c.x));
      for (let k = 0; k < 6; k++) {
        ctx.fillStyle = k % 2 ? '#111' : '#fff';
        ctx.fillRect(this.sx(c.x) - sq, gy - sq * 0.5 + (k - 3) * sq * 0.5, sq, sq * 0.5);
        ctx.fillStyle = k % 2 ? '#fff' : '#111';
        ctx.fillRect(this.sx(c.x), gy - sq * 0.5 + (k - 3) * sq * 0.5, sq, sq * 0.5);
      }
    });
  }

  // Static parts are pre-rendered once (in local metres, y up) and then just
  // blitted with the current transform: far cheaper than ~100 path fills.
  sprite(key, [x0, y0, x1, y1], paint) {
    let img = this.sprites[key];
    if (!img) {
      const scale = this.ppm * this.dpr;
      const canvas = new OffscreenCanvas(Math.ceil((x1 - x0) * scale), Math.ceil((y1 - y0) * scale));
      const c = canvas.getContext('2d');
      c.setTransform(scale, 0, 0, -scale, -x0 * scale, y1 * scale);
      c.lineJoin = 'round';
      c.lineCap = 'round';
      paint(c);
      img = this.sprites[key] = canvas.transferToImageBitmap();
    }
    const { ctx } = this;
    ctx.save();
    ctx.scale(1, -1);
    ctx.drawImage(img, x0, -y1, x1 - x0, y1 - y0);
    ctx.restore();
  }
}

// Wheel positions and spin in the chassis frame, as paintVehicle wants them.
function wheelPoses(game) {
  const ch = game.chassis;
  const angle = ch.getAngle();
  return game.wheels.map((w) => {
    const lp = ch.getLocalPoint(w.body.getPosition());
    return { x: lp.x, y: lp.y, r: w.r, spin: w.body.getAngle() - angle };
  });
}

/** Draw a vehicle at rest into a small canvas, for the garage. */
export function drawVehicleThumb(canvas, vehicle, skin) {
  const art = ART[vehicle.id];
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || canvas.width;
  const h = canvas.clientHeight || canvas.height;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  const [x0, , x1, y1] = art.bounds;
  const y0 = Math.min(...vehicle.wheels.map((wh) => wh.y - wh.r));
  const scale = Math.min((w * 0.92) / (x1 - x0), (h * 0.9) / (y1 - y0));
  ctx.setTransform(dpr * scale, 0, 0, -dpr * scale, (dpr * w) / 2 - dpr * scale * ((x0 + x1) / 2), (dpr * h) / 2 + dpr * scale * ((y0 + y1) / 2));
  const wheels = vehicle.wheels.map((wh) => ({ ...wh, spin: 0 }));
  paintVehicle(ctx, vehicle.id, {
    skin,
    wheels,
    lean: { x: 0, y: 0 },
    blit: (key, bounds, paint) => {
      ctx.save();
      paint(ctx);
      ctx.restore();
    },
  });
}

/** Paint a little postcard of a map for the map page: three of its landmarks, then the road. */
export function drawMapPreview(canvas, map) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 320;
  const h = canvas.clientHeight || 140;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const base = h * 0.74;
  // misty hills far off (the sky itself is the canvas's CSS background)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w; x += 6) ctx.lineTo(x, base - h * 0.12 - Math.sin(x * 0.02 + map.id.length) * h * 0.06 - Math.sin(x * 0.051) * h * 0.03);
  ctx.lineTo(w, h);
  ctx.fill();
  if (map.id === 'coast') {
    const sea = ctx.createLinearGradient(0, base - h * 0.05, 0, h);
    sea.addColorStop(0, '#2c7fb0');
    sea.addColorStop(1, '#69cfd0');
    ctx.fillStyle = sea;
    ctx.fillRect(0, base - h * 0.05, w, h);
  }
  const ids = [...new Set(Object.values(map.landmarks))].filter((id) => LANDMARKS[id]);
  const picks = ids.length <= 3 ? ids : [ids[0], ids[Math.floor(ids.length / 2)], ids[ids.length - 1]];
  const tallest = Math.max(...picks.map((id) => LANDMARKS[id].height));
  const s = Math.min((base - h * 0.08) / tallest, w / (picks.length * 12.5));
  picks.forEach((id, i) => {
    ctx.save();
    ctx.translate((w * (i + 0.5)) / picks.length, base);
    ctx.scale(s, s);
    ctx.lineJoin = 'round';
    LANDMARKS[id].draw(ctx);
    ctx.restore();
  });
  // the road in front: soil, verge and a grass line, in the map's own colours
  const G = map.ground;
  const road = (x) => h * 0.84 - Math.sin(x * 0.018 + 1) * h * 0.05;
  const soil = ctx.createLinearGradient(0, h * 0.78, 0, h);
  soil.addColorStop(0, G.soil[0]);
  soil.addColorStop(1, G.soil[1]);
  ctx.fillStyle = soil;
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w; x += 4) ctx.lineTo(x, road(x));
  ctx.lineTo(w, h);
  ctx.fill();
  for (const [color, width, dy] of [[G.verge[0], 5, 2], [G.verge[1], 2, 0]]) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 4) ctx.lineTo(x, road(x) + dy);
    ctx.stroke();
  }
}
