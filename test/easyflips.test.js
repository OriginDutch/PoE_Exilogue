'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { compute, summary, scale } = require('../src/core/easyflips');

// poe.ninja snapshot, Covens, 25 Nov 2026: chaos price and hourly chaos volume.
const L = (name, chaos, vol, extra) => ({ name, chaos, vol, ...extra });
const LINES = [
  L('Divine Orb', 197.7, 1e6), L('Chaos Orb', 1, 1e6),
  L('Shrieking Essence of Zeal', 5.18, 19480), L('Deafening Essence of Zeal', 19.94, 173631),
  L('Screaming Essence of Rage', 0.4636, 222.8), L('Shrieking Essence of Rage', 1.75, 4164), L('Deafening Essence of Rage', 7.76, 50632),
  L('Simulacrum Splinter', 0.4884, 14712), L('Simulacrum', 164.2, 234333),
  L('Altered Perception', 41.55, 1600), L('Seven Years Bad Luck', 533.4, 55825), L('Mirror Shard', 7630, 2346142),
  L('The Sephirot', 165.8, 51170), L('Unrequited Love', 8439, 1496559),
  L('Silver Oil', 40.49, 5000), L('Golden Oil', 120.9, 9000), L('Tainted Oil', 1, 100),
  L('Orb of Fusing', 0.1334, 50000), L("Jeweller's Orb", 0.02591, 20000), L('Blessing of Uul-Netol', 30, 500),
];
const UNIQUES = [
  { id: 'kaoms-heart', name: "Kaom's Heart", itemType: 'Body Armour', links: 0, chaos: 100 },
  { id: 'kaoms-heart-6l', name: "Kaom's Heart", itemType: 'Body Armour', links: 6, chaos: 600 },
  { id: 'bow', name: 'Some Bow', itemType: 'Bow', links: 0, chaos: 10 }, { id: 'bow6', name: 'Some Bow', itemType: 'Bow', links: 6, chaos: 300 },
  { id: 'axe', name: 'Some Axe', itemType: 'Two Handed Axe', links: 0, chaos: 10 }, { id: 'axe6', name: 'Some Axe', itemType: 'Two Handed Axe', links: 6, chaos: 300 },
  { id: 'ring', name: 'Some Ring', itemType: 'Ring', links: 0, chaos: 5 },
  { id: 'kiss', name: "Uul-Netol's Kiss", itemType: 'One Hand Axe', links: 0, chaos: 2 },
  { id: 'embrace', name: "Uul-Netol's Embrace", itemType: 'Two Hand Axe', links: 0, chaos: 80 },
];
const run = (o = {}) => compute({ lines: LINES, uniques: UNIQUES, owned: o.owned || {}, opts: { divine: 197.7, ...o.opts } });
const byId = (r, id) => r.flips.find(f => f.id === id);

test('easyflips: essence 3 → 1 with spread on both sides', () => {
  const f = byId(run(), 'ess-deafening-essence-of-zeal');
  assert.ok(f);
  assert.equal(f.in[0].name, 'Shrieking Essence of Zeal'); assert.equal(f.in[0].n, 3);
  assert.ok(Math.abs(f.pay - 15.54 * 1.03) < 1e-6);
  assert.ok(Math.abs(f.get - 19.94 * 0.97) < 1e-6);
  assert.ok(Math.abs(f.margin - 100 * (19.94 * 0.97 - 15.54 * 1.03) / (15.54 * 1.03)) < 1e-6);
  // Volume is per hour: units a day = 19480 × 24 / 5.18.
  assert.ok(Math.abs(f.inDay - 19480 * 24 / 5.18) < 1e-6);
  assert.ok(!f.thin);
  // Pay at most: keeps exactly the minimum margin.
  assert.ok(Math.abs((f.get - f.payAtMost * 3 * 1.0) / (f.payAtMost * 3) - 0.10) < 1e-9);
});

test('easyflips: the cheaper essence route wins and the other is shown', () => {
  const f = byId(run(), 'ess-deafening-essence-of-rage');
  assert.equal(f.in[0].name, 'Screaming Essence of Rage'); assert.equal(f.in[0].n, 9); assert.equal(f.upgrades, 2);
  assert.equal(f.route.alt.name, 'Shrieking Essence of Rage'); assert.equal(f.route.alt.n, 3);
  // Screaming Rage trades 222.8c an hour: under the 1000c floor.
  assert.ok(f.thin && f.reasons.includes('thin') && f.below);
  assert.ok(f.route.best.pay < f.route.alt.pay);
});

test('easyflips: margins above 50% are flagged, and sort after unflagged flips', () => {
  const r = run();
  const rage = byId(r, 'ess-deafening-essence-of-rage');
  assert.ok(rage.verify);
  const ok = r.flips.filter(f => !f.below);
  const firstVerify = ok.findIndex(f => f.verify);
  assert.ok(firstVerify === -1 || ok.slice(firstVerify).every(f => f.verify));
});

test('easyflips: divine reward has no sell discount; unsure when the two divine prices differ more than the profit', () => {
  const f = byId(run({ opts: { divineAlt: 179 } }), 'card-the-sephirot');
  assert.ok(Math.abs(f.get - 197.7 * 10) < 1e-6);
  assert.ok(f.divUnsure); assert.ok(f.reasons.includes('divine')); assert.ok(f.below);
  const g = byId(run(), 'card-the-sephirot');
  assert.ok(!g.divUnsure);
});

test('easyflips: owned cards count at their sell price; you pay only for the rest', () => {
  const f = byId(run({ owned: { 'Seven Years Bad Luck': 9 } }), 'card-seven-years-bad-luck');
  assert.equal(f.own, 9);
  assert.ok(Math.abs(f.payNow - 4 * 533.4 * 1.03) < 1e-6);
  assert.ok(Math.abs(f.cost - (4 * 533.4 * 1.03 + 9 * 533.4 * 0.97)) < 1e-6);
  const s = scale(f, 2);
  assert.equal(s.buyN, 17);
  assert.ok(Math.abs(s.profit - (2 * f.get - (26 * 533.4 * 1.03 - 9 * 533.4 * 0.06))) < 1e-6);
  // The card counts one set; with more sets owned, n flips use them all.
  const g = byId(run({ owned: { 'Seven Years Bad Luck': 30 } }), 'card-seven-years-bad-luck');
  assert.equal(g.own, 13); assert.equal(g.ownAll, 30);
  assert.equal(scale(g, 2).buyN, 0); assert.equal(scale(g, 3).buyN, 9);
});

test('easyflips: high stakes, max investment, oils and exclusions', () => {
  const r = run();
  assert.ok(byId(r, 'card-unrequited-love').highStakes);
  assert.ok(byId(r, 'card-unrequited-love').reasons.includes('maxDiv'));
  assert.ok(byId(r, 'oil-golden'));
  assert.ok(!r.flips.some(f => /tainted/.test(f.id)));
});

test('easyflips: bench six link only for body armour / two-handers; Breach blessing is a vendor recipe that rerolls', () => {
  const r = run();
  const six = byId(r, 'six-kaoms-heart');
  assert.ok(six && six.sixLink);
  assert.ok(Math.abs(six.payAvg - (100 + 1500 * 0.1334 + 350 * 0.02591)) < 1e-6);
  assert.equal(six.inDay, null); assert.ok(!six.thin);
  assert.ok(!r.flips.some(f => f.id === 'six-ring'));
  assert.ok(byId(r, 'six-bow') && byId(r, 'six-axe'));
  const b = byId(r, 'bls-uul-netol-s-kiss');
  assert.ok(b && b.vendor && b.rerolls);
  assert.equal(b.out.name, "Uul-Netol's Embrace");
});

test('easyflips: summary counts flips within limits and picks the best unflagged margin', () => {
  const r = run();
  const s = summary(r.flips);
  assert.equal(s.count, r.flips.filter(f => !f.below && !f.highStakes).length);
  assert.ok(s.best && !s.best.verify && !s.best.below);
  const hidden = summary(r.flips, { hidden: [s.best.id] });
  assert.ok(!hidden.best || hidden.best.id !== s.best.id);
});

test('easyflips: missing prices are skipped, never NaN', () => {
  const r = compute({ lines: [L('Shrieking Essence of Zeal', 0, 0), L('Deafening Essence of Zeal', 19.94, 1)], uniques: [], owned: null, opts: {} });
  assert.equal(r.flips.length, 0);
  assert.deepEqual(compute({}).flips, []);
});

test('easyflips: div card list comes from the generated table', () => {
  const { CARDS } = require('../src/core/easyflips');
  const by = Object.fromEntries(CARDS.map(c => [c[0], c]));
  assert.ok(CARDS.length >= 60);
  assert.deepEqual(by['Seven Years Bad Luck'], ['Seven Years Bad Luck', 13, 'Mirror Shard', 1]);
  assert.deepEqual(by['Abandoned Wealth'], ['Abandoned Wealth', 5, 'Exalted Orb', 3]);
  assert.ok(!by['The Immortal'] && !by['The Gambler']);
  const r = compute({ lines: [L('Abandoned Wealth', 10, 5000), L('Exalted Orb', 20, 50000), L('Divine Orb', 180, 1e6)], uniques: [], owned: {}, opts: {} });
  const f = r.flips.find(x => x.id === 'card-abandoned-wealth');
  assert.ok(f && f.in[0].n === 5 && f.out.n === 3 && f.out.name === 'Exalted Orb');
});
