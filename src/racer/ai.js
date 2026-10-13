// AI drivers for the 3D racer: steering and braking worked out from the road ahead.
// No three.js here, so it runs headless in tests.
import { ROAD_HALF } from './track.js';

const LAT_GRIP = 13; // m/s² of cornering the bots dare (they brake for anything tighter)

/**
 * Inputs for an AI car. `others` are the other cars (to steer round), `lane` a personal
 * offset (-1..1) so bots don't all queue on one line, `skill` 0..1 how close to the limit
 * they corner.
 */
export function aiInput(car, others, { lane = 0, skill = 0.8, obstacles = [] } = {}) {
  const t = car.track;
  const v = Math.max(car.v, 5);

  // the tightest bend in the braking distance ahead sets the speed to carry
  const look = 20 + v * 1.6;
  let kMax = 0;
  for (let a = 5; a < look; a += 6) kMax = Math.max(kMax, Math.abs(t.kappaAt(car.s + a)));
  const cornerSpeed = Math.sqrt((LAT_GRIP * (0.75 + 0.35 * skill)) / Math.max(kMax, 1e-4));
  const brake = car.v > cornerSpeed + 2;

  // racing line: drift to the inside of the bend coming up, plus this bot's lane
  const ahead = t.kappaAt(car.s + 10 + v * 0.6);
  let target = Math.max(-ROAD_HALF + 1.5, Math.min(ROAD_HALF - 1.5, lane * 3 + Math.sign(ahead) * Math.min(4, Math.abs(ahead) * 260)));
  // swerve round a car close in front
  for (const o of others) {
    const gap = o.s - car.s;
    if (gap > 0 && gap < 12 + v * 0.3 && Math.abs(o.d - car.d) < 2.2) target = o.d + (o.d > car.d || o.d > ROAD_HALF - 3 ? -2.8 : 2.8);
  }

  // obstacles ahead (each { s, d, hd }): block out the road they cover, and aim for the free
  // spot nearest the line we wanted
  const blocked = [];
  for (const o of obstacles) {
    const gap = o.s - car.s;
    if (gap > -1.5 && gap < 18 + v * 0.9) blocked.push([o.d - o.hd - car.stats.halfWidth - 0.6, o.d + o.hd + car.stats.halfWidth + 0.6]);
  }
  if (blocked.some(([a, b]) => target > a && target < b)) {
    let best = target;
    let bestCost = Infinity;
    for (let d = -ROAD_HALF + 1; d <= ROAD_HALF - 1; d += 0.25) {
      if (blocked.some(([a, b]) => d > a && d < b)) continue;
      const cost = Math.abs(d - target) + Math.abs(d - car.d) * 0.5;
      if (cost < bestCost) {
        bestCost = cost;
        best = d;
      }
    }
    target = best;
  }

  // steer so the car's heading closes on the line over a short distance
  const reach = 8 + v * 0.5;
  const want = Math.atan2(target - car.d, reach);
  const steer = Math.max(-1, Math.min(1, (want - car.psi) * 2.2));
  return { steer, brake };
}
