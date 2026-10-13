// Arcade car handling for the 3D racer, worked out in road coordinates (track.js):
// s along the road, d across it, with headings measured from the road's direction.
// That keeps it stable and kart-like: you can't fall off the world, barriers line the
// road, jumps happen wherever the road drops away faster than you fall.
// No three.js here, so it runs headless in tests.
import { ROAD_HALF, WALL } from './track.js';

export const GRAVITY = 24; // a touch heavier than real: snappy, readable jumps
export const DRIFT_MIN = 0.7; // seconds of sliding before letting go gives a boost

// Racer upgrades (levels 0-5), bought in the garage.
export const UPGRADES = [
  { key: 'engine', name: 'Engine', effect: (l) => `Top speed +${l * 4} km/h` },
  { key: 'handling', name: 'Handling', effect: (l) => `Steering +${l * 6}%` },
  { key: 'tyres', name: 'Tyres', effect: (l) => `Grip +${l * 10}%` },
  { key: 'nitro', name: 'Nitro', effect: (l) => `Boosts +${(l * 0.25).toFixed(2)} s` },
];
export const NO_UPGRADES = { engine: 0, handling: 0, tyres: 0, nitro: 0 };

/** Handling numbers for a car (cars.js) at upgrade levels `up`. */
export function carStats(vehicle, up = NO_UPGRADES) {
  const r = vehicle.rating;
  return {
    top: 24 + r.power * 2.2 + up.engine * 1.1, // m/s: ~100-130 km/h before upgrades
    accel: 8 + r.power * 1.4 + up.engine * 0.6,
    turn: (1.5 + r.grip * 0.08) * (1 + up.handling * 0.06), // rad/s of yaw at full lock
    grip: (3.5 + r.grip * 0.5) * (1 + up.tyres * 0.1), // how fast the slide straightens out
    offroad: 0.6 + r.grip * 0.05, // speed kept on the verge
    boostTime: 2 + up.nitro * 0.25,
    mass: vehicle.mass ?? 1, // how hard it shoves others in a collision
    halfWidth: vehicle.halfWidth ?? 0.9,
  };
}

export class Car {
  constructor(track, vehicle, stats, { s = 0, d = 0 } = {}) {
    this.track = track;
    this.vehicle = vehicle;
    this.stats = stats;
    this.s = s;
    this.d = d;
    this.psi = 0; // where the car points, relative to the road (rad, + right)
    this.phi = 0; // where it's actually moving, relative to the road (slides lag behind psi)
    this.v = 0; // forward speed (m/s)
    this.y = track.heightAt(s); // absolute height of the car's base
    this.vy = 0;
    this.grounded = true;
    this.airTime = 0;
    this.spin = 0; // seconds of spin-out left
    this.spinAngle = 0;
    this.boost = 0; // seconds of boost left
    this.shield = 0; // seconds of shield left
    this.item = null; // the power-up held
    this.drift = 0; // 0..1, how sideways (for smoke and sound)
    this.driftCharge = 0; // seconds held in a slide: let go after long enough for a boost
    this.bump = 0; // a barrier hit this step (for effects)
    this.crash = 0; // an obstacle hit (0..1, for effects); decays
    this.jolt = 0; // a pothole or a hard landing (for camera shake); decays
    this.obstacleCooldown = 0;
  }

  get speedKmh() {
    return Math.abs(this.v) * 3.6;
  }

  /** Spin out (from a power-up hit). Returns false if a shield stopped it. */
  hit(seconds) {
    if (this.shield > 0) {
      this.shield = 0;
      return false;
    }
    this.spin = Math.max(this.spin, seconds);
    this.boost = 0;
    return true;
  }

  /** input: { steer: -1..1, brake: bool }. */
  update(input, dt) {
    const t = this.track;
    const st = this.stats;
    this.bump = 0;
    this.crash = Math.max(0, this.crash - dt * 2);
    this.jolt = Math.max(0, this.jolt - dt * 3);
    this.obstacleCooldown = Math.max(0, this.obstacleCooldown - dt);
    this.spin = Math.max(0, this.spin - dt);
    this.boost = Math.max(0, this.boost - dt);
    this.shield = Math.max(0, this.shield - dt);

    // ---- speed ------------------------------------------------------------------------
    const onTarmac = Math.abs(this.d) < ROAD_HALF;
    const ford = t.inFord(this.s);
    let top = st.top * (this.boost > 0 ? 1.4 : 1);
    if (this.grounded && !onTarmac) top *= st.offroad;
    if (ford && this.y < ford.level + 0.3) top *= 0.6;
    if (this.spin > 0) {
      this.v *= Math.exp(-2.5 * dt);
      this.spinAngle += 14 * dt * Math.min(1, this.spin * 2);
    } else {
      this.spinAngle *= Math.exp(-10 * dt); // settle back facing forward
      if (input.brake) {
        if (this.v > 1) this.v -= 28 * dt;
        else this.v = Math.max(this.v - 9 * dt, -9); // reverse
      } else if (this.v < top) {
        this.v += (this.boost > 0 ? st.accel * 2 : st.accel) * Math.max(0.15, 1 - this.v / top) * dt;
      } else this.v -= (this.v - top) * 2 * dt; // slowing to the verge's or water's limit
    }
    if (this.grounded) this.v -= GRAVITY * 0.35 * t.gradeAt(this.s) * dt; // climbs cost speed

    // ---- steering and sliding ---------------------------------------------------------
    // steering works even when nearly stopped (to get round something), strongest at middling speed
    const pace = Math.max(0.45, Math.min(1, Math.abs(this.v) / 10)) * (1 - 0.3 * Math.min(1, Math.abs(this.v) / st.top));
    const steer = this.spin > 0 || !Number.isFinite(input.steer) ? 0 : Math.max(-1, Math.min(1, input.steer)); // no input: straight ahead
    this.psi += steer * st.turn * pace * Math.sign(this.v || 1) * (this.grounded ? 1 : 0.35) * dt;
    const slip = this.psi - this.phi;
    this.phi += slip * Math.min(1, st.grip * (this.grounded ? 1 : 0.15) * dt);
    this.drift = Math.min(1, Math.abs(slip) * 3);
    this.v *= 1 - Math.min(0.5, Math.abs(slip) * 0.6) * dt; // sliding scrubs speed
    // drift boost: hold a slide through a bend, then straighten up for a burst of speed
    if (this.grounded && Math.abs(slip) > 0.1 && Math.abs(this.v) > 14 && this.spin === 0) this.driftCharge += dt;
    else {
      if (this.driftCharge > DRIFT_MIN) this.boost = Math.max(this.boost, Math.min(1.5, 0.45 + this.driftCharge * 0.5));
      this.driftCharge = 0;
    }

    // ---- move along the road ----------------------------------------------------------
    const k = t.kappaAt(this.s);
    const ds = (this.v * Math.cos(this.phi) * dt) / Math.max(0.3, 1 - k * this.d);
    this.s = Math.max(0, Math.min(t.length - 1, this.s + ds));
    this.d += this.v * Math.sin(this.phi) * dt;
    this.psi -= k * ds; // the road turns underneath the car
    this.phi -= k * ds;

    // barriers: bounce off, losing speed, turned back along the road
    const limit = WALL - st.halfWidth;
    if (Math.abs(this.d) > limit) {
      const side = Math.sign(this.d);
      this.d = side * limit;
      if (Math.sign(this.phi) === side) {
        this.bump = Math.min(1, Math.abs(Math.sin(this.phi)) * Math.abs(this.v) / 10);
        this.v *= 1 - 0.5 * Math.abs(Math.sin(this.phi));
        this.phi = -this.phi * 0.2;
        this.psi = this.phi + (this.psi - this.phi) * 0.3;
      }
    }

    // ---- up and down: follow the road, or fly where it drops away -------------------------
    const ground = t.heightAt(this.s);
    if (this.grounded) {
      const ballistic = this.y + this.vy * dt - 0.5 * GRAVITY * dt * dt;
      if (ballistic > ground + 0.03 && this.v > 8) {
        this.grounded = false;
        this.vy -= GRAVITY * dt;
        this.y = ballistic;
        this.airTime = 0;
      } else {
        this.vy = (ground - this.y) / dt;
        this.y = ground;
      }
    } else {
      this.vy -= GRAVITY * dt;
      this.y += this.vy * dt;
      this.airTime += dt;
      if (this.y <= ground) {
        this.jolt = Math.max(this.jolt, Math.min(1, -this.vy / 14)); // landing thump
        this.y = ground;
        this.vy = 0;
        this.grounded = true;
      }
    }
  }

  /** Pitch for drawing: the road's slope on the ground, the flight path in the air. */
  get pitch() {
    if (this.grounded) return Math.atan(this.track.gradeAt(this.s));
    return Math.atan2(this.vy, Math.max(5, Math.abs(this.v))) * 0.6;
  }
}
