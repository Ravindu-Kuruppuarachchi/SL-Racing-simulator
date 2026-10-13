// bundled font, so the app works offline
import '@fontsource/baloo-2/latin-500.css';
import '@fontsource/baloo-2/latin-700.css';
import '@fontsource/baloo-2/latin-800.css';
import { App as NativeApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Game, NITRO, STEP } from './game.js';
import { Renderer, drawMapPreview, drawVehicleThumb } from './render.js';
import { MAPS, getMap } from './maps.js';
import { Lobby, MAX_PLAYERS, RELAY_URL, joinLink, newCode, parseCode } from './net.js';
import { RACE, Race, formatTime, nextPace, ordinal } from './race.js';
import { Showroom } from './showroom.js';
import { EngineSound } from './sound.js';
import { Music } from './music.js';
import { VEHICLES, getSkin, getVehicle, skinsOf, vehicleStats } from './vehicles.js';

const $ = (id) => document.getElementById(id);

// ---- save data -------------------------------------------------------------
const SAVE_KEY = 'tuktuk-climb-save';
const UPGRADES = [
  { key: 'engine', name: 'Engine', effect: (l) => `Power +${Math.round((l * 100) / 3)}%`, icon: '<path d="M4 10h3l2-3h6v3h3l2 2v5h-2v2h-4l-2-2H9l-2-2H4z"/><path d="M11 4h4"/>' },
  { key: 'suspension', name: 'Suspension', effect: (l) => `Stiffness +${l * 17}%`, icon: '<path d="M12 2v3M12 19v3M7 5h10M7 19h10M8 8l8 2-8 2 8 2-8 2"/>' },
  { key: 'tires', name: 'Tyres', effect: (l) => `Grip +${(l * 0.15).toFixed(2)}`, icon: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><path d="M12 3v5M12 16v5M3 12h5M16 12h5"/>' },
  { key: 'tank', name: 'Fuel tank', effect: (l) => `Capacity +${l * 25}%`, icon: '<path d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h14M7 8h6M15 9l3 3v6a1.5 1.5 0 0 0 3 0V9l-3-3"/>' },
];
const COSTS = [150, 400, 800, 1400, 2200];
const MAX_LEVEL = COSTS.length;
const NO_UPGRADES = { engine: 0, suspension: 0, tires: 0, tank: 0 };
// pricier vehicles cost more to upgrade
const upgradeCost = (vehicle, lvl) => Math.round((COSTS[lvl] * (1 + vehicle.price / 6000)) / 10) * 10;
// vehicles renamed after the first release; old saves use the old ids
const RENAMED = { wagonr: 'hatchback', prius: 'hybrid', defender: 'jeep' };

function load() {
  // paint: equipped skin per vehicle; paints: skins bought per vehicle (the factory paint is free)
  // mode: 'ride' (free ride) or 'race'; racing: per map { pace, wins, races, best } (see race.js)
  // settings: music and sound volume (0-1), tilt: handling sensitivity (0.5-1.5)
  const fresh = { coins: 0, bests: {}, settings: { music: 0.5, sound: 0.8, tilt: 1 }, selected: 'tuktuk', owned: ['tuktuk'], ups: {}, map: 'hills', paint: {}, paints: {}, mode: 'ride', racing: {} };
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!s) return fresh;
    const save = { ...fresh, ...s };
    save.settings = { ...fresh.settings, ...s.settings };
    if (s.muted && !s.settings) save.settings.music = save.settings.sound = 0; // the old mute button
    delete save.muted;
    if (s.up && !s.ups) save.ups = { tuktuk: s.up }; // saves from before vehicles existed
    delete save.up;
    if (s.best && !s.bests) save.bests = { hills: s.best }; // saves from before maps existed
    delete save.best;
    const id = (old) => RENAMED[old] ?? old;
    save.selected = id(save.selected);
    save.owned = save.owned.map(id);
    save.ups = Object.fromEntries(Object.entries(save.ups).map(([k, v]) => [id(k), v]));
    return save;
  } catch {
    return fresh;
  }
}
const save = load();
const upgradesOf = (id) => ({ ...NO_UPGRADES, ...save.ups[id] });
const bestOf = (map) => save.bests[map] ?? 0;
const skinOf = (id) => getSkin(id, save.paint[id]);
const ownsSkin = (id, skinId) => skinsOf(id)[0].id === skinId || (save.paints[id] ?? []).includes(skinId);
function newGame(id = save.selected) {
  // free ride: fuel to manage, no nitro
  const g = new Game(id, upgradesOf(id), undefined, save.map, { nitro: false, tilt: save.settings.tilt });
  g.skin = skinOf(id); // read by the renderer
  return g;
}
// bank a finished or abandoned run: best distance for this map
function recordBest(dist) {
  save.bests[save.map] = Math.max(bestOf(save.map), dist);
}
function persist() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    /* storage unavailable: progress lasts for this session only */
  }
}

// Best race runs per map, replayed as ghosts. Kept apart from the save: they're ~25 KB each.
const GHOST_KEY = 'tuktuk-climb-ghosts';
const ghosts = (() => {
  try {
    return JSON.parse(localStorage.getItem(GHOST_KEY)) ?? {};
  } catch {
    return {};
  }
})();
function persistGhosts() {
  try {
    localStorage.setItem(GHOST_KEY, JSON.stringify(ghosts));
  } catch {
    /* too big or unavailable: the ghost lasts for this session only */
  }
}
const racingOf = (map) => (save.racing[map] ??= { pace: RACE.startPace, wins: 0, races: 0, best: null });

// ---- state -----------------------------------------------------------------
const renderer = new Renderer($('game'));
const showroom = new Showroom($('stage'));
const sound = new EngineSound();
const music = new Music();
music.volume = save.settings.music;
let settingsFrom = 'home'; // the screen the settings page goes back to
const input = { gas: false, brake: false, nitro: false };
let game = newGame();
let race = null; // the race in progress (race mode), whose player game is `game`
let lobby = null; // the online race room we're in (net.js), if any
let pendingJoin = null; // a race link opened mid-run, handled back at home
let mode = 'home'; // home | garage | maps | play | pause | over
let viewing = save.selected; // vehicle shown in the garage
let previewSkin = null; // paint picked in the garage but not bought yet (null: the equipped one)
let acc = 0;
let last = performance.now();
let shownEvents = 0;
renderer.reset(game);

// ---- input -----------------------------------------------------------------
const keys = { gas: ['ArrowRight', 'KeyD', 'ArrowUp', 'KeyW'], brake: ['ArrowLeft', 'KeyA', 'ArrowDown', 'KeyS'], nitro: ['Space', 'KeyN', 'ShiftLeft', 'ShiftRight'] };
function onKey(e, down) {
  if (e.target.closest?.('input, textarea')) return; // typing a race code, not driving
  for (const [action, codes] of Object.entries(keys)) {
    if (codes.includes(e.code)) {
      input[action] = down;
      e.preventDefault();
    }
  }
  if (down && (e.code === 'Escape' || e.code === 'KeyP')) togglePause();
  if (down && e.code === 'Enter' && mode === 'cover' && !e.repeat) return leaveCover();
  if (down && e.code === 'Enter' && (mode === 'home' || mode === 'over') && !e.repeat) startRun();
  if (down && e.code === 'Escape' && mode === 'settings') show(settingsFrom);
  if (down && e.code === 'Escape' && (mode === 'garage' || mode === 'maps')) show('home');
  if (down && e.code === 'Escape' && mode === 'lobby') $('lobby-back').onclick();
  if (mode === 'home' || mode === 'garage') {
    if (down && e.code === 'ArrowLeft') cycle(-1);
    if (down && e.code === 'ArrowRight') cycle(1);
  }
}
addEventListener('keydown', (e) => onKey(e, true));
addEventListener('keyup', (e) => onKey(e, false));

function bindPedal(el, action) {
  const set = (v) => (e) => {
    e.preventDefault();
    input[action] = v;
    el.classList.toggle('down', v);
  };
  el.addEventListener('pointerdown', set(true));
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, set(false));
}
bindPedal($('gas'), 'gas');
bindPedal($('brake'), 'brake');
bindPedal($('nitro'), 'nitro');
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('blur', () => {
  input.gas = input.brake = input.nitro = false;
  if (mode === 'play') togglePause();
});

// ---- screens ---------------------------------------------------------------
const MENUS = ['home', 'garage'];
function show(next) {
  mode = next;
  if (MENUS.includes(next) || next === 'maps' || next === 'lobby') race = null; // back in the menus: the race is over
  if ((MENUS.includes(next) || next === 'maps') && lobby) {
    lobby.close(); // left the online race for the menus
    lobby = null;
  }
  for (const id of ['cover', 'home', 'garage', 'maps', 'lobby', 'pause', 'over', 'settings']) $(id).hidden = id !== next;
  $('hud').hidden = MENUS.includes(next) || next === 'cover';
  if (next === 'play') music.play('drive');
  else if (next !== 'pause' && next !== 'settings') music.play('menu');
  $('controls').hidden = next !== 'play';
  $('race-hud').hidden = !race;
  $('countdown').hidden = true;
  for (const el of document.querySelectorAll('.stats')) el.hidden = !!race;
  $('checkpoint-btn').hidden = !race;
  // the cartoon scenery is behind the cover and home; the 3D stage is the garage's
  $('scenery').hidden = !(next === 'cover' || next === 'home');
  $('stage').hidden = !(next === 'garage' && showroom.ok);
  if (next !== 'play') sound.setLevel(0, false);
  if (next === 'garage') {
    showroom.setScene(next);
    showroom.setSlot($(`${next}-slot`));
  }
  if (next === 'home') renderHome();
  if (next === 'garage') renderGarage();
  if (next === 'maps') renderMaps();
  if (next === 'lobby') renderLobby();
  if (next === 'home' && pendingJoin) {
    const code = pendingJoin;
    pendingJoin = null;
    joinRace(code);
  }
}

// Without WebGL, show the 2D artwork in the slot instead.
// Home shows the vehicle as cartoon art over the scenery; the garage in 3D.
function showVehicle(id, skin = skinOf(id)) {
  if (showroom.ok && mode !== 'home') return showroom.setVehicle(id, skin);
  const slot = $(`${mode}-slot`);
  let c = slot.querySelector('canvas');
  if (!c) {
    c = document.createElement('canvas');
    c.className = 'thumb';
    slot.prepend(c);
  }
  drawVehicleThumb(c, getVehicle(id), skin);
}

const coinsText = () => document.querySelectorAll('.js-coins').forEach((el) => (el.textContent = save.coins.toLocaleString()));

function renderHome() {
  const v = getVehicle(save.selected);
  const up = upgradesOf(v.id);
  coinsText();
  const map = getMap(save.map);
  const racing = racingOf(map.id);
  $('best-pill').innerHTML =
    save.mode === 'race'
      ? `<small>RACE BEST</small> <b>${racing.best ? formatTime(racing.best) : '–'}</b>${racing.races ? ` <small>· won ${racing.wins}/${racing.races}</small>` : ''}`
      : `<small>BEST</small> <b>${bestOf(save.map)}</b> m`;
  for (const b of $('mode-pick').querySelectorAll('[data-mode]')) b.setAttribute('aria-checked', b.dataset.mode === save.mode);
  $('start-btn').textContent = save.mode === 'race' ? 'Race ▶' : 'Start ▶';
  $('friends-btn').hidden = save.mode !== 'race';
  $('home-tag').textContent = map.tagline;
  $('map-icon').className = `map-icon map-${map.id}`;
  $('map-name').textContent = map.name;
  $('map-route').textContent = map.route;
  if (showroom.ok) showroom.setTheme(save.map);
  $('home-name').textContent = v.name;
  const total = Object.values(up).reduce((a, b) => a + b, 0);
  $('home-levels').textContent = `${v.blurb} · upgrades ${total}/${UPGRADES.length * MAX_LEVEL}`;
  for (const b of $('home').querySelectorAll('.nav-btn')) b.hidden = save.owned.length < 2;
  showVehicle(v.id);
}

// Stat bars compare against the best any vehicle can reach when fully upgraded.
const MAXED = { engine: MAX_LEVEL, suspension: MAX_LEVEL, tires: MAX_LEVEL, tank: MAX_LEVEL };
function statValues(v, up) {
  const s = vehicleStats(v, up);
  const r = Math.max(...v.wheels.map((w) => w.r));
  return {
    power: v.rating.power * (1 + up.engine / 3),
    speed: s.speed * r * 3.6, // km/h at the wheel rim
    grip: s.grip,
    range: s.tank / v.fuelUse,
  };
}
const STAT_MAX = Object.fromEntries(['power', 'speed', 'grip', 'range'].map((k) => [k, Math.max(...VEHICLES.map((v) => statValues(v, MAXED)[k]))]));
const STAT_LABELS = [
  ['power', 'Power', () => ''],
  ['speed', 'Top speed', (x) => `${Math.round(x)} km/h`],
  ['grip', 'Grip', (x) => x.toFixed(2)],
  ['range', 'Fuel range', (x) => `${Math.round(x)}`],
];

function renderStats(v, up, preview) {
  const now = statValues(v, up);
  const next = preview ? statValues(v, { ...up, [preview]: up[preview] + 1 }) : now;
  $('g-stats').innerHTML = STAT_LABELS.map(([k, label, fmt]) => {
    const pct = (x) => `${Math.min((x / STAT_MAX[k]) * 100, 100).toFixed(1)}%`;
    return `<div class="stat"><div class="stat-top"><span>${label}</span><b>${fmt(next[k])}</b></div>
      <div class="stat-bar"><i class="next" style="width:${pct(next[k])}"></i><i class="now" style="width:${pct(now[k])}"></i></div></div>`;
  }).join('');
}

function renderGarage() {
  const v = getVehicle(viewing);
  const owned = save.owned.includes(v.id);
  const selected = save.selected === v.id;
  const up = upgradesOf(v.id);
  coinsText();

  $('vehicle-tabs').innerHTML = VEHICLES.map((t) => {
    const mark = save.selected === t.id ? '✓' : save.owned.includes(t.id) ? '' : '🔒';
    return `<button class="tab" role="tab" data-view="${t.id}" aria-selected="${t.id === v.id}">${t.name}${mark ? `<span class="mark">${mark}</span>` : ''}</button>`;
  }).join('');
  $('vehicle-tabs').querySelector('[aria-selected="true"]').scrollIntoView({ block: 'nearest', inline: 'nearest' });

  $('g-name').textContent = v.name;
  $('g-blurb').textContent = v.blurb;
  const status = $('g-status');
  status.className = `chip ${selected ? 'driving' : owned ? '' : 'locked'}`;
  status.textContent = selected ? 'DRIVING' : owned ? 'OWNED' : `Rs ${v.price.toLocaleString()}`;
  $('lock-badge').hidden = owned;
  renderStats(v, up);

  $('g-upgrades').innerHTML = UPGRADES.map(({ key, name, effect, icon }) => {
    const lvl = up[key];
    const cost = upgradeCost(v, lvl);
    const pips = Array.from({ length: MAX_LEVEL }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('');
    const btn = !owned
      ? '<button class="buy" disabled>🔒</button>'
      : lvl >= MAX_LEVEL
        ? '<button class="buy max" disabled>MAX</button>'
        : `<button class="buy" data-up="${key}" ${save.coins < cost ? 'disabled' : ''}>Rs ${cost.toLocaleString()}</button>`;
    const note = lvl >= MAX_LEVEL ? `${effect(lvl)} (max)` : `${effect(lvl)} → ${effect(lvl + 1).replace(/^[^+]+/, '')}`;
    return `<div class="upg ${owned ? '' : 'locked'}" data-preview="${owned && lvl < MAX_LEVEL ? key : ''}">
      <div class="upg-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icon}</svg></div>
      <div><div class="upg-top"><b>${name}</b><span>Level ${lvl}/${MAX_LEVEL}</span></div><div class="pips">${pips}</div><small>${note}</small></div>
      ${btn}</div>`;
  }).join('');

  const action = $('g-action');
  action.className = 'btn primary';
  action.disabled = false;
  if (!owned) {
    const short = v.price - save.coins;
    action.className = 'btn buy-vehicle';
    action.textContent = short > 0 ? `Need Rs ${short.toLocaleString()} more` : `Buy for Rs ${v.price.toLocaleString()}`;
    action.disabled = short > 0;
  } else action.textContent = selected ? 'Start ▶' : `Drive the ${v.name} ▶`;
  showVehicle(v.id, renderPaints(v, owned));
}

// Paint swatches; returns the skin to show on the model.
function renderPaints(v, owned) {
  const equipped = skinOf(v.id);
  const shown = getSkin(v.id, previewSkin ?? equipped.id);
  $('g-paints').innerHTML = skinsOf(v.id).map((k) => {
    const mark = k.id === equipped.id ? '<span class="mark on">✓</span>' : ownsSkin(v.id, k.id) ? '' : '<span class="mark">🔒</span>';
    return `<button class="swatch" role="radio" data-skin="${k.id}" aria-checked="${k.id === shown.id}" aria-label="${k.name}" title="${k.name}"
      style="--body:${k.body};--light:${k.light};--dark:${k.dark}">${mark}</button>`;
  }).join('');
  $('g-paint-name').textContent = shown.name;
  const buy = $('g-paint-buy');
  buy.className = 'buy';
  buy.disabled = false;
  const have = ownsSkin(v.id, shown.id);
  if (shown.id === equipped.id) {
    $('g-paint-note').textContent = shown.price ? 'Your paint' : 'Factory paint';
    buy.className = 'buy max';
    buy.textContent = '✓';
    buy.disabled = true;
  } else if (have) {
    $('g-paint-note').textContent = 'Owned';
    buy.textContent = 'Apply';
    buy.disabled = !owned;
  } else {
    $('g-paint-note').textContent = owned ? (save.coins < shown.price ? `Need Rs ${(shown.price - save.coins).toLocaleString()} more` : 'Preview') : `Buy the ${v.name} first`;
    buy.textContent = owned ? `Rs ${shown.price.toLocaleString()}` : '🔒';
    buy.disabled = !owned || save.coins < shown.price;
  }
  return shown;
}

function applySkin(id, skinId) {
  save.paint[id] = skinId;
  persist();
  if (game.vehicle.id === id) game.skin = skinOf(id);
}

// switch the garage to another vehicle (forgetting any paint preview)
function view(id) {
  viewing = id;
  previewSkin = null;
  renderGarage();
}

function cycle(dir) {
  // home cycles through owned vehicles; the garage through all of them
  const list = mode === 'home' ? VEHICLES.filter((v) => save.owned.includes(v.id)) : VEHICLES;
  const cur = mode === 'home' ? save.selected : viewing;
  const i = list.findIndex((v) => v.id === cur);
  const next = list[(i + dir + list.length) % list.length].id;
  if (mode === 'home') selectVehicle(next);
  else view(next);
}
for (const b of document.querySelectorAll('[data-cycle]')) b.onclick = () => cycle(+b.dataset.cycle);

function selectVehicle(id) {
  save.selected = viewing = id;
  previewSkin = null;
  persist();
  game = newGame(id);
  renderer.reset(game);
  if (mode === 'home') renderHome();
  else renderGarage();
}

$('vehicle-tabs').addEventListener('click', (e) => {
  const id = e.target.closest('[data-view]')?.dataset.view;
  if (id) view(id);
});

// tapping a paint you own applies it; any other previews it
$('g-paints').addEventListener('click', (e) => {
  const skinId = e.target.closest('[data-skin]')?.dataset.skin;
  if (!skinId) return;
  if (save.owned.includes(viewing) && ownsSkin(viewing, skinId)) {
    applySkin(viewing, skinId);
    previewSkin = null;
  } else previewSkin = skinId;
  renderGarage();
});

$('g-paint-buy').onclick = () => {
  const v = getVehicle(viewing);
  const skin = getSkin(v.id, previewSkin ?? skinOf(v.id).id);
  if (!save.owned.includes(v.id)) return;
  if (!ownsSkin(v.id, skin.id)) {
    if (save.coins < skin.price) return;
    save.coins -= skin.price;
    save.paints[v.id] = [...(save.paints[v.id] ?? []), skin.id];
  }
  applySkin(v.id, skin.id);
  previewSkin = null;
  renderGarage();
};

$('g-upgrades').addEventListener('click', (e) => {
  const key = e.target.closest('[data-up]')?.dataset.up;
  if (!key) return;
  const vehicle = getVehicle(viewing);
  const up = upgradesOf(vehicle.id);
  const cost = upgradeCost(vehicle, up[key]);
  if (up[key] >= MAX_LEVEL || save.coins < cost) return;
  save.coins -= cost;
  save.ups[vehicle.id] = { ...up, [key]: up[key] + 1 };
  persist();
  showroom.pulse();
  renderGarage();
});
// hovering an upgrade previews its effect on the stat bars
$('g-upgrades').addEventListener('pointerover', (e) => {
  const key = e.target.closest('[data-preview]')?.dataset.preview;
  renderStats(getVehicle(viewing), upgradesOf(viewing), key || null);
});
$('g-upgrades').addEventListener('pointerleave', () => renderStats(getVehicle(viewing), upgradesOf(viewing)));

$('g-action').onclick = () => {
  const v = getVehicle(viewing);
  if (!save.owned.includes(v.id)) {
    if (save.coins < v.price) return;
    save.coins -= v.price;
    save.owned.push(v.id);
    showroom.pulse();
    selectVehicle(v.id);
  } else if (save.selected !== v.id) selectVehicle(v.id);
  else startRun();
};

function startRun() {
  if (lobby) return backToLobby(); // "Race again" after an online race
  race =
    save.mode === 'race'
      ? new Race({
          mapId: save.map,
          player: { vehicleId: save.selected, upgrades: upgradesOf(save.selected), skin: skinOf(save.selected), tilt: save.settings.tilt },
          pace: racingOf(save.map).pace,
          ghost: ghosts[save.map],
        })
      : null;
  launch();
}

// Start driving: `race` is the race to run, or null for free ride.
function launch() {
  unlockAudio();
  sound.setVehicle(save.selected);
  game = race ? race.player.game : newGame();
  if (race) buildRaceTrack();
  renderer.reset(game);
  shownEvents = 0;
  acc = 0;
  $('toasts').innerHTML = '';
  show('play');
}

function endRun() {
  const dist = game.distance;
  const isBest = dist > bestOf(save.map);
  recordBest(dist);
  save.coins += game.coinsEarned;
  persist();
  $('over-reason').textContent = game.over;
  $('over-dist').textContent = dist;
  $('over-unit').textContent = 'm';
  $('over-coins').textContent = game.coinsEarned;
  $('over-best').textContent = 'New best!';
  $('over-best').hidden = !isBest;
  $('over-standings').hidden = true;
  $('retry-btn').textContent = 'Drive again';
  show('over');
}

// ---- race ------------------------------------------------------------------
// The progress bar: a tick per checkpoint, a dot per racer.
let raceDots = [];
function buildRaceTrack() {
  const track = $('race-track');
  const pct = (x) => `${(Math.min(Math.max((x - 3) / (race.finish - 3), 0), 1) * 100).toFixed(2)}%`;
  track.innerHTML =
    '<i class="done"></i>' +
    race.checkpoints.map((c, i) => `<i class="cp ${i === race.checkpoints.length - 1 ? 'finish' : ''}" style="left:${pct(c.x)}" title="${c.town}"></i>`).join('');
  raceDots = [...race.rivals, race.player].map((r) => {
    const dot = document.createElement('i');
    dot.className = `dot ${r.kind === 'player' ? 'you' : r.kind}`;
    dot.style.background = r.skin.body;
    dot.title = r.name;
    track.appendChild(dot);
    return { r, dot };
  });
  raceDots.pct = pct;
  $('race-len').textContent = (race.finish - 3).toLocaleString();
}

function updateRaceHud() {
  const pct = raceDots.pct;
  const you = race.xOf(race.player);
  $('race-track').querySelector('.done').style.width = pct(you);
  for (const { r, dot } of raceDots) dot.style.left = pct(race.xOf(r));
  $('race-pos').textContent = `${ordinal(race.position)} / ${race.rivals.length + 1}`;
  $('race-time').textContent = formatTime(Math.max(race.time, 0));
  $('race-dist').textContent = Math.round(Math.min(Math.max(you - 3, 0), race.finish - 3)).toLocaleString();
  const cd = $('countdown');
  cd.hidden = race.time > 0.8;
  cd.textContent = race.time < 0 ? Math.ceil(-race.time) : 'GO!';
}

function endRace() {
  const r = race.player;
  const place = race.place;
  const racing = racingOf(save.map);
  const won = place === 1;
  // races with friends don't touch the bots' pace, your best time or your ghost
  const isBest = !race.online && (!racing.best || r.finishTime < racing.best);
  if (race.online) lobby?.sendFinish(r.finishTime);
  else {
    racing.races++;
    if (won) racing.wins++;
    // win and the bots get quicker, lose and they ease off: you end up winning about half
    racing.pace = nextPace(racing.pace, won);
  }
  if (isBest) {
    racing.best = r.finishTime;
    ghosts[save.map] = race.run;
    persistGhosts();
  }
  const prize = RACE.prizes[place - 1] ?? 0;
  const coins = game.coinsEarned + prize;
  save.coins += coins;
  persist();
  $('over-reason').textContent = won ? '🏆 You won!' : `${ordinal(place)} place`;
  $('over-dist').textContent = formatTime(r.finishTime);
  $('over-unit').textContent = '';
  $('over-best').textContent = 'New best time!';
  $('over-best').hidden = !isBest;
  $('over-coins').textContent = coins;
  $('retry-btn').textContent = race.online ? 'Back to lobby' : 'Race again';
  $('over-standings').hidden = false;
  renderStandings();
  show('over');
}

// Results list; redrawn as friends' finishes come in after yours.
function renderStandings() {
  const you = race.player;
  $('over-standings').innerHTML = race.standings
    .filter((x) => !x.left || x.finishTime !== null)
    .map((x, i) => {
      const who = x.kind === 'player' ? `You <small>${x.vehicle.name}</small>` : x.kind === 'remote' ? `${x.name} <small>${x.vehicle.name}</small>` : x.name;
      const result = x.finishTime !== null ? formatTime(x.finishTime) : x.kind === 'remote' ? 'racing…' : `${Math.round(race.xOf(x) - 3)} m`;
      return `<li class="${x === you ? 'you' : ''}"><b>${i + 1}</b><i style="background:${x.skin.body}"></i>${who}<span>${result}</span></li>`;
    })
    .join('');
}

// ---- races with friends ------------------------------------------------------
// The host (first in the list) and Player 2..6 in join order.
const playerLabel = (i) => (i === 0 ? 'Host' : `Player ${i + 1}`);

function openLobby() {
  $('lobby-error').hidden = true;
  show('lobby');
}

function lobbyError(message) {
  lobby?.close();
  lobby = null;
  const el = $('lobby-error');
  el.textContent = message;
  el.hidden = false;
  if (mode === 'lobby') renderLobby();
}

function connect(role, code) {
  if (!RELAY_URL) return lobbyError('Online races need the race server. See "Online races" in readme.md to set it up.');
  lobby?.close();
  lobby = new Lobby({ code, role, me: { vehicle: save.selected, skin: skinOf(save.selected).id }, map: save.map });
  const l = lobby;
  const mine = (fn) => (...args) => l === lobby && fn(...args); // ignore a room we've already left
  l.on('update', mine(() => mode === 'lobby' && renderLobby()));
  l.on('reconnecting', mine(() => mode === 'lobby' && renderLobby()));
  l.on('reconnected', mine(() => mode === 'lobby' && renderLobby()));
  l.on('error', mine(lobbyError));
  l.on('host-left', mine(() => {
    if (race?.online && (mode === 'play' || mode === 'pause')) game.say('The host left the race');
    else lobbyError('The host closed the race.');
    lobby = null;
  }));
  l.on('start', mine(startOnlineRace));
  l.on('pose', mine((id, m) => race?.online && race.remotePose(id, m.x, m.y, m.a)));
  l.on('finish', mine((id, time) => {
    if (!race?.online) return;
    race.remoteFinish(id, time);
    if (mode === 'over') renderStandings();
  }));
  l.on('leave', mine((id) => race?.online && race.remoteLeft(id)));
  $('lobby-error').hidden = true;
  renderLobby();
}

function joinRace(code) {
  openLobby();
  connect('join', code);
}

function startOnlineRace() {
  const me = lobby.players.find((p) => p.id === lobby.id);
  if (!me) return;
  race = new Race({
    mapId: lobby.map,
    player: { vehicleId: save.selected, upgrades: upgradesOf(save.selected), skin: skinOf(save.selected), tilt: save.settings.tilt },
    online: { players: lobby.players.map((p, i) => ({ ...p, label: playerLabel(i) })), me: lobby.id, clock: () => performance.now() / 1000 },
  });
  launch();
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
  $('room-route').textContent = map.route;
  for (const b of ['map-prev', 'map-next']) $(b).hidden = !host;
  const slots = Array.from({ length: MAX_PLAYERS }, (_, i) => lobby.players[i]);
  $('room-players').innerHTML = slots
    .map((p, i) => {
      if (!p) return `<li class="empty"><i></i>${lobby.id === null && i === 0 ? 'Connecting…' : 'Waiting for a friend…'}</li>`;
      const skin = getSkin(p.vehicle, p.skin);
      const note = p.id === lobby.id ? ' (you)' : lobby.away.has(p.id) ? ' · reconnecting…' : '';
      return `<li class="${p.id === lobby.id ? 'you' : ''}"><i style="background:${skin.body}"></i>${playerLabel(i)}${note}<small>${getVehicle(p.vehicle).name}</small></li>`;
    })
    .join('');
  const start = $('room-start');
  start.hidden = !host;
  start.disabled = lobby.players.length < 2;
  start.textContent = lobby.players.length < 2 ? 'Waiting for friends…' : `Start race ▶ (${lobby.players.length} players)`;
  const wait = $('room-wait');
  wait.hidden = host && lobby.connected;
  wait.textContent = !lobby.connected
    ? 'Reconnecting to the race…'
    : lobby.away.has(lobby.hostId)
      ? 'The host is reconnecting…'
      : lobby.racing
        ? 'A race is under way. You can race the next one.'
        : 'Waiting for the host to start…';
  start.disabled = start.disabled || !lobby.connected;
}

async function shareRace() {
  const url = joinLink(lobby.code);
  const text = `Race me in Hill Rush! Race code ${lobby.code}`;
  try {
    if (Capacitor.isNativePlatform()) await Share.share({ title: 'Hill Rush race', text, url });
    else if (navigator.share) await navigator.share({ title: 'Hill Rush race', text, url });
    else {
      await navigator.clipboard.writeText(`${text}: ${url}`);
      $('share-btn').textContent = 'Link copied ✓';
      setTimeout(() => ($('share-btn').textContent = 'Share link'), 2000);
    }
  } catch {
    /* share sheet dismissed */
  }
}

$('friends-btn').onclick = openLobby;
$('host-btn').onclick = () => connect('host', newCode());
$('join-form').onsubmit = (e) => {
  e.preventDefault();
  const code = parseCode($('join-code').value);
  if (!code) return lobbyError('Race codes are 5 letters and numbers, like K7M2Q.');
  connect('join', code);
};
$('share-btn').onclick = shareRace;
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

// Race links: https://<relay>/join/CODE opens the app as tuktukclimb://join/CODE
function openRaceLink(url) {
  const code = parseCode(url ?? '');
  if (!code) return;
  if (mode === 'play' || mode === 'pause') pendingJoin = code; // after this run
  else joinRace(code);
}
if (Capacitor.isNativePlatform()) {
  NativeApp.addListener('appUrlOpen', ({ url }) => openRaceLink(url));
  NativeApp.getLaunchUrl().then((launch) => launch?.url && openRaceLink(launch.url));
}

function togglePause() {
  if (mode === 'play') show('pause');
  else if (mode === 'pause') {
    last = performance.now();
    show('play');
  }
}

function openGarage() {
  viewing = save.selected;
  previewSkin = null;
  show('garage');
}

// ---- map page ----------------------------------------------------------------
// One card per road: painted preview, route, best distance and the hazards on it.
function renderMaps() {
  coinsText();
  $('map-list').innerHTML = MAPS.map((m) => {
    const hazards = [...new Set(Object.values(m.hard))].slice(0, 4);
    const best = bestOf(m.id);
    return `<div class="map-card" role="radio" tabindex="0" data-map="${m.id}" aria-checked="${m.id === save.map}">
      <canvas class="map-preview ${m.sky ?? ''}" data-preview="${m.id}"></canvas>
      <div class="map-info">
        <div class="map-head"><b>${m.name}</b>${m.id === save.map ? '<span class="chip driving">SELECTED</span>' : ''}</div>
        <small class="map-route">${m.route}</small>
        <p>${m.tagline}</p>
        <div class="hazards">${hazards.map((h) => `<span>${h}</span>`).join('')}</div>
        <div class="map-foot"><span class="map-best">${best ? `Best <b>${best.toLocaleString()}</b> m` : 'Not driven yet'}${racingOf(m.id).best ? ` · Race <b>${formatTime(racingOf(m.id).best)}</b>` : ''}</span>
          <button class="btn primary drive" data-drive="${m.id}">Drive ▶</button></div>
      </div>
    </div>`;
  }).join('');
  for (const c of $('map-list').querySelectorAll('[data-preview]')) drawMapPreview(c, getMap(c.dataset.preview));
  $('map-list').querySelector('[aria-checked="true"]')?.scrollIntoView({ block: 'nearest' });
}

function pickMap(id) {
  save.map = getMap(id).id;
  persist();
}

$('map-list').addEventListener('click', (e) => {
  const drive = e.target.closest('[data-drive]')?.dataset.drive;
  if (drive) {
    pickMap(drive);
    return startRun();
  }
  const id = e.target.closest('[data-map]')?.dataset.map;
  if (!id) return;
  pickMap(id);
  show('home');
});
$('map-list').addEventListener('keydown', (e) => {
  const id = e.target.closest('[data-map]')?.dataset.map;
  if (id && (e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-map]')) {
    e.preventDefault();
    pickMap(id);
    show('home');
  }
});
$('map-open').onclick = () => show('maps');
$('maps-back').onclick = () => show('home');

$('start-btn').onclick = startRun;
$('garage-open').onclick = openGarage;
$('garage-back').onclick = () => show('home');
$('retry-btn').onclick = startRun;
$('garage-btn').onclick = openGarage;
$('home-btn').onclick = () => show('home');
$('quit-btn').onclick = () => {
  // bank what was earned so quitting isn't a loss (a quit race doesn't count either way)
  if (!race) recordBest(game.distance);
  save.coins += game.coinsEarned;
  persist();
  const online = race?.online;
  race = null;
  if (online && lobby) backToLobby();
  else show('home');
};
$('checkpoint-btn').onclick = () => {
  const r = race.player;
  game.respawn(race.checkpointX(r));
  game.say(r.cp >= 0 ? `Back to ${race.checkpoints[r.cp].town}` : 'Back to the start');
  togglePause();
};
$('mode-pick').addEventListener('click', (e) => {
  const m = e.target.closest('[data-mode]')?.dataset.mode;
  if (!m || m === save.mode) return;
  save.mode = m;
  persist();
  renderHome();
});
$('pause-btn').onclick = togglePause;
$('resume-btn').onclick = togglePause;
// ---- cover and settings ----------------------------------------------------------
function unlockAudio() {
  sound.unlock(save.settings.sound <= 0);
  sound.setVolume(save.settings.sound);
  music.unlock();
}
// The cover's loading bar: fills while the fonts and the 3D garage get ready, then "Tap to play".
let coverReady = false;
function loadCover() {
  const start = performance.now();
  let ready = false;
  // fonts loaded (never wait more than 2 s for them: some WebViews never report it)
  const fonts = Promise.race([document.fonts?.ready ?? Promise.resolve(), new Promise((r) => setTimeout(r, 2000))]);
  Promise.all([fonts, new Promise((r) => setTimeout(r, 300))]).then(() => (ready = true));
  const tick = () => {
    const t = (performance.now() - start) / 1800; // at least ~2 s, so the splash is seen
    const pct = Math.min(ready ? 100 : 92, Math.round(100 * (1 - (1 - Math.min(t, 1)) ** 2)));
    $('cover-fill').style.width = `${pct}%`;
    $('cover-pct').textContent = `${pct}%`;
    if (pct < 100) return setTimeout(tick, 33);
    coverReady = true;
    document.querySelector('.cover-load').hidden = true;
    $('cover-play').hidden = false;
  };
  tick();
}

function leaveCover() {
  if (mode !== 'cover' || !coverReady) return;
  unlockAudio(); // the first tap: browsers and phones only start audio after one
  show('home');
}
$('cover').addEventListener('click', (e) => {
  if (!e.target.closest('#cover-settings')) leaveCover();
});
$('cover-settings').onclick = () => {
  unlockAudio();
  openSettings('cover');
};
$('settings-btn').onclick = () => openSettings('home');
$('pause-settings').onclick = () => openSettings('pause');
$('settings-back').onclick = () => show(settingsFrom);

function openSettings(from) {
  settingsFrom = from;
  renderSettings();
  show('settings');
}
function renderSettings() {
  const st = save.settings;
  $('set-music').value = Math.round(st.music * 100);
  $('set-sound').value = Math.round(st.sound * 100);
  $('set-tilt').value = Math.round(st.tilt * 100);
  $('set-music-v').textContent = st.music > 0 ? `${Math.round(st.music * 100)}%` : 'Off';
  $('set-sound-v').textContent = st.sound > 0 ? `${Math.round(st.sound * 100)}%` : 'Off';
  $('set-tilt-v').textContent = `${Math.round(st.tilt * 100)}%`;
}
$('set-music').oninput = (e) => {
  save.settings.music = e.target.value / 100;
  music.setVolume(save.settings.music);
  renderSettings();
  persist();
};
$('set-sound').oninput = (e) => {
  save.settings.sound = e.target.value / 100;
  sound.setVolume(save.settings.sound);
  renderSettings();
  persist();
};
$('set-tilt').oninput = (e) => {
  save.settings.tilt = e.target.value / 100;
  game.tiltScale = save.settings.tilt; // takes effect straight away, even mid-run
  if (race) race.player.game.tiltScale = save.settings.tilt;
  renderSettings();
  persist();
};

function drawCover() {
  drawVehicleThumb($('cover-tuk'), getVehicle(save.selected), skinOf(save.selected));
}
// In the background (home button, another app, screen off) all sound stops; it comes back
// with the app. Capacitor reports it as appStateChange; browsers as visibilitychange.
function backgroundAudio(hidden) {
  if (hidden) {
    music.suspend();
    sound.suspend();
  } else {
    music.resume();
    sound.resume();
  }
}
if (Capacitor.isNativePlatform()) NativeApp.addListener('appStateChange', ({ isActive }) => backgroundAudio(!isActive));
document.addEventListener('visibilitychange', () => {
  backgroundAudio(document.hidden);
  if (document.hidden && mode === 'play') togglePause();
  if (!document.hidden) lobby?.wake(); // back from another app: rejoin the race room straight away
});
if (Capacitor.isNativePlatform()) NativeApp.addListener('resume', () => lobby?.wake());

// Android back button: pause, then resume; garage goes home; home exits the app.
if (Capacitor.isNativePlatform()) {
  NativeApp.addListener('backButton', () => {
    if (mode === 'play' || mode === 'pause') togglePause();
    else if (mode === 'lobby') $('lobby-back').onclick();
    else if (mode === 'over' && lobby) backToLobby();
    else if (mode === 'settings') show(settingsFrom);
    else if (mode === 'garage' || mode === 'maps' || mode === 'over') show('home');
    else NativeApp.exitApp();
  });
}

// ---- HUD -------------------------------------------------------------------
function updateHud() {
  // free ride has fuel and no nitro; races have nitro and no fuel
  document.querySelector('#hud .fuel').hidden = !game.useFuel;
  $('nitro').hidden = !game.useNitro;
  const pct = (game.fuel / game.stats.tank) * 100;
  const fill = $('fuel-fill');
  fill.style.width = `${pct}%`;
  fill.classList.toggle('low', pct < 20);
  $('hud-dist').textContent = game.distance;
  $('hud-best').textContent = Math.max(bestOf(save.map), game.distance);
  $('hud-coins').textContent = game.coinsEarned;
  if (race) updateRaceHud();
  const nitro = $('nitro');
  $('nitro-count').textContent = game.nitroCharges;
  $('nitro-fill').style.width = `${(game.boost / NITRO.time) * 100}%`;
  nitro.classList.toggle('burning', game.boost > 0);
  nitro.classList.toggle('empty', game.nitroCharges === 0 && game.boost <= 0);
  while (shownEvents < game.events.length) {
    const el = document.createElement('span');
    el.className = 'toast';
    el.textContent = game.events[shownEvents++].text;
    $('toasts').appendChild(el);
    setTimeout(() => el.remove(), 1600);
  }
}

// ---- main loop -------------------------------------------------------------
function frame() {
  // read the clock here: rAF timestamps can be older than `last` (set by performance.now()
  // elsewhere), and a negative step would run animations backwards
  const now = performance.now();
  const dt = Math.min(Math.max((now - last) / 1000, 0), 0.1);
  last = now;

  if (mode === 'play') {
    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps++ < 5) {
      acc -= STEP;
      if (race) {
        // in a race a crash isn't the end: the race puts you back at the last checkpoint
        race.step(input);
        if (race.online && race.time >= 0 && race.steps % 4 === 0) {
          const c = game.chassis;
          lobby?.sendPose(c.getPosition().x, c.getPosition().y, c.getAngle()); // ~15 a second
        }
        if (race.done) break;
      } else {
        game.step(input);
        if (game.over) break;
      }
    }
    const wheelSpin = Math.abs(game.rear.body.getAngularVelocity());
    sound.setLevel(wheelSpin, input.gas && game.fuel > 0 && !race?.counting);
    updateHud();
    if (race?.done) endRace();
    else if (!race && game.over) endRun();
  }

  if (mode === 'maps' || mode === 'lobby' || mode === 'cover' || mode === 'settings' || mode === 'home') {
    // the map page is opaque: nothing to draw behind it
  } else if (mode === 'garage' && showroom.ok) showroom.render(dt);
  else {
    if (MENUS.includes(mode)) game.step({ gas: false, brake: false }); // no WebGL: the vehicle idles behind the menu
    renderer.draw(game, mode === 'play' ? input : { gas: false, brake: false }, dt, race);
  }
  requestAnimationFrame(frame);
}

drawCover();
loadCover();
show(new URLSearchParams(location.search).get('join') ? 'home' : 'cover');
requestAnimationFrame(frame);
openRaceLink(new URLSearchParams(location.search).get('join') && `join/${new URLSearchParams(location.search).get('join')}`); // web: ?join=CODE

// Dev-only console hook (stripped from production builds): window.__game().teleport(800)
if (import.meta.env.DEV) {
  window.__game = () => game;
  window.__debug = { renderer, showroom };
}
