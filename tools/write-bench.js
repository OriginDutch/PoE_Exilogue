'use strict';
// Bytes written per hour of play: old state.json (v0.3) vs league.db (v0.4).
// Late-league state, then one simulated hour of mapping. Counts bytes passed to write() via /proc/self/io (Linux).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Tracker, freshState } = require('../src/core/tracker');
const { parseLine } = require('../src/core/parser');
const { LeagueDb } = require('../src/main/db');

const wchar = () => Number(/wchar: (\d+)/.exec(fs.readFileSync('/proc/self/io', 'utf8'))[1]);
const pad = n => String(n).padStart(2, '0');
let clock = Date.UTC(2026, 10, 13, 19, 0, 0);
const line = msg => { const d = new Date(clock); return `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} 1 a [INFO Client 1] ${msg}`; };
let seed = 1;

// One map: hideout -> map -> a death sometimes -> back to hideout. ~4 minutes.
function mapCycle(tr, i) {
  const tier = 1 + (i % 16);
  const step = (sec, msg) => { clock += sec * 1000; tr.apply(parseLine(line(msg))); };
  step(5, `Generating level ${68 + tier - 1} area "MapWorlds${['Strand', 'Beach', 'Cemetery', 'Dunes'][i % 4]}" with seed ${seed++}`);
  step(1, `: You have entered ${['Strand', 'Beach', 'Cemetery', 'Dunes'][i % 4]} Map.`);
  if (i % 5 === 0) step(60, ': Seraphine has been slain.');
  if (i % 7 === 0) step(30, `: Seraphine (Witch) is now level ${Math.min(100, 70 + (i % 30))}`);
  step(180, 'Generating level 1 area "HideoutFelled" with seed 1');
  step(1, ': You have entered Felled Hideout.');
}

const tr = new Tracker(freshState());
tr.apply(parseLine(line('***** LOG FILE OPENING *****')));
for (let i = 0; i < 4000; i++) mapCycle(tr, i);     // ~4000 maps
while (tr.s.eventSeq < 20000) { clock += 60000; tr.apply(parseLine(line(': Seraphine has been slain.'))); }

// ---- old: whole state.json, every 2 s while the log moves (it always moves while playing)
const legacyState = () => ({ tracker: { ...tr.s, events: tr.tail.concat(Array(Math.max(0, 20000 - tr.tail.length)).fill(tr.tail[0])), maps: tr.maps }, offset: 123456789, file: 'C:/PoE/logs/Client.txt' });
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exl-bench-'));
const oldFile = path.join(dir, 'state.json');
const oldText = JSON.stringify(legacyState(), null, 2);
let w0 = wchar();
for (let i = 0; i < 1800; i++) { fs.writeFileSync(oldFile + '.tmp', oldText); fs.renameSync(oldFile + '.tmp', oldFile); }
const oldBytes = wchar() - w0;

// ---- new: database, flush every 30 s with whatever happened in those 30 s
const db = new LeagueDb(path.join(dir, 'league.db'));
db.commit({ tracker: tr.s, meta: { offset: 1, file: 'f' }, pending: tr.takePending() }); // initial import, not counted
db.checkpoint(); db.io.db = 0;
w0 = wchar();
let off = 1;
for (let k = 0; k < 120; k++) {           // 120 x 30 s = 1 hour
  if (k % 8 === 0) mapCycle(tr, k);         // ~15 maps per hour
  off += 2000;
  db.commit({ tracker: tr.s, meta: { offset: off, file: 'f' }, pending: tr.takePending() });
}
db.checkpoint(); // count the copy into the main file too
console.log('counted by the app itself:', (db.io.db / 1048576).toFixed(2) + ' MB');
const newBytes = wchar() - w0;
db.close();

const mb = b => (b / 1048576).toFixed(2) + ' MB';
console.log(`state.json size late league: ${mb(oldText.length)}`);
console.log(`old (v0.3) per hour of play: ${mb(oldBytes)}`);
console.log(`new (v0.4) per hour of play: ${mb(newBytes)}`);
console.log(`factor: ${(oldBytes / newBytes).toFixed(0)}x less`);
console.log(`4000 h: old ${(oldBytes * 4000 / 1e12).toFixed(2)} TB, new ${(newBytes * 4000 / 1e9).toFixed(2)} GB`);
