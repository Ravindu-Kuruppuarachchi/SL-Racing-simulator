// SL Racing headless check, on every map: the route never comes back near itself, a
// six-car race finishes with power-ups used and landing, and a remote (online) car
// follows the poses sent for it.
import { Track, WALL } from '../src/racer/track.js';
import { Race3D } from '../src/racer/race3d.js';
import { aiInput } from '../src/racer/ai.js';
import { MAPS } from '../src/maps.js';
import { CARS as VEHICLES, skinsOf } from '../src/racer/cars.js';

const up = { engine: 1, handling: 1, tyres: 1, nitro: 1 };
let failed = false;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failed = true;
};

for (const m of MAPS) {
  const t = new Track(m.id, 1);
  check(t.selfGap() > WALL * 2 + 30, `${m.name}: the road keeps ${Math.round(t.selfGap())} m from its other stretches`);

  const racers = [...VEHICLES.slice(1, 6).map((v) => ({ vehicle: v, upgrades: up, skin: skinsOf(v.id)[1], kind: 'bot' })), { vehicle: VEHICLES[0], upgrades: up, skin: skinsOf('buggy')[0], kind: 'player' }];
  const race = new Race3D(t, racers, { rand: Math.random });
  let used = 0;
  let hits = 0;
  const fire = race.fire.bind(race);
  race.fire = (...a) => (used++, fire(...a));
  const hit = race.hitCar.bind(race);
  race.hitCar = (...a) => (hits++, hit(...a));
  const p = race.player;
  while (race.finishers.length < racers.length && race.time < 300) {
    const ai = aiInput(p, race.cars.filter((c) => c !== p), { lane: 0.3 });
    race.step({ ...ai, fire: !!p.item && race.botWantsItem(p, race.standings) }, 1 / 60);
  }
  const times = race.finishers.map((c) => c.finishTime);
  check(race.finishers.length === racers.length, `${m.name}: all ${racers.length} cars finish (${Math.round(Math.min(...times))}-${Math.round(Math.max(...times))} s)`);
  check(used > 3 && hits > 0, `${m.name}: power-ups used (${used}) and hitting (${hits})`);
}

// online: a friend's car goes where their phone says
const t = new Track('hills', 1);
const race = new Race3D(t, [
  { vehicle: VEHICLES[0], upgrades: up, skin: skinsOf('buggy')[0], kind: 'player', id: 1 },
  { vehicle: VEHICLES[5], upgrades: up, skin: skinsOf('supercar')[0], kind: 'remote', id: 2, name: 'Player 2' },
]);
while (race.counting) race.step({}, 1 / 60);
const friend = race.cars.find((c) => c.kind === 'remote');
race.remotePose(2, { s: 140, d: 2, psi: 0.1, v: 30, y: t.heightAt(140), grounded: true, spin: 0, spinAngle: 0, boost: 0, shield: 0 });
for (let i = 0; i < 60; i++) race.step({}, 1 / 60);
check(Math.abs(friend.s - 142) < 4 && Math.abs(friend.d - 2) < 0.1, `a friend's car follows their pose (at ${friend.s.toFixed(1)} m)`);
race.remoteFire(2, 'shield');
check(friend.shield > 0, "a friend's power-up takes effect");
race.remoteFinish(2, 77.5);
check(friend.finishTime === 77.5 && race.standings[0] === friend, "a friend's finish puts them first");

if (failed) process.exit(1);
