'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { summarizeHour, aggregate, compare, recent, check, nameOf, CHAOS, DIVINE } = require('../src/core/cxprices');

const ZEAL = 'Metadata/Items/Currency/CurrencyEssenceZeal4';
const mk = (league, a, b, va, vb) => ({ league, market_id: `${a}|${b}`, market_pair: [a, b], volume_traded: { [a]: va, [b]: vb } });
const hour = (rate, zc, zd) => ({ next_change_id: 1, markets: [
  mk('Covens', CHAOS, DIVINE, rate * 100, 100),
  mk('Covens', ZEAL, CHAOS, zc[0], zc[1]),
  mk('Covens', DIVINE, ZEAL, zd[1], zd[0]), // pair order is GGG's own: either side can come first
  mk('Hardcore Covens', ZEAL, CHAOS, 1, 1000),
  mk('Covens', 'Metadata/Items/Currency/Unknown', CHAOS, 5, 5),
] });

test('cx: names come from the bundled table', () => {
  assert.equal(nameOf(ZEAL), 'Deafening Essence of Zeal');
  assert.equal(nameOf(DIVINE), 'Divine Orb');
  assert.equal(nameOf('Metadata/Items/Currency/Unknown'), null);
});

test('cx: one hour, one league, both markets, divine rate from the chaos/divine market', () => {
  const h = summarizeHour(hour(180, [1000, 17500], [90, 10]), 'Covens', 7);
  assert.equal(h.rate, 180);
  assert.deepEqual(h.items['Deafening Essence of Zeal'], { ci: 1000, cc: 17500, di: 90, dd: 10 });
  assert.equal(Object.keys(h.items).length, 1);
});

test('cx: medians over hours, divine market in chaos at each hour\'s rate, and the comparison', () => {
  const hs = [summarizeHour(hour(180, [1000, 17500], [90, 10]), 'Covens', 1), summarizeHour(hour(170, [1000, 18000], [100, 10]), 'Covens', 2),
    summarizeHour(hour(175, [1000, 17000], [0, 0]), 'Covens', 3)];
  const a = aggregate(hs)['Deafening Essence of Zeal'];
  assert.equal(a.chaos, 17.5); assert.equal(a.chaosHours, 3); assert.equal(a.divHours, 2);
  assert.ok(Math.abs(a.divine - (180 / 9 + 17) / 2) < 1e-9);
  assert.ok(Math.abs(a.divPerHour - 20 / 3) < 1e-9);
  const c = compare(aggregate(hs), 'Deafening Essence of Zeal');
  assert.equal(c.buy, 'chaos'); assert.equal(c.sell, 'divine'); assert.ok(c.pct > 0);
  assert.ok(Math.abs(c.perDivine - 1 / ((10 / 90 + 0.1) / 2)) < 1e-9);
  assert.equal(compare({}, 'Nothing'), null);
  assert.ok(c.thin); // 10 divines an hour in 2 of 3 hours: under 3 of 4
  // Divine side in 1 of 3 hours, or under 2 divines an hour: thin, no advice.
  assert.ok(compare({ X: { chaos: 1, divine: 2, divEach: 0.01, chaosHours: 3, divHours: 1, divMedian: 9, hours: 3 } }, 'X').thin);
  assert.ok(compare({ X: { chaos: 1, divine: 2, divEach: 0.01, chaosHours: 3, divHours: 3, divMedian: 1, hours: 3 } }, 'X').thin);
  assert.ok(!compare({ X: { chaos: 1, divine: 2, divEach: 0.01, chaosHours: 3, divHours: 3, divMedian: 5, hours: 3 } }, 'X').thin);
});

const { CxHistory, exchangeLeague } = require('../src/main/cx');
test('cx: hours asked for start two hours back, newest first', () => {
  const now = Date.UTC(2026, 10, 25, 14, 20) ;
  const w = CxHistory.wanted(now);
  assert.equal(w.length, 12); assert.equal(w[0], Date.UTC(2026, 10, 25, 12) / 1000); assert.equal(w[1] - w[0], -3600);
});
test('cx: exchange league names', () => {
  assert.equal(exchangeLeague('Covens of Umbra', 'Covens'), 'Covens');
  assert.equal(exchangeLeague('Hardcore Covens of Umbra', 'Hardcore Covens'), 'Hardcore Covens');
  assert.equal(exchangeLeague('Ruthless Covens of Umbra', 'Covens'), 'Ruthless Covens');
  assert.equal(exchangeLeague('HC Ruthless Covens of Umbra', 'Hardcore Covens'), 'HC Ruthless Covens');
  assert.equal(exchangeLeague('SSF Covens of Umbra', 'Covens'), null);
});
test('cx: only complete hours are kept; a 429 stops the round', async () => {
  const os = require('os'), fs = require('fs'), path = require('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cx-'));
  const asked = [];
  const body = (ts, next) => JSON.stringify({ next_change_id: next, markets: [mk('Covens', CHAOS, DIVINE, 18000, 100)] });
  const res = (status, text, h = {}) => ({ ok: status === 200, status, headers: { get: k => h[k] ?? null }, text: async () => text });
  let n = 0;
  const cx = new CxHistory({ dir, userAgent: 't', fetch: async url => { const ts = Number(url.split('/').pop()); asked.push(ts); n++;
    if (n === 1) return res(200, body(ts, ts)); // not published yet
    if (n === 2) return res(200, body(ts, ts + 3600));
    return res(429, '', { 'retry-after': '60' }); } });
  const orig = global.setTimeout; global.setTimeout = (f) => orig(f, 0);
  try { await cx.refresh('Covens'); } finally { global.setTimeout = orig; }
  assert.equal(asked.length, 3); // stopped after the 429
  assert.equal(cx.hours.size, 1);
  assert.ok(cx.pauseUntil > Date.now() + 50e3);
  assert.equal(fs.readdirSync(dir).length, 1);
});

test('cx: recent real prices over both markets, and a flip checked against them', () => {
  const h = { rate: 200, items: { A: { ci: 30, cc: 30, di: 0, dd: 0 }, B: { ci: 10, cc: 40, di: 10, dd: 0.25 } } };
  const r = recent([h, h]);
  assert.equal(r.hours, 2); assert.equal(r.rate, 200);
  assert.ok(Math.abs(r.items.A.price - 1) < 1e-9); assert.equal(r.items.A.perHour, 30);
  assert.ok(Math.abs(r.items.B.price - (40 + 50) / 20) < 1e-9); assert.equal(r.items.B.perHour, 20);
  // Typical hour, not the average of all trades: one huge hour doesn't drag the price.
  const big = { rate: 200, items: { A: { ci: 1000, cc: 5000, di: 0, dd: 0 } } };
  assert.equal(recent([h, h, big]).items.A.price, 1);
  const flip = { in: [{ name: 'A', n: 3 }], out: { name: 'B', n: 1 } };
  const c = check(flip, r, { spread: 0.03, minMargin: 10 });
  assert.equal(c.status, 'confirmed'); assert.ok(Math.abs(c.margin - (100 * (4.5 * 0.97 - 3 * 1.03) / (3 * 1.03))) < 1e-9);
  assert.equal(c.perHour, Math.floor(Math.min(30 * 0.1 / 3, 20 * 0.1)));
  assert.equal(check(flip, r, { minMargin: 60 }).status, 'unconfirmed');
  assert.equal(check({ in: [{ name: 'Z', n: 1 }], out: { name: 'B', n: 1 } }, r).status, 'unchecked');
  assert.deepEqual([check({ in: [{ name: 'Z', n: 1 }], out: { name: 'B', n: 1 } }, r, { known: { Z: {} } }).status, check({ in: [{ name: 'Z', n: 1 }], out: { name: 'B', n: 1 } }, r, { known: { Z: {} } }).reason], ['unconfirmed', 'quiet']);
  assert.equal(check({ in: [{ name: 'A', n: 3 }], out: { name: 'Divine Orb', n: 1 } }, r).status, 'confirmed');
  assert.equal(check(flip, null).status, 'unchecked');
});

test('cx: price range per hour from GGG ratios, order flips and exchange flips', () => {
  const { orderFlips, exchangeFlips } = require('../src/core/cxprices');
  const mkr = (a, b, va, vb, lo, hi) => ({ ...mk('Covens', a, b, va, vb), lowest_ratio: lo, highest_ratio: hi });
  const hourR = (i, avg) => ({ next_change_id: 1, markets: [mk('Covens', CHAOS, DIVINE, 18000, 100),
    mkr(ZEAL, CHAOS, 1000, 1000 * avg, { [ZEAL]: 1, [CHAOS]: 15 }, { [ZEAL]: 1, [CHAOS]: 21 })] });
  const hs = [16, 18, 17, 18].map((p, i) => summarizeHour(hourR(i, p), 'Covens', i));
  assert.equal(hs[0].items['Deafening Essence of Zeal'].cLo, 15); assert.equal(hs[0].items['Deafening Essence of Zeal'].cHi, 21);
  const o = orderFlips(hs, { minPrice: 10, minVol: 10000 });
  assert.equal(o.length, 1);
  const z = o[0];
  assert.equal(z.typical, 17.5); assert.equal(z.buy, (15 + 17.5) / 2); assert.equal(z.sell, (17.5 + 21) / 2);
  assert.ok(Math.abs(z.margin - 100 * (19.25 / 16.25 - 1)) < 1e-9);
  assert.equal(z.buyHours, 4); assert.equal(z.sellHours, 4);
  // A price that moves more from hour to hour than the spread: not an order flip.
  const wild = [10, 20, 11, 22].map((p, i) => summarizeHour(hourR(i, p), 'Covens', i));
  assert.equal(orderFlips(wild).length, 0);
  assert.equal(orderFlips(hs, { minPrice: 20 }).length, 0);
  const prices = { X: { chaos: 10, divine: 14, divEach: 14 / 180, chaosHours: 4, chaosPerHour: 1000, divStock: 10, divHours: 4, divPerHour: 9, divMedian: 9, hours: 4 },
    Z: { chaos: 10, divine: 14, divEach: 14 / 180, chaosHours: 4, chaosPerHour: 1000, divStock: 0, divHours: 4, divPerHour: 9, divMedian: 9, hours: 4 },
    Q: { chaos: 10, divine: 14, divEach: 14 / 180, chaosHours: 4, chaosPerHour: 50, divStock: 10, divHours: 4, divPerHour: 9, divMedian: 9, hours: 4 },
    Y: { chaos: 10, divine: 10.5, divEach: 0.06, chaosHours: 4, divHours: 4, divPerHour: 9, divMedian: 9, hours: 4 },
    T: { chaos: 10, divine: 20, divEach: 0.1, chaosHours: 4, divHours: 1, divPerHour: 9, divMedian: 9, hours: 4 } };
  const e = exchangeFlips(prices, { minNet: 10 });
  assert.deepEqual(e.map(x => x.name), ['X']);
  assert.equal(e[0].buy, 'chaos'); assert.equal(e[0].sell, 'divine');
  assert.ok(Math.abs(e[0].net - 100 * ((14 * 0.97 * 0.97) / (10 * 1.03) - 1)) < 1e-9);
});
