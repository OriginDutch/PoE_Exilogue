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

// Where the tab sits differs per player: with the essence tab inside a stash folder PoE shows a second row of tabs
// and the whole tab is 46.7 px (1440p) lower than without. REF above is the folder layout. On each press Exilogue
// looks once at the stash's middle ornament (the three claws, never covered by items) and picks the layout whose
// ornament matches best: normalised correlation, so brightness and gamma settings don't matter.
const NO_FOLDER_DY = -140 / 3; // 35 px at 1080p
const ANCHOR = { x: 480, y: 506.67, w: 133.33, h: 240, cols: 25, rows: 45 }; // REF px; sampled down to cols×rows grey
const ANCHOR_GREY = [26,27,27,29,27,47,42,35,45,48,44,48,49,48,47,42,37,51,45,27,26,26,26,27,27,29,31,32,30,33,42,41,39,46,44,43,50,49,46,46,43,37,43,42,32,31,32,32,30,31,37,35,37,38,38,37,39,43,45,47,42,46,50,49,51,46,43,40,41,38,41,40,44,39,41,42,40,41,43,43,40,42,43,44,48,45,49,50,51,50,48,47,42,48,45,43,44,44,44,43,46,45,46,46,47,44,44,46,48,48,45,53,52,50,48,51,48,44,48,49,45,50,50,48,46,48,49,47,48,48,47,48,48,51,49,49,49,49,52,51,48,50,46,50,50,51,50,50,51,50,47,49,47,49,48,47,48,48,49,50,48,48,50,52,52,51,52,49,52,50,49,50,48,52,50,48,48,47,47,45,46,45,45,45,47,49,48,52,54,54,51,49,49,52,51,49,52,53,53,49,49,46,49,49,46,49,50,50,49,50,53,52,53,54,56,52,51,52,56,54,51,53,52,52,47,48,46,49,48,45,49,52,50,48,48,51,50,49,50,55,53,50,54,59,58,53,52,54,51,49,48,49,49,47,48,50,50,49,51,51,52,55,42,49,59,56,53,55,56,55,53,52,56,53,52,49,48,48,48,49,51,47,48,52,53,55,54,42,50,61,53,53,54,55,56,56,53,51,51,50,53,50,50,51,52,52,51,53,57,57,54,55,47,50,66,62,58,57,55,55,57,54,53,53,51,55,56,52,53,54,54,52,52,54,54,56,54,54,54,65,64,56,55,55,54,57,54,55,53,54,52,56,55,51,54,51,53,54,57,52,53,51,60,52,64,64,55,53,53,54,56,54,52,52,51,51,52,53,49,49,52,58,53,46,48,53,55,74,56,64,68,58,56,55,55,58,56,53,54,54,51,53,53,47,50,51,56,55,40,50,49,57,86,56,58,66,56,54,56,58,61,56,52,56,54,51,53,52,51,55,54,57,55,48,56,56,61,95,57,58,57,59,60,59,58,59,60,55,59,59,55,54,55,53,54,54,57,57,58,58,57,63,104,61,72,83,64,61,60,61,59,57,55,56,60,57,56,58,57,60,57,55,67,57,60,56,62,111,62,68,100,60,57,59,58,63,60,57,56,54,61,53,54,57,60,56,56,74,59,59,58,72,116,64,63,97,82,58,59,62,64,64,59,59,56,61,58,57,61,62,58,64,68,63,62,63,73,110,63,63,89,101,60,61,62,66,59,55,50,52,62,61,61,61,58,58,83,63,54,45,62,84,108,58,65,67,108,67,65,63,69,59,58,57,58,69,67,63,65,61,60,105,62,58,54,58,99,125,66,66,65,114,93,62,63,66,64,60,59,65,63,66,63,64,63,62,101,59,71,64,61,108,119,66,64,55,89,110,64,58,65,61,55,55,60,61,65,68,69,66,79,92,51,79,63,63,114,126,67,71,61,86,126,87,60,71,64,63,60,65,64,69,68,66,62,94,83,56,90,61,60,113,122,64,82,76,68,125,130,68,72,69,65,66,65,64,69,68,64,62,101,67,55,96,64,68,125,124,66,90,90,60,116,133,75,74,59,57,61,59,65,70,73,66,61,103,68,65,101,61,78,140,124,65,94,103,57,100,123,86,67,57,54,60,64,74,71,70,66,72,112,64,75,110,63,85,140,128,71,92,110,61,83,124,113,68,66,75,61,65,71,73,75,68,90,119,61,85,114,61,87,143,124,65,93,119,67,70,126,120,69,62,77,77,61,69,76,64,53,106,122,66,93,117,63,93,146,120,68,87,116,74,68,103,120,72,65,73,96,61,68,72,68,58,110,119,61,95,121,64,71,136,132,70,70,68,65,67,88,121,86,61,71,111,64,66,72,83,67,122,111,56,97,103,65,64,128,134,77,74,61,60,67,73,128,95,62,78,126,88,69,89,86,73,133,119,58,96,73,70,70,125,134,80,78,65,65,65,66,110,106,65,75,127,116,68,112,78,79,141,131,66,78,67,74,71,132,143,73,74,75,68,67,66,94,99,60,76,123,122,80,109,71,80,149,123,69,67,73,79,82,153,142,79,75,72,71,69,68,93,79,63,67,108,103,107,99,71,77,142,100,70,74,76,77,83,155,132,76,82,76,75,77,74,76,74,69,60,108,79,128,105,70,78,131,87,77,74,75,76,86,146,122,73,74,70,72,71,69,53,59,69,59,87,60,111,71,73,80,97,79,77,71,73,73,88,138,111,72,80,70,69,72,77,65,62,68,61,64,67,80,64,69,80,68,72,72,69,71,68,82,128,95,72,78,75,73,72,73,74,78,69,65,51,68,56,65,72,74,75,77,79,69,70,71,69,121,90,68,71,69,72,68,64,69,71,65,72,69,69,66,68,74,76,77,71,74,70,75,73,69,112,88,70,75,69,69,70,73,72,70,61,66,70,74,70,66,67,70,75,70,70,66,73,73,69,102,82,71,73,72,70,71,71,73,72,63,62,66,67,67,67,71,70,76,70,75,67,69,74,71,94,72,63,70,70,69,69,64,73,79,68,66,68,61];

// Normalised cross-correlation of two equal-length grey arrays: 1 = same picture, ~0 = unrelated.
function ncc(a, b) {
  const n = Math.min(a.length, b.length);
  if (!n) return 0;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let ab = 0, aa = 0, bb = 0;
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; ab += x * y; aa += x * x; bb += y * y; }
  return aa && bb ? ab / Math.sqrt(aa * bb) : 0;
}

// samples: { [dy]: grey[] } for each candidate layout (0 = in a folder, NO_FOLDER_DY = not). → the dy that matches,
// or null when nothing matches well (stash not open, a tooltip or window over the ornament): then the caller keeps
// the last layout it was sure of.
function pickShift(samples) {
  let best = { dy: 0, score: -1 };
  for (const [dy, grey] of Object.entries(samples || {})) {
    const score = ncc(ANCHOR_GREY, grey);
    if (score > best.score) best = { dy: Number(dy), score };
  }
  return best.score >= 0.8 ? best.dy : null;
}

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
// dy: the layout shift in REF px (pickShift); 0 = the folder layout REF was measured on.
function geometry(p, h, dy = 0) {
  const s = h / REF.h, r = v => Math.round(v * s);
  const x = (side, c) => (side === 'L' ? LEFT.x0 + LEFT.step * c : RIGHT.x0 - RIGHT.step * c);
  const y = row => REF.rowY + dy + REF.rowStep * row;
  const boxes = [], labels = [];
  for (const row of p.rows) {
    for (const c of row.cells) if (c.box) boxes.push({ x: r(x(row.side, c.col)), y: r(y(row.row)), size: r(REF.cell), color: c.box, type: row.type, tier: c.tier });
    if (row.label != null) labels.push({ x: r(x(row.side, row.label)), y: r(y(row.row)), size: r(REF.cell), profit: row.profit, type: row.type });
  }
  return { scale: s, boxes, labels, total: { x: r(TOTAL_AT.x), y: r(TOTAL_AT.y + dy), h: r(TOTAL_AT.h), value: p.total } };
}

const REF_H = REF.h;
module.exports = { REF_H, TIERS, LAYOUT, RATIO, essenceCounts, plan, geometry, nameOf, NO_FOLDER_DY, ANCHOR, ANCHOR_GREY, ncc, pickShift };
