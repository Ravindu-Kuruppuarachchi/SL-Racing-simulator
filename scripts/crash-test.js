// Drop each vehicle onto its roof and check the run ends as a crash.
import { Game } from '../src/game.js';
import { MAPS } from '../src/maps.js';
import { VEHICLES } from '../src/vehicles.js';

let failed = false;
for (const v of VEHICLES) {
  const g = new Game(v.id, { engine: 0, tank: 0, suspension: 0, tires: 0 }, 1);
  const y0 = g.chassis.getPosition().y;
  for (const b of [g.chassis, ...g.wheels.map((w) => w.body)]) {
    const p = b.getPosition();
    b.setTransform({ x: p.x, y: 4 - (p.y - y0) }, Math.PI); // upside down, mirrored around y=4
  }
  for (let i = 0; i < 60 * 5 && !g.over; i++) g.step({});
  console.log(`${v.id}: over = ${g.over}`);
  if (g.over !== 'Crashed!') failed = true;
}

// A full-gas launch must not flip any vehicle (holding gas in the air is
// still allowed to flip you; that's part of the game).
for (const v of VEHICLES) {
  for (const { id: map } of MAPS) for (const lvl of [0, 5]) {
    const g = new Game(v.id, { engine: lvl, tank: lvl, suspension: lvl, tires: lvl }, 1, map);
    for (let i = 0; i < 60 * 3 && !g.over; i++) g.step({ gas: true });
    const ok = !g.over;
    console.log(`${v.id} full-gas launch (${map}, level ${lvl}): ${ok ? `ok, ${g.distance}m` : g.over}`);
    if (!ok) failed = true;
  }
}
if (failed) process.exit(1);
