// The race relay on your own computer, for development and tests: the same rooms and
// link page as the Cloudflare Worker (worker.js), on http://localhost:8787.
//   node server/dev-relay.js [port]
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { CODE_RE, RelayRoom } from './room.js';
import { joinPage } from './join-page.js';

/** grace: how long a dropped player keeps their place (ms); tests use a short one. */
export function startRelay(port = 8787, { grace } = {}) {
  const rooms = new Map(); // code -> RelayRoom
  const http = createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const [, code] = url.pathname.match(/^\/join\/([A-Z0-9]+)$/i) ?? [];
    if (code) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(joinPage(code.toUpperCase(), `http://${req.headers.host}${url.pathname}`));
    } else {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('Tuk Tuk Climb race relay (dev)');
    }
  });
  const wss = new WebSocketServer({ noServer: true });
  http.on('upgrade', (req, sock, head) => {
    const url = new URL(req.url, 'http://x');
    const [, code] = url.pathname.match(/^\/room\/([A-Z0-9]+)$/i) ?? [];
    if (!code || !CODE_RE.test(code)) return sock.destroy();
    wss.handleUpgrade(req, sock, head, (ws) => {
      const room = rooms.get(code) ?? new RelayRoom({ grace, onEmpty: () => rooms.delete(code) });
      rooms.set(code, room);
      const send = (text) => ws.readyState === ws.OPEN && ws.send(text);
      const joined = room.join(url.searchParams.get('role') === 'host' ? 'host' : 'join', send, url.searchParams.get('resume'));
      if (joined.error) {
        send(JSON.stringify({ t: 'error', message: joined.error }));
        ws.close(4000, 'rejected');
        if (room.empty) rooms.delete(code);
        return;
      }
      ws.on('message', (data) => room.message(joined.id, data.toString()));
      ws.on('close', () => room.drop(joined.id, send)); // keeps the player's place for a while (room.js)
    });
  });
  const close = () => {
    for (const ws of wss.clients) ws.terminate();
    wss.close();
    http.close();
  };
  return new Promise((resolve) => http.listen(port, () => resolve({ port: http.address().port, close })));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { port } = await startRelay(+(process.argv[2] ?? 8787));
  console.log(`race relay on http://localhost:${port}  (ws://localhost:${port}/room/CODE)`);
}
