'use strict';
// Also loaded by the renderer (pages/flips.js uses scale) as a plain script: window.EasyflipsCore.
(function (root) {
// Easyflips: "buy → convert in-game → sell" opportunities, worked out from poe.ninja prices.
// Pure functions: no network, no Electron. Inputs are poe.ninja lines { id, name, chaos, vol, icon }, where vol is
// poe.ninja's volumePrimaryValue: chaos traded per HOUR (the poe.ninja site labels that column "Volume / Hour").
// Exilogue only shows advice. The player buys, converts and sells by hand.

// minVol: an input that trades for less chaos an hour than this is 'thin' (hard to buy at the shown price).
const DEFAULTS = { spread: 0.03, minMargin: 10, maxDiv: 50, minVol: 1000, verifyAbove: 50, highStakesDiv: 200 };

// ---------- recipes ----------
const ESSENCE_TIERS = ['Whispering', 'Muttering', 'Weeping', 'Wailing', 'Screaming', 'Shrieking', 'Deafening'];
// Oil tiers, low to high. 3 of a tier → 1 of the next at a vendor. Tainted, Reflective and Prismatic oils are left out.
const OIL_TIERS = ['Clear', 'Sepia', 'Amber', 'Verdant', 'Teal', 'Azure', 'Indigo', 'Violet', 'Crimson', 'Black', 'Opalescent', 'Silver', 'Golden'];
// Stackables that combine by themselves once the stack is full (in the inventory).
const COMBINE = [
  ['Simulacrum Splinter', 300, 'Simulacrum'],
  ['Splinter of Xoph', 100, "Xoph's Breachstone"], ['Splinter of Tul', 100, "Tul's Breachstone"], ['Splinter of Esh', 100, "Esh's Breachstone"],
  ['Splinter of Uul-Netol', 100, "Uul-Netol's Breachstone"], ['Splinter of Chayula', 100, "Chayula's Breachstone"],
  ['Timeless Karui Splinter', 100, 'Timeless Karui Emblem'], ['Timeless Maraketh Splinter', 100, 'Timeless Maraketh Emblem'],
  ['Timeless Eternal Empire Splinter', 100, 'Timeless Eternal Emblem'], ['Timeless Templar Splinter', 100, 'Timeless Templar Emblem'],
  ['Timeless Vaal Splinter', 100, 'Timeless Vaal Emblem'],
  ['Ritual Splinter', 100, 'Ritual Vessel'], ['Crescent Splinter', 10, "The Maven's Writ"],
];
// Currency shards: 20 → 1 orb.
const SHARDS = [
  ['Mirror Shard', 'Mirror of Kalandra'], ['Fracturing Shard', 'Fracturing Orb'], ['Exalted Shard', 'Exalted Orb'],
  ['Annulment Shard', 'Orb of Annulment'], ['Binding Shard', 'Orb of Binding'], ['Horizon Shard', 'Orb of Horizons'],
  ["Harbinger's Shard", "Harbinger's Orb"], ['Ancient Shard', 'Ancient Orb'], ["Engineer's Shard", "Engineer's Orb"],
  ['Regal Shard', 'Regal Orb'], ['Chaos Shard', 'Chaos Orb'], ['Alchemy Shard', 'Orb of Alchemy'],
];
// Divination cards: full set → reward. Cards whose reward is a fixed amount of one item, generated from RePoE's card
// data (tools/div-cards.py → div-cards.json: [card, set size, reward, count]); a reward without an exchange price
// (random ones like "Currency" or "Fossil") simply gives no flip. The Immortal is left out (owner's decision).
const CARD_SKIP = new Set(['The Immortal']);
const CARDS = (typeof require === 'function' ? require('./div-cards.json') : (root.EasyflipsCards || [])).filter(c => !CARD_SKIP.has(c[0]));
// Breach: sell 1 unique + 1 blessing to a vendor → the upgraded unique (its rolls are new).
// (from poedb, Nov 2026)
const BLESSINGS = [
  ['Blessing of Uul-Netol', "Uul-Netol's Kiss", "Uul-Netol's Embrace"],
  ['Blessing of Uul-Netol', 'The Infinite Pursuit', 'The Red Trail'],
  ['Blessing of Uul-Netol', 'The Anticipation', 'The Surrender'],
  ['Blessing of Xoph', "Xoph's Inception", "Xoph's Nurture"],
  ['Blessing of Xoph', 'The Formless Flame', 'The Formless Inferno'],
  ['Blessing of Xoph', "Xoph's Heart", "Xoph's Blood"],
  ['Blessing of Tul', 'Tulborn', 'Tulfall'],
  ['Blessing of Tul', 'The Snowblind Grace', 'The Perfect Form'],
  ['Blessing of Tul', 'The Halcyon', 'The Pandemonius'],
  ['Blessing of Esh', 'Hand of Thought and Motion', 'Hand of Wisdom and Action'],
  ['Blessing of Esh', "Esh's Mirror", "Esh's Visage"],
  ['Blessing of Esh', 'Voice of the Storm', 'Choir of the Storm'],
  ['Blessing of Chayula', 'Eye of Chayula', 'Presence of Chayula'],
  ['Blessing of Chayula', 'Severed in Sleep', 'United in Dream'],
  ['Blessing of Chayula', 'Skin of the Loyal', 'Skin of the Lords'],
  ['Blessing of Chayula', 'The Red Dream', 'The Red Nightmare'],
  ['Blessing of Chayula', 'The Green Dream', 'The Green Nightmare'],
  ['Blessing of Chayula', 'The Blue Dream', 'The Blue Nightmare'],
];
// Behind the "High stakes" toggle whatever they cost: very expensive sets.
const HIGH_STAKES = new Set(['card-unrequited-love', 'card-house-of-mirrors']);
// Crafting bench six link: only body armours and two-handed weapons have 6 sockets.
const SIX_LINK_BASES = /^(Body Armour|Bow|Staff|Warstaff|Two Handed Sword|Two Handed Axe|Two Handed Mace)$/; // poe.ninja's itemType
const SIX_LINK = { fusing: 1500, jewellers: 350 };

const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// One recipe: inputs [{ name, n }] → output { name, n }. kind: essence | oil | splinter | shard | card | unique.
function candidates(byName, uniques) {
  const out = [];
  const has = n => byName.has(n);
  const add = (r) => { if (r.in.every(x => has(x.name)) && has(r.out.name)) out.push(r); };
  // Essences: 3 of tier t-1, or 9 of tier t-2 (two upgrades). The cheaper route is kept per output.
  const kinds = new Set();
  for (const name of byName.keys()) { const m = /^(\w+) Essence of (.+)$/.exec(name); if (m && ESSENCE_TIERS.includes(m[1])) kinds.add(m[2]); }
  for (const k of kinds) for (let t = 1; t < ESSENCE_TIERS.length; t++) {
    const to = `${ESSENCE_TIERS[t]} Essence of ${k}`;
    if (!has(to)) continue;
    const routes = [];
    const one = `${ESSENCE_TIERS[t - 1]} Essence of ${k}`;
    if (has(one)) routes.push({ in: [{ name: one, n: 3 }], upgrades: 1 });
    const two = t >= 2 && `${ESSENCE_TIERS[t - 2]} Essence of ${k}`;
    if (two && has(two)) routes.push({ in: [{ name: two, n: 9 }], upgrades: 2 });
    if (!routes.length) continue;
    out.push({ kind: 'essence', id: 'ess-' + slug(to), routes, out: { name: to, n: 1 } });
  }
  for (let t = 1; t < OIL_TIERS.length; t++) add({ kind: 'oil', id: 'oil-' + slug(OIL_TIERS[t]), in: [{ name: OIL_TIERS[t - 1] + ' Oil', n: 3 }], out: { name: OIL_TIERS[t] + ' Oil', n: 1 } });
  for (const [a, n, b] of COMBINE) add({ kind: 'splinter', id: 'spl-' + slug(a), in: [{ name: a, n }], out: { name: b, n: 1 } });
  for (const [a, b] of SHARDS) add({ kind: 'shard', id: 'shd-' + slug(a), in: [{ name: a, n: 20 }], out: { name: b, n: 1 } });
  for (const [c, n, r, rn] of CARDS) add({ kind: 'card', id: 'card-' + slug(c), in: [{ name: c, n }], out: { name: r, n: rn } });
  // Uniques: the plain, unlinked, uncorrupted line and the 6-link line of the same item.
  for (const u of uniques || []) {
    if (!u || u.links || !SIX_LINK_BASES.test(u.itemType || '')) continue;
    const six = (uniques || []).find(x => x.name === u.name && x.links === 6 && (x.variant || null) === (u.variant || null));
    if (six && has("Orb of Fusing") && has("Jeweller's Orb")) out.push({ kind: 'unique', id: 'six-' + slug(u.id || u.name), sixLink: true,
      in: [{ name: u.name, n: 1, line: u }, { name: 'Orb of Fusing', n: SIX_LINK.fusing, cost: true }, { name: "Jeweller's Orb", n: SIX_LINK.jewellers, cost: true }],
      out: { name: u.name, n: 1, line: six, label: '6-link' } });
  }
  for (const [bless, from, to] of BLESSINGS) {
    const a = (uniques || []).find(x => x.name === from && !x.links), b = (uniques || []).find(x => x.name === to && !x.links);
    if (a && b && has(bless)) out.push({ kind: 'unique', id: 'bls-' + slug(from), vendor: true, rerolls: true,
      in: [{ name: from, n: 1, line: a }, { name: bless, n: 1 }], out: { name: to, n: 1, line: b } });
  }
  return out;
}

// ---------- maths ----------
// A route's numbers. Prices are poe.ninja averages; buying counts spread% dearer, selling spread% cheaper.
// Divine Orbs as a reward need no selling (they are the money), so no sell discount there.
function priceRoute(route, outSpec, kind, P, o) {
  const s = o.spread;
  const lineOf = x => x.line || P.get(x.name);
  const unit = x => { const l = lineOf(x); return l && l.chaos > 0 ? l.chaos : null; };
  const ins = route.in.map(x => ({ ...x, unit: unit(x) }));
  const outUnit = outSpec.line ? (outSpec.line.chaos > 0 ? outSpec.line.chaos : null) : unit(outSpec);
  if (ins.some(x => !x.unit) || !outUnit) return null;
  const payAvg = ins.reduce((t, x) => t + x.unit * x.n, 0);
  const getAvg = outUnit * outSpec.n;
  const isMoney = outSpec.name === 'Divine Orb' || outSpec.name === 'Chaos Orb';
  const pay = payAvg * (1 + s), get = isMoney ? getAvg : getAvg * (1 - s);
  // Traded per day = poe.ninja hourly chaos volume × 24 / unit price (for the share-of-a-day bars). Uniques have no volume.
  const perDayUnits = x => { const l = lineOf(x); return l && l.vol > 0 && l.chaos > 0 ? (l.vol * 24) / l.chaos : null; };
  const main = ins[0];
  const inDay = perDayUnits(main), outDay = outSpec.line ? null : perDayUnits(outSpec);
  const ml = lineOf(main);
  return { ins, outUnit, payAvg, getAvg, pay, get, inDay, outDay, inVol: ml && ml.vol > 0 ? ml.vol : (ml && ml.vol === 0 ? 0 : null), upgrades: route.upgrades || 0, mainUnit: main.unit, mainN: main.n };
}

// owned: { name: count } from the Wealthy Exile export (may be empty).
// opts: { spread, minMargin, maxDiv, minVol, divine (chaos per divine), divineAlt (a second divine price, for the warning) }.
function compute({ lines, uniques, owned, opts }) {
  const o = { ...DEFAULTS, ...(opts || {}) };
  const P = new Map();
  for (const l of lines || []) if (l && l.name && l.chaos > 0 && !P.has(l.name)) P.set(l.name, l);
  const divine = o.divine > 0 ? o.divine : (P.get('Divine Orb') || {}).chaos || null;
  const flips = [];
  for (const c of candidates(P, uniques)) {
    const routes = (c.routes || [{ in: c.in }]).map(r => ({ r, p: priceRoute(r, c.out, c.kind, P, o) })).filter(x => x.p);
    if (!routes.length) continue;
    routes.sort((a, b) => a.p.pay - b.p.pay);
    const best = routes[0].p, alt = routes[1] ? routes[1].p : null;
    const main = best.ins[0];
    // ownAll: how many you have; own: how many count towards one set (the card shows one flip).
    const ownAll = Math.max(0, Math.floor(Number(owned && owned[main.name]) || 0));
    const own = Math.min(main.n, ownAll);
    // Owned inputs count at what you'd get for selling them (the alternative), the rest at the buy price.
    const cost = own ? best.pay - own * main.unit * (1 + o.spread) + own * main.unit * (1 - o.spread) : best.pay;
    const profit = best.get - cost;
    const margin = cost > 0 ? (100 * profit) / cost : 0;
    const payNow = best.pay - own * main.unit * (1 + o.spread);
    // The most you can pay per input and still keep the minimum margin (other inputs at their price).
    const otherCost = best.pay - main.unit * main.n * (1 + o.spread);
    const payAtMost = Math.max(0, (best.get / (1 + o.minMargin / 100) - otherCost) / main.n);
    const isMoneyOut = c.out.name === 'Divine Orb';
    // Divine-priced rewards: if the two divine prices differ by more than the profit, the profit is noise.
    const divGap = o.divineAlt > 0 && divine > 0 ? Math.abs(divine - o.divineAlt) / Math.min(divine, o.divineAlt) : 0;
    const divUnsure = isMoneyOut && divGap > 0 && Math.abs(profit) < best.getAvg * divGap;
    const verify = margin > o.verifyAbove;
    const highStakes = HIGH_STAKES.has(c.id) || (divine > 0 && best.pay / divine > o.highStakesDiv);
    const reasons = [];
    if (margin < o.minMargin) reasons.push('margin');
    const thin = best.inVol != null && best.inVol < o.minVol;
    if (thin) reasons.push('thin');
    if (divine > 0 && payNow / divine > o.maxDiv) reasons.push('maxDiv');
    if (divUnsure) reasons.push('divine');
    if (profit <= 0) reasons.push('loss');
    flips.push({
      id: c.id, kind: c.kind, sixLink: !!c.sixLink, vendor: !!c.vendor, rerolls: !!c.rerolls,
      in: best.ins.map(x => ({ name: x.name, n: x.n, unit: x.unit, cost: !!x.cost, icon: (x.line || P.get(x.name) || {}).icon || null })),
      out: { name: c.out.name, n: c.out.n, unit: best.outUnit, label: c.out.label || null, icon: (c.out.line || P.get(c.out.name) || {}).icon || null },
      upgrades: best.upgrades, route: alt ? { alt: { name: alt.ins[0].name, n: alt.ins[0].n, pay: alt.pay }, best: { name: main.name, n: main.n, pay: best.pay } } : null,
      payAvg: best.payAvg, getAvg: best.getAvg, pay: best.pay, get: best.get, cost, payNow, profit, margin,
      own, ownAll, payAtMost, inDay: best.inDay, outDay: best.outDay, inVol: best.inVol, thin,
      verify, divUnsure, highStakes, below: reasons.length > 0, reasons,
    });
  }
  // Within the limits first; inside each group unflagged before "verify"; then by margin.
  flips.sort((a, b) => (a.below - b.below) || (a.verify - b.verify) || (b.margin - a.margin));
  return { flips, divine, at: Date.now() };
}

// Home: count of flips within the limits (high stakes only when shown), and the best one (highest margin, not "verify").
function summary(flips, { highStakes = false, hidden = [] } = {}) {
  const hide = new Set(hidden);
  const good = flips.filter(f => !f.below && !hide.has(f.id) && (highStakes || !f.highStakes));
  const best = good.filter(f => !f.verify).sort((a, b) => b.margin - a.margin)[0] || null;
  return { count: good.length, best };
}

// n flips at once: owned inputs count for up to n sets. What you pay now, the cost (owned at their sell price), profit, margin.
function scale(f, n, spread = DEFAULTS.spread) {
  const main = f.in[0];
  const own = Math.min(f.ownAll || 0, main.n * n);
  const buyN = main.n * n - own;
  const payNow = f.pay * n - own * main.unit * (1 + spread);
  const cost = payNow + own * main.unit * (1 - spread);
  const profit = f.get * n - cost;
  return { own, buyN, sellN: f.out.n * n, payNow, cost, get: f.get * n, profit, margin: cost > 0 ? (100 * profit) / cost : 0,
    buyShare: f.inDay ? buyN / f.inDay : null, sellShare: f.outDay ? (f.out.n * n) / f.outDay : null };
}

const api = { compute, summary, scale, candidates, DEFAULTS, ESSENCE_TIERS, OIL_TIERS, CARDS, COMBINE, SHARDS, BLESSINGS, SIX_LINK };
if (typeof module === 'object' && module.exports) module.exports = api; else root.EasyflipsCore = api;
})(this);
