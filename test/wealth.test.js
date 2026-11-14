'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Wealth, readExport } = require('../src/main/wealth');

const CSV = '﻿"Name","Tab","Quantity","Price","Total"\n"Mageblood","₿","1","135285","135285"\n"Divine Orb","₿","42","909","38157"\n"Orb of Chance","₿","3048","1.6","4755"\n"Odd, ""quoted"" name","Other","2","1","2"\n';

test('wealth: reads the export (BOM, quotes, uses Total not Price, divine price)', () => {
  const ex = readExport(CSV);
  assert.equal(ex.chaos, 135285 + 38157 + 4755 + 2);
  assert.equal(ex.divPrice, 38157 / 42); // exact, from Total/Quantity
  assert.equal(ex.items[0].name, 'Mageblood');
  assert.equal(ex.items[3].name, 'Odd, "quoted" name');
  assert.deepEqual(Object.keys(ex.tabs), ['₿', 'Other']);
  assert.throws(() => readExport('"a","b"\n"1","2"\n'));
});

test('wealth: picks exports up from Downloads, archives the newest 2, skips duplicates, keeps history', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'exl-w-'));
  const dl = path.join(root, 'Downloads'); fs.mkdirSync(dl);
  const league = Date.now() - 60000;
  let changes = 0;
  const w = new Wealth({ dir: root, downloads: dl, onChange: () => changes++ });
  w.start();
  const drop = (n, text) => fs.writeFileSync(path.join(dl, `Wealthy-Exile-export-${n}.csv`), text);
  drop('1', CSV);
  await new Promise(r => setTimeout(r, 2600));
  drop('2', CSV.replace('"4755"', '"5755"'));
  await new Promise(r => setTimeout(r, 2600));
  drop('3', CSV); // same content as 1, later: not counted again, but it is now the latest state
  await new Promise(r => setTimeout(r, 2600));
  w.stop();
  assert.deepEqual(fs.readdirSync(dl), [], 'Downloads cleaned up');
  assert.equal(fs.readdirSync(path.join(root, 'wealth')).length, 2, 'newest 2 kept');
  const s = w.summary(league);
  assert.equal(s.count, 2);
  assert.equal(s.delta, -1000, 'back to the state of export 1');
  assert.equal(Math.round(s.divines), Math.round((135285 + 38157 + 4755 + 2) / (38157 / 42)));
  assert.equal(s.top[0].name, 'Mageblood');
  assert.equal(w.summary(Date.now() + 60000).count, 0, 'exports before the league start do not count');
  w.close();
});

test('wealth: empty, broken and locked files; duplicates update the time and are not archived', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'exl-w-'));
  const dl = path.join(root, 'Downloads'); fs.mkdirSync(dl);
  const w = new Wealth({ dir: root, downloads: dl, onChange: () => {} });
  const f = n => path.join(dl, `Wealthy-Exile-export-${n}.csv`);
  fs.writeFileSync(f('empty'), '');                                   // Firefox placeholder: ignored, no error
  fs.writeFileSync(f('head'), '"Name","Tab","Quantity","Price","Total"\n'); // header only: refused
  w.scan();
  await new Promise(r => setTimeout(r, 2400));
  assert.equal(w.summary(0).count, 0);
  assert.match(w.summary(0).error, /empty/);
  fs.unlinkSync(f('head')); fs.unlinkSync(f('empty'));
  fs.writeFileSync(f('a'), CSV);
  w.scan();
  await new Promise(r => setTimeout(r, 2400));
  assert.equal(w.summary(0).error, null, 'error cleared once the bad file is gone and a good one came in');
  const t1 = w.summary(0).at;
  fs.writeFileSync(f('b'), CSV); // same stash again, later
  const later = new Date(Date.now() + 1000); fs.utimesSync(f('b'), later, later);
  w.scan();
  await new Promise(r => setTimeout(r, 2400));
  const s = w.summary(0);
  assert.equal(s.count, 1, 'not counted twice');
  assert.ok(s.at >= t1, 'time moved to the newest confirmation');
  assert.equal(fs.readdirSync(path.join(root, 'wealth')).length, 2, 'newer confirmation archived (it is the latest export)');
  assert.deepEqual(fs.readdirSync(dl), []);
  assert.equal(Math.round(readExport(CSV).divPrice), Math.round(38157 / 42), 'divine price from Total/Quantity');
  w.close();
});

test('wealth: session change uses the export right after the session and only breaks inside the measured time', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'exl-ws-'));
  const w = new Wealth({ dir: root, downloads: path.join(root, 'none'), onChange: () => {} });
  const put = (t, chaos) => w.db.prepare('INSERT INTO exports (t, hash, chaos, div_price, top, tabs, items) VALUES (?, ?, ?, ?, ?, ?, ?)').run(t, 'h' + t, chaos, 100, '[]', 1, 1);
  const H = 3600e3, s = 1000 * H;
  put(s - 10 * 60e3, 1000);      // before the session
  put(s + 60 * 60e3, 1300);      // during
  put(s + 3 * H + 5 * 60e3, 1500); // 5 min after it ended
  // a 25-minute break at +2 h lies outside the first hour and must not shrink it
  const mid = w.sessionChange(s, s + 60 * 60e3, [{ t: s + 2 * H, ms: 25 * 60e3 }]);
  assert.equal(mid.divines, 3);
  assert.ok(Math.abs(mid.perHour - 3) < 1e-9);
  const all = w.sessionChange(s, s + 3 * H, [{ t: s + 2 * H, ms: 30 * 60e3 }]);
  assert.equal(all.divines, 5);
  assert.ok(Math.abs(all.perHour - 5 / 2.5) < 1e-9);
  w.close();
});
