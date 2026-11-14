'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseLine, parseDuration } = require('../src/core/parser');
const { Tracker } = require('../src/core/tracker');

// Builds synthetic Client.txt lines in the real format.
let clock = new Date(2026, 10, 13, 20, 0, 0).getTime();
const pad = n => String(n).padStart(2, '0');
function stamp(t) {
  const d = new Date(t);
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
const L = {
  open: () => `${stamp(clock)} ***** LOG FILE OPENING *****`,
  gen: (lvl, id, seed) => `${stamp(clock)} 1234 1186a0e0 [DEBUG Client 99] Generating level ${lvl} area "${id}" with seed ${seed}`,
  enter: z => `${stamp(clock)} 1234 cffb0719 [INFO Client 99] : You have entered ${z}.`,
  lvl: (n, c, l) => `${stamp(clock)} 1234 cffb0719 [INFO Client 99] : ${n} (${c}) is now level ${l}`,
  slain: n => `${stamp(clock)} 1234 cffb0719 [INFO Client 99] : ${n} has been slain.`,
  played: txt => `${stamp(clock)} 1234 cffb0719 [INFO Client 99] : You have played for ${txt}.`,
};
const wait = sec => { clock += sec * 1000; };

function feed(tr, line) { tr.apply(parseLine(line)); }

test('parser basics', () => {
  assert.equal(parseLine(L.enter('The Twilight Strand')).zone, 'The Twilight Strand');
  const g = parseLine(L.gen(83, 'MapWorldsStrand', '777'));
  assert.deepEqual([g.areaLevel, g.areaId, g.seed], [83, 'MapWorldsStrand', '777']);
  assert.equal(parseLine(L.lvl('TerribleLizard', 'Witch', 2)).level, 2);
  assert.equal(parseDuration('1 day, 2 hours, 3 minutes and 4 seconds'), 93784);
  assert.equal(parseLine('garbage'), null);
});

test('campaign run, act splits, maps, hideout pause, deaths', () => {
  const tr = new Tracker();
  feed(tr, L.open());
  feed(tr, L.gen(1, '1_1_1', '1')); feed(tr, L.enter('The Twilight Strand'));
  wait(60); feed(tr, L.lvl('Lizzy', 'Witch', 2));
  wait(240); feed(tr, L.gen(1, '1_1_town', '2')); feed(tr, L.enter("Lioneye's Watch"));
  wait(300); feed(tr, L.slain('Lizzy'));
  wait(300); feed(tr, L.gen(13, '1_2_1', '3')); feed(tr, L.enter('The Southern Forest')); // act 2 at 15:00

  let snap = tr.snapshot(clock);
  assert.equal(snap.campaign.char, 'Lizzy');
  assert.equal(snap.campaign.splits[1], 15 * 60 * 1000);
  assert.equal(snap.campaign.deaths, 1);

  tr.setProfile([{ name: 'Lizzy', class: 'Witch', level: 2, league: 'Covens of Umbra', lastLoginTime: 0 }], clock);
  feed(tr, L.slain('SomeoneElse')); // party member: not on the profile
  assert.equal(tr.snapshot(clock).totals.deaths, 1);

  // finish the campaign quickly
  feed(tr, L.lvl('Lizzy', 'Witch', 66));
  wait(600); feed(tr, L.gen(67, '2_10_7', '4')); feed(tr, L.enter('The Feeding Trough'));
  wait(60); feed(tr, L.gen(68, '3_10_town', '5')); feed(tr, L.enter('Karui Shores'));
  snap = tr.snapshot(clock);
  assert.equal(snap.campaign, null);
  assert.equal(snap.runs[0].finishReason, 'epilogue');
  assert.equal(snap.runs[0].activeMs, 26 * 60 * 1000);

  wait(60); feed(tr, L.gen(68, 'MapWorldsBeach', '100')); feed(tr, L.enter('Beach Map'));
  wait(120); feed(tr, L.gen(1, 'HideoutLuxurious', '6')); feed(tr, L.enter('Luxurious Hideout'));
  wait(300); // hideout: map paused
  feed(tr, L.enter('Beach Map')); // portal back, no Generating line
  wait(60);
  assert.equal(tr.snapshot(clock).currentMap.activeMs, 180 * 1000);

  feed(tr, L.gen(70, 'MapWorldsDunes', '101')); feed(tr, L.enter('Dunes Map'));
  snap = tr.snapshot(clock);
  assert.equal(snap.totals.mapsDone, 1);
  assert.equal(snap.lastMap.activeMs, 180 * 1000);
  assert.equal(snap.totals.tiers[1], 1);
  assert.equal(tr.snapshot(clock + 30000).currentMap.activeMs, 30000);

  // game closed overnight: gap never counts, open map stays open (review #3)
  wait(8 * 3600); feed(tr, L.open());
  snap = tr.snapshot(clock);
  assert.equal(snap.totals.mapsDone, 1);
  assert.equal(snap.currentMap.activeMs, 0);
  assert.equal(snap.session.deaths, 0);
});

test('second character compares against previous run; alt play does not tick or end the run (review #1)', () => {
  const tr = new Tracker();
  feed(tr, L.open());
  feed(tr, L.gen(1, '1_1_1', '1')); wait(30); feed(tr, L.lvl('First', 'Witch', 2));
  wait(600); feed(tr, L.gen(13, '1_2_1', '2'));
  feed(tr, L.lvl('First', 'Witch', 66)); wait(600); feed(tr, L.gen(68, '3_10_town', '2b')); feed(tr, L.enter('Karui Shores'));
  // second char
  feed(tr, L.gen(1, '1_1_1', '4')); wait(30); feed(tr, L.lvl('Second', 'Ranger', 2));
  wait(500); feed(tr, L.gen(13, '1_2_1', '5'));
  let snap = tr.snapshot(clock);
  assert.equal(snap.campaign.char, 'Second');
  assert.equal(snap.campaign.reference.char, 'First');
  assert.equal(snap.campaign.splits[1], 530 * 1000);
  assert.equal(snap.campaign.reference.splits[1], 630 * 1000);

  // log into First (no level-up line!) and run a map
  wait(60); feed(tr, L.gen(1, 'HideoutLuxurious', '6'));
  wait(30); feed(tr, L.gen(83, 'MapWorldsStrand', '9')); feed(tr, L.enter('Strand Map'));
  wait(1200); feed(tr, L.slain('First'));
  snap = tr.snapshot(clock);
  assert.ok(snap.campaign, 'run must not be finished by the alt');
  assert.equal(snap.campaign.activeMs, 620 * 1000, 'alt map time not counted (hideout 30s ambiguous)');
  assert.equal(snap.totals.deaths, 1, 'alt death counted in league totals');
  assert.equal(snap.campaign.deaths, 0);

  // back to Second, without a level-up: an act-2 zone at fitting level resumes the run
  wait(60); feed(tr, L.gen(14, '1_2_2', '10'));
  wait(100);
  assert.equal(tr.snapshot(clock).campaign.activeMs, 720 * 1000);
});

test('relog / new Strand instance keeps the same run (review #2)', () => {
  const tr = new Tracker();
  feed(tr, L.open());
  feed(tr, L.gen(1, '1_1_1', '1')); wait(60); feed(tr, L.lvl('NewGuy', 'Duelist', 2));
  wait(240); feed(tr, L.gen(1, '1_1_1', '2')); // disconnect -> new instance
  wait(60); feed(tr, L.lvl('NewGuy', 'Duelist', 3)); // same name -> merged back
  let snap = tr.snapshot(clock);
  assert.equal(snap.runs.length, 1);
  assert.equal(snap.campaign.activeMs, 360 * 1000);

  // game restart: character unknown, new Strand instance, then a level-up proves it's NewGuy -> merged
  wait(3600); feed(tr, L.open());
  feed(tr, L.gen(1, '1_1_1', '3')); wait(120); feed(tr, L.lvl('NewGuy', 'Duelist', 5));
  snap = tr.snapshot(clock);
  assert.equal(snap.runs.length, 1);
  assert.equal(snap.campaign.activeMs, 480 * 1000);
});
test('played command', () => {
  const tr = new Tracker();
  feed(tr, L.open());
  feed(tr, L.played('2 hours, 5 minutes and 1 second'));
  assert.equal(tr.snapshot(clock).played.seconds, 7501);
});

test('campaign ends on reaching the Epilogue (Karui Shores)', () => {
  const tr = new Tracker();
  feed(tr, L.open());
  feed(tr, L.gen(1, '1_1_1', '1')); wait(30); feed(tr, L.lvl('Kit', 'Witch', 2)); feed(tr, L.lvl('Kit', 'Witch', 65));
  wait(600); feed(tr, L.gen(64, '2_10_7', '2')); feed(tr, L.enter('The Feeding Trough'));
  wait(300); feed(tr, L.gen(67, '3_10_town', '3')); feed(tr, L.enter('Karui Shores'));
  const snap = tr.snapshot(clock);
  assert.equal(snap.campaign, null);
  assert.equal(snap.runs[0].finishReason, 'epilogue');
  assert.equal(snap.runs[0].activeMs, 930 * 1000);
  assert.equal(snap.runs[0].splits[10], 930 * 1000);
});

test('events: session, level, act, death, campaign, first map, tier', () => {
  const tr = new Tracker();
  feed(tr, L.open());
  feed(tr, L.gen(1, '1_1_1', '1')); feed(tr, L.enter('The Twilight Strand'));
  wait(30); feed(tr, L.lvl('Evy', 'Witch', 2));
  wait(30); feed(tr, L.slain('Evy'));
  wait(600); feed(tr, L.gen(13, '1_2_1', '2')); feed(tr, L.enter('The Southern Forest'));
  feed(tr, L.lvl('Evy', 'Witch', 66));
  wait(600); feed(tr, L.gen(68, '3_10_town', '3')); feed(tr, L.enter('Karui Shores'));
  wait(60); feed(tr, L.gen(68, 'MapWorldsBeach', '4')); feed(tr, L.enter('Beach Map'));
  wait(60); feed(tr, L.gen(70, 'MapWorldsDunes', '5'));
  wait(60); feed(tr, L.gen(69, 'MapWorldsStrand', '6'));
  tr.setProfile([{ name: 'Evy', class: 'Witch', level: 66, league: 'Covens of Umbra', lastLoginTime: 0 }], clock);
  feed(tr, L.lvl('PartyGuy', 'Ranger', 50)); // not on the profile
  tr.setPaused(true, clock + 1000);
  const types = tr.events().map(e => e.type);
  assert.deepEqual(types, ['sessStart', 'level', 'death', 'act', 'level', 'act', 'campaign', 'firstMap', 'tier', 'sessEnd']);
  const death = tr.events().find(e => e.type === 'death');
  assert.equal(death.zone, 'The Twilight Strand');
  assert.equal(tr.events().find(e => e.type === 'tier').tier, 3);
  assert.deepEqual(Object.keys(tr.snapshot(clock).chars), ['Evy']);
});

test('abandoned run resumes when that character plays again', () => {
  const tr = new Tracker();
  feed(tr, L.open());
  feed(tr, L.gen(1, '1_1_1', '1')); wait(30); feed(tr, L.lvl('One', 'Witch', 2));
  wait(300); feed(tr, L.gen(13, '1_2_1', '2')); // One in act 2
  feed(tr, L.gen(1, '1_1_1', '3')); wait(30); feed(tr, L.lvl('Two', 'Ranger', 2));
  let snap = tr.snapshot(clock);
  assert.equal(snap.campaign.char, 'Two');
  assert.equal(snap.runs.find(r => r.char === 'One').abandoned, true);
  // back to One
  wait(60); feed(tr, L.gen(14, '1_2_2', '4')); wait(60); feed(tr, L.lvl('One', 'Witch', 14));
  snap = tr.snapshot(clock);
  assert.equal(snap.campaign.char, 'One');
  assert.equal(snap.runs.find(r => r.char === 'Two').abandoned, true);
});

test('old saved state without new fields still loads', () => {
  const old = new Tracker().s; delete old.events; delete old.chars;
  const tr = new Tracker(JSON.parse(JSON.stringify(old)));
  feed(tr, L.open());
  assert.equal(tr.events().length, 1);
});

test('profile: existing character without a run has unknown campaign until it enters a map; last login decides who plays', () => {
  const tr = new Tracker();
  feed(tr, L.open());
  tr.setProfile([
    { name: 'OldMain', class: 'Warden', level: 89, league: 'Covens of Umbra', lastLoginTime: Math.floor(clock / 1000) },
    { name: 'Alt', class: 'Witch', level: 40, league: 'Covens of Umbra', lastLoginTime: Math.floor(clock / 1000) - 3600 },
  ], clock);
  let chars = tr.snapshot(clock).chars;
  assert.equal(tr.snapshot(clock).character.name, 'OldMain');
  assert.equal(chars.OldMain.campaign, 'unknown');
  assert.equal(chars.Alt.campaign, 'unknown');
  wait(60); feed(tr, L.gen(83, 'MapWorldsStrand', '9')); feed(tr, L.enter('Strand Map'));
  chars = tr.snapshot(clock).chars;
  assert.equal(chars.OldMain.campaign, 'done');
  assert.equal(chars.Alt.campaign, 'unknown');
  // a level-up of a profile character is an event even with no run
  feed(tr, L.lvl('OldMain', 'Warden', 90));
  assert.equal(tr.events().filter(e => e.type === 'level').length, 1);
});

test('profile login switches ownership away from the leveling run', () => {
  const tr = new Tracker();
  feed(tr, L.open());
  feed(tr, L.gen(1, '1_1_1', '1')); wait(30); feed(tr, L.lvl('Fresh', 'Ranger', 2));
  wait(300);
  tr.setProfile([
    { name: 'Fresh', class: 'Ranger', level: 2, league: 'X', lastLoginTime: Math.floor((clock - 400000) / 1000) },
    { name: 'Main', class: 'Warden', level: 90, league: 'X', lastLoginTime: Math.floor(clock / 1000) },
  ], clock);
  const before = tr.snapshot(clock).campaign.activeMs;
  wait(600); feed(tr, L.gen(1, 'HideoutLuxurious', '2'));
  assert.equal(tr.snapshot(clock).campaign.activeMs, before, 'run does not tick while Main is logged in');
});

test('review: new character while previous is still in act 1 gets its own run', () => {
  const tr = new Tracker();
  feed(tr, L.open());
  feed(tr, L.gen(1, '1_1_1', '1')); wait(30); feed(tr, L.lvl('One', 'Witch', 2));
  wait(100); feed(tr, L.gen(1, '1_1_1', '2')); wait(30); feed(tr, L.lvl('Two', 'Ranger', 2));
  const snap = tr.snapshot(clock);
  assert.deepEqual(snap.runs.map(r => r.char), ['One', 'Two']);
  assert.equal(snap.campaign.char, 'Two');
});

test('review: death of an abandoned character resumes its run', () => {
  const tr = new Tracker();
  feed(tr, L.open());
  feed(tr, L.gen(1, '1_1_1', '1')); wait(30); feed(tr, L.lvl('One', 'Witch', 2));
  wait(300); feed(tr, L.gen(13, '1_2_1', '2'));
  feed(tr, L.gen(1, '1_1_1', '3')); wait(30); feed(tr, L.lvl('Two', 'Ranger', 2));
  wait(60); feed(tr, L.gen(14, '1_2_2', '4')); wait(30); feed(tr, L.slain('One'));
  const snap = tr.snapshot(clock);
  assert.equal(snap.campaign.char, 'One');
  assert.equal(snap.runs.find(r => r.char === 'One').deaths, 1);
});

test('review: with a profile, a brand-new character is still claimed and its level-ups kept', () => {
  const tr = new Tracker();
  feed(tr, L.open());
  tr.setProfile([{ name: 'Main', class: 'Warden', level: 90, league: 'X', lastLoginTime: 1 }], clock);
  feed(tr, L.gen(1, '1_1_1', '1')); wait(30); feed(tr, L.lvl('Newbie', 'Witch', 2));
  wait(30); feed(tr, L.slain('Newbie'));
  const snap = tr.snapshot(clock);
  assert.equal(snap.campaign.char, 'Newbie');
  assert.equal(snap.campaign.deaths, 1);
  assert.equal(tr.events().filter(e => e.type === 'level').length, 1);
});

test('3.30 log: the Epilogue town (2_11_endgame_town) ends the run without an "act 11"', () => {
  const tr = new Tracker();
  const L = (t, msg) => `2026/11/13 ${t} 1 a [INFO Client 1] ${msg}`;
  const seq = [L('20:10:16', 'Generating level 1 area "1_1_1" with seed 1'), L('20:10:17', ': You have entered The Twilight Strand.'),
    L('20:11:37', ': Lizard (Witch) is now level 2')];
  for (let a = 2; a <= 10; a++) {
    seq.push(L(`21:${String(a * 5).padStart(2, '0')}:00`, `Generating level ${a * 6} area "2_${a}_1" with seed 1`));
    seq.push(L(`21:${String(a * 5).padStart(2, '0')}:01`, `: You have entered Zone ${a}.`));
    seq.push(L(`21:${String(a * 5).padStart(2, '0')}:30`, `: Lizard (Witch) is now level ${a * 6}`));
  }
  for (const l of seq) tr.apply(parseLine(l));
  tr.apply(parseLine(L('23:59:00', 'Generating level 69 area "2_11_endgame_town" with seed 1')));
  tr.apply(parseLine(L('23:59:01', ': You have entered Karui Shores.')));
  const run = tr.snapshot(Date.now()).runs[0];
  assert.equal(run.maxAct, 10);
  assert.ok(!(11 in run.splits), 'no act 11 split');
  assert.ok(!tr.events().some(e => e.type === 'act' && e.act === 11));
});

test('sessions: breaks are counted and the summary lands in lastSession and the sessEnd event', () => {
  const tr = new Tracker();
  const L = (t, msg) => `2026/11/14 ${t} 1 a [INFO Client 1] ${msg}`;
  tr.apply(parseLine('2026/11/14 10:00:00 ***** LOG FILE OPENING *****'));
  tr.apply(parseLine(L('10:00:05', 'Generating level 70 area "MapWorldsStrand" with seed 3')));
  tr.apply(parseLine(L('10:00:06', ': You have entered Strand Map.')));
  tr.apply(parseLine(L('10:05:00', ': Lizard (Witch) is now level 87')));
  const t0 = new Date(2026, 10, 14, 10, 10).getTime();
  tr.addBreak(t0, t0 + 5 * 60e3, 'idle');
  tr.addBreak(t0 + 20 * 60e3, t0 + 20 * 60e3, 'manual');
  assert.equal(tr.s.session.breaks, 2);
  assert.equal(tr.s.session.breakMs, 5 * 60e3);
  assert.equal(tr.s.session.lastBreakEnd, t0 + 20 * 60e3);
  tr.setPaused(true, new Date(2026, 10, 14, 11, 0).getTime());
  const sum = tr.snapshot(Date.now()).lastSession;
  assert.equal(sum.breaks, 2);
  assert.equal(sum.playedMs, 60 * 60e3);
  assert.equal(sum.levelTo, 87);
  assert.ok(tr.events().some(e => e.type === 'sessEnd' && e.summary && e.summary.breaks === 2));
  assert.equal(tr.events().filter(e => e.type === 'break').length, 2);
});
