import https from 'node:https';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { buildApp } from '../dist/server/server/app.js';
import { readConfig } from '../dist/server/server/config.js';
import { createGame, defaultSetup } from '../dist/server/shared/game.js';
const dir = mkdtempSync(join(tmpdir(), 'mtg-proxy-'));
execFileSync(
  'openssl',
  [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    join(dir, 'key.pem'),
    '-out',
    join(dir, 'cert.pem'),
    '-days',
    '1',
    '-subj',
    '/CN=localhost',
  ],
  { stdio: 'ignore' },
);
const config = readConfig({
  PUBLIC_ORIGIN: 'https://localhost',
  ALLOW_INSECURE_HTTP: 'false',
  TRUST_PROXY_HOPS: '1',
  NODE_ENV: 'production',
});
const { app } = await buildApp({ config, filename: ':memory:' });
await app.listen({ host: '127.0.0.1', port: 0 });
const backendPort = app.server.address().port;
const proxy = https.createServer(
  { key: readFileSync(join(dir, 'key.pem')), cert: readFileSync(join(dir, 'cert.pem')) },
  (req, res) => {
    const upstream = http.request(
      {
        host: '127.0.0.1',
        port: backendPort,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, 'x-forwarded-proto': 'https', 'x-forwarded-for': '127.0.0.1' },
      },
      (result) => {
        res.writeHead(result.statusCode, result.headers);
        result.pipe(res);
      },
    );
    upstream.on('error', () => res.destroy());
    req.pipe(upstream);
  },
);
proxy.on('upgrade', (req, socket, head) => {
  const upstream = http.request({
    host: '127.0.0.1',
    port: backendPort,
    path: req.url,
    headers: { ...req.headers, 'x-forwarded-proto': 'https' },
  });
  upstream.on('upgrade', (res, target, targetHead) => {
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\n${Object.entries(res.headers)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\r\n')}\r\n\r\n`,
    );
    if (head.length) target.write(head);
    if (targetHead.length) socket.write(targetHead);
    target.on('error', () => socket.destroy());
    socket.on('error', () => target.destroy());
    socket.pipe(target).pipe(socket);
  });
  upstream.on('error', () => socket.destroy());
  upstream.end();
});
await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
config.publicOrigin = `https://127.0.0.1:${proxy.address().port}`;
let ws;
async function request(path, auth, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      `${config.publicOrigin}/api${path}`,
      {
        rejectUnauthorized: false,
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          origin: config.publicOrigin,
          'x-mtg-client': '1',
          'content-type': 'application/json',
          ...(auth ? { cookie: auth.cookie, 'x-csrf-token': auth.csrf } : {}),
        },
      },
      (res) => {
        let text = '';
        res.on('data', (chunk) => {
          text += chunk;
        });
        res.on('end', () => {
          if (res.statusCode !== 200) reject(new Error(`HTTPS request failed: ${res.statusCode}`));
          else resolve({ body: JSON.parse(text), headers: res.headers });
        });
      },
    );
    req.on('error', reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}
try {
  const session = await request('/session', undefined, { reset: false });
  const cookie = session.headers['set-cookie'][0];
  assert.match(cookie, /Secure/);
  assert.match(cookie, /HttpOnly/);
  assert.equal(session.headers['cache-control'], 'no-store');
  const auth = { cookie: cookie.split(';')[0], csrf: session.body.csrf };
  const { body: room } = await request('/rooms', auth, {
    game: createGame(defaultSetup(), randomUUID, Date.now()),
    name: 'Proxy host',
  });
  assert.ok(room.joinUrl.startsWith(config.publicOrigin));
  ws = new WebSocket(
    `${config.publicOrigin.replace('https:', 'wss:')}/api/rooms/${room.id}/live?protocol=1`,
    { rejectUnauthorized: false, headers: { origin: config.publicOrigin, cookie: auth.cookie } },
  );
  const envelope = {
    protocolVersion: 1,
    roomId: room.id,
    gameId: room.gameId,
    operationId: randomUUID(),
    baseRevision: room.revision,
    command: { type: 'adjust', playerId: room.seats[0].id, field: 'life', delta: -1 },
  };
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('WSS acknowledgement timed out')), 10000);
    ws.on('error', reject);
    ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.type === 'ready') ws.send(JSON.stringify({ type: 'command', csrf: auth.csrf, envelope }));
      if (msg.type === 'ack') {
        try {
          assert.equal(msg.receipt.ok, true);
          assert.equal(msg.view.game.players[room.seats[0].id].life, 39);
          clearTimeout(timeout);
          resolve();
        } catch (e) {
          reject(e);
        }
      }
    });
  });
  console.info(
    'PASS: HTTPS reverse proxy, Secure HttpOnly cookie, public join URL, CSRF and WSS upgrade/command/acknowledgement.',
  );
} finally {
  ws?.terminate();
  proxy.closeAllConnections();
  await new Promise((resolve) => proxy.close(resolve));
  await app.close();
  rmSync(dir, { recursive: true, force: true });
}
