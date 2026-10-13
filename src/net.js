// Online races with friends: the phone's side of the race relay (server/).
//
// One phone hosts: it makes a room code, keeps the player list, picks the map and starts
// the race. Up to five friends join with the code (or the shared link). During a race each
// phone drives its own physics and sends its pose to the others, who draw it as a rival.
//
// relay -> phone:  welcome {id, hostId, token, resumed?, peers}, join {id}, leave {id},
//                  away {id}, back {id} (a dropped connection and its return), host-left, error {message}
// phone -> relay:  hb (heartbeat, every 20 s), bye (leaving on purpose)
// phone -> phone (the relay stamps `from`):
//   hello  {vehicle, skin}                          a newcomer introduces itself to the host
//   lobby  {map, players: [{id, vehicle, skin}], racing}   host: the player list
//   busy                                             host to a newcomer while racing
//   start  {map, players}                           host: the countdown starts now
//   p      {x, y, a}                                a racer's pose, ~15 a second
//   fin    {time}                                   a racer crossed the line
//   p3     {s, d, psi, v, y, ...}                   SL Racing: a car's place on the road
//   it     {kind}                                   SL Racing: a power-up fired
import { CODE_CHARS, MAX_PLAYERS } from '../server/room.js';

export { MAX_PLAYERS };

// Where the relay lives: set VITE_RELAY_URL when building (see readme.md). In development
// it falls back to the local relay (node server/dev-relay.js) on the same machine.
export const RELAY_URL = (import.meta.env?.VITE_RELAY_URL || (import.meta.env?.DEV ? `http://${location.hostname}:8787` : '')).replace(/\/$/, '');

/** The share link for a race code: /join/ opens Tuk Tuk Climb, /race/ opens SL Racing. */
export const joinLink = (code, game = 'climb') => `${RELAY_URL}/${game === 'racer' ? 'race' : 'join'}/${code}`;

export function newCode() {
  return Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
}

/** A race code from typed text or a link (…/join/ABCDE or tuktukclimb://join/ABCDE). */
export function parseCode(text) {
  const t = String(text).trim().toUpperCase();
  const m = t.match(/JOIN\/([A-Z0-9]{5})\b/) ?? t.match(/^([A-Z0-9]{5})$/);
  return m && [...m[1]].every((c) => CODE_CHARS.includes(c)) ? m[1] : null;
}

export class Lobby {
  /**
   * role: 'host' or 'join'; me: { vehicle, skin } (ids) for this phone's racer.
   * url: the relay (defaults to RELAY_URL); WS: WebSocket class (for tests).
   */
  constructor({ code, role, me, map, game = 'climb', url = RELAY_URL, WS = globalThis.WebSocket }) {
    this.code = code;
    this.game = game; // which app's rooms: 'climb' (Tuk Tuk Climb) or 'racer' (SL Racing)
    this.role = role;
    this.me = me;
    this.map = map;
    this.url = url;
    this.WS = WS;
    this.id = null;
    this.hostId = null;
    this.token = null; // from the relay: lets us take our place back after a dropped connection
    this.players = []; // [{ id, vehicle, skin }] in join order; the host first
    this.away = new Set(); // players whose connection dropped (they have a while to come back)
    this.racing = false;
    this.handlers = {};
    this.closed = false; // we left (or were refused); no reconnecting
    this.retries = 0;
    this.retryTimer = null;
    this.heartbeat = setInterval(() => this.send({ t: 'hb' }), 20_000);
    this.open();
  }

  get isHost() {
    return this.role === 'host';
  }

  get connected() {
    return this.ws?.readyState === 1;
  }

  open() {
    const resume = this.token ? `&resume=${encodeURIComponent(this.token)}` : '';
    const game = this.game === 'climb' ? '' : `&game=${this.game}`;
    const ws = (this.ws = new this.WS(`${this.url.replace(/^http/, 'ws')}/room/${this.code}?role=${this.role}${resume}${game}`));
    ws.onmessage = (e) => {
      try {
        this.receive(JSON.parse(e.data));
      } catch {
        /* not a message we understand */
      }
    };
    ws.onclose = ws.onerror = () => {
      if (ws !== this.ws || this.closed) return;
      this.ws = null;
      if (!this.token) {
        // never got in: the server can't be reached
        this.fail('Could not reach the race server. Check your internet connection.');
        return;
      }
      this.reconnect();
    };
  }

  // Phones drop the connection when they go to the background: try to get back in, with
  // growing waits, for about as long as the relay keeps our place.
  reconnect() {
    if (this.closed || this.retryTimer) return;
    if (this.retries === 0) this.emit('reconnecting');
    const wait = [500, 1000, 2000, 4000, 8000, 15000][Math.min(this.retries, 5)];
    if (this.retries++ > 12) return this.fail('Lost the connection to the race server.');
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (!this.closed && !this.ws) this.open();
    }, wait);
  }

  /** The app came back to the front: reconnect now rather than at the next retry. */
  wake() {
    if (this.closed || this.connected || this.ws?.readyState === 0) return;
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.open();
  }

  fail(message) {
    if (this.closed) return;
    this.emit('error', message);
    this.close();
  }

  on(type, fn) {
    this.handlers[type] = fn;
    return this;
  }

  emit(type, ...args) {
    this.handlers[type]?.(...args);
  }

  send(msg) {
    if (this.connected) this.ws.send(JSON.stringify(msg));
  }

  receive(m) {
    // The relay stamps `from` on everything a phone sends, so messages without it are the
    // relay's own; and only the host may run the room. Anything else is ignored.
    const fromRelay = m.from === undefined;
    const fromHost = !fromRelay && m.from === this.hostId;
    if (['welcome', 'join', 'leave', 'away', 'back', 'host-left', 'error'].includes(m.t) && !fromRelay) return;
    if (['lobby', 'busy', 'start'].includes(m.t) && !fromHost) return;
    switch (m.t) {
      case 'welcome':
        this.id = m.id;
        this.hostId = m.hostId;
        this.token = m.token;
        this.retries = 0;
        if (this.isHost) {
          if (!m.resumed) this.players = [{ id: m.id, ...this.me }];
          this.shareLobby(); // after a reconnect, friends may have missed changes
        } else this.send({ t: 'hello', to: m.hostId, ...this.me });
        if (m.resumed) this.emit('reconnected');
        break;
      case 'hello': // host: a newcomer, or a friend back after a dropped connection
        if (!this.isHost || typeof m.vehicle !== 'string' || typeof m.skin !== 'string') break;
        if (this.players.some((p) => p.id === m.from)) this.shareLobby(); // back: just bring them up to date
        else if (this.racing || this.players.length >= MAX_PLAYERS) this.send({ t: 'busy', to: m.from });
        else {
          this.players = [...this.players, { id: m.from, vehicle: m.vehicle, skin: m.skin }];
          this.shareLobby();
        }
        break;
      case 'lobby':
        if (!Array.isArray(m.players)) break;
        Object.assign(this, { players: m.players, map: m.map, racing: !!m.racing });
        this.emit('update');
        break;
      case 'busy':
        this.fail('That race has already started. Wait for it to finish and join again.');
        break;
      case 'away':
      case 'back':
        if (m.t === 'away') this.away.add(m.id);
        else this.away.delete(m.id);
        // the host is back: make sure it knows about us (a hello sent while it was away is lost)
        if (m.t === 'back' && m.id === this.hostId && !this.isHost) this.send({ t: 'hello', to: this.hostId, ...this.me });
        this.emit('update');
        break;
      case 'leave':
        this.away.delete(m.id);
        this.players = this.players.filter((p) => p.id !== m.id);
        if (this.isHost) this.shareLobby();
        this.emit('leave', m.id);
        this.emit('update');
        break;
      case 'host-left':
        this.emit('host-left');
        this.close();
        break;
      case 'error':
        this.fail(m.message);
        break;
      case 'start':
        if (!Array.isArray(m.players)) break;
        this.racing = true;
        this.map = m.map;
        this.players = m.players;
        this.emit('start');
        break;
      case 'p':
        if ([m.x, m.y, m.a].every(Number.isFinite)) this.emit('pose', m.from, m);
        break;
      case 'fin':
        if (Number.isFinite(m.time) && m.time > 0) this.emit('finish', m.from, m.time);
        break;
      case 'p3': // SL Racing: a car's place on the road
        if ([m.s, m.d, m.psi, m.v, m.y].every(Number.isFinite)) this.emit('pose3d', m.from, m);
        break;
      case 'it': // SL Racing: a power-up fired
        if (typeof m.kind === 'string') this.emit('item', m.from, m.kind);
        break;
    }
  }

  shareLobby() {
    this.send({ t: 'lobby', map: this.map, players: this.players, racing: this.racing });
    this.emit('update');
  }

  // ---- host --------------------------------------------------------------------
  setMap(map) {
    this.map = map;
    this.shareLobby();
  }

  start() {
    this.racing = true;
    this.send({ t: 'start', map: this.map, players: this.players });
    this.emit('start');
  }

  /** Host: back in the lobby after a race, so friends can join again. */
  endRace() {
    if (!this.racing) return;
    this.racing = false;
    if (this.isHost) this.shareLobby();
  }

  // ---- racing ------------------------------------------------------------------
  sendPose(x, y, a) {
    this.send({ t: 'p', x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, a: Math.round(a * 1000) / 1000 });
  }

  sendFinish(time) {
    this.send({ t: 'fin', time });
  }

  /** Leave the room for good (the relay then drops us at once, without waiting). */
  close() {
    if (this.closed) return;
    this.send({ t: 'bye' });
    this.closed = true;
    clearInterval(this.heartbeat);
    clearTimeout(this.retryTimer);
    try {
      this.ws?.close();
    } catch {
      /* already closed */
    }
  }
}
