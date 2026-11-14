'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { IconStore, iconLinks } = require('../src/main/icons');

const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');

test('icons: picks the largest icon link, apple-touch and svg preferred, favicon.ico last', () => {
  const html = `<link rel="icon" href="/f32.png" sizes="32x32"><link rel="apple-touch-icon" href="/apple.png" sizes="180x180"><link rel="mask-icon" href="/mask.svg">`;
  const c = iconLinks(html, 'https://example.com/');
  assert.deepEqual(c.map(x => x.url), ['https://example.com/apple.png', 'https://example.com/f32.png', 'https://example.com/favicon.ico']);
  // other hosts, http, data-rel, duplicates and svg are skipped; at most 4 + favicon
  const junk = '<link data-rel="icon" rel="stylesheet" href="/a.css"><link rel=icon href=/u.png><link rel="icon" href="http://example.com/x.png"><link rel="icon" href="https://evil.test/x.png"><link rel="icon" href="/favicon.ico"><link rel="icon" href="/s.svg">' + '<link rel="icon" href="/m.png">'.repeat(50);
  assert.deepEqual(iconLinks(junk, 'https://example.com/').map(x => x.url), ['https://example.com/u.png', 'https://example.com/favicon.ico', 'https://example.com/m.png']);
});

function fakeFetch(routes, log) {
  return async url => {
    log.push(url);
    const r = routes[url];
    if (!r) return { ok: false, status: 404, headers: new Map(), arrayBuffer: async () => new ArrayBuffer(0) };
    const buf = Buffer.isBuffer(r.body) ? r.body : Buffer.from(r.body);
    return { ok: true, status: 200, headers: new Map([['content-type', r.type]]), arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) };
  };
}

test('icons: fetches once, caches, falls back per source, and does nothing when nothing is due', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exl-i-'));
  const log = [];
  const routes = {
    'https://www.filterblade.xyz/': { type: 'text/html', body: '<link rel="icon" href="/fb.png" sizes="192x192">' },
    'https://www.filterblade.xyz/fb.png': { type: 'image/png', body: PNG },
    'https://poe.ninja/': { type: 'text/html', body: '<html></html>' },
    'https://poe.ninja/favicon.ico': { type: 'image/x-icon', body: PNG },
    'https://web.poecdn.com/image/Art/2DItems/Maps/Atlas2Maps/New/Strand.png': { type: 'image/png', body: PNG },
  };
  let written = 0;
  const store = new IconStore({ dir, fetch: fakeFetch(routes, log), getFileIcon: async () => PNG, userAgent: 't', io: { add: w => { written += w; } } });
  await store.refresh({ mapName: 'Nonexistent' });
  const all = store.all();
  assert.ok(all.filter.startsWith('data:image/png;base64,'));
  assert.ok(all.ninja.startsWith('data:image/png;base64,'), 'type from the bytes, not the header');
  assert.ok(all.maps, 'map falls back to Strand');
  assert.ok(!all.wealthy, 'failed site: no icon (monogram)');
  assert.equal(store.rev, 1);
  const n = log.length, w = written;
  await store.refresh({ mapName: 'Nonexistent' });
  assert.equal(log.length, n, 'nothing due: no network');
  assert.equal(written, w, 'nothing due: no disk writes');
  assert.equal(store.rev, 1);
});


test('icons: junk HTML is parsed quickly', () => {
  const t = Date.now();
  iconLinks('<link '.repeat(400000), 'https://example.com/');
  assert.ok(Date.now() - t < 1000, 'took ' + (Date.now() - t) + ' ms');
});

test('icons: an endless response is cut off while streaming; html served as an image is refused', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exl-i-'));
  let sent = 0;
  const fetch = async url => {
    if (url.endsWith('/')) return { ok: true, status: 200, headers: new Map([['content-type', 'text/html']]), body: null, arrayBuffer: async () => Buffer.from('<link rel="icon" href="/big.png"><link rel="icon" href="/fake.png" sizes="8x8">').buffer };
    if (url.endsWith('/fake.png')) return { ok: true, status: 200, headers: new Map(), body: null, arrayBuffer: async () => new TextEncoder().encode('<html>nope</html>').buffer };
    if (url.endsWith('/big.png')) {
      const body = new ReadableStream({ pull(c) { sent += 65536; c.enqueue(new Uint8Array(65536)); } });
      return { ok: true, status: 200, headers: new Map(), body, arrayBuffer: async () => { throw new Error('should stream'); } };
    }
    return { ok: false, status: 404, headers: new Map() };
  };
  const store = new IconStore({ dir, fetch, getFileIcon: async () => null, userAgent: 't' });
  await store.refresh({});
  assert.ok(sent <= 4 * (2 * 1024 * 1024 + 131072), 'stopped after ' + sent); // 4 sites, each cut off at 2 MB
  assert.ok(!store.all().filter);
});

test('icons: a failure is retried after an hour, not on every refresh, and writes nothing; a deleted file is fetched again', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exl-i-'));
  const log = [];
  let up = true;
  const base = fakeFetch({ 'https://web.poecdn.com/image/Art/2DItems/Hideout/Waypoint.png': { type: 'image/png', body: PNG } }, log);
  const store = new IconStore({ dir, fetch: (u, o) => (up ? base(u, o) : Promise.reject(new Error('offline'))), getFileIcon: async () => null, userAgent: 't' });
  await store.refresh({});
  assert.ok(store.all().campaign);
  up = false;
  const w = store.written;
  await store.refresh({ mapName: 'Other' }); // new key while offline
  const n = log.length;
  await store.refresh({ mapName: 'Other' });
  await store.refresh({ mapName: 'Other' });
  assert.equal(log.length, n, 'no repeated attempts within the hour');
  assert.equal(store.written, w, 'offline: nothing written');
  up = true;
  fs.unlinkSync(path.join(dir, 'campaign.png'));
  await store.refresh({ mapName: 'Other' });
  assert.ok(fs.existsSync(path.join(dir, 'campaign.png')), 'missing file fetched again');
});
