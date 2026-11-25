'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { summarizeHour, aggregate, compare, nameOf, CHAOS, DIVINE } = require('../src/core/cxprices');

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
