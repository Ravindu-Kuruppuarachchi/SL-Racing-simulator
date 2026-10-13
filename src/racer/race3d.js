// A 3D race (or a free drive): the cars on one route, item boxes and power-ups, boost
// pads, coins, positions and the finish. No three.js here, so it runs headless in tests.
//
// Power-ups, from item boxes (cars further back get the better ones):
//   rocket   a homing Vesak rocket that spins out the car it reaches
//   coconut  three coconuts lobbed ahead; they lie on the road until someone hits them
//   oil      an oil slick dropped behind
//   shield   blocks the next hit (for a few seconds)
//   boost    nitro
import { Car, carStats } from './car.js';
import { aiInput } from './ai.js';
import { ROAD_HALF } from './track.js';

export const ITEMS = {
  rocket: { name: 'Vesak Rocket', icon: '🚀' },
  coconut: { name: 'Coconut Bombs', icon: '🥥' },
  oil: { name: 'Oil Slick', icon: '🛢️' },
  shield: { name: 'Shield', icon: '🛡️' },
  boost: { name: 'Nitro', icon: '🔥' },
};

export const RACE3D = {
  countdown: 3,
  boxRespawn: 3, // seconds
  padBoost: 1.2,
  rocketSpeed: 62,
  coinValue: 5,
  prizes: [300, 180, 110, 70, 40, 20],
};

// [rocket, coconut, oil, shield, boost] weights by place (0 = leading, 1 = last)
function rollItem(rand, place) {
  const w = [0.5 + 2 * place, 1.2, 1.6 - place, 1.2 - 0.6 * place, 0.6 + 1.6 * place];
  let x = rand() * w.reduce((a, b) => a + b);
  const kinds = Object.keys(ITEMS);
  for (let i = 0; i < kinds.length; i++) if ((x -= w[i]) < 0) return kinds[i];
  return 'boost';
}

export class Race3D {
  /**
   * track: a Track. racers: [{ vehicle, upgrades, skin, kind: 'player'|'bot'|'remote', id?, name? }]
   * (the first 'player' is you). free: a free drive (no countdown, no finish).
   * clock: real time in seconds, for online races: finish times then use it, so a phone
   * too slow to keep up (its physics runs in slow motion) can't post a flattering time.
   */
  constructor(track, racers, { free = false, rand = Math.random, clock = null } = {}) {
    this.track = track;
    this.rand = rand;
    this.free = free;
    this.clock = clock;
    this.startClock = null;
    this.time = free ? 0 : -RACE3D.countdown;
    this.cars = racers.map((r, i) => {
      // starting grid: rows of two, staggered, behind the line
      const row = Math.floor(i / 2);
      const car = new Car(track, r.vehicle, carStats(r.vehicle, r.upgrades), { s: 30 - row * 7 - (i % 2) * 2, d: i % 2 ? 2.6 : -2.6 });
      return Object.assign(car, {
        kind: r.kind,
        id: r.id ?? i,
        name: r.name ?? r.vehicle.name,
        skin: r.skin,
        lane: ((i * 0.37) % 1) * 2 - 1,
        skill: 0.7 + rand() * 0.25,
        finishTime: null,
        itemCooldown: 0,
        coins: 0,
        target: null, // remote cars: the latest pose from the network
      });
    });
    this.player = this.cars.find((c) => c.kind === 'player');
    this.boxes = track.boxes.map((b) => ({ ...b, gone: 0 }));
    this.coins = track.coins.map((c) => ({ ...c, taken: false }));
    this.hazards = []; // rockets in flight, coconuts, oil slicks
    this.finishers = [];
    this.events = []; // { text } for the HUD
    this.fired = []; // items the player used this step (sent to friends online)
  }

  get counting() {
    return this.time < 0;
  }

  get done() {
    return !this.free && this.player.finishTime !== null;
  }

  /** Everyone in race order: finishers by time, then by distance along the road. */
  get standings() {
    return [...this.cars].sort((a, b) => (a.finishTime ?? Infinity) - (b.finishTime ?? Infinity) || b.s - a.s);
  }

  placeOf(car) {
    return this.standings.indexOf(car) + 1;
  }

  say(text) {
    this.events.push({ text, t: this.time });
  }

  /** input: { steer, brake, fire } for the player. */
  step(input, dt) {
    this.time += dt;
    if (this.time < 0) return; // waiting on the grid
    if (this.clock && this.startClock === null) this.startClock = this.clock();
    this.fired.length = 0;
    const order = this.standings;
    for (const car of this.cars) {
      if (car.kind === 'remote') {
        this.followRemote(car, dt);
        continue;
      }
      const finished = car.finishTime !== null;
      let control;
      if (car.kind === 'player' && !finished) control = input;
      else {
        control = aiInput(car, this.cars.filter((o) => o !== car), { lane: car.lane, skill: car.skill, obstacles: this.obstaclesAhead(car) });
        if (finished) control.brake = car.v > 8; // roll to a stop past the line
      }
      if (car.kind === 'bot') {
        this.rubberBand(car);
        this.unstick(car, dt);
      }
      car.update(control, dt);
      this.hitObstacles(car);
      if (!finished) this.checkFinish(car);
      car.itemCooldown = Math.max(0, car.itemCooldown - dt);
      if (car.item && (car.kind === 'player' ? input.fire : this.botWantsItem(car, order))) this.useItem(car);
    }
    this.collide();
    this.pickups(order, dt);
    this.moveHazards(dt);
  }

  // Bots ease off when far ahead of you and push when far behind, so races stay close.
  rubberBand(car) {
    if (!this.player || this.free) return;
    const gap = car.s - this.player.s;
    const k = gap > 60 ? Math.max(0.9, 1 - (gap - 60) / 800) : gap < -60 ? Math.min(1.08, 1 + (-gap - 60) / 900) : 1;
    car.stats.top = car.baseTop ??= car.stats.top;
    car.stats.top = car.baseTop * k;
  }

  checkFinish(car) {
    if (this.free || !(car.s >= this.track.finish)) return;
    car.finishTime = car === this.player && this.clock ? this.clock() - this.startClock : this.time;
    this.finishers.push(car);
    if (car === this.player) this.say(this.finishers.length === 1 ? 'You win!' : `Finished ${this.finishers.length}`);
    else if (this.finishers.length === 1) this.say(`${car.name} wins!`);
  }

  // An AI car that has been stuck (on an obstacle, or wedged) for a while is put back on
  // the road a little further on, where it's clear. Players never get this.
  unstick(car, dt) {
    car.stuckTime = Math.abs(car.v) < 2 && car.spin === 0 && !this.counting ? (car.stuckTime ?? 0) + dt : 0;
    if (car.stuckTime < 2.5) return;
    car.stuckTime = 0;
    const t = this.track;
    let s = car.s + 6;
    while (t.obstacles.some((o) => Math.abs(o.s - s) < o.hs + 3)) s += 3;
    Object.assign(car, { s, d: 0, psi: 0, phi: 0, v: 8, y: t.heightAt(s), vy: 0, grounded: true });
  }

  // ---- obstacles on the road ---------------------------------------------------------
  /** Solid obstacles in the next stretch of road, where they are now (for the AI). */
  obstaclesAhead(car) {
    const t = this.track;
    return t.obstacles.filter((o) => o.solid && o.s > car.s - 2 && o.s < car.s + 70).map((o) => ({ s: o.s, d: t.obstacleD(o, this.time), hd: o.hd }));
  }

  hitObstacles(car) {
    const t = this.track;
    for (const o of t.obstacles) {
      const ds = car.s - o.s;
      if (Math.abs(ds) > 8) continue;
      const od = t.obstacleD(o, this.time);
      const dd = car.d - od;
      const reachS = o.hs + 1.1;
      const reachD = o.hd + car.stats.halfWidth;
      if (Math.abs(ds) > reachS || Math.abs(dd) > reachD) continue;
      if (car.y - t.heightAt(o.s) > o.h + 0.2) continue; // flying over it
      if (!o.solid) {
        if (car.obstacleCooldown > 0 || !car.grounded) continue;
        car.obstacleCooldown = 0.6;
        if (o.kind === 'pothole') {
          car.v *= 0.82;
          car.vy = 3.2; // a jolt up out of the hole
          car.grounded = false;
          car.jolt = 0.8;
        } else {
          car.v *= 0.88; // a puddle: splash, slow down
          car.splash = 1;
        }
        continue;
      }
      if (reachS - Math.abs(ds) < reachD - Math.abs(dd)) {
        // nose (or tail) first: bounce back, and spin if it was hard
        car.s = o.s + Math.sign(ds || -1) * reachS;
        const impact = Math.abs(car.v);
        car.v *= -0.15;
        // glance off towards the side of the obstacle the car was on, rather than hitting it again
        const away = Math.sign(dd || (od > 0 ? -1 : 1));
        car.psi += away * 0.35;
        car.phi = car.psi;
        car.d += away * 0.3;
        car.crash = Math.min(1, impact / 20);
        if (impact > 14) car.spin = Math.max(car.spin, 0.55);
        if (car === this.player && impact > 8) this.say(o.kind === 'elephant' ? 'Mind the elephant!' : 'Crash!');
      } else {
        // a glancing blow: pushed aside, losing a little speed
        car.d = od + Math.sign(dd) * reachD;
        car.phi *= 0.3;
        car.v *= 0.85;
        car.crash = Math.max(car.crash, 0.35);
      }
    }
  }

  // ---- cars bumping into each other ----------------------------------------------------
  collide() {
    const cars = this.cars;
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i];
        const b = cars[j];
        const ds = b.s - a.s;
        const dd = b.d - a.d;
        if (Math.abs(ds) > 3.4 || Math.abs(dd) > 1.8 || Math.abs(a.y - b.y) > 1.5) continue;
        const wa = b.stats.mass / (a.stats.mass + b.stats.mass); // a's share of the shove
        const wb = 1 - wa;
        const remote = (c) => c.kind === 'remote'; // their own phone moves them
        if (1.8 - Math.abs(dd) < 3.4 - Math.abs(ds)) {
          // side by side: push apart sideways
          const push = (1.8 - Math.abs(dd)) * Math.sign(dd || 1);
          if (!remote(a)) a.d -= push * (remote(b) ? 1 : wa);
          if (!remote(b)) b.d += push * (remote(a) ? 1 : wb);
        } else {
          // nose to tail: the one behind is pushed back and slows, the one in front gets a nudge
          const [back, front] = ds > 0 ? [a, b] : [b, a];
          const overlap = 3.4 - Math.abs(ds);
          if (!remote(back)) back.s -= overlap * (remote(front) ? 1 : 0.5);
          if (!remote(front)) front.s += overlap * (remote(back) ? 0 : 0.5);
          const dv = back.v - front.v;
          if (dv > 0) {
            if (!remote(back)) back.v -= dv * (front.stats.mass / (back.stats.mass + front.stats.mass));
            if (!remote(front)) front.v += dv * 0.4 * (back.stats.mass / (back.stats.mass + front.stats.mass));
          }
        }
      }
    }
  }

  // ---- item boxes, boost pads, coins -----------------------------------------------------
  pickups(order, dt) {
    const n = this.cars.length;
    for (const box of this.boxes) box.gone = Math.max(0, box.gone - dt);
    for (const car of this.cars) {
      if (car.kind === 'remote') continue;
      for (const box of this.boxes) {
        if (box.gone > 0 || Math.abs(box.s - car.s) > 1.8 || Math.abs(box.d - car.d) > 1.4 || car.y - this.track.heightAt(box.s) > 2) continue;
        box.gone = RACE3D.boxRespawn;
        if (!car.item) {
          const place = n > 1 ? order.indexOf(car) / (n - 1) : 0.5;
          car.item = rollItem(this.rand, place);
          car.itemCooldown = 0.6; // bots don't fire the instant they get it
          if (car === this.player) this.say(ITEMS[car.item].name);
        }
      }
      for (const pad of this.track.pads) {
        if (Math.abs(pad.s - car.s) < 2.2 && Math.abs(pad.d - car.d) < 2 && car.grounded) car.boost = Math.max(car.boost, RACE3D.padBoost);
      }
      if (car !== this.player) continue;
      for (const coin of this.coins) {
        if (!coin.taken && Math.abs(coin.s - car.s) < 1.6 && Math.abs(coin.d - car.d) < 1.3 && car.y - this.track.heightAt(coin.s) < 2.5) {
          coin.taken = true;
          car.coins += RACE3D.coinValue;
        }
      }
    }
  }

  // ---- power-ups ---------------------------------------------------------------------
  botWantsItem(car, order) {
    if (car.itemCooldown > 0 || car.spin > 0) return false;
    const ahead = this.cars.filter((o) => o !== car && o.s > car.s);
    const behind = this.cars.filter((o) => o !== car && o.s < car.s);
    const near = (list, range) => list.some((o) => Math.abs(o.s - car.s) < range);
    switch (car.item) {
      case 'rocket':
        return near(ahead, 110);
      case 'coconut':
        return near(ahead, 45);
      case 'oil':
        return near(behind, 30);
      case 'shield':
        return this.hazards.some((h) => h.kind === 'rocket' && h.target === car) || order.indexOf(car) === 0;
      case 'boost':
        return Math.abs(this.track.kappaAt(car.s + 30)) < 1 / 150;
      default:
        return false;
    }
  }

  useItem(car) {
    const kind = car.item;
    car.item = null;
    const shot = this.fire(car, kind);
    if (car === this.player) this.fired.push({ kind, s: car.s, d: car.d, seed: shot.seed });
  }

  /** Launch an item from `car` (also called for friends' items arriving online). */
  fire(car, kind, seed = Math.floor(this.rand() * 1e6)) {
    const t = this.track;
    if (kind === 'shield') car.shield = 6;
    else if (kind === 'boost') car.boost = Math.max(car.boost, car.stats.boostTime);
    else if (kind === 'rocket') {
      // homes on the nearest car ahead within range
      const target = this.cars.filter((o) => o !== car && o.s > car.s && o.s - car.s < 160).sort((a, b) => a.s - b.s)[0] ?? null;
      this.hazards.push({ kind, s: car.s + 3, d: car.d, y: car.y + 1, v: Math.max(RACE3D.rocketSpeed, car.v + 25), owner: car, target, ttl: 4.5 });
    } else if (kind === 'coconut') {
      [-1.6, 0, 1.6].forEach((off, i) => {
        const land = car.s + 16 + i * 6;
        this.hazards.push({ kind, s: car.s, d: car.d, y: car.y + 1.5, fromS: car.s, toS: land, toD: Math.max(-ROAD_HALF, Math.min(ROAD_HALF, car.d + off)), flight: 0, owner: car, ttl: 12 });
      });
    } else if (kind === 'oil') {
      this.hazards.push({ kind, s: Math.max(0, car.s - 4), d: car.d, y: t.heightAt(car.s - 4), owner: car, ownerGrace: 1.5, ttl: 14 });
    }
    return { seed };
  }

  moveHazards(dt) {
    const t = this.track;
    for (const h of this.hazards) {
      h.ttl -= dt;
      if (h.kind === 'rocket') {
        h.s += h.v * dt;
        if (h.target) h.d += Math.max(-9 * dt, Math.min(9 * dt, h.target.d - h.d)); // home in sideways
        h.y = t.heightAt(h.s) + 1;
        for (const car of this.cars) {
          if (car === h.owner || h.ttl <= 0) continue;
          if (Math.abs(car.s - h.s) < 2.6 && Math.abs(car.d - h.d) < 1.7) {
            if (car.kind !== 'remote') this.hitCar(car, 1.6, h.owner, 'rocket');
            h.ttl = 0;
          }
        }
      } else if (h.kind === 'coconut' && h.flight < 1) {
        h.flight = Math.min(1, h.flight + dt / 0.7);
        h.s = h.fromS + (h.toS - h.fromS) * h.flight;
        h.d = h.d + (h.toD - h.d) * Math.min(1, dt * 6);
        h.y = t.heightAt(h.s) + 0.3 + Math.sin(Math.PI * h.flight) * 4;
      } else {
        // lying on the road: coconuts and oil
        h.ownerGrace = Math.max(0, (h.ownerGrace ?? 1) - dt);
        const r = h.kind === 'oil' ? [2.6, 1.9, 1.1] : [1.5, 1.2, 1.0];
        for (const car of this.cars) {
          if (h.ttl <= 0 || (car === h.owner && h.ownerGrace > 0) || car.kind === 'remote') continue;
          if (Math.abs(car.s - h.s) < r[0] && Math.abs(car.d - h.d) < r[1] && car.y - t.heightAt(h.s) < 1) {
            this.hitCar(car, r[2], h.owner, h.kind);
            h.ttl = 0;
          }
        }
      }
    }
    this.hazards = this.hazards.filter((h) => h.ttl > 0);
  }

  hitCar(car, seconds, by, kind) {
    const hurt = car.hit(seconds);
    if (car === this.player) this.say(hurt ? 'Spun out!' : 'Shield blocked it!');
    else if (by === this.player && hurt) this.say(kind === 'rocket' ? 'Direct hit!' : 'Got one!');
  }

  // ---- friends online ------------------------------------------------------------------
  // A friend's car is placed where their phone says it is (gliding between updates).
  followRemote(car, dt) {
    const t = car.target;
    if (!t) return;
    const k = Math.min(1, dt * 10);
    if (Math.abs(t.s - car.s) > 25) Object.assign(car, { s: t.s, d: t.d }); // too far: snap
    car.s += (t.s + t.v * 0.07 - car.s) * k; // aim a little ahead: the update is already old
    car.d += (t.d - car.d) * k;
    car.psi += (t.psi - car.psi) * k;
    car.v = t.v;
    car.y = t.y;
    car.grounded = t.grounded;
    car.spin = t.spin;
    car.spinAngle = t.spinAngle;
    car.boost = t.boost;
    car.shield = t.shield;
  }

  remotePose(id, pose) {
    const car = this.cars.find((c) => c.kind === 'remote' && c.id === id);
    if (car) car.target = pose;
  }

  remoteFire(id, kind) {
    const car = this.cars.find((c) => c.kind === 'remote' && c.id === id);
    if (car) this.fire(car, kind);
  }

  remoteFinish(id, time) {
    const car = this.cars.find((c) => c.kind === 'remote' && c.id === id);
    if (car && car.finishTime === null) {
      car.finishTime = time;
      this.finishers.push(car);
      if (this.finishers.length === 1 && car !== this.player) this.say(`${car.name} wins!`);
    }
  }
}
