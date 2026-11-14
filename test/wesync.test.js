'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { shouldSync, WeSyncServer, PORT } = require('../src/main/wesync');

const now = 10 * 3600e3;
const base = { enabled: true, everyMin: 30, gameRunning: true, idleMs: 0, now, area: { kind: 'hideout', enteredAt: now - 20e3 }, lastSyncAt: now - 40 * 60e3, lastExportAt: now - 35 * 60e3 };

test('wesync: yes between maps after 30 minutes, no otherwise', () => {
  assert.equal(shouldSync(base), true);
  assert.equal(shouldSync({ ...base, area: { kind: 'map', enteredAt: now - 20e3 } }), false);
  assert.equal(shouldSync({ ...base, area: { kind: 'hideout', enteredAt: now - 10 * 60e3 } }), false);
  assert.equal(shouldSync({ ...base, lastExportAt: now - 10 * 60e3 }), false);
  assert.equal(shouldSync({ ...base, idleMs: 5 * 60e3 }), false);
  assert.equal(shouldSync({ ...base, gameRunning: false }), false);
  assert.equal(shouldSync({ ...base, enabled: false }), false);
  assert.equal(shouldSync({ ...base, area: { kind: 'town', enteredAt: now - 1000 } }), true);
});

test('wesync: server answers on localhost, 404 elsewhere', async () => {
  let asks = 0;
  const srv = new WeSyncServer({ decide: () => true, onAsk: () => asks++ });
  srv.start();
  await new Promise(r => srv.server.once('listening', r));
  const get = (p, headers = { 'X-Exilogue': '1' }) => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p, headers }, r => { let b = ''; r.on('data', d => b += d); r.on('end', () => res({ status: r.statusCode, body: b, cors: r.headers['access-control-allow-origin'] })); }).on('error', rej));
  const a = await get('/we-sync');
  assert.equal(a.status, 200); assert.deepEqual(JSON.parse(a.body), { go: true }); assert.equal(a.cors, undefined);
  assert.equal((await get('/other')).status, 404);
  assert.equal((await get('/we-sync', {})).status, 404); // a web page (no header)
  assert.equal((await get('/we-sync', { 'X-Exilogue': '1', Origin: 'https://evil.example' })).status, 404);
  assert.equal((await get('/we-sync', { 'X-Exilogue': '1', Host: 'evil.example:47615' })).status, 404);
  assert.equal(asks, 1);
  srv.stop();
});
