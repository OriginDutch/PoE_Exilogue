'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { shouldSync, WeSyncServer, PORT } = require('../src/main/wesync');

const now = 10 * 3600e3;
const base = { enabled: true, everyMin: 30, gameRunning: true, idleMs: 0, now, lastSyncAt: now - 40 * 60e3, lastExportAt: now - 35 * 60e3 };

test('wesync: yes every N minutes while playing, anywhere; no otherwise', () => {
  assert.equal(shouldSync(base), true);
  assert.equal(shouldSync({ ...base, lastExportAt: now - 10 * 60e3 }), false);
  assert.equal(shouldSync({ ...base, lastSyncAt: now - 10 * 60e3 }), false);
  assert.equal(shouldSync({ ...base, idleMs: 5 * 60e3 }), false);
  assert.equal(shouldSync({ ...base, gameRunning: false }), false);
  assert.equal(shouldSync({ ...base, enabled: false }), false);
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

test('wesync: busy flag reaches decide, go carries an id, /failed passes it back', async () => {
  const seen = [], failed = [];
  const srv = new WeSyncServer({ decide: ({ busy }) => { seen.push(busy); return busy ? { go: false } : { go: true, id: 7 }; }, onFailed: id => failed.push(id) });
  srv.start();
  await new Promise(r => srv.server.once('listening', r));
  const get = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p, headers: { 'X-Exilogue': '1' } }, r => { let b = ''; r.on('data', d => b += d); r.on('end', () => res({ status: r.statusCode, body: b })); }).on('error', rej));
  assert.deepEqual(JSON.parse((await get('/we-sync')).body), { go: true, id: 7 });
  assert.deepEqual(JSON.parse((await get('/we-sync?busy=1')).body), { go: false });
  assert.deepEqual(seen, [false, true]);
  assert.equal((await get('/we-sync/failed?id=7')).status, 204);
  await get('/we-sync/failed');            // older scripts: no id
  await get('/we-sync/failed?id=abc');     // junk: treated as no id
  assert.deepEqual(failed, [7, null, null]);
  srv.stop();
});
