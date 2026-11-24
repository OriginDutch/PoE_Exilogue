'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { LeagueDb } = require('../src/main/db');
const { Tracker, freshState } = require('../src/core/tracker');
const { parseLine } = require('../src/core/parser');

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'exl-')), 'league.db');
const L = (t, msg) => `2026/11/13 ${t} 1000 abc [INFO Client 1] ${msg}`;

function play(tr, lines) { for (const l of lines) tr.apply(parseLine(l)); }

const SESSION = [
  L('20:01:00', '***** LOG FILE OPENING *****'),
  L('20:01:05', 'Generating level 1 area "1_1_1" with seed 11'),
  L('20:01:06', ': You have entered The Twilight Strand.'),
  L('20:03:00', ': Seraphine (Witch) is now level 2'),
  L('20:05:00', ': Seraphine has been slain.'),
];

test('db: round trip of state, events, maps and offset', () => {
  const f = tmp();
  const db = new LeagueDb(f);
  const tr = new Tracker(freshState());
  play(tr, SESSION);
  db.commit({ tracker: tr.s, meta: { offset: 1234, file: 'C:/x/Client.txt' }, pending: tr.takePending() });
  db.close();
  const db2 = new LeagueDb(f);
  const saved = db2.load();
  assert.equal(saved.offset, 1234);
  assert.equal(saved.file, 'C:/x/Client.txt');
  assert.equal(saved.tracker.character.name, 'Seraphine');
  assert.deepEqual(saved.tail.map(e => e.type), ['sessStart', 'level', 'death']);
  const tr2 = new Tracker(saved.tracker, { maps: saved.maps, tail: saved.tail });
  assert.equal(tr2.snapshot(Date.now()).eventCount, 3);
  db2.close();
});

test('db: a save with no changes writes nothing, a small change writes only that key', () => {
  const db = new LeagueDb(tmp());
  const tr = new Tracker(freshState());
  play(tr, SESSION);
  assert.equal(db.commit({ tracker: tr.s, meta: { offset: 10, file: 'a' }, pending: tr.takePending() }), true);
  assert.equal(db.commit({ tracker: tr.s, meta: { offset: 10, file: 'a' }, pending: tr.takePending() }), false);
  const before = new Map(db.written);
  play(tr, [L('20:06:00', ': Seraphine (Witch) is now level 3')]);
  db.commit({ tracker: tr.s, meta: { offset: 20, file: 'a' }, pending: tr.takePending() });
  const changed = [...db.written].filter(([k, v]) => before.get(k) !== v).map(([k]) => k).sort();
  assert.ok(!changed.includes('t.zoneCache'), 'unchanged keys are not rewritten');
  assert.ok(changed.includes('offset') && changed.includes('t.character'));
  db.close();
});

test('db: events query filters by character/type, merges pending, newest first', () => {
  const db = new LeagueDb(tmp());
  const tr = new Tracker(freshState());
  play(tr, SESSION);
  db.commit({ tracker: tr.s, meta: { offset: 0, file: null }, pending: tr.takePending() });
  play(tr, [L('20:07:00', ': Seraphine has been slain.')]); // not saved yet
  const r = db.events({ char: 'Seraphine', types: ['death'], limit: 10 }, tr.pending.events);
  assert.equal(r.total, 2);
  assert.equal(r.rows.length, 2);
  assert.ok(r.rows[0].seq > r.rows[1].seq);
  assert.equal(r.any, 4);
  const lim = db.events({ char: 'all', limit: 1 }, tr.pending.events);
  assert.equal(lim.rows.length, 1);
  assert.equal(lim.total, 4);
  db.close();
});

test('db: old state.json data migrates (events get sequence numbers, maps move to their table)', () => {
  const db = new LeagueDb(tmp());
  const legacy = freshState();
  legacy.events = [{ type: 'level', t: 1, char: 'A' }, { type: 'death', t: 2, char: 'A' }];
  legacy.maps = [{ areaId: 'MapWorldsStrand', start: 5, end: 9, activeMs: 4, deaths: 0, tier: 1 }];
  legacy.eventSeq = 7; // the old cap dropped some
  const tr = new Tracker(JSON.parse(JSON.stringify(legacy)));
  assert.ok(!('events' in tr.s) && !('maps' in tr.s));
  db.commit({ tracker: tr.s, meta: { offset: 5, file: 'f' }, pending: tr.takePending() });
  const saved = db.load();
  assert.deepEqual(saved.tail.map(e => e.seq), [6, 7]);
  assert.equal(saved.maps.length, 1);
  assert.equal(saved.tracker.eventSeq, 7);
  db.close();
});

test('db: backup copy and restore', () => {
  const f = tmp();
  const db = new LeagueDb(f);
  const tr = new Tracker(freshState());
  play(tr, SESSION);
  db.commit({ tracker: tr.s, meta: { offset: 1, file: 'f' }, pending: tr.takePending() });
  const bak = path.join(path.dirname(f), 'league.backup-x.db');
  db.backupTo(bak);
  db.clear();
  assert.equal(db.load().tracker, null);
  db.restoreFrom(bak);
  assert.equal(db.load().tracker.character.name, 'Seraphine');
  db.close();
});

test('db: an unreadable file is kept aside, not overwritten', () => {
  const f = tmp();
  fs.writeFileSync(f, 'this is not a database'.repeat(200));
  const db = new LeagueDb(f);
  assert.ok(db.corruptFile && fs.existsSync(db.corruptFile));
  assert.equal(db.load().tracker, null);
  db.close();
});

test('db: a failed restore (bad backup) changes nothing and the database stays open', () => {
  const f = tmp();
  const db = new LeagueDb(f);
  const tr = new Tracker(freshState());
  play(tr, SESSION);
  db.commit({ tracker: tr.s, meta: { offset: 5, file: 'f' }, pending: tr.takePending() });
  const bad = path.join(path.dirname(f), 'league.backup-bad.db');
  fs.writeFileSync(bad, 'garbage'.repeat(100));
  assert.throws(() => db.restoreFrom(bad));
  assert.equal(db.load().tracker.character.name, 'Seraphine');
  assert.equal(db.load().offset, 5);
  db.close();
});

test('db: events paging with before/after cursors', () => {
  const db = new LeagueDb(tmp());
  const tr = new Tracker(freshState());
  play(tr, SESSION);
  db.commit({ tracker: tr.s, meta: {}, pending: tr.takePending() });
  const first = db.events({ limit: 2 });
  assert.deepEqual(first.rows.map(e => e.seq), [3, 2]);
  const older = db.events({ limit: 2, before: 2 });
  assert.deepEqual(older.rows.map(e => e.seq), [1]);
  play(tr, [L('20:09:00', ': Seraphine has been slain.')]);
  const newer = db.events({ after: 3 }, tr.pending.events);
  assert.deepEqual(newer.rows.map(e => e.seq), [4]);
  db.close();
});

test('db: writes are counted (checkpoint accounting)', () => {
  const db = new LeagueDb(tmp());
  const tr = new Tracker(freshState());
  play(tr, SESSION);
  db.commit({ tracker: tr.s, meta: { offset: 1 }, pending: tr.takePending() });
  db.checkpoint();
  const a = db.io.db;
  assert.ok(a > 0 && a < 200000, 'first save counted: ' + a);
  db.commit({ tracker: tr.s, meta: { offset: 2 }, pending: tr.takePending() });
  db.checkpoint();
  const b = db.io.db - a;
  assert.ok(b > 0 && b < a, 'small change, small count: ' + b);
  db.checkpoint();
  assert.equal(db.io.db - a - b, 0, 'nothing new, nothing counted');
  db.close();
});

test('db: source of the saved state (file, league start, first line) round-trips', () => {
  const f = tmp();
  const db = new LeagueDb(f);
  db.commit({ tracker: freshState(), meta: { offset: 9, file: 'C:/a/Client.txt', minStamp: '2026/11/13 20:00:00', head: 'first' }, pending: null });
  db.close();
  const s = new LeagueDb(f).load();
  assert.equal(s.minStamp, '2026/11/13 20:00:00');
  assert.equal(s.head, 'first');
});

test('db: saving the same maps twice (retried save) stores them once', () => {
  const db = new LeagueDb(tmp());
  const m = { areaId: 'MapWorldsStrand', seed: 7, start: 100, end: 200, activeMs: 100, deaths: 0, tier: 1 };
  db.commit({ tracker: freshState(), meta: {}, pending: { events: [], maps: [m] } });
  db.commit({ tracker: freshState(), meta: { offset: 1 }, pending: { events: [], maps: [m] } });
  assert.equal(db.load().maps.length, 1);
  db.close();
});

test('db: deaths in maps per hour of the day (campaign deaths and older ones left out, pending counted)', () => {
  const db = new LeagueDb(tmp());
  const at = (h, m) => new Date(2026, 10, 15, h, m).getTime();
  db.commit({ pending: { events: [
    { seq: 1, t: at(1, 10), type: 'death', char: 'A', tier: 16 },
    { seq: 2, t: at(1, 50), type: 'death', char: 'A', tier: 14 },
    { seq: 3, t: at(1, 55), type: 'death', char: 'A', tier: null },          // in the campaign
    { seq: 4, t: at(22, 5), type: 'death', char: 'A', tier: 16 },
    { seq: 5, t: new Date(2026, 10, 1, 1, 0).getTime(), type: 'death', char: 'A', tier: 16 }, // before `since`
    { seq: 6, t: at(1, 20), type: 'level', char: 'A', level: 90 },
  ], maps: [] } });
  const h = db.deathHours(new Date(2026, 10, 13).getTime(), [{ seq: 7, t: at(22, 30), type: 'death', tier: 15 }]);
  assert.equal(h[1], 2);
  assert.equal(h[22], 2);
  assert.equal(h.reduce((a, b) => a + b, 0), 4);
  db.close();
});

test('db: an empty tracker is not content worth keeping; events are', () => {
  const db = new LeagueDb(tmp());
  const empty = new Tracker(freshState());
  db.commit({ tracker: empty.s, meta: { offset: 0, file: 'C:/x/Client.txt' }, pending: empty.takePending() });
  assert.strictEqual(db.hasData(), true);     // keys were written
  assert.strictEqual(db.hasContent(), false); // but nothing to back up or keep
  const tr = new Tracker(freshState());
  play(tr, SESSION);
  db.commit({ tracker: tr.s, meta: { offset: 99, file: 'C:/x/Client.txt' }, pending: tr.takePending() });
  assert.strictEqual(db.hasContent(), true);
  db.close();
});
