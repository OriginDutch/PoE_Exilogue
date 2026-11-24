'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { plan, geometry, essenceCounts, LAYOUT } = require('../src/core/essences');

// Prices: poe.ninja Covens, 24 Nov 2026 (chaos). Counts: a real essence tab from that day.
const P = {
  Fear: [0.4183, 1.48, 5.77], Envy: [0.8859, 2.92, 9.43], Anguish: [0.7083, 0.7922, 5.62], Zeal: [1.94, 6.23, 22.04],
};
const Q = { Fear: [10, 21, 8], Envy: [9, 12, 9], Anguish: [10, 11, 15], Zeal: [16, 16, 14] };
const T = ['Screaming', 'Shrieking', 'Deafening'];
const prices = {}, counts = {};
for (const [k, v] of Object.entries(P)) v.forEach((x, i) => { prices[`${T[i]} Essence of ${k}`] = x; });
for (const [k, v] of Object.entries(Q)) v.forEach((x, i) => { counts[`${T[i]} Essence of ${k}`] = x; });
const row = (p, type) => p.rows.find(r => r.type === type);
const box = (r, tier) => r.cells.find(c => c.tier === tier).box;

test('essences: layout covers 20 types, 12 left and 8 right', () => {
  assert.equal(LAYOUT.length, 20);
  assert.equal(LAYOUT.filter(l => l.side === 'L').length, 12);
});

test('essences: chain makes a step green that is not worth it on its own (Fear)', () => {
  const p = plan(counts, prices);
  const r = row(p, 'Fear');
  // 1.48 / 0.4183 = 3.54x on its own already; Shrieking → Deafening 3.90x
  assert.equal(box(r, 'Screaming'), 'green');
  assert.equal(box(r, 'Shrieking'), 'green');
  assert.equal(box(r, 'Deafening'), null);
});

test('essences: Anguish Screaming is red, Shrieking green', () => {
  const r = row(plan(counts, prices), 'Anguish');
  // Shrieking is worth 5.62/3 = 1.87 when upgraded; 1.87 < 3 × 0.7083 = 2.12
  assert.equal(box(r, 'Screaming'), 'red');
  assert.equal(box(r, 'Shrieking'), 'green');
});

test('essences: a chain that cannot finish is red, one that can is green', () => {
  const pr = { 'Screaming Essence of Woe': 1, 'Shrieking Essence of Woe': 2, 'Deafening Essence of Woe': 9 };
  // 3 Screaming → 1 Shrieking, which can't go on: 3c in, 2c out
  const r = row(plan({ 'Screaming Essence of Woe': 3, 'Shrieking Essence of Woe': 0 }, pr), 'Woe');
  assert.equal(box(r, 'Screaming'), 'red');
  assert.equal(r.profit, 0);
  assert.equal(r.label, null);
  // 9 Screaming → 3 Shrieking → 1 Deafening: 9c in, 9c out (exactly 3x per step on the chain): green
  const r2 = row(plan({ 'Screaming Essence of Woe': 9, 'Shrieking Essence of Woe': 0 }, pr), 'Woe');
  assert.equal(box(r2, 'Screaming'), 'green');
  assert.equal(box(r2, 'Shrieking'), 'green');
  // 3 Screaming + 2 Shrieking: the 1 that flows in makes 3 → 1 Deafening (9) for 3 + 4 = 7: green
  const r3 = row(plan({ 'Screaming Essence of Woe': 3, 'Shrieking Essence of Woe': 2 }, pr), 'Woe');
  assert.equal(box(r3, 'Screaming'), 'green');
  assert.equal(r3.profit, 2);
});

test('essences: what flows in can make a tier upgradeable', () => {
  const pr = { 'Screaming Essence of Woe': 1, 'Shrieking Essence of Woe': 3, 'Deafening Essence of Woe': 9 };
  const r = row(plan({ 'Screaming Essence of Woe': 6, 'Shrieking Essence of Woe': 1 }, pr), 'Woe');
  assert.equal(box(r, 'Screaming'), 'green');
  assert.equal(box(r, 'Shrieking'), 'green'); // 1 + 2 flowing in = 3
  assert.equal(r.profit, 0); // exactly 3x: 6×1 + 1×3 = 9 before, 1 Deafening = 9 after
});

test('essences: fewer than 3 gets no box, no price gets no advice', () => {
  const r = row(plan({ 'Screaming Essence of Rage': 2, 'Shrieking Essence of Rage': 5 }, { 'Screaming Essence of Rage': 1, 'Deafening Essence of Rage': 10 }), 'Rage');
  assert.equal(box(r, 'Screaming'), null);
  assert.equal(box(r, 'Shrieking'), null);
});

test('essences: profit and label in the first empty cell past Screaming', () => {
  const p = plan(counts, prices);
  const z = row(p, 'Zeal');
  // Zeal: Screaming 16 → 5 Shrieking (+1 left), 21 Shrieking → 7 Deafening
  const expect = (1 * 1.94 + 0 * 6.23 + 21 * 22.04) - (16 * 1.94 + 16 * 6.23 + 14 * 22.04);
  assert.equal(z.profit, Math.round(expect * 10) / 10);
  assert.equal(z.label, 3); // Wailing cell, empty
  const withWailing = row(plan({ ...counts, 'Wailing Essence of Fear': 1 }, prices), 'Fear');
  assert.equal(withWailing.label, 4); // Wailing taken: next one
  assert.ok(Math.abs(p.total - p.rows.reduce((s, r) => s + r.profit, 0)) < 0.05);
});

test('essences: the essence tab is the one with the most essences', () => {
  const r = essenceCounts([
    { name: 'Deafening Essence of Zeal', tab: 'Ess', qty: 14 }, { name: 'Shrieking Essence of Zeal', tab: 'Ess', qty: 16 },
    { name: 'Deafening Essence of Zeal', tab: 'Dump', qty: 2 }, { name: 'Chaos Orb', tab: 'Ess', qty: 5 },
  ]);
  assert.equal(r.tab, 'Ess');
  assert.deepEqual(r.counts, { 'Deafening Essence of Zeal': 14, 'Shrieking Essence of Zeal': 16 });
});

test('essences: geometry at 1440p matches the screenshot, 1080p scales by 0.75', () => {
  const p = plan(counts, prices);
  const g = geometry(p, 1440);
  const fearScream = g.boxes.find(b => b.type === 'Fear' && b.tier === 'Screaming');
  assert.deepEqual([fearScream.x, fearScream.y, fearScream.size], [189, 517, 62]);
  const zealShriek = g.boxes.find(b => b.type === 'Zeal' && b.tier === 'Shrieking');
  assert.deepEqual([zealShriek.x, zealShriek.y], [703, 320]);
  const g2 = geometry(p, 1080);
  assert.equal(g2.scale, 0.75);
  assert.equal(g2.boxes.find(b => b.type === 'Fear' && b.tier === 'Screaming').x, Math.round(189 * 0.75));
});

test('essences: wealth.latestItems reads the newest archived export, ninja.essencePrices maps names to chaos', async () => {
  const fs = require('fs'), os = require('os'), path = require('path');
  const { Wealth } = require('../src/main/wealth');
  const { NinjaPrice } = require('../src/main/ninja');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exl-ess-'));
  const w = new Wealth({ dir, downloads: dir });
  assert.equal(w.latestItems(), null);
  fs.mkdirSync(path.join(dir, 'wealth'));
  const csv = rows => '﻿"Name","Tab","Quantity","Price","Total"\n' + rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
  const old = path.join(dir, 'wealth', 'Wealthy-Exile-export-1.csv'), neu = path.join(dir, 'wealth', 'Wealthy-Exile-export-2.csv');
  fs.writeFileSync(old, csv([['Deafening Essence of Zeal', 'Ess', 1, 22, 22]]));
  fs.writeFileSync(neu, csv([['Deafening Essence of Zeal', 'Ess', 14, 22, 308], ['Chaos Orb', 'B', 5, 1, 5]]));
  fs.utimesSync(old, new Date(1e12), new Date(1e12));
  const r = w.latestItems();
  assert.equal(r.items.find(i => i.name === 'Deafening Essence of Zeal').qty, 14);
  w.close();
  const resp = obj => ({ ok: true, status: 200, text: async () => JSON.stringify(obj) });
  const n = new NinjaPrice({ userAgent: 't', fetch: async url => url.endsWith('/data/index-state') ? resp({ economyLeagues: [{ name: 'Covens' }] })
    : resp({ core: { primary: 'chaos', items: [{ id: 'dz', name: 'Deafening Essence of Zeal' }, { id: 'x', name: 'Screaming Essence of Zeal' }] },
      lines: [{ id: 'dz', primaryValue: 22.04 }, { id: 'x', primaryValue: 0 }] }) });
  const p = await n.essencePrices('Covens of Umbra');
  assert.deepEqual(p.prices, { 'Deafening Essence of Zeal': 22.04 });
});

test('essences: finds where the tab sits (in a stash folder or not) from the stash ornament', () => {
  const { pickShift, NO_FOLDER_DY, ANCHOR_GREY, ncc, geometry } = require('../src/core/essences');
  // 25×45 grey samples from two real 1080p screenshots: one with the essence tab in a folder, one without.
  const f = require('./fixtures/essence-anchor.json');
  assert.equal(pickShift({ 0: f.folder, [NO_FOLDER_DY]: f.folder_at35 }), 0);
  assert.equal(pickShift({ 0: f.nofolder_at0, [NO_FOLDER_DY]: f.nofolder_at35 }), NO_FOLDER_DY);
  assert.ok(ncc(ANCHOR_GREY, f.nofolder_at35) > 0.95);
  // Brighter or darker gamma doesn't matter.
  assert.equal(pickShift({ 0: f.nofolder_at0.map(v => v * 0.6 + 40), [NO_FOLDER_DY]: f.nofolder_at35.map(v => v * 0.6 + 40) }), NO_FOLDER_DY);
  // Nothing recognisable (stash closed): unsure, so the caller keeps its last sure layout.
  const flat = new Array(1125).fill(80), noise = Array.from({ length: 1125 }, (_, i) => (i * 7919) % 255);
  assert.equal(pickShift({ 0: flat, [NO_FOLDER_DY]: noise }), null);
  assert.equal(pickShift({}), null);
  // Half the ornament covered (an item tooltip, a window): unsure, not a wrong guess.
  const cover = g => g.map((v, i) => (i % 25 < 13 ? 30 : v));
  assert.equal(pickShift({ 0: cover(f.nofolder_at0), [NO_FOLDER_DY]: cover(f.nofolder_at35) }), null);
  // The shift moves boxes and the total by 35 px at 1080p, and nothing sideways.
  const p = { rows: [{ side: 'L', row: 0, cells: [{ col: 0, box: 'g' }] }], total: 1 };
  const a = geometry(p, 1080), b = geometry(p, 1080, NO_FOLDER_DY);
  assert.ok(Math.abs(a.boxes[0].y - b.boxes[0].y - 35) <= 1);
  assert.equal(a.boxes[0].x, b.boxes[0].x);
  assert.ok(Math.abs(a.total.y - b.total.y - 35) <= 1);
});
