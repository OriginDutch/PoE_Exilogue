'use strict';
// Essence upgrade overlay: which essences in the essence stash tab are worth upgrading (3 → 1 of the next tier),
// and where on screen to mark them. Pure: counts and prices in, a plan out.
//
// Rule (Marcel, Nov 2026): an upgrade is worth it when it gains value with the counts you actually have: one of the
// next tier at least 3× this tier (≥ 3x), and chains count only when they can really finish (9 Screaming →
// 1 Deafening is green even when Screaming → Shrieking alone is not; 3 Screaming → 1 Shrieking that can't go on is not).
// Green = worth it, red = not worth it; a cell with fewer than 3 (after what flows in from below) gets no box.
// Volume is deliberately ignored: profit is profit.

const TIERS = ['Whispering', 'Muttering', 'Weeping', 'Wailing', 'Screaming', 'Shrieking', 'Deafening'];
const RATIO = 3;

// The essence tab at 2560×1440 (UI scale default), measured on Marcel's screenshot of 23 Nov 2026.
// Left block: one row per type, Deafening in the first column and lower tiers to the right.
// Right block: mirrored, Deafening in the last column and lower tiers to the left.
// lowest = the lowest tier that type comes in (row length).
const REF = { h: 1440, cell: 62, rowY: 255, rowStep: 65.4 };
const LEFT = { x0: 58, step: 65.5, dir: 1 };   // x of the Deafening cell, then +step per lower tier
const RIGHT = { x0: 768, step: 65.3, dir: -1 }; // x of the Deafening cell, then −step per lower tier
const LAYOUT = [
  ['Greed', 'L', 0, 'Whispering'], ['Contempt', 'L', 1, 'Whispering'], ['Hatred', 'L', 2, 'Whispering'], ['Woe', 'L', 3, 'Whispering'],
  ['Fear', 'L', 4, 'Muttering'], ['Anger', 'L', 5, 'Muttering'], ['Torment', 'L', 6, 'Muttering'], ['Sorrow', 'L', 7, 'Muttering'],
  ['Rage', 'L', 8, 'Weeping'], ['Suffering', 'L', 9, 'Weeping'], ['Wrath', 'L', 10, 'Weeping'], ['Doubt', 'L', 11, 'Weeping'],
  ['Loathing', 'R', 0, 'Wailing'], ['Zeal', 'R', 1, 'Wailing'], ['Anguish', 'R', 2, 'Wailing'], ['Spite', 'R', 3, 'Wailing'],
  ['Scorn', 'R', 4, 'Screaming'], ['Envy', 'R', 5, 'Screaming'], ['Misery', 'R', 6, 'Screaming'], ['Dread', 'R', 7, 'Screaming'],
].map(([type, side, row, lowest]) => ({ type, side, row, tiers: TIERS.slice(TIERS.indexOf(lowest)) }));
// Total bubble: right of the Upgrade button under the tab.
const TOTAL_AT = { x: 546, y: 1110, h: 44 };

const NAME = /^(Whispering|Muttering|Weeping|Wailing|Screaming|Shrieking|Deafening) Essence of (\w+)$/;
const nameOf = (tier, type) => `${tier} Essence of ${type}`;

// items: [{ name, tab, qty }] from a Wealthy Exile export. Essences can sit in any tab; the essence tab is the one
// holding the most essence lines (its name is the user's own). Only that tab is counted.
function essenceCounts(items) {
  const perTab = new Map();
  for (const it of items || []) {
    if (!it || !NAME.test(it.name) || !(it.qty > 0)) continue;
    if (!perTab.has(it.tab)) perTab.set(it.tab, new Map());
    const m = perTab.get(it.tab);
    m.set(it.name, (m.get(it.name) || 0) + it.qty);
  }
  let best = null;
  for (const [tab, m] of perTab) if (!best || m.size > best.m.size) best = { tab, m };
  return best ? { tab: best.tab, counts: Object.fromEntries(best.m) } : { tab: null, counts: {} };
}

// counts: { name: qty }, prices: { name: chaos }. → { rows: [...], total, missing: [names without a price] }
// row: { type, side, row, profit, cells: [{ tier, col, qty, box: 'green' | 'red' | null }], label: col | null }
function plan(counts, prices) {
  const price = n => { const p = prices[n]; return p > 0 ? p : null; };
  const missing = new Set();
  const rows = [];
  for (const def of LAYOUT) {
    const t = def.tiers;
    const p = t.map(tier => price(nameOf(tier, def.type)));
    const q = t.map(tier => Math.max(0, Math.floor(counts[nameOf(tier, def.type)] || 0)));
    // Every way to upgrade or not, step by step, run with your real counts (3 → 1, the rest stays); the plan that
    // ends worth the most wins, a tie goes to upgrading (exactly 3x counts as worth it). So a step is only green when
    // it pays off with what you have: 3 Screaming → 1 Shrieking that can't go further isn't.
    const steps = t.length - 1;
    const known = i => p[i] != null && p[i + 1] != null;
    const run = mask => {
      const h = q.slice();
      const did = new Array(t.length).fill(false);
      for (let i = 0; i < steps; i++) {
        if (!(mask & (1 << i)) || !known(i) || h[i] < RATIO) continue;
        const up = Math.floor(h[i] / RATIO); h[i] -= up * RATIO; h[i + 1] += up; did[i] = true;
      }
      let v = 0;
      for (let i = 0; i < t.length; i++) if (p[i] != null) v += h[i] * p[i];
      return { h, did, v, n: did.filter(Boolean).length };
    };
    let best = run(0);
    for (let mask = 1; mask < (1 << steps); mask++) {
      const r = run(mask);
      if (r.v > best.v + 1e-9 || (Math.abs(r.v - best.v) <= 1e-9 && r.n > best.n)) best = r;
    }
    // Boxes: green where the best plan upgrades; red where you could (3 or more, after what flows in) but it doesn't pay.
    const box = new Array(t.length).fill(null);
    { const h = q.slice();
      for (let i = 0; i < steps; i++) {
        if (!known(i) || h[i] < RATIO) continue;
        box[i] = best.did[i] ? 'green' : 'red';
        if (best.did[i]) { const up = Math.floor(h[i] / RATIO); h[i] -= up * RATIO; h[i + 1] += up; }
      } }
    const have = best.h;
    for (let i = 0; i < t.length; i++) if (q[i] > 0 && p[i] == null) missing.add(nameOf(t[i], def.type));
    let profit = 0;
    for (let i = 0; i < t.length; i++) if (p[i] != null) profit += (have[i] - q[i]) * p[i];
    profit = Math.round(profit * 10) / 10;
    // Columns count from Deafening (0) towards lower tiers. The profit label goes in the first empty cell below the
    // Screaming column (Wailing, then lower); if all of the row's cells are taken, just past the end of the row.
    const col = i => t.length - 1 - i;
    const cells = t.map((tier, i) => ({ tier, col: col(i), qty: q[i], box: box[i] }));
    let label = null;
    if (box.includes('green')) { // a row with only red boxes gets no label
      for (let c = 3; c < 7 && label == null; c++) {
        const cell = cells.find(x => x.col === c);
        if (!cell || cell.qty === 0) label = c;
      }
      if (label == null) label = t.length;
    }
    rows.push({ type: def.type, side: def.side, row: def.row, profit, cells, label });
  }
  const total = Math.round(rows.reduce((s, r) => s + r.profit, 0) * 10) / 10;
  return { rows, total, missing: [...missing] };
}

// Screen rectangles for a plan on a display of height h (px). The game scales its UI with the screen height and
// anchors the stash to the left edge, so 1440p positions scale by h / 1440. To be checked on 1080p (Nov 2026).
function geometry(p, h) {
  const s = h / REF.h, r = v => Math.round(v * s);
  const x = (side, c) => (side === 'L' ? LEFT.x0 + LEFT.step * c : RIGHT.x0 - RIGHT.step * c);
  const y = row => REF.rowY + REF.rowStep * row;
  const boxes = [], labels = [];
  for (const row of p.rows) {
    for (const c of row.cells) if (c.box) boxes.push({ x: r(x(row.side, c.col)), y: r(y(row.row)), size: r(REF.cell), color: c.box, type: row.type, tier: c.tier });
    if (row.label != null) labels.push({ x: r(x(row.side, row.label)), y: r(y(row.row)), size: r(REF.cell), profit: row.profit, type: row.type });
  }
  return { scale: s, boxes, labels, total: { x: r(TOTAL_AT.x), y: r(TOTAL_AT.y), h: r(TOTAL_AT.h), value: p.total } };
}

module.exports = { TIERS, LAYOUT, RATIO, essenceCounts, plan, geometry, nameOf };
