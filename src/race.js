// Race mode: you against three rivals from the first town board to the last.
// No DOM access here, so races can run headless (see scripts/race-test.js).
//
// - The town boards are checkpoints. Passing one refills the tank; crashing or running
//   dry puts you back at the last one you passed, while the rivals drive on.
// - Rivals are bots driving their own physics copy of the same road. Each has a `pace`:
//   how many of its physics steps run per step of yours, so 1.1 is 10% quicker in time.
// - The fastest finish on each map is saved as a ghost, and in RACE.ghostChance of races
//   it replaces the strongest bot, so beating it means beating your own best.
// - After each race the bots' pace moves up after a win and down after a loss
//   (nextPace), which settles where you win about half your races.
import { Game, STEP } from './game.js';
import { TOWN_EVERY, getMap } from './maps.js';
import { VEHICLES, getVehicle, skinsOf } from './vehicles.js';

export const RACE = {
  rivals: 3,
  maxCheckpoints: 8, // the long roads have 13-15 towns: a race ends at the 8th (~2 km, ~3 min)
  ghostChance: 0.3,
  countdown: 3, // seconds before the start
  crashPause: 1.2, // seconds stranded before going back to the checkpoint
  sampleEvery: 6, // physics steps between ghost samples (10 a second)
  paces: [1, 0.93, 0.86], // the three bots, relative to the race pace
  startPace: 0.85,
  paceStep: 1.07, // pace change per win or loss
  minPace: 0.55,
  maxPace: 2,
  prizes: [250, 120, 60, 20], // coins for 1st..4th
};

const wrap = (a) => a - Math.round(a / (Math.PI * 2)) * Math.PI * 2;

/** Every race on a map uses the same road, so runs can be compared (and ghosts replayed). */
export const raceSeed = (mapId) => [...mapId].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/** The town boards in order (up to RACE.maxCheckpoints); the last one is the finish line. */
export const raceCheckpoints = (map) => map.towns.slice(0, RACE.maxCheckpoints).map((town, i) => ({ town, x: (i + 1) * TOWN_EVERY + 3 }));

export const nextPace = (pace, won) => Math.min(RACE.maxPace, Math.max(RACE.minPace, won ? pace * RACE.paceStep : pace / RACE.paceStep));

/** The simple driver the bots use: lean forward when tipping back, level out in the air. */
export function botInput(g) {
  const air = g.wheelContacts <= 0;
  const tip = wrap(g.chassis.getAngle() - g.groundAngle());
  return tip > 0.5 || (air && tip > 0.15) ? { brake: true } : { gas: true };
}

export const formatTime = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
export const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] ?? 'th'}`;

export class Race {
  /**
   * player: { vehicleId, upgrades, skin }
   * pace: the bots' current race pace (see nextPace)
   * ghost: the saved best run on this map ({ vehicle, skin, time, samples }), if any
   */
  /**
   * online: { players: [{ id, vehicle, skin, label }], me, clock } for a race with friends
   * (net.js). clock() is real time in seconds: online finish times use it, so a phone too
   * slow to keep up (its physics then runs in slow motion) can't post a flattering time.
   */
  constructor({ mapId, player, pace = RACE.startPace, ghost = null, rand = Math.random, online = null }) {
    this.map = getMap(mapId);
    this.seed = raceSeed(this.map.id);
    this.checkpoints = raceCheckpoints(this.map);
    this.finish = this.checkpoints.at(-1).x;
    this.time = -RACE.countdown;
    this.steps = 0;
    this.finishers = [];
    this.done = false; // the player has crossed the line
    this.samples = []; // the player's run, for a new ghost

    this.player = this.racer({ name: 'You', kind: 'player', vehicleId: player.vehicleId, upgrades: player.upgrades, skin: player.skin });
    this.online = !!online;
    this.clock = online?.clock ?? null;
    this.startClock = null;
    if (online) {
      // friends: their phones drive them; we draw them where their poses say
      const start = this.player.game.chassis;
      this.rivals = online.players.filter((p) => p.id !== online.me).map((p) => this.remoteRacer(p, start));
      this.ghostRace = false;
      return;
    }
    const useGhost = ghost?.samples?.length > 0 && rand() < RACE.ghostChance;
    this.rivals = RACE.paces.slice(0, RACE.rivals).map((k, i) => {
      if (i === 0 && useGhost) return this.ghostRacer(ghost);
      const v = VEHICLES[Math.floor(rand() * VEHICLES.length)];
      const skins = skinsOf(v.id);
      const r = this.racer({ name: v.name, kind: 'bot', vehicleId: v.id, upgrades: player.upgrades, skin: skins[Math.floor(rand() * skins.length)] });
      r.pace = k * pace * (0.97 + rand() * 0.06);
      return r;
    });
    this.ghostRace = useGhost;
  }

  racer({ name, kind, vehicleId, upgrades, skin }) {
    const game = new Game(vehicleId, upgrades, this.seed, this.map.id);
    game.skin = skin;
    game.keepBehind = TOWN_EVERY + 60; // respawning goes back to the last checkpoint
    // bestX/stuckTime spot a stuck bot; reach/fails (since the last checkpoint) a bot that keeps crashing
    return { name, kind, vehicle: game.vehicle, skin, game, cp: -1, finishTime: null, crashTimer: 0, pace: 1, acc: 0, bestX: 0, stuckTime: 0, reach: 0, fails: 0 };
  }

  remoteRacer({ id, vehicle: vehicleId, skin: skinId, label }, start) {
    const vehicle = getVehicle(vehicleId);
    const skin = skinsOf(vehicle.id).find((s) => s.id === skinId) ?? skinsOf(vehicle.id)[0];
    const p = start.getPosition();
    const pose = { x: p.x, y: p.y, angle: 0 };
    return { name: label, kind: 'remote', id, vehicle, skin, game: null, cp: -1, finishTime: null, pose, target: { ...pose }, left: false };
  }

  /** A friend's latest pose from the network. */
  remotePose(id, x, y, angle) {
    const r = this.rivals.find((q) => q.id === id);
    if (!r) return;
    // a jump of more than a few metres is a respawn at a checkpoint: snap there
    if (Math.abs(x - r.pose.x) > 8) Object.assign(r.pose, { x, y, angle });
    Object.assign(r.target, { x, y, angle });
  }

  /** A friend crossed the line, at their own race time. */
  remoteFinish(id, time) {
    const r = this.rivals.find((q) => q.id === id);
    if (r && r.finishTime === null) {
      r.cp = this.checkpoints.length - 1;
      this.cross(r, time);
    }
  }

  remoteLeft(id) {
    const r = this.rivals.find((q) => q.id === id);
    if (r) r.left = true;
  }

  // poses arrive ~15 times a second: glide towards the latest so friends move smoothly
  stepRemote(r) {
    if (r.left) return;
    const k = 0.3;
    r.pose.x += (r.target.x - r.pose.x) * k;
    r.pose.y += (r.target.y - r.pose.y) * k;
    r.pose.angle += wrap(r.target.angle - r.pose.angle) * k;
    while (r.cp + 1 < this.checkpoints.length - 1 && r.pose.x >= this.checkpoints[r.cp + 1].x) r.cp++;
  }

  ghostRacer(ghost) {
    const vehicle = getVehicle(ghost.vehicle);
    const skin = skinsOf(vehicle.id).find((s) => s.id === ghost.skin) ?? skinsOf(vehicle.id)[0];
    return { name: 'Your best', kind: 'ghost', vehicle, skin, ghost, game: null, cp: -1, finishTime: null, pose: this.ghostPose(ghost, 0) };
  }

  /** Where a saved run was at time t: { x, y, angle }, interpolated between samples. */
  ghostPose(ghost, t) {
    const s = ghost.samples;
    const n = s.length / 3;
    const f = Math.min(Math.max((t * 60) / RACE.sampleEvery - 1, 0), n - 1); // sample i was taken at step (i + 1) * sampleEvery
    const i = Math.floor(f);
    const j = Math.min(i + 1, n - 1);
    const k = f - i;
    // a jump of more than a few metres is a respawn: don't slide between the two places
    const jump = Math.abs(s[j * 3] - s[i * 3]) > 5;
    const lerp = (a, b) => (jump ? a : a + (b - a) * k);
    return { x: lerp(s[i * 3], s[j * 3]), y: lerp(s[i * 3 + 1], s[j * 3 + 1]), angle: s[i * 3 + 2] + (jump ? 0 : wrap(s[j * 3 + 2] - s[i * 3 + 2]) * k) };
  }

  xOf(r) {
    return r.game ? r.game.chassis.getPosition().x : r.pose.x;
  }

  checkpointX(r) {
    return r.cp >= 0 ? this.checkpoints[r.cp].x : 3;
  }

  /** Everyone in race order: finishers by time, then by distance. */
  get standings() {
    const all = [this.player, ...this.rivals];
    return all.sort((a, b) => (a.finishTime ?? Infinity) - (b.finishTime ?? Infinity) || this.xOf(b) - this.xOf(a));
  }

  get position() {
    return this.standings.indexOf(this.player) + 1;
  }

  get counting() {
    return this.time < 0;
  }

  step(input) {
    if (this.done) return;
    this.time += STEP;
    if (this.time < 0) return; // countdown: everyone waits on the line
    if (this.clock && this.startClock === null) this.startClock = this.clock();
    this.steps++;
    this.stepRacer(this.player, input);
    if (this.steps % RACE.sampleEvery === 0) {
      const c = this.player.game.chassis;
      const p = c.getPosition();
      this.samples.push(Math.round(p.x * 50) / 50, Math.round(p.y * 50) / 50, Math.round(c.getAngle() * 1000) / 1000);
    }
    for (const r of this.rivals) {
      if (r.kind === 'ghost') this.stepGhost(r);
      else if (r.kind === 'remote') this.stepRemote(r);
      else {
        r.acc += r.pace;
        while (r.acc >= 1) {
          r.acc -= 1;
          this.stepRacer(r, botInput(r.game));
        }
      }
    }
  }

  stepRacer(r, input) {
    const g = r.game;
    if (r.finishTime !== null) {
      g.step({ brake: true }); // roll to a stop past the line
      return;
    }
    if (g.over) {
      // crashed or out of fuel: tumble for a moment, then back to the last checkpoint
      g.world.step(STEP, 8, 3);
      r.crashTimer += STEP;
      if (r.crashTimer >= RACE.crashPause) {
        r.crashTimer = 0;
        r.fails++;
        // a bot that keeps crashing at the same spot restarts just past it instead
        const x = r.kind === 'bot' && r.fails >= 2 ? Math.min(r.reach + 10, this.finish - 4) : this.checkpointX(r);
        g.respawn(x);
        r.bestX = x;
        r.stuckTime = 0;
        if (r.kind === 'player') g.say(r.cp >= 0 ? `Back to ${this.checkpoints[r.cp].town}` : 'Back to the start');
      }
      return;
    }
    g.step(input);
    const x = g.chassis.getPosition().x;
    r.reach = Math.max(r.reach, x);
    if (r.kind === 'bot') this.unstick(r, x);
    while (r.cp + 1 < this.checkpoints.length && x >= this.checkpoints[r.cp + 1].x) {
      r.cp++;
      r.fails = 0;
      g.fuel = g.stats.tank;
      if (r.cp === this.checkpoints.length - 1) this.cross(r);
      else if (r.kind === 'player') g.say(`Checkpoint: ${this.checkpoints[r.cp].town}`);
    }
  }

  // A bot that makes no progress for a while is lifted a little way up the road, the
  // way a stuck car gets a push. (The pace adjustment keeps races fair either way.)
  unstick(r, x) {
    if (x > r.bestX + 1) {
      r.bestX = x;
      r.stuckTime = 0;
      return;
    }
    r.stuckTime += STEP;
    if (r.stuckTime > 8) {
      r.game.respawn(Math.min(r.bestX + 12, this.finish - 4));
      r.stuckTime = 0;
    }
  }

  stepGhost(r) {
    if (r.finishTime !== null) return;
    r.pose = this.ghostPose(r.ghost, this.time);
    while (r.cp + 1 < this.checkpoints.length && r.pose.x >= this.checkpoints[r.cp + 1].x) r.cp++;
    if (this.time >= r.ghost.time) {
      r.cp = this.checkpoints.length - 1;
      this.cross(r, r.ghost.time);
    }
  }

  cross(r, time = r.kind === 'player' && this.clock ? this.clock() - this.startClock : this.time) {
    r.finishTime = time;
    this.finishers.push(r);
    const g = this.player.game;
    if (r.kind === 'player') {
      this.done = true;
      this.place = this.finishers.length;
    } else if (this.finishers.length === 1) g.say(`${r.name} wins!`);
  }

  /** The finished run as a ghost to save, if the player crossed the line. */
  get run() {
    if (!this.done) return null;
    return { vehicle: this.player.vehicle.id, skin: this.player.skin.id, time: this.player.finishTime, samples: this.samples };
  }
}
