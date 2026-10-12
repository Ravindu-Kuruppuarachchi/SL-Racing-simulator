// Cloudflare Worker for online races. Each room code is a Durable Object holding that
// room's WebSocket connections; the logic is in room.js. Deploy: see readme.md.
//
//   wss://<relay>/room/ABCDE?role=host|join   a phone joining a room
//   https://<relay>/join/ABCDE                the page behind a shared link
import { CODE_RE, RelayRoom } from './room.js';
import { joinPage } from './join-page.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const [, kind, code] = url.pathname.match(/^\/(room|join)\/([A-Z0-9]+)$/i) ?? [];
    if (kind === 'join') {
      return new Response(joinPage(code.toUpperCase(), `${url.origin}${url.pathname}`), { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }
    if (kind === 'room' && CODE_RE.test(code) && request.headers.get('Upgrade') === 'websocket') {
      return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(request);
    }
    return new Response('Tuk Tuk Climb race relay', { status: kind ? 400 : 200 });
  },
};

export class Room {
  constructor() {
    this.room = new RelayRoom();
  }

  async fetch(request) {
    const params = new URL(request.url).searchParams;
    const role = params.get('role') === 'host' ? 'host' : 'join';
    const { 0: client, 1: socket } = new WebSocketPair();
    socket.accept();
    const send = (text) => {
      try {
        socket.send(text);
      } catch {
        /* already closed */
      }
    };
    const joined = this.room.join(role, send, params.get('resume'));
    if (joined.error) {
      send(JSON.stringify({ t: 'error', message: joined.error }));
      socket.close(4000, 'rejected');
    } else {
      socket.addEventListener('message', (e) => this.room.message(joined.id, e.data));
      // a dropped connection keeps the player's place for a while (room.js)
      const gone = () => this.room.drop(joined.id, send);
      socket.addEventListener('close', gone);
      socket.addEventListener('error', gone);
    }
    return new Response(null, { status: 101, webSocket: client });
  }
}
