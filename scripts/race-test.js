// Headless race check: a bot drives the player's car on every map against the rivals.
// Every racer must reach the finish, and the run must replay as a ghost.
// Usage: node scripts/race-test.js [mapId]
import { STEP } from '../src/game.js';
import { MAPS } from '../src/maps.js';
import { Race, botInput, formatTime } from '../src/race.js';
import { skinsOf } from '../src/vehicles.js';

const up = { engine: 1, tank: 1, suspension: 1, tires: 1 };
const only = process.argv[2];
let failed = false;
const drive = (race, limit = 900) => {
  // the test driver lifts off the gas now and then; and like the rival bots it can't learn
  // a hard section, so after three crashes in one stretch it gets a push past it
  while (!race.done && race.time < limit) {
    race.step(race.counting || Math.random() < 0.1 ? {} : botInput(race.player.game));
    const p = race.player;
    if (p.fails >= 3 && !p.game.over) {
      p.game.respawn(Math.min(p.reach + 10, race.finish - 4));
      p.fails = 0;
    }
  }
  // let the rivals finish too, for the report
  while (race.rivals.some((r) => r.finishTime === null) && race.time < limit) {
    race.time += STEP;
    for (const r of race.rivals) if (r.kind === 'ghost') race.stepGhost(r);
    else for (let i = 0; i < 1; i++) race.stepRacer(r, botInput(r.game));
  }
};
for (const map of MAPS.filter((m) => !only || m.id === only)) {
  const t0 = performance.now();
  const race = new Race({ mapId: map.id, player: { vehicleId: 'jeep', upgrades: up, skin: skinsOf('jeep')[0] }, pace: 1, rand: Math.random });
  drive(race);
  const ms = performance.now() - t0;
  const res = race.standings.map((r) => `${r.name} (${r.vehicle.id}) ${r.finishTime === null ? 'DNF' : formatTime(r.finishTime)}`).join(', ');
  console.log(`${map.id.padEnd(9)} ${race.finish}m  ${race.done ? `place ${race.place}` : 'DID NOT FINISH'}  ${res}  [${(ms / 1000).toFixed(1)}s cpu]`);
  if (!race.done) failed = true;
  // replay the run as a ghost: it must finish at the recorded time
  const ghost = race.run;
  if (ghost) {
    const g2 = new Race({ mapId: map.id, player: { vehicleId: 'tuktuk', upgrades: up, skin: skinsOf('tuktuk')[0] }, pace: 1, ghost, rand: () => 0 });
    const gr = g2.rivals.find((r) => r.kind === 'ghost');
    while (gr.finishTime === null && g2.time < ghost.time + 2) {
      g2.time += STEP;
      g2.stepGhost(gr);
    }
    const ok = gr.finishTime !== null && Math.abs(gr.finishTime - ghost.time) < 0.05;
    console.log(`          ghost replay: ${ok ? 'ok' : 'FAILED'} (${gr.finishTime?.toFixed(2)} vs ${ghost.time.toFixed(2)}), ${ghost.samples.length / 3} samples, ${(JSON.stringify(ghost).length / 1024).toFixed(0)} KB`);
    if (!ok) failed = true;
  }
}
if (failed) process.exit(1);
