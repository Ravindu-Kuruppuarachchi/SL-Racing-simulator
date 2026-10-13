// Free ride has fuel and no nitro; races have nitro and no fuel.
import { Game, STEP } from '../src/game.js';
import { Race } from '../src/race.js';

const UP = { engine: 0, suspension: 0, tires: 0, tank: 0 };
let failed = false;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failed = true;
};

const free = new Game('tuktuk', UP, 5, 'hills', { nitro: false });
for (let i = 0; i < 60 * 30; i++) free.step({ gas: true, nitro: true });
check(free.nitros.length === 0 && free.nitroCharges === 0 && free.boost === 0, 'free ride: no nitro bottles, and the nitro key does nothing');
check(free.fuels.length > 0 && free.fuel < free.stats.tank, 'free ride: fuel cans on the road and the tank drains');

const race = new Race({ mapId: 'hills', player: { vehicleId: 'tuktuk', upgrades: UP, skin: null, tilt: 1.3 } });
for (let i = 0; i < 60 * 40; i++) race.step({ gas: true });
const g = race.player.game;
check(g.fuels.length === 0 && g.fuel === g.stats.tank, 'race: no fuel cans and the tank never drains');
check(g.nitros.length > 0, 'race: nitro bottles on the road');
check(race.rivals.every((r) => !r.game || !r.game.useFuel), "race: rivals don't use fuel either");
check(g.tiltScale === 1.3, 'race: the handling sensitivity reaches the player');
const soft = new Game('tuktuk', UP, 5, 'hills', { tilt: 0.5 });
check(soft.tiltScale === 0.5 && STEP > 0, 'free ride: the handling sensitivity is used');
if (failed) process.exit(1);
