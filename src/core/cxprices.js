'use strict';
// GGG's currency exchange history (public, https://web.poecdn.com/api/currency-exchange/<hour>): one file per hour with,
// per market (a pair of two items), how much of each side was traded. That gives a real average price per market,
// so "X for chaos" and "X for divines" can be compared, which poe.ninja (one price per item) can't do.
// Pure functions: no network, no Electron.
const NAMES = require('./cx-names.json'); // internal id (without "Metadata/Items/") -> name, see tools/cx-names.py

const CHAOS = 'Metadata/Items/Currency/CurrencyRerollRare';
const DIVINE = 'Metadata/Items/Currency/CurrencyModValues';
const nameOf = id => NAMES[String(id).replace(/^Metadata\/Items\//, '')] || null;

// One hour's file → a small summary for one league:
// { ts, rate (chaos per divine that hour), items: { name: { ci, cc, di, dd } } }
// ci/cc: items and chaos traded in the item↔chaos market; di/dd: items and divines in the item↔divine market.
function summarizeHour(json, league, ts) {
  const markets = (json && Array.isArray(json.markets) ? json.markets : []).filter(m => m && m.league === league && Array.isArray(m.market_pair) && m.volume_traded);
  const dc = markets.find(m => m.market_pair.includes(CHAOS) && m.market_pair.includes(DIVINE));
  const rate = dc && dc.volume_traded[DIVINE] > 0 ? dc.volume_traded[CHAOS] / dc.volume_traded[DIVINE] : null;
  const items = {};
  for (const m of markets) {
    const [a, b] = m.market_pair, v = m.volume_traded;
    for (const [item, cur] of [[a, b], [b, a]]) {
      if (item === CHAOS || item === DIVINE || (cur !== CHAOS && cur !== DIVINE)) continue;
      const n = Number(v[item]) || 0, c = Number(v[cur]) || 0;
      if (!(n > 0 && c > 0)) continue;
      const name = nameOf(item); if (!name) continue;
      const e = items[name] = items[name] || { ci: 0, cc: 0, di: 0, dd: 0 };
      if (cur === CHAOS) { e.ci += n; e.cc += c; } else { e.di += n; e.dd += c; }
    }
  }
  return { ts: Number(ts) || null, rate, items };
}

const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };

// Hour summaries → per item name: the median price per item in each market over the hours it traded there,
// in chaos (the divine market converted at that hour's own divine rate), plus how much traded on the divine side.
// { name: { chaos: c|null, divine: c|null, divEach: div|null, chaosHours, divHours, divPerHour, hours } }
function aggregate(hours) {
  const hs = (hours || []).filter(h => h && h.items);
  const acc = {};
  for (const h of hs) for (const [name, e] of Object.entries(h.items)) {
    const a = acc[name] = acc[name] || { c: [], d: [], de: [], dv: 0, dh: [] };
    if (e.ci > 0 && e.cc > 0) a.c.push(e.cc / e.ci);
    if (e.di > 0 && e.dd > 0 && h.rate > 0) { a.d.push((e.dd / e.di) * h.rate); a.de.push(e.dd / e.di); a.dv += e.dd; a.dh.push(e.dd); }
  }
  const out = {};
  for (const [name, a] of Object.entries(acc)) out[name] = { chaos: median(a.c), divine: median(a.d), divEach: median(a.de),
    chaosHours: a.c.length, divHours: a.d.length, divPerHour: hs.length ? a.dv / hs.length : 0, divMedian: median(a.dh) || 0, hours: hs.length };
  return out;
}

// For one item: both markets side by side and which is better to buy in and to sell in.
// pct: how much the divine market costs/pays more than the chaos market (+ = divine dearer).
// thin: the divine side traded in fewer than 3 of 4 hours, or in a typical hour for under 3 divines: both prices are
// still shown, but no advice is given (a few single-divine trades can make a market look far better than it is).
const THIN = { minShare: 0.75, minDivMedian: 3 };
function compare(cx, name) {
  const e = cx && cx[name];
  if (!e) return null;
  const thin = !(e.divHours >= e.hours * THIN.minShare && (e.divMedian || 0) >= THIN.minDivMedian);
  if (e.chaos == null || e.divine == null) return { chaos: e.chaos, divine: e.divine, divEach: e.divEach, pct: null, thin };
  const pct = (100 * (e.divine - e.chaos)) / e.chaos;
  return { chaos: e.chaos, divine: e.divine, divEach: e.divEach, pct, thin, buy: pct > 0 ? 'chaos' : 'divine', sell: pct > 0 ? 'divine' : 'chaos',
    perDivine: e.divEach > 0 ? 1 / e.divEach : null, divPerHour: e.divPerHour, hours: e.hours, divHours: e.divHours };
}

module.exports = { summarizeHour, aggregate, compare, nameOf, CHAOS, DIVINE, THIN };
