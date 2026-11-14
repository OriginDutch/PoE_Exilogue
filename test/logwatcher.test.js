'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { LogWatcher } = require('../src/main/logwatcher');

const pad = n => String(n).padStart(2, '0');
const stamp = t => { const d = new Date(t); return `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`; };

function run(w) {
  return new Promise(resolve => {
    const lines = [];
    w.on('lines', l => lines.push(...l));
    w.on('done', () => { w.stop(); resolve(lines); });
    w.on('idle', () => { w.stop(); resolve(lines); });
    w.start(5);
  });
}

test('watcher: skips straight to the league start in a big log', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exl-w-'));
  const f = path.join(dir, 'Client.txt');
  const t0 = Date.UTC(2026, 0, 1);
  const out = [];
  for (let i = 0; i < 120000; i++) out.push(`${stamp(t0 + i * 60000)} 1 a [INFO Client 1] : old line number ${i} padding padding padding`);
  const start = stamp(t0 + 119990 * 60000);
  fs.writeFileSync(f, out.join('\n') + '\n');
  const w = new LogWatcher({ file: f, offset: 0, minStamp: start });
  const lines = await run(w);
  assert.equal(lines.length, 10);
  assert.ok(w.bytesRead < fs.statSync(f).size / 10, `read ${w.bytesRead} of ${fs.statSync(f).size}`);
});

test('watcher: a recreated Client.txt is read from the start even when larger than the old offset', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exl-w-'));
  const f = path.join(dir, 'Client.txt');
  fs.writeFileSync(f, '2026/11/13 20:00:00 ***** LOG FILE OPENING *****\n2026/11/13 20:00:01 1 a [INFO Client 1] : x\n');
  const w1 = new LogWatcher({ file: f, offset: 0 });
  let head = null; w1.on('head', h => { head = h; });
  await run(w1);
  const oldOffset = fs.statSync(f).size;
  fs.writeFileSync(f, '2026/11/14 10:00:00 ***** LOG FILE OPENING *****\n' + '2026/11/14 10:00:01 1 a [INFO Client 1] : new\n'.repeat(5));
  const w2 = new LogWatcher({ file: f, offset: oldOffset, head });
  let replaced = false; w2.on('replaced', () => { replaced = true; });
  const lines = await run(w2);
  assert.ok(replaced);
  assert.equal(lines.length, 6);
});

test('watcher: truncated in place with a half line pending: no double reading, no glued line', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exl-w-'));
  const f = path.join(dir, 'Client.txt');
  fs.writeFileSync(f, '2026/11/13 20:00:00 ***** LOG FILE OPENING *****\n2026/11/13 20:00:01 1 a [INFO Client 1] : one\n'.repeat(3) + '2026/11/13 20:00:02 1 a [INFO Cli');
  const w = new LogWatcher({ file: f, offset: 0 });
  let head = null; w.on('head', h => { head = h; });
  await run(w);
  fs.writeFileSync(f, '2026/11/14 10:00:00 ***** LOG FILE OPENING *****\n2026/11/14 10:00:01 1 a [INFO Client 1] : two\n');
  const w2 = new LogWatcher({ file: f, offset: w.offset, head });
  w2.rest = w.rest; // same process: the half line is still pending
  let h2 = null, replaced = false; w2.on('head', h => { h2 = h; }); w2.on('replaced', () => { replaced = true; });
  const lines = await run(w2);
  assert.deepEqual(lines, ['2026/11/14 10:00:00 ***** LOG FILE OPENING *****', '2026/11/14 10:00:01 1 a [INFO Client 1] : two']);
  assert.equal(h2, lines[0], 'new first line learned, so the next start does not read it again');
  assert.equal(replaced, false);
  // next start with the saved (new) head: nothing is read twice
  const w3 = new LogWatcher({ file: f, offset: w2.offset, head: h2 });
  assert.deepEqual(await run(w3), []);
});
