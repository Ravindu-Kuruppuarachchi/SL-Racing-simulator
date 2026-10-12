// One race room on the relay. The relay is deliberately dumb: it only passes messages
// between the phones in a room. The host's phone runs the race (player list, map,
// start); see src/net.js for the messages themselves.
//
// Phones drop their connection whenever they go to the background (switching to
// WhatsApp to share the link, a phone call), so a dropped connection isn't leaving: the
// player is "away" and keeps their place for GRACE_MS, and reconnects with the token they
// were given. Only a goodbye ('bye') or the end of the grace period removes them.
//
// Shared by the Cloudflare Worker (worker.js) and the local relay (dev-relay.js).

export const MAX_PLAYERS = 6;
export const MAX_MESSAGE = 2048; // bytes; poses are ~60
export const GRACE_MS = 90_000;
export const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I to misread
export const CODE_RE = new RegExp(`^[${CODE_CHARS}]{5}$`);

export class RelayRoom {
  constructor({ grace = GRACE_MS, onEmpty = () => {} } = {}) {
    this.peers = new Map(); // id -> { send, token, away, timer }
    this.nextId = 1;
    this.hostId = null;
    this.grace = grace;
    this.onEmpty = onEmpty;
  }

  get empty() {
    return this.peers.size === 0;
  }

  /**
   * A phone connects as 'host' or 'join', or comes back with its token (`resume`).
   * Returns { id } or { error } (the caller then sends the error and closes the socket).
   */
  join(role, send, resume = null) {
    if (resume) {
      const entry = [...this.peers].find(([, p]) => p.token === resume);
      if (!entry) return { error: 'That race has ended.' };
      const [id, p] = entry;
      clearTimeout(p.timer);
      Object.assign(p, { send, away: false, timer: null });
      send(JSON.stringify({ t: 'welcome', id, hostId: this.hostId, token: p.token, resumed: true, peers: [...this.peers.keys()].filter((k) => k !== id) }));
      this.broadcast(id, { t: 'back', id });
      return { id };
    }
    if (role === 'host') {
      if (this.hostId !== null) return { error: 'That room code is already in use.' };
    } else {
      if (this.hostId === null) return { error: 'No race with that code. Check it with the host.' };
      if (this.peers.size >= MAX_PLAYERS) return { error: `That race is full (${MAX_PLAYERS} players).` };
    }
    const id = this.nextId++;
    if (role === 'host') this.hostId = id;
    const others = [...this.peers.keys()];
    const token = crypto.randomUUID();
    this.peers.set(id, { send, token, away: false, timer: null });
    send(JSON.stringify({ t: 'welcome', id, hostId: this.hostId, token, peers: others }));
    this.broadcast(id, { t: 'join', id });
    return { id };
  }

  /** A message from a phone: to one peer (`to`) or everyone else, stamped with who sent it. */
  message(id, text) {
    if (!this.peers.has(id) || typeof text !== 'string' || text.length > MAX_MESSAGE) return;
    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;
    if (msg.t === 'hb') return; // heartbeat: keeps the connection alive, nothing to pass on
    if (msg.t === 'bye') return this.remove(id); // leaving on purpose: no grace period
    msg.from = id;
    if (msg.to !== undefined) this.peers.get(msg.to)?.send(JSON.stringify(msg));
    else this.broadcast(id, msg);
  }

  /** A phone's connection closed. `send` identifies which connection (a resumed phone has a new one). */
  drop(id, send) {
    const p = this.peers.get(id);
    if (!p || p.send !== send || p.away) return;
    p.away = true;
    this.broadcast(id, { t: 'away', id });
    p.timer = setTimeout(() => this.remove(id), this.grace);
  }

  remove(id) {
    const p = this.peers.get(id);
    if (!p) return;
    clearTimeout(p.timer);
    this.peers.delete(id);
    if (id === this.hostId) {
      // the host has gone: the race is over, and the code is free again
      this.broadcast(id, { t: 'host-left' });
      for (const q of this.peers.values()) clearTimeout(q.timer);
      this.peers.clear();
      this.hostId = null;
    } else this.broadcast(id, { t: 'leave', id });
    if (this.empty) this.onEmpty();
  }

  broadcast(fromId, msg) {
    const text = JSON.stringify(msg);
    for (const [id, p] of this.peers) if (id !== fromId && !p.away) p.send(text);
  }
}
