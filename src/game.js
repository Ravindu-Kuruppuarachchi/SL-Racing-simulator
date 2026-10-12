// Core game simulation: physics world, terrain, vehicle, pickups.
// No DOM access here, so it can run headless (see scripts/sim-test.js).
import { World, Vec2, Chain, Box, Circle, Polygon, WheelJoint } from 'planck';
import { Terrain, SAMPLE, mulberry32 } from './terrain.js';
import { getMap } from './maps.js';
import { getVehicle, vehicleStats } from './vehicles.js';

export const STEP = 1 / 60;
const CHUNK = 50; // metres of terrain per physics chunk
export const LC = { lookahead: 0.4, band: 0.3 }; // launch control tuning
const WATER_DRAG = 2; // per second, per metre of water depth
// Nitro: a rocket push along the chassis for `time` seconds (in m/s², fading out above
// `topSpeed`). Taking off from an uphill slope while boosting adds up to `launch` m/s of
// upward speed, and `lift` (m/s²) keeps the vehicle climbing for the rest of the boost.
// `steady` damps rotation while boosting (per second), `level` pulls a rising nose back down.
// After a boost, each touchdown gets `settle` seconds of strong spin damping (`calm`, per
// second) with rotation capped at `spinCap` rad/s, so a fast landing can't send it spinning.
export const NITRO = { time: 2.5, max: 3, thrust: 16, ramp: 8, launch: 10, lift: 3, topSpeed: 38, steady: 4, level: 70, settle: 0.7, calm: 12, spinCap: 2.5, fullBonus: 25 };

export class Game {
  constructor(vehicleId, upgrades, seed = Math.floor(Math.random() * 1e9), mapId = 'hills') {
    this.vehicle = getVehicle(vehicleId);
    this.stats = vehicleStats(this.vehicle, upgrades);
    this.seed = seed;
    this.map = getMap(mapId);
    this.terrain = new Terrain(seed, this.map);
    this.rand = mulberry32(seed * 31 + 7);
    this.world = new World({ gravity: new Vec2(0, -10) });
    this.chunks = new Map(); // index -> body
    this.coins = []; // {x, y, taken}
    this.fuels = [];
    this.nitros = [];
    this.nitroRand = mulberry32(seed * 17 + 3); // own stream, so coins and fuel stay where they were
    this.nextNitroX = 70 + this.nitroRand() * 50;
    this.nitroCharges = 0;
    this.boost = 0; // seconds of nitro left
    this.nitroAfter = false; // landing assist armed: boosted, and not yet settled back on the wheels
    this.settle = 0; // seconds of landing assist left
    this.calmTime = 0;
    this.nitroHeld = false;
    this.nextCoinX = 30;
    this.nextFuelX = 140;
    this.fuelGap = 140;
    this.generatedTo = 0;

    this.fuel = this.stats.tank;
    this.coinsEarned = 0;
    this.time = 0;
    this.over = null; // reason string when finished
    this.events = []; // UI messages: {text, t}
    this.wheelContacts = 0;
    this.airTime = 0;
    this.airStartAngle = 0;
    this.stillTime = 0;
    this.stallX = 0;
    this.keepBehind = 80; // metres of road kept loaded behind the car (races respawn backwards)

    this.ensureTerrain(150);
    this.buildVehicle();
    this.world.on('begin-contact', (c) => this.onContact(c, 1));
    this.world.on('end-contact', (c) => this.onContact(c, -1));
    // let the vehicle settle onto the road before the run starts
    for (let i = 0; i < 45; i++) this.world.step(STEP, 8, 3);
  }

  // ---- terrain -----------------------------------------------------------
  height(x) {
    return this.terrain.height(x);
  }

  ensureTerrain(toX) {
    while (this.generatedTo < toX) {
      const i = Math.round(this.generatedTo / CHUNK);
      this.buildChunk(i);
      this.generatedTo = (i + 1) * CHUNK;
      this.placePickups(this.generatedTo);
    }
  }

  buildChunk(i) {
    const x0 = i * CHUNK;
    const verts = [];
    for (let k = 0; k <= CHUNK / SAMPLE; k++) {
      const x = x0 + k * SAMPLE;
      verts.push(new Vec2(x, this.height(x)));
    }
    if (i === 0) verts.unshift(new Vec2(-30, 30), new Vec2(-30, 0)); // back wall
    const body = this.world.createBody({ type: 'static', userData: 'ground' });
    body.createFixture({ shape: new Chain(verts, false), friction: this.map.friction });
    for (const rock of this.terrain.rocks) {
      if (rock.x < x0 || rock.x >= x0 + CHUNK) continue;
      const pts = rock.verts.map(([vx, vy]) => new Vec2(rock.x + vx, rock.y + vy));
      body.createFixture({ shape: new Polygon(pts), friction: 0.8 });
    }
    // cave roofs belong to the chunk the cave starts in, with sloping rock faces over each mouth
    for (const s of this.terrain.sections) {
      if (!s.roof || s.x0 < x0 || s.x0 >= x0 + CHUNK) continue;
      const [first, last] = [s.roof[0], s.roof.at(-1)];
      const pts = [[first[0] - 2, first[1] + 5], ...s.roof, [last[0] + 2, last[1] + 5]];
      body.createFixture({ shape: new Chain(pts.map(([x, y]) => new Vec2(x, y)), false), friction: 0.6 });
    }
    this.chunks.set(i, body);
  }

  // ground height including the top of any wreck lying there (pickups sit above wrecks)
  surface(x) {
    let y = this.height(x);
    for (const r of this.terrain.rocks) {
      if (r.kind !== 'wreck' || Math.abs(x - r.x) > r.hw) continue;
      const top = r.y + Math.min(r.h, ((r.hw - Math.abs(x - r.x)) / r.run) * (r.h + 0.15) - 0.15);
      y = Math.max(y, top);
    }
    return y;
  }

  placePickups(x1) {
    while (this.nextCoinX < x1) {
      const n = 4 + Math.floor(this.rand() * 4);
      for (let k = 0; k < n; k++) {
        const x = this.nextCoinX + k * 1.6;
        this.coins.push({ x, y: this.surface(x) + 1.1, taken: false });
      }
      this.nextCoinX += 35 + this.rand() * 45;
    }
    while (this.nextFuelX < x1) {
      const x = this.nextFuelX;
      this.fuels.push({ x, y: this.surface(x) + 1.0, taken: false });
      this.fuelGap += 25;
      this.nextFuelX += this.fuelGap;
    }
    const nitroAt = (x) => this.nitros.push({ x, y: this.surface(x) + 1.1, taken: false });
    while (this.nextNitroX < x1) {
      nitroAt(this.nextNitroX);
      this.nextNitroX += 110 + this.nitroRand() * 130;
    }
    // about half the kicker ramps get a bottle on the run-up, to try a nitro launch
    for (const s of this.terrain.sections) {
      if (s.type !== 'kicker' || s.nitro !== undefined || s.x0 >= x1) continue;
      const x = s.x0 - 22;
      s.nitro = x > 40 && this.nitroRand() < 0.5 && !this.nitros.some((n) => Math.abs(n.x - x) < 30);
      if (s.nitro) nitroAt(x);
    }
  }

  dropOldTerrain(carX) {
    for (const [i, body] of this.chunks) {
      if ((i + 1) * CHUNK < carX - this.keepBehind) {
        this.world.destroyBody(body);
        this.chunks.delete(i);
      }
    }
    const behind = this.keepBehind;
    this.terrain.rocks = this.terrain.rocks.filter((r) => r.x > carX - behind);
    this.coins = this.coins.filter((c) => c.x > carX - behind / 2);
    this.fuels = this.fuels.filter((f) => f.x > carX - behind / 2);
    this.nitros = this.nitros.filter((n) => n.x > carX - behind / 2);
  }

  // ---- vehicle -----------------------------------------------------------
  buildVehicle() {
    const w = this.world;
    const v = this.vehicle;
    // spawn with every wheel just above the flat start
    const start = new Vec2(3, Math.max(...v.wheels.map((wh) => wh.r - wh.y)) + 0.3);
    const chassis = w.createBody({ type: 'dynamic', position: start, userData: 'car' });
    for (const f of v.fixtures) {
      let shape;
      if (f.box) {
        const [hx, hy, cx, cy] = f.box;
        shape = new Box(hx, hy, new Vec2(cx, cy), 0);
      } else if (f.poly) {
        shape = new Polygon(f.poly.map(([x, y]) => new Vec2(x, y)));
      } else {
        const [r, cx, cy] = f.circle;
        shape = new Circle(new Vec2(cx, cy), r);
      }
      chassis.createFixture({ shape, density: f.density, friction: 0.5, userData: f.head ? 'head' : null });
    }

    this.chassis = chassis;
    this.wheels = v.wheels.map((wh, i) => {
      const p = new Vec2(start.x + wh.x, start.y + wh.y);
      const body = w.createBody({ type: 'dynamic', position: p, userData: 'wheel' });
      body.createFixture({ shape: new Circle(wh.r), density: 1, friction: this.stats.grip, userData: 'wheel' });
      const joint = w.createJoint(
        new WheelJoint(
          {
            enableMotor: true,
            maxMotorTorque: this.stats.torque,
            motorSpeed: 0,
            frequencyHz: this.stats.suspension,
            dampingRatio: v.damping,
          },
          chassis,
          body,
          p,
          new Vec2(0, 1),
        ),
      );
      return { body, joint, r: wh.r, drive: v.drive[i] };
    });
    this.rear = this.wheels[0];
    // the vehicle's extent in chassis-local metres (body and wheels), for picking things up
    const xs = [];
    const ys = [];
    for (const f of v.fixtures) {
      if (f.box) {
        const [hx, hy, cx, cy] = f.box;
        xs.push(cx - hx, cx + hx);
        ys.push(cy - hy, cy + hy);
      } else if (f.poly) for (const [x, y] of f.poly) xs.push(x), ys.push(y);
      else {
        const [r, cx, cy] = f.circle;
        xs.push(cx - r, cx + r);
        ys.push(cy - r, cy + r);
      }
    }
    for (const wh of v.wheels) xs.push(wh.x - wh.r, wh.x + wh.r), ys.push(wh.y - wh.r);
    this.extent = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    this.front = this.wheels[this.wheels.length - 1];
  }

  onContact(contact, delta) {
    const a = contact.getFixtureA();
    const b = contact.getFixtureB();
    const isGround = (f) => f.getBody().getUserData() === 'ground';
    const other = isGround(a) ? b : isGround(b) ? a : null;
    if (!other) return;
    const tag = other.getUserData();
    if (tag === 'head' && delta > 0 && !this.over) this.over = 'Crashed!';
    if (tag === 'wheel') this.wheelContacts += delta;
  }

  // ---- loop --------------------------------------------------------------
  get distance() {
    return Math.max(0, Math.floor(this.chassis.getPosition().x - 3));
  }

  get speed() {
    return this.chassis.getLinearVelocity().x;
  }

  /** input: { gas: bool, brake: bool, nitro: bool } (nitro fires on press) */
  step(input) {
    if (this.over) return;
    this.time += STEP;
    const hasFuel = this.fuel > 0;
    const gas = input.gas && hasFuel;
    const brake = input.brake && hasFuel;

    if (input.nitro && !this.nitroHeld && this.nitroCharges > 0 && this.boost <= 0) {
      this.nitroCharges--;
      this.boost = NITRO.time;
      this.say('NITRO!');
    }
    this.nitroHeld = !!input.nitro;

    let motor = 0;
    if (gas) motor = -this.stats.speed * (this.boost > 0 ? 1.5 : 1);
    else if (brake) motor = this.stats.speed * 0.6;
    const throttle = this.launchControl();
    for (const wh of this.wheels) {
      wh.joint.setMotorSpeed(motor);
      // gas drives each wheel by its share, brakes work on all; otherwise coast
      const torque = brake ? this.stats.torque : gas ? this.stats.torque * wh.drive * throttle : 0.6;
      wh.joint.setMaxMotorTorque(torque);
    }

    // Hill Climb style tilt control: gas leans back, brake leans forward.
    const tilt = this.vehicle.tilt[this.wheelContacts > 0 ? 0 : 1];
    if (gas) this.chassis.applyTorque(tilt * throttle);
    if (brake) this.chassis.applyTorque(-tilt);

    this.waterDrag();
    this.nitroPush();
    this.world.step(STEP, 8, 3);

    // fuel
    this.fuel = Math.max(0, this.fuel - STEP * (gas ? 3.2 : 1.6) * this.vehicle.fuelUse);

    const pos = this.chassis.getPosition();
    this.ensureTerrain(pos.x + 120);
    this.dropOldTerrain(pos.x);
    this.collect();
    this.landingAssist(); // before trackAir, which resets airTime on touchdown
    this.trackAir();

    if (!hasFuel) {
      // out of fuel: end once we stop making forward progress (rolling back and
      // forth in a dip counts as stuck)
      if (pos.x > this.stallX + 0.5) {
        this.stallX = pos.x;
        this.stillTime = 0;
      } else this.stillTime += STEP;
      if (this.stillTime > 3) this.over = 'Out of fuel!';
    } else this.stallX = pos.x;
  }

  nitroPush() {
    if (this.boost <= 0) return;
    this.boost = Math.max(0, this.boost - STEP);
    const mass = this.chassis.getMass() + this.wheels.reduce((m, wh) => m + wh.body.getMass(), 0);
    const a = this.chassis.getAngle();
    const dir = new Vec2(Math.cos(a), Math.sin(a));
    const v = this.chassis.getLinearVelocity();
    const along = v.x * dir.x + v.y * dir.y;
    const fade = Math.min(1, Math.max(0, 1 - (along - NITRO.topSpeed) / 10));
    const force = dir.mul(mass * NITRO.thrust * fade);
    // how steeply we're climbing: 0 on the flat, 1 up a steep ramp
    const ramp = Math.min(1, Math.max(0, (Math.atan2(v.y, Math.abs(v.x)) - 0.08) / 0.27));
    if (this.wheelContacts > 0) {
      force.y += mass * NITRO.ramp * ramp; // press up the ramp
      this.launched = false;
    } else {
      if (!this.launched && ramp > 0) {
        // just left an uphill slope: launch every body together, so the suspension doesn't stretch
        for (const b of [this.chassis, ...this.wheels.map((wh) => wh.body)]) {
          const bv = b.getLinearVelocity();
          b.setLinearVelocity(new Vec2(bv.x, Math.max(bv.y, 0) + NITRO.launch * ramp));
        }
        this.say('LIFT OFF!');
      }
      if (!this.launched) this.lift = ramp; // remember the take-off for the rest of the boost
      this.launched = true;
      force.y += mass * NITRO.lift * this.lift;
    }
    // Every body gets its share by mass, so the whole vehicle accelerates as one. (Pushing
    // only the chassis drags the wheels along by the axles, below its centre, which
    // pitches the nose up and spins the vehicle in the air.)
    for (const b of [this.chassis, ...this.wheels.map((wh) => wh.body)]) b.applyForceToCenter(force.clone().mul(b.getMass() / mass), true);
    this.nitroStabilise();
  }

  // While nitro burns, hold the vehicle steady: damp any rotation, and on the ground stop
  // the boosted drive wheels lifting the nose past half the vehicle's wheelie angle.
  nitroStabilise() {
    const c = this.chassis;
    const inertia = this.inertia();
    let torque = -c.getAngularVelocity() * NITRO.steady * inertia;
    if (this.wheelContacts > 0) {
      const tip = this.chassis.getAngle() - this.groundAngle();
      const over = tip - Math.round(tip / (Math.PI * 2)) * Math.PI * 2 - this.vehicle.wheelie * 0.5;
      if (over > 0) torque -= over * NITRO.level * inertia;
    }
    c.applyTorque(torque, true);
  }

  /** Rotational inertia of the whole vehicle about the chassis centre. */
  inertia() {
    const c = this.chassis;
    return c.getInertia() + this.wheels.reduce((sum, wh) => sum + wh.body.getMass() * Vec2.distanceSquared(wh.body.getPosition(), c.getWorldCenter()), 0);
  }

  // Nitro-speed landings hit the wheels far harder than normal ones, and the bounce can
  // send the vehicle spinning. After a boost, every touchdown is damped for a moment,
  // until the vehicle has been back on its wheels for a second.
  landingAssist() {
    if (this.boost > 0) {
      this.nitroAfter = true;
      this.calmTime = 0;
    }
    if (!this.nitroAfter) return;
    const onGround = this.wheelContacts > 0;
    if (onGround && this.airTime > 0.1) this.settle = NITRO.settle; // touchdown
    this.settle = Math.max(0, this.settle - STEP);
    this.calmTime = onGround && this.boost <= 0 ? this.calmTime + STEP : 0;
    if (this.calmTime > 1 && this.settle <= 0) {
      this.nitroAfter = false;
      return;
    }
    if (this.settle <= 0) return;
    const c = this.chassis;
    const w = c.getAngularVelocity();
    if (Math.abs(w) > NITRO.spinCap) c.setAngularVelocity(Math.sign(w) * NITRO.spinCap);
    c.applyTorque(-c.getAngularVelocity() * NITRO.calm * this.inertia(), true);
  }

  /** The water section at x (river ford, lake, gorge stream), if any. */
  waterAt(x) {
    return this.terrain.sections.findLast((s) => s.drag && x >= s.x0 && x <= s.x1);
  }

  // Wading slows the whole vehicle down in proportion to how deep the water is (up to 1 m).
  waterDrag() {
    for (const b of [this.chassis, ...this.wheels.map((wh) => wh.body)]) {
      const p = b.getPosition();
      const s = this.waterAt(p.x);
      if (!s) continue;
      const depth = Math.min(1, s.level - this.height(p.x));
      if (depth <= 0 || p.y > s.level + 2) continue; // flying over it
      const v = b.getLinearVelocity();
      const k = WATER_DRAG * depth * b.getMass();
      b.applyForceToCenter(new Vec2(-v.x * k, -v.y * k), true);
    }
  }

  // The engine's reaction torque lifts the nose. While on the ground, ease off
  // as the nose rises relative to the road (and while it's pitching up fast),
  // so holding full gas can't flip a powerful vehicle by itself.
  /** Road angle under the rear wheel (the pivot when the nose lifts). */
  groundAngle() {
    const x = this.rear.body.getPosition().x;
    return Math.atan2(this.height(x + 0.5) - this.height(x - 0.5), 1);
  }

  launchControl() {
    if (this.wheelContacts <= 0) return 1;
    const a = this.chassis.getAngle() - this.groundAngle();
    const tip = a - Math.round(a / (Math.PI * 2)) * Math.PI * 2; // wrap to [-PI, PI]
    // look ahead: where the nose will be shortly at the current pitch rate
    const ahead = tip + this.chassis.getAngularVelocity() * LC.lookahead;
    return Math.min(1, Math.max(0, 1 - (ahead - this.vehicle.wheelie) / LC.band));
  }

  collect() {
    // A pickup is collected when it touches the vehicle's body or wheels, wherever the
    // vehicle is and however it's tilted. (A distance from the chassis centre missed
    // pickups that visibly passed through the wheels when flying low, e.g. on nitro.)
    const { x0, x1, y0, y1 } = this.extent;
    const R = 0.45; // pickup radius
    const near = (o) => {
      const p = this.chassis.getLocalPoint(new Vec2(o.x, o.y));
      return p.x > x0 - R && p.x < x1 + R && p.y > y0 - R && p.y < y1 + R;
    };
    for (const c of this.coins) {
      if (!c.taken && near(c)) {
        c.taken = true;
        this.coinsEarned += 5;
      }
    }
    for (const f of this.fuels) {
      if (!f.taken && near(f)) {
        f.taken = true;
        this.fuel = this.stats.tank;
        this.say('Fuel refilled!');
      }
    }
    for (const n of this.nitros) {
      if (n.taken || !near(n)) continue;
      // always picked up, so driving through one never seems to miss: with a full set
      // of charges it's worth coins instead
      n.taken = true;
      if (this.nitroCharges < NITRO.max) {
        this.nitroCharges++;
        this.say('Nitro +1');
      } else {
        this.coinsEarned += NITRO.fullBonus;
        this.say(`Nitro full! +${NITRO.fullBonus}`);
      }
    }
  }

  trackAir() {
    const angle = this.chassis.getAngle();
    if (this.wheelContacts <= 0) {
      if (this.airTime === 0) this.airStartAngle = angle;
      this.airTime += STEP;
      return;
    }
    if (this.airTime > 0) {
      const flips = Math.floor(Math.abs(angle - this.airStartAngle) / (Math.PI * 2) + 0.15);
      if (flips > 0) {
        const bonus = flips * 50;
        this.coinsEarned += bonus;
        this.say(flips > 1 ? `${flips}x Flip! +${bonus}` : `Flip! +${bonus}`);
      } else if (this.airTime > 1.2) {
        const bonus = Math.round(this.airTime * 10);
        this.coinsEarned += bonus;
        this.say(`Air time! +${bonus}`);
      }
    }
    this.airTime = 0;
  }

  /** Debug helper: move the tuk tuk to distance x, keeping its pose. */
  teleport(x) {
    this.ensureTerrain(x + 150);
    for (let i = Math.floor((x - 60) / CHUNK); i <= Math.floor((x + 150) / CHUNK); i++) {
      if (i >= 0 && !this.chunks.has(i)) this.buildChunk(i); // ground behind may have been unloaded
    }
    const p = this.chassis.getPosition();
    const dx = x - p.x;
    const dy = this.height(x) - this.height(p.x);
    for (const b of [this.chassis, ...this.wheels.map((wh) => wh.body)]) {
      const q = b.getPosition();
      b.setTransform({ x: q.x + dx, y: q.y + dy + 0.3 }, b.getAngle());
      b.setLinearVelocity({ x: 0, y: 0 });
    }
    this.dropOldTerrain(x);
  }

  /** Back on its wheels at x: upright on the road, at rest, with a full tank (race checkpoints). */
  respawn(x) {
    this.teleport(x);
    const v = this.vehicle;
    const slope = Math.atan2(this.height(x + 1) - this.height(x - 1), 2);
    const ground = Math.max(...v.wheels.map((wh) => this.surface(x + wh.x)));
    this.chassis.setTransform(new Vec2(x, ground + Math.max(...v.wheels.map((wh) => wh.r - wh.y)) + 0.3), slope);
    this.wheels.forEach((wh, i) => wh.body.setTransform(this.chassis.getWorldPoint(new Vec2(v.wheels[i].x, v.wheels[i].y)), slope));
    for (const b of [this.chassis, ...this.wheels.map((wh) => wh.body)]) {
      b.setLinearVelocity(new Vec2(0, 0));
      b.setAngularVelocity(0);
    }
    Object.assign(this, { fuel: this.stats.tank, over: null, boost: 0, nitroAfter: false, settle: 0, airTime: 0, stillTime: 0, stallX: x });
  }

  say(text) {
    this.events.push({ text, t: this.time });
  }
}
