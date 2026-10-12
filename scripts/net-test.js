// Online race check: a local relay, a host and friends as real WebSocket clients.
// Joining, the player list, map choice, start, poses into the race, finishing, a full
// room, joining mid-race, dropped connections (switching apps) and coming back, faked
// host messages, two-player races and the host leaving.
import { startRelay } from '../server/dev-relay.js';
import { Lobby, MAX_PLAYERS, newCode, parseCode } from '../src/net.js';
import { Race } from '../src/race.js';
import { skinsOf } from '../src/vehicles.js';

const relay = await startRelay(0, { grace: 1500 }); // a short grace period, so the test doesn't wait 90 s
const url = `http://localhost:${relay.port}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = false;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failed = true;
};
const until = async (cond, ms = 2000) => {
  for (let t = 0; t < ms && !cond(); t += 20) await wait(20);
  return cond();
};

check(parseCode('https://x.workers.dev/join/AB3CD') === 'AB3CD' && parseCode('tuktukclimb://join/ab3cd') === 'AB3CD' && parseCode(' ab3cd ') === 'AB3CD' && parseCode('AB1CD') === null, 'race codes parse from text and links');

const code = newCode();
const host = new Lobby({ code, role: 'host', me: { vehicle: 'jeep', skin: 'green' }, map: 'rajarata', url });
await until(() => host.players.length === 1);
const friends = ['tuktuk', 'van'].map((v) => new Lobby({ code, role: 'join', me: { vehicle: v, skin: skinsOf(v)[0].id }, url }));
check(await until(() => friends.every((f) => f.players.length === 3) && host.players.length === 3), 'host and two friends see the same three players');
check(friends.every((f) => f.map === 'rajarata'), "friends see the host's map");
host.setMap('knuckles');
check(await until(() => friends.every((f) => f.map === 'knuckles')), 'map change reaches everyone');

const dup = new Lobby({ code, role: 'host', me: { vehicle: 'bike', skin: 'red' }, map: 'hills', url });
let dupErr = null;
dup.on('error', (m) => (dupErr = m));
check(await until(() => dupErr !== null), `a second host on the same code is refused ("${dupErr}")`);
const nobody = new Lobby({ code: newCode(), role: 'join', me: { vehicle: 'bike', skin: 'red' }, url });
let noErr = null;
nobody.on('error', (m) => (noErr = m));
check(await until(() => noErr !== null), `joining a code nobody hosts is refused ("${noErr}")`);

// fill the room, then one more
const extra = Array.from({ length: MAX_PLAYERS - 3 }, () => new Lobby({ code, role: 'join', me: { vehicle: 'bike', skin: 'red' }, url }));
await until(() => host.players.length === MAX_PLAYERS);
const seventh = new Lobby({ code, role: 'join', me: { vehicle: 'bike', skin: 'red' }, url });
let fullErr = null;
seventh.on('error', (m) => (fullErr = m));
check(await until(() => fullErr !== null) && host.players.length === MAX_PLAYERS, `a seventh player is refused ("${fullErr}")`);
extra.forEach((e) => e.close());
check(await until(() => host.players.length === 3 && friends.every((f) => f.players.length === 3)), 'players who leave drop off everyone\'s list');

// race: everyone builds a race from the start message
const races = new Map();
for (const l of [host, ...friends]) {
  l.on('start', () => {
    const me = l.players.find((p) => p.id === l.id);
    const race = new Race({ mapId: l.map, player: { vehicleId: me.vehicle, upgrades: { engine: 0, tank: 0, suspension: 0, tires: 0 }, skin: skinsOf(me.vehicle)[0] }, online: { players: l.players.map((p, i) => ({ ...p, label: `Player ${i + 1}` })), me: l.id } });
    races.set(l, race);
    l.on('pose', (id, m) => race.remotePose(id, m.x, m.y, m.a));
    l.on('finish', (id, t) => race.remoteFinish(id, t));
    l.on('leave', (id) => race.remoteLeft(id));
  });
}
host.start();
check(await until(() => races.size === 3), 'start reaches everyone; each phone builds its race');
check([...races.values()].every((r) => r.rivals.length === 2 && r.rivals.every((q) => q.kind === 'remote')), 'each race has the two others as remote rivals');
const late = new Lobby({ code, role: 'join', me: { vehicle: 'bike', skin: 'red' }, url });
let lateErr = null;
late.on('error', (m) => (lateErr = m));
check(await until(() => lateErr !== null), `joining mid-race is refused ("${lateErr}")`);

friends[0].sendPose(120.5, 3.2, 0.1);
const hostRace = races.get(host);
const tukOnHost = hostRace.rivals.find((r) => r.id === friends[0].id);
await until(() => tukOnHost.target.x === 120.5);
hostRace.time = 1;
for (let i = 0; i < 30; i++) hostRace.stepRemote(tukOnHost);
check(Math.abs(tukOnHost.pose.x - 120.5) < 0.1, `a friend's pose reaches the host and the rival glides there (x ${tukOnHost.pose.x.toFixed(2)})`);

friends[1].sendFinish(95.4);
check(await until(() => hostRace.rivals.find((r) => r.id === friends[1].id).finishTime === 95.4), 'a finish reaches the others with its time');
check(hostRace.standings[0].id === friends[1].id, 'the finisher leads the host\'s standings');

// a friend fakes host and relay messages: everyone ignores them
let startedAgain = 0;
let fakeLeft = 0;
friends[0].on('start', () => startedAgain++);
friends[0].on('host-left', () => fakeLeft++);
friends[1].send({ t: 'start', map: 'hills', players: [] });
friends[1].send({ t: 'host-left' });
friends[1].send({ t: 'busy', to: friends[0].id });
await wait(400);
check(startedAgain === 0 && fakeLeft === 0 && !friends[0].closed, "a friend can't fake the host's start, a kick or 'host left'");

// switching apps: the host's connection drops, then it comes back by itself
let awayOnFriend = false;
friends.forEach((f) => f.on('host-left', () => (awayOnFriend = 'LEFT')));
host.ws.close(); // as Android does when the app goes to the background
check(await until(() => friends.every((f) => f.away.has(host.id))), 'when the host drops, friends see it as away (not gone)');
check(await until(() => host.connected && friends.every((f) => !f.away.has(host.id))), 'the host reconnects by itself and friends see it back');
check(awayOnFriend !== 'LEFT' && host.players.length === 3 && friends.every((f) => f.players.length === 3), 'nobody was dropped from the race');

// a friend drops mid-race and comes back: still in, not refused as "race already started"
let refused = null;
friends[0].on('error', (m) => (refused = m));
friends[0].ws.close();
await until(() => host.away.has(friends[0].id));
check(await until(() => friends[0].connected && !host.away.has(friends[0].id)) && refused === null && host.players.length === 3, 'a friend who drops mid-race gets back in');

// two players: two cars, no bots
const code2 = newCode();
const h2 = new Lobby({ code: code2, role: 'host', me: { vehicle: 'jeep', skin: 'green' }, map: 'hills', url });
await until(() => h2.players.length === 1);
const f2 = new Lobby({ code: code2, role: 'join', me: { vehicle: 'van', skin: 'pearl' }, url });
await until(() => h2.players.length === 2 && f2.players.length === 2);
const duo = new Race({ mapId: 'hills', player: { vehicleId: 'jeep', upgrades: { engine: 0, tank: 0, suspension: 0, tires: 0 }, skin: skinsOf('jeep')[0] }, online: { players: h2.players.map((p, i) => ({ ...p, label: `Player ${i + 1}` })), me: h2.id } });
check(duo.rivals.length === 1 && duo.rivals[0].kind === 'remote', 'a two-player race has exactly two cars and no bots');

// a host that never comes back: friends are told once the grace period is over
let f2Left = false;
f2.on('host-left', () => (f2Left = true));
clearInterval(h2.heartbeat);
h2.closed = true; // stop it reconnecting, as if the phone was switched off
h2.ws.close();
check(await until(() => f2.away.has(h2.id)), 'a host that drops is away at first');
check(await until(() => f2Left, 4000), "and once it's been gone past the grace period, friends hear the host left");

host.close();
let hostLeft = 0;
friends.forEach((f) => f.on('host-left', () => hostLeft++));
check(await until(() => hostLeft === 2), 'friends hear at once when the host leaves on purpose');
const again = new Lobby({ code, role: 'host', me: { vehicle: 'jeep', skin: 'green' }, map: 'hills', url });
check(await until(() => again.players.length === 1), 'the code is free again once the host has gone');
again.close();

relay.close();
if (failed) process.exit(1);
process.exit(0);
