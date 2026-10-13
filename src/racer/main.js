// SL Racing: 3D kart-style races along Sri Lanka's roads (the routes of Tuk Tuk Climb's
// maps), with power-ups, upgrades and paints, a free drive, and online races with friends.
// bundled font, so the app works offline
import '@fontsource/baloo-2/latin-500.css';
import '@fontsource/baloo-2/latin-700.css';
import '@fontsource/baloo-2/latin-800.css';
import { App as NativeApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Track } from './track.js';
import { ITEMS, RACE3D, Race3D } from './race3d.js';
import { View } from './view.js';
import { NO_UPGRADES, UPGRADES, carStats } from './car.js';
import { MAPS, getMap } from '../maps.js';
import { CARS as VEHICLES, carModel, getCar as getVehicle, getSkin, skinsOf } from './cars.js';
import { Showroom } from '../showroom.js';
import { EngineSound } from '../sound.js';
import { Lobby, MAX_PLAYERS, RELAY_URL, joinLink, newCode, parseCode } from '../net.js';

const $ = (id) => document.getElementById(id);
const STEP = 1 / 60;

// ---- save data -------------------------------------------------------------------------
const SAVE_KEY = 'sl-racing-save';
const COSTS = [200, 500, 1000, 1700, 2600];
const MAX_LEVEL = COSTS.length;
const upgradeCost = (vehicle, lvl) => Math.round((COSTS[lvl] * (1 + vehicle.price / 6000)) / 10) * 10;
function load() {
  const fresh = { coins: 0, owned: ['buggy'], selected: 'buggy', ups: {}, paint: {}, paints: {}, map: 'hills', bests: {}, races: 0, wins: 0, muted: false };
  try {
    const save = { ...fresh, ...JSON.parse(localStorage.getItem(SAVE_KEY)) };
    // saves from the first build had Tuk Tuk Climb's vehicles: keep only the cars that exist now
    save.owned = [...new Set(['buggy', ...save.owned.filter((id) => VEHICLES.some((c) => c.id === id))])];
    if (!save.owned.includes(save.selected)) save.selected = 'buggy';
    return save;
  } catch {
    return fresh;
  }
}
const save = load();
function persist() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    /* storage unavailable: progress lasts for this session only */
  }
}
const upgradesOf = (id) => ({ ...NO_UPGRADES, ...save.ups[id] });
const skinOf = (id) => getSkin(id, save.paint[id]);
const ownsSkin = (id, skinId) => skinsOf(id)[0].id === skinId || (save.paints[id] ?? []).includes(skinId);
const formatTime = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] ?? 'th'}`;
const coinsText = () => document.querySelectorAll('.js-coins').forEach((el) => (el.textContent = save.coins.toLocaleString()));

// ---- state -------------------------------------------------------------------------------
const view = new View($('view'));
const showroom = new Showroom($('stage'));
showroom.modelOf = carModel; // the garage turntable shows SL Racing's cars
const sound = new EngineSound();
let race = null;
let raceMode = 'race'; // race | free | online
let mode = 'home'; // home | garage | maps | lobby | play | pause | over
let viewing = save.selected; // vehicle shown in the garage
let lobby = null; // the online race room (net.js)
let acc = 0;
let last = performance.now();
let shownEvents = 0;
let firedLatch = false;
const MENUS = ['home', 'garage'];

// ---- input ---------------------------------------------------------------------------
const held = { left: false, right: false, brake: false, fire: false };
const KEYS = { left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], brake: ['ArrowDown', 'KeyS'], fire: ['Space', 'Enter', 'ArrowUp', 'KeyW'] };
function onKey(e, down) {
  if (e.target.closest?.('input, textarea')) return; // typing a race code
  if (mode === 'play') {
    for (const [k, codes] of Object.entries(KEYS)) {
      if (codes.includes(e.code)) {
        held[k] = down;
        e.preventDefault();
      }
    }
  }
  if (!down) return;
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (mode === 'play' || mode === 'pause') togglePause();
    else if (mode !== 'home') back();
  }
  if (MENUS.includes(mode) && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) cycle(e.code === 'ArrowLeft' ? -1 : 1);
}
addEventListener('keydown', (e) => onKey(e, true));
addEventListener('keyup', (e) => onKey(e, false));
function bindPad(el, key) {
  const set = (v) => (e) => {
    e.preventDefault();
    held[key] = v;
    el.classList.toggle('down', v);
  };
  el.addEventListener('pointerdown', set(true));
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, set(false));
}
for (const k of ['left', 'right', 'brake', 'fire']) bindPad($(k), k);
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('blur', () => {
  for (const k in held) held[k] = false;
  if (mode === 'play' && raceMode !== 'online') togglePause();
});

// ---- screens ---------------------------------------------------------------------------
function show(next) {
  mode = next;
  if ((MENUS.includes(next) || next === 'maps') && lobby) {
    lobby.close(); // left the online race for the menus
    lobby = null;
  }
  for (const id of ['home', 'garage', 'maps', 'lobby', 'pause', 'over']) $(id).hidden = id !== next;
  const racing = next === 'play' || next === 'pause';
  $('hud').hidden = $('speed').hidden = $('controls').hidden = !racing;
  $('countdown').hidden = true;
  $('stage').hidden = !(MENUS.includes(next) && showroom.ok);
  $('view').hidden = !(racing || next === 'over');
  if (!racing) sound.setLevel(0, false);
  if (MENUS.includes(next)) {
    showroom.setScene(next);
    showroom.setSlot($(`${next}-slot`));
  }
  if (next === 'home') renderHome();
  if (next === 'garage') renderGarage();
  if (next === 'maps') renderMaps();
  if (next === 'lobby') renderLobby();
}

function back() {
  if (mode === 'lobby') $('lobby-back').onclick();
  else if (mode === 'over' && lobby) backToLobby();
  else show('home');
}

function showVehicle(id, skin = skinOf(id)) {
  if (showroom.ok) showroom.setVehicle(id, skin);
}

const statLine = (v) => {
  const s = carStats(v, upgradesOf(v.id));
  return `${Math.round(s.top * 3.6)} km/h · ${v.blurb}`;
};

function renderHome() {
  coinsText();
  const v = getVehicle(save.selected);
  const map = getMap(save.map);
  const best = save.bests[map.id];
  $('best-pill').innerHTML = `<small>BEST</small> ${best ? formatTime(best) : '–'}`;
  $('home-tag').textContent = map.tagline;
  $('map-name').textContent = map.name;
  $('map-route').textContent = routeText(map);
  $('home-name').textContent = v.name;
  $('home-stats').textContent = statLine(v);
  $('mute-btn').textContent = save.muted ? '🔇' : '🔊';
  for (const b of $('home').querySelectorAll('.nav-btn')) b.hidden = save.owned.length < 2;
  if (showroom.ok) showroom.setTheme(map.id);
  showVehicle(v.id);
}

const routeText = (map) => {
  const towns = map.towns.slice(0, 8);
  return `${towns[0]} → ${towns.at(-1)}`;
};

// ---- garage ------------------------------------------------------------------------------
// stat bars compare against the best any vehicle reaches fully upgraded
const MAXED = { engine: MAX_LEVEL, handling: MAX_LEVEL, tyres: MAX_LEVEL, nitro: MAX_LEVEL };
const statValues = (v, up) => {
  const s = carStats(v, up);
  return { speed: s.top * 3.6, accel: s.accel, handling: s.turn, grip: s.grip };
};
const STAT_MAX = Object.fromEntries(['speed', 'accel', 'handling', 'grip'].map((k) => [k, Math.max(...VEHICLES.map((v) => statValues(v, MAXED)[k]))]));
const STAT_LABELS = [
  ['speed', 'Top speed', (x) => `${Math.round(x)} km/h`],
  ['accel', 'Acceleration', () => ''],
  ['handling', 'Handling', () => ''],
  ['grip', 'Grip', () => ''],
];
let previewSkin = null;

function renderGarage() {
  coinsText();
  const v = getVehicle(viewing);
  const owned = save.owned.includes(v.id);
  const selected = save.selected === v.id;
  const up = upgradesOf(v.id);
  $('vehicle-tabs').innerHTML = VEHICLES.map((t) => {
    const mark = save.selected === t.id ? ' ✓' : save.owned.includes(t.id) ? '' : ' 🔒';
    return `<button class="tab" role="tab" data-view="${t.id}" aria-selected="${t.id === v.id}">${t.name}${mark}</button>`;
  }).join('');
  $('vehicle-tabs').querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  $('g-name').textContent = v.name;
  const status = $('g-status');
  status.className = `chip ${selected ? 'driving' : owned ? '' : 'locked'}`;
  status.textContent = selected ? 'DRIVING' : owned ? 'OWNED' : `Rs ${v.price.toLocaleString()}`;
  $('lock-badge').hidden = owned;
  const vals = statValues(v, up);
  $('g-stats').innerHTML = STAT_LABELS.map(([k, label, fmt]) => `<div class="stat"><div class="stat-top"><span>${label}</span><b>${fmt(vals[k])}</b></div><div class="stat-bar"><i style="width:${Math.min(100, (vals[k] / STAT_MAX[k]) * 100).toFixed(1)}%"></i></div></div>`).join('');

  // paints: tap one you own to use it, any other to preview (and buy)
  const equipped = skinOf(v.id);
  const shown = getSkin(v.id, previewSkin ?? equipped.id);
  $('g-paints').innerHTML = skinsOf(v.id).map((k) => {
    const mark = k.id === equipped.id ? '<span class="mark on">✓</span>' : ownsSkin(v.id, k.id) ? '' : `<span class="mark">Rs ${k.price}</span>`;
    return `<button class="swatch" role="radio" data-skin="${k.id}" aria-checked="${k.id === shown.id}" aria-label="${k.name}" title="${k.name}" style="--body:${k.body};--light:${k.light};--dark:${k.dark}">${mark}</button>`;
  }).join('');

  $('g-upgrades').innerHTML = UPGRADES.map(({ key, name, effect }) => {
    const lvl = up[key];
    const cost = upgradeCost(v, lvl);
    const pips = Array.from({ length: MAX_LEVEL }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('');
    const btn = !owned ? '<button class="buy" disabled>🔒</button>' : lvl >= MAX_LEVEL ? '<button class="buy" disabled>MAX</button>' : `<button class="buy" data-up="${key}" ${save.coins < cost ? 'disabled' : ''}>Rs ${cost.toLocaleString()}</button>`;
    return `<div class="upg ${owned ? '' : 'locked'}"><div><div class="upg-top"><b>${name}</b><span>Level ${lvl}/${MAX_LEVEL}</span></div><div class="pips">${pips}</div><small>${effect(lvl)}</small></div>${btn}</div>`;
  }).join('');

  const action = $('g-action');
  action.className = 'btn primary';
  action.disabled = false;
  if (!owned) {
    const short = v.price - save.coins;
    action.className = 'btn buy-vehicle';
    action.textContent = short > 0 ? `Need Rs ${short.toLocaleString()} more` : `Buy for Rs ${v.price.toLocaleString()}`;
    action.disabled = short > 0;
  } else if (shown.id !== equipped.id && !ownsSkin(v.id, shown.id)) {
    action.className = 'btn buy-vehicle';
    action.textContent = save.coins < shown.price ? `Paint: need Rs ${(shown.price - save.coins).toLocaleString()} more` : `Buy ${shown.name} paint · Rs ${shown.price.toLocaleString()}`;
    action.disabled = save.coins < shown.price;
  } else action.textContent = selected ? '🏁 Race ▶' : `Drive the ${v.name} ▶`;
  showVehicle(v.id, shown);
}

function cycle(dir) {
  const list = mode === 'home' ? VEHICLES.filter((v) => save.owned.includes(v.id)) : VEHICLES;
  const cur = mode === 'home' ? save.selected : viewing;
  const i = list.findIndex((v) => v.id === cur);
  const next = list[(i + dir + list.length) % list.length].id;
  if (mode === 'home') {
    save.selected = viewing = next;
    persist();
    renderHome();
  } else {
    viewing = next;
    previewSkin = null;
    renderGarage();
  }
}
for (const b of document.querySelectorAll('[data-cycle]')) b.onclick = () => cycle(+b.dataset.cycle);

$('vehicle-tabs').addEventListener('click', (e) => {
  const id = e.target.closest('[data-view]')?.dataset.view;
  if (!id) return;
  viewing = id;
  previewSkin = null;
  renderGarage();
});
$('g-paints').addEventListener('click', (e) => {
  const skinId = e.target.closest('[data-skin]')?.dataset.skin;
  if (!skinId) return;
  if (save.owned.includes(viewing) && ownsSkin(viewing, skinId)) {
    save.paint[viewing] = skinId;
    previewSkin = null;
    persist();
  } else previewSkin = skinId;
  renderGarage();
});
$('g-upgrades').addEventListener('click', (e) => {
  const key = e.target.closest('[data-up]')?.dataset.up;
  if (!key) return;
  const v = getVehicle(viewing);
  const up = upgradesOf(v.id);
  const cost = upgradeCost(v, up[key]);
  if (up[key] >= MAX_LEVEL || save.coins < cost) return;
  save.coins -= cost;
  save.ups[v.id] = { ...up, [key]: up[key] + 1 };
  persist();
  showroom.pulse();
  renderGarage();
});
$('g-action').onclick = () => {
  const v = getVehicle(viewing);
  if (!save.owned.includes(v.id)) {
    if (save.coins < v.price) return;
    save.coins -= v.price;
    save.owned.push(v.id);
    save.selected = v.id;
    showroom.pulse();
  } else if (previewSkin && !ownsSkin(v.id, previewSkin)) {
    const skin = getSkin(v.id, previewSkin);
    if (save.coins < skin.price) return;
    save.coins -= skin.price;
    save.paints[v.id] = [...(save.paints[v.id] ?? []), skin.id];
    save.paint[v.id] = skin.id;
    previewSkin = null;
  } else if (save.selected !== v.id) save.selected = v.id;
  else return startRace('race');
  persist();
  renderGarage();
};

// ---- roads -----------------------------------------------------------------------------
function renderMaps() {
  coinsText();
  $('map-list').innerHTML = MAPS.map((m) => {
    const best = save.bests[m.id];
    return `<button class="map-card map-${m.id}" role="radio" data-map="${m.id}" aria-checked="${m.id === save.map}">
      <b>${m.name}</b><small>${routeText(m)}</small><p>${m.tagline}</p>
      <span class="best">${best ? `Best ${formatTime(best)}` : 'Not raced yet'}</span></button>`;
  }).join('');
}
$('map-list').addEventListener('click', (e) => {
  const id = e.target.closest('[data-map]')?.dataset.map;
  if (!id) return;
  save.map = getMap(id).id;
  persist();
  show('home');
});

// ---- racing ------------------------------------------------------------------------------
/** mode: 'race' (against AI), 'free' (free drive), or 'online' (with the lobby's players). */
function startRace(m) {
  raceMode = m;
  const me = getVehicle(save.selected);
  const meRacer = { vehicle: me, upgrades: upgradesOf(me.id), skin: skinOf(me.id), kind: 'player' };
  let racers;
  let mapId = save.map;
  if (m === 'online') {
    mapId = lobby.map;
    racers = lobby.players.map((p, i) =>
      p.id === lobby.id ? { ...meRacer, id: p.id } : { vehicle: getVehicle(p.vehicle), upgrades: NO_UPGRADES, skin: getSkin(p.vehicle, p.skin), kind: 'remote', id: p.id, name: playerLabel(i) },
    );
  } else if (m === 'free') racers = [meRacer];
  else {
    // five AI rivals in random vehicles and paints, on your upgrade levels; you start at the back
    const pool = [...VEHICLES].sort(() => Math.random() - 0.5).slice(0, 5);
    racers = [...pool.map((v) => ({ vehicle: v, upgrades: upgradesOf(me.id), skin: skinsOf(v.id)[Math.floor(Math.random() * skinsOf(v.id).length)], kind: 'bot' })), meRacer];
  }
  race = new Race3D(new Track(mapId, 1), racers, { free: m === 'free', clock: m === 'online' ? () => performance.now() / 1000 : null });
  view.load(race);
  buildTrackBar();
  sound.unlock(save.muted);
  sound.setVehicle(me.id);
  shownEvents = 0;
  acc = 0;
  $('toasts').innerHTML = '';
  show('play');
}

function togglePause() {
  if (mode === 'play') show('pause');
  else if (mode === 'pause') {
    last = performance.now();
    show('play');
  }
}

let dots = [];
function buildTrackBar() {
  const t = race.track;
  const pct = (s) => `${(Math.min(1, Math.max(0, s / t.finish)) * 100).toFixed(2)}%`;
  $('hud-track').innerHTML = t.towns.map((town) => `<i class="cp" style="left:${pct(town.s)}"></i>`).join('');
  dots = race.cars.map((c) => {
    const d = document.createElement('i');
    d.className = `dot ${c === race.player ? 'you' : ''}`;
    d.style.background = c.skin.body;
    $('hud-track').appendChild(d);
    return { c, d, pct };
  });
}

function updateHud() {
  const p = race.player;
  const t = race.track;
  $('hud-pos').innerHTML = race.free ? '🛣️' : `${race.placeOf(p)}<small>/${race.cars.length}</small>`;
  $('hud-time').textContent = formatTime(Math.max(0, race.time));
  const next = t.towns.find((town) => town.s > p.s) ?? t.towns.at(-1);
  $('hud-town').textContent = next.name;
  $('hud-dist').textContent = `${Math.max(0, Math.round(next.s - p.s))} m`;
  for (const { c, d, pct } of dots) d.style.left = pct(c.s);
  $('hud-speed').textContent = Math.round(p.speedKmh);
  $('hud-coins').textContent = p.coins;
  $('item-icon').textContent = p.item ? ITEMS[p.item].icon : '·';
  $('fire').classList.toggle('empty', !p.item);
  const cd = $('countdown');
  cd.hidden = race.free || race.time > 0.8;
  cd.textContent = race.time < 0 ? Math.ceil(-race.time) : 'GO!';
  while (shownEvents < race.events.length) {
    const el = document.createElement('span');
    el.className = 'toast';
    el.textContent = race.events[shownEvents++].text;
    $('toasts').appendChild(el);
    setTimeout(() => el.remove(), 1600);
  }
}

function endRace() {
  const p = race.player;
  const place = race.free ? 1 : race.placeOf(p);
  const time = race.free ? race.time : p.finishTime;
  const prize = race.free ? 0 : (RACE3D.prizes[place - 1] ?? 0);
  const best = save.bests[race.track.map.id];
  const isBest = raceMode !== 'online' && (!best || time < best);
  if (isBest) save.bests[race.track.map.id] = time;
  if (raceMode === 'race') {
    save.races++;
    if (place === 1) save.wins++;
  }
  if (raceMode === 'online') lobby?.sendFinish(time);
  save.coins += p.coins + prize;
  persist();
  $('over-title').textContent = race.free ? `🏁 ${race.track.towns.at(-1).name}!` : place === 1 ? '🏆 You won!' : `${ordinal(place)} place`;
  $('over-time').textContent = formatTime(time);
  $('over-best').hidden = !isBest;
  $('over-coins').textContent = p.coins + prize;
  $('over-standings').hidden = race.free;
  renderStandings();
  $('again-btn').textContent = raceMode === 'online' ? 'Back to lobby' : raceMode === 'free' ? 'Drive again' : 'Race again';
  show('over');
}

function renderStandings() {
  const p = race.player;
  // AI rivals still on the road: finish them at their current speed, so the results are complete
  if (raceMode === 'race') {
    for (const c of race.cars) if (c.finishTime === null && c.kind === 'bot') c.finishTime = race.time + (race.track.finish - c.s) / Math.max(12, c.v);
  }
  $('over-standings').innerHTML = race.standings
    .filter((c) => !c.left || c.finishTime !== null)
    .map((c, i) => `<li class="${c === p ? 'you' : ''}"><b>${i + 1}</b><i style="background:${c.skin.body}"></i>${c === p ? 'You' : c.name}<span>${c.finishTime !== null ? formatTime(c.finishTime) : 'racing…'}</span></li>`)
    .join('');
}

$('race-btn').onclick = () => startRace('race');
$('free-btn').onclick = () => startRace('free');
$('garage-open').onclick = () => {
  viewing = save.selected;
  previewSkin = null;
  show('garage');
};
$('garage-back').onclick = () => show('home');
$('map-open').onclick = () => show('maps');
$('maps-back').onclick = () => show('home');
$('pause-btn').onclick = togglePause;
$('resume-btn').onclick = togglePause;
$('quit-btn').onclick = () => {
  save.coins += race.player.coins; // keep the coins picked up
  persist();
  if (raceMode === 'online' && lobby) backToLobby();
  else show('home');
};
$('again-btn').onclick = () => (raceMode === 'online' ? backToLobby() : startRace(raceMode));
$('home-btn').onclick = () => show('home');
$('garage-btn').onclick = () => $('garage-open').onclick();
$('mute-btn').onclick = () => {
  save.muted = !save.muted;
  sound.setMuted(save.muted);
  persist();
  renderHome();
};

// ---- racing friends --------------------------------------------------------------------
const playerLabel = (i) => (i === 0 ? 'Host' : `Player ${i + 1}`);

function lobbyError(message) {
  lobby?.close();
  lobby = null;
  $('lobby-error').textContent = message;
  $('lobby-error').hidden = false;
  if (mode === 'lobby') renderLobby();
}

function connect(role, code) {
  if (!RELAY_URL) return lobbyError('Online races need the race server. See "Online races" in readme.md.');
  lobby?.close();
  lobby = new Lobby({ code, role, game: 'racer', me: { vehicle: save.selected, skin: skinOf(save.selected).id }, map: save.map });
  const l = lobby;
  const mine = (fn) => (...args) => l === lobby && fn(...args); // ignore a room we've already left
  for (const ev of ['update', 'reconnecting', 'reconnected']) l.on(ev, mine(() => mode === 'lobby' && renderLobby()));
  l.on('error', mine(lobbyError));
  l.on('host-left', mine(() => {
    if (raceMode === 'online' && (mode === 'play' || mode === 'pause')) race.say('The host left the race');
    else lobbyError('The host closed the race.');
    lobby = null;
  }));
  l.on('start', mine(() => startRace('online')));
  l.on('pose3d', mine((id, m) => raceMode === 'online' && race?.remotePose(id, m)));
  l.on('item', mine((id, kind) => raceMode === 'online' && race?.remoteFire(id, kind)));
  l.on('finish', mine((id, time) => {
    if (raceMode !== 'online' || !race) return;
    race.remoteFinish(id, time);
    if (mode === 'over') renderStandings();
  }));
  l.on('leave', mine((id) => {
    const car = race?.cars.find((c) => c.kind === 'remote' && c.id === id);
    if (car) car.left = true;
  }));
  $('lobby-error').hidden = true;
  renderLobby();
}

function backToLobby() {
  lobby?.endRace();
  show(lobby ? 'lobby' : 'home');
}

function renderLobby() {
  coinsText();
  $('lobby-choose').hidden = !!lobby;
  $('lobby-room').hidden = !lobby;
  if (!lobby) return;
  const host = lobby.isHost;
  $('room-code').textContent = lobby.code;
  const map = getMap(lobby.map ?? save.map);
  $('room-map').textContent = map.name;
  $('room-route').textContent = routeText(map);
  for (const b of ['map-prev', 'map-next']) $(b).hidden = !host;
  $('room-players').innerHTML = Array.from({ length: MAX_PLAYERS }, (_, i) => lobby.players[i])
    .map((p, i) => {
      if (!p) return `<li class="empty"><i></i>${lobby.id === null && i === 0 ? 'Connecting…' : 'Waiting for a friend…'}</li>`;
      const note = p.id === lobby.id ? ' (you)' : lobby.away.has(p.id) ? ' · reconnecting…' : '';
      return `<li class="${p.id === lobby.id ? 'you' : ''}"><i style="background:${getSkin(p.vehicle, p.skin).body}"></i>${playerLabel(i)}${note}<small>${getVehicle(p.vehicle).name}</small></li>`;
    })
    .join('');
  const start = $('room-start');
  start.hidden = !host;
  start.disabled = lobby.players.length < 2 || !lobby.connected;
  start.textContent = lobby.players.length < 2 ? 'Waiting for friends…' : `Start race ▶ (${lobby.players.length} players)`;
  const wait = $('room-wait');
  wait.hidden = host && lobby.connected;
  wait.textContent = !lobby.connected ? 'Reconnecting to the race…' : lobby.away.has(lobby.hostId) ? 'The host is reconnecting…' : lobby.racing ? 'A race is under way. You can race the next one.' : 'Waiting for the host to start…';
}

$('friends-btn').onclick = () => {
  $('lobby-error').hidden = true;
  show('lobby');
};
$('host-btn').onclick = () => connect('host', newCode());
$('join-form').onsubmit = (e) => {
  e.preventDefault();
  const code = parseCode($('join-code').value);
  if (!code) return lobbyError('Race codes are 5 letters and numbers, like K7M2Q.');
  connect('join', code);
};
$('share-btn').onclick = async () => {
  const url = joinLink(lobby.code, 'racer');
  const text = `Race me in SL Racing! Race code ${lobby.code}`;
  try {
    if (Capacitor.isNativePlatform()) await Share.share({ title: 'SL Racing', text, url });
    else if (navigator.share) await navigator.share({ title: 'SL Racing', text, url });
    else {
      await navigator.clipboard.writeText(`${text}: ${url}`);
      $('share-btn').textContent = 'Link copied ✓';
      setTimeout(() => ($('share-btn').textContent = 'Share link'), 2000);
    }
  } catch {
    /* share sheet dismissed */
  }
};
$('room-start').onclick = () => lobby?.isHost && lobby.connected && lobby.players.length >= 2 && lobby.start();
for (const [id, dir] of [['map-prev', -1], ['map-next', 1]]) {
  $(id).onclick = () => {
    const i = MAPS.findIndex((m) => m.id === lobby.map);
    lobby.setMap(MAPS[(i + dir + MAPS.length) % MAPS.length].id);
  };
}
$('lobby-back').onclick = () => {
  lobby?.close();
  lobby = null;
  show('home');
};

// race links: https://<relay>/race/CODE opens the app as slracing://join/CODE
function openRaceLink(url) {
  const code = parseCode(url ?? '');
  if (!code || mode === 'play' || mode === 'pause') return;
  show('lobby');
  connect('join', code);
}
if (Capacitor.isNativePlatform()) {
  NativeApp.addListener('appUrlOpen', ({ url }) => openRaceLink(url));
  NativeApp.getLaunchUrl().then((l) => l?.url && openRaceLink(l.url));
  NativeApp.addListener('resume', () => lobby?.wake());
  NativeApp.addListener('backButton', () => {
    if (mode === 'play' || mode === 'pause') togglePause();
    else if (mode === 'home') NativeApp.exitApp();
    else back();
  });
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden && mode === 'play' && raceMode !== 'online') togglePause();
  if (!document.hidden) lobby?.wake();
});

// ---- loop ------------------------------------------------------------------------------
function frame() {
  const now = performance.now();
  const dt = Math.min(Math.max((now - last) / 1000, 0), 0.1);
  last = now;
  if (mode === 'play' && race) {
    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps++ < 6) {
      acc -= STEP;
      const fire = held.fire && !firedLatch;
      firedLatch = held.fire;
      view.steer = (held.right ? 1 : 0) - (held.left ? 1 : 0); // for the front wheels
      race.step({ steer: view.steer, brake: held.brake, fire }, STEP);
      if (raceMode === 'online' && lobby) {
        for (const f of race.fired) lobby.send({ t: 'it', kind: f.kind });
        if (race.time >= 0 && Math.round(race.time * 60) % 4 === 0) {
          const c = race.player;
          const r2 = (x) => Math.round(x * 100) / 100;
          lobby.send({ t: 'p3', s: r2(c.s), d: r2(c.d), psi: r2(c.psi), v: r2(c.v), y: r2(c.y), grounded: c.grounded, spin: r2(c.spin), spinAngle: r2(c.spinAngle), boost: r2(c.boost), shield: r2(c.shield) });
        }
      }
    }
    sound.setLevel(Math.abs(race.player.v) / 0.35, !held.brake && !race.counting);
    updateHud();
    const finished = race.free ? race.player.s >= race.track.finish : race.done;
    if (finished) endRace();
  }
  if (MENUS.includes(mode) && showroom.ok) showroom.render(dt);
  else if (race && (mode === 'play' || mode === 'pause' || mode === 'over')) view.draw(mode === 'play' ? dt : 0);
  requestAnimationFrame(frame);
}

show('home');
requestAnimationFrame(frame);
openRaceLink(new URLSearchParams(location.search).get('join') && `join/${new URLSearchParams(location.search).get('join')}`); // web: ?join=CODE

if (import.meta.env.DEV) window.__racer = { get race() { return race; }, view, startRace, save };
