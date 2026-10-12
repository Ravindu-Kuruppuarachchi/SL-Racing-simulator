// Headless sanity check: drive every vehicle with a simple "player" policy.
// Usage: node scripts/sim-test.js [upgradeLevel] [seconds] [vehicleId] [mapId]
import { Game } from '../src/game.js';
import { MAPS } from '../src/maps.js';
import { VEHICLES } from '../src/vehicles.js';

const lvl = +(process.argv[2] ?? 0);
const seconds = +(process.argv[3] ?? 40);
const only = process.argv[4];
const onlyMap = process.argv[5];
const up = { engine: lvl, tank: lvl, suspension: lvl, tires: lvl };
for (const map of MAPS.filter((m) => !onlyMap || m.id === onlyMap)) {
  console.log(`-- ${map.name}`);
  for (const v of VEHICLES.filter((v) => !only || v.id === only)) {
    const runs = [];
    for (const seed of [1, 42, 300, 777]) {
      const g = new Game(v.id, up, seed, map.id);
      for (let i = 0; i < 60 * seconds && !g.over; i++) {
        const tip = (g.chassis.getAngle() % (Math.PI * 2)) - g.groundAngle(); // tilt relative to the road
        const air = g.wheelContacts <= 0;
        // lean forward if tipping back; level out in the air
        const input = tip > 0.5 || (air && tip > 0.15) ? { brake: true } : { gas: true };
        g.step(input);
      }
      const p = g.chassis.getPosition();
      if (!Number.isFinite(p.x)) throw new Error(`${v.id}: physics exploded`);
      if (g.distance < 100) throw new Error(`${v.id} seed ${seed}: stuck at ${g.distance}m (${g.over ?? 'running'})`);
      runs.push(`${String(g.distance).padStart(4)}m${g.over ? ` ${g.over === 'Crashed!' ? 'crash' : 'fuel'}@${g.time.toFixed(0)}s` : ''}`);
    }
    console.log(`${v.id.padEnd(9)} ${runs.join(' | ')}`);
  }
}
