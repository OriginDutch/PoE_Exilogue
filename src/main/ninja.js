'use strict';
// poe.ninja (public, no account): divine price, currency icons, the goal item's price and icon,
// and 24 h price changes for items you own. Uses poe.ninja's PoE 1 API (/poe1/api/...), which names
// leagues by short names ("Covens" for "Covens of Umbra"): the short name comes from its index.
// Requests: index once a day, currency once an hour, goal categories once an hour (the category is remembered).
const BASE = 'https://poe.ninja/poe1/api';
const CDN = 'https://web.poecdn.com';
const ITEM_TYPES = ['UniqueAccessory', 'UniqueArmour', 'UniqueWeapon', 'UniqueJewel', 'UniqueFlask', 'UniqueRelic', 'UniqueMap'];
const HOUR = 60 * 60 * 1000;
const RETRY = 10 * 60 * 1000;          // after a network error
const RETRY_NOT_FOUND = 6 * HOUR;      // the goal name isn't on poe.ninja (or a typo)
const MAX_BYTES = 12 * 1024 * 1024;

const abs = u => (typeof u === 'string' && u ? (u.startsWith('http') ? u : CDN + (u.startsWith('/') ? '' : '/') + u) : null);
const httpsOnly = u => (u && /^https:\/\/web\.poecdn\.com\//.test(u) ? u : null);

// GGG's generated image URLs carry their options as base64 JSON: /gen/image/<base64>/<hash>/<file>; relic art has "relic".
function isRelicIcon(u) {
  const m = /\/gen\/image\/([A-Za-z0-9_-]+)\//.exec(String(u || ''));
  if (!m) return false;
  try { return /"relic"/.test(Buffer.from(m[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); } catch { return false; }
}

// "Covens of Umbra" → "Covens"; "Hardcore Covens of Umbra" → "Hardcore Covens". Falls back to the full name.
function shortLeague(full, leagues) {
  const f = String(full || '').toLowerCase();
  const hc = /hardcore|\bhc\b/.test(f);
  const pick = (leagues || []).filter(l => l && l.name && /hardcore/i.test(l.name) === hc && !/^(standard|hardcore)$/i.test(l.name))
    .find(l => f.includes(l.name.toLowerCase().replace(/^hardcore\s+/, '')));
  return pick ? pick.name : full;
}

// A goal as given: a plain name (older settings) or { name, id, type }. id = poe.ninja's detailsId of one exact line.
function normGoal(g) {
  if (typeof g === 'string') g = { name: g };
  const name = String((g && g.name) || '').trim();
  if (!name) return null;
  const id = g.id && /^[a-z0-9-]{1,120}$/.test(g.id) ? g.id : null;
  return { name, id, type: ITEM_TYPES.includes(g.type) ? g.type : null };
}
const goalKey = g => (g.id ? 'id:' + g.id : g.name.toLowerCase());
// "4 Flasks", "6L", "Relic", or a combination; '' for the plain item.
const lineLabel = l => [l.variant, l.links ? l.links + 'L' : '', l.relic ? 'Relic' : ''].filter(Boolean).join(' · ');

class NinjaPrice {
  constructor({ fetch, userAgent }) {
    this.fetch = fetch; this.ua = userAgent;
    this.index = null;      // { leagues, at }
    this.currency = null;   // { key, at, divineChaos, icons: { divine, chaos }, changes: { name: pct } }
    this.cache = null;      // goal: { key, at, type, name, chaos, divines, icon, change }
    this.items = {};        // type -> { key, at, lines } (lines kept short: id, name, variant, base, links, relic, chaos, divines, change, icon)
    this.failed = {};       // what -> { key, at, wait }
    this.busy = false;
    this.rev = 0;
  }

  async _json(url) {
    const r = await this.fetch(url, { headers: { 'User-Agent': this.ua, Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const text = await r.text();
    if (text.length > MAX_BYTES) throw new Error('too large');
    return JSON.parse(text);
  }

  _can(what, key) { const f = this.failed[what]; return !f || f.key !== key || Date.now() - f.at > f.wait; }
  _fail(what, key, wait) { this.failed[what] = { key, at: Date.now(), wait }; }

  async _league(full) {
    if (!this.index || Date.now() - this.index.at > 24 * HOUR) {
      const j = await this._json(`${BASE}/data/index-state`);
      this.index = { leagues: Array.isArray(j && j.economyLeagues) ? j.economyLeagues : [], at: Date.now() };
    }
    return shortLeague(full, this.index.leagues);
  }

  // One download per category at a time (a search typed during the first load shares it), cached an hour.
  _items(league, type) {
    const key = `${league}|${type}`;
    const c = this.items[type];
    if (c && c.key === key && Date.now() - c.at < HOUR) return Promise.resolve(c.lines);
    this.loading = this.loading || new Map();
    if (this.loading.has(key)) return this.loading.get(key);
    const p = this._loadItems(league, type, key).finally(() => this.loading.delete(key));
    this.loading.set(key, p);
    return p;
  }
  async _loadItems(league, type, key) {
    const j = await this._json(`${BASE}/economy/stash/current/item/overview?league=${encodeURIComponent(league)}&type=${type}`);
    const lines = (j && Array.isArray(j.lines) ? j.lines : []).filter(l => l && typeof l.name === 'string').map(l => ({
      id: typeof l.detailsId === 'string' ? l.detailsId.slice(0, 120) : null, type,
      name: l.name, variant: typeof l.variant === 'string' ? l.variant.slice(0, 80) : null, base: typeof l.baseType === 'string' ? l.baseType.slice(0, 60) : null,
      chaos: Number(l.chaosValue) || null, divines: Number(l.divineValue) || null, links: l.links || 0,
      relic: /relic/i.test(l.detailsId || '') || isRelicIcon(l.icon),
      icon: httpsOnly(abs(l.icon)), change: l.sparkLine && Number.isFinite(l.sparkLine.totalChange) ? l.sparkLine.totalChange : null,
    }));
    this.items[type] = { key, at: Date.now(), lines };
    return lines;
  }

  async _currency(league) {
    const j = await this._json(`${BASE}/economy/exchange/current/overview?league=${encodeURIComponent(league)}&type=Currency`);
    const core = (j && j.core) || {};
    const items = [...(Array.isArray(core.items) ? core.items : []), ...(Array.isArray(j && j.items) ? j.items : [])];
    const byId = new Map(items.filter(i => i && i.id).map(i => [i.id, i]));
    const rate = core.rates && Number(core.rates.divine); // divines per chaos
    const icon = id => { const i = byId.get(id); return i ? httpsOnly(abs(i.image)) : null; };
    const changes = {};
    for (const l of Array.isArray(j && j.lines) ? j.lines : []) {
      const it = byId.get(l && l.id);
      const ch = l && l.sparkline && Number(l.sparkline.totalChange);
      if (it && it.name && Number.isFinite(ch)) changes[it.name] = ch;
    }
    this.currency = { key: league, at: Date.now(), divineChaos: rate > 0 ? 1 / rate : null, icons: { divine: icon('divine'), chaos: icon('chaos') }, changes };
    this.rev++;
  }

  // goal: { name, id?, type? }. With an id (picked in the search) that exact poe.ninja line; with only a name (typed by hand,
  // older settings) the plain version: no links, no relic, the cheapest if there are still several (e.g. flask-count variants).
  // If poe.ninja no longer has the picked id (variant reworked, new league), a second pass looks it up by name and
  // marks the price approximate.
  async _goal(league, goal, knownType) {
    const want = goal.name.toLowerCase();
    const types = [...new Set([knownType, goal.type, ...ITEM_TYPES].filter(t => ITEM_TYPES.includes(t)))];
    for (const byName of goal.id ? [false, true] : [true]) for (const type of types) {
      const all = await this._items(league, type);
      let line = null;
      if (goal.id) line = all.find(l => l.id === goal.id) || null;
      if (!goal.id || (!line && byName)) {
        const lines = all.filter(l => l.name.toLowerCase() === want);
        if (lines.length) line = lines.filter(l => !l.links && !l.relic).sort((a, b) => (a.chaos || 0) - (b.chaos || 0))[0] || lines[0];
      }
      if (!line) continue;
      this.cache = { key: `${league}|${goalKey(goal)}`, type, at: Date.now(), name: line.name, label: lineLabel(line), chaos: line.chaos, divines: line.divines, icon: line.icon, change: line.change, approx: !!(goal.id && byName) };
      this.rev++;
      return true;
    }
    return false;
  }

  // Every unique category, for the goal search. A category that failed waits a minute before it's tried again,
  // so typing during an outage doesn't fire 7 downloads per keystroke. partial = some categories are missing.
  async catalog(fullLeague) {
    const league = await this._league(fullLeague);
    const parts = await Promise.all(ITEM_TYPES.map(async type => {
      const key = `${league}|${type}`;
      if (!this._can('cat:' + type, key)) return null;
      try { return await this._items(league, type); } catch { this._fail('cat:' + type, key, 60e3); return null; }
    }));
    const lines = parts.filter(Boolean).flat();
    const partial = parts.some(x => x === null);
    if (!lines.length && partial) throw new Error('poe.ninja not reachable');
    return { lines, partial };
  }

  // Search by name, variant and base; every word must match.
  async search(fullLeague, query, limit = 40) {
    const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6);
    if (!words.length) return [];
    const { lines: all, partial } = await this.catalog(fullLeague);
    const q = words.join(' ');
    const hits = [];
    for (const l of all) {
      if (!l.id) continue;
      const name = l.name.toLowerCase();
      const hay = `${name} ${(l.variant || '').toLowerCase()} ${(l.base || '').toLowerCase()} ${l.links ? l.links + 'l' : ''} ${l.relic ? 'relic' : ''}`;
      if (!words.every(w => hay.includes(w))) continue;
      const rank = name === q ? 0 : name.startsWith(q) ? 1 : name.split(/\s+/).some(w => w.startsWith(words[0])) ? 2 : 3;
      hits.push({ rank, l });
    }
    // Best name match first, then alphabetical; versions of the same unique from priciest to cheapest.
    hits.sort((a, b) => a.rank - b.rank || a.l.name.localeCompare(b.l.name) || (b.l.chaos || 0) - (a.l.chaos || 0));
    const items = hits.slice(0, limit).map(({ l }) => ({ id: l.id, type: l.type, name: l.name, label: lineLabel(l), base: l.base, divines: l.divines, chaos: l.chaos }));
    return { items, partial };
  }

  // Everything due, one request after another. Never throws.
  async refresh(fullLeague, goalIn) {
    if (this.busy) return;
    this.busy = true;
    try {
      let league;
      if (!this.index && !this._can('index', fullLeague)) return;
      try { league = await this._league(fullLeague); } catch { if (!this.index) { this._fail('index', fullLeague, RETRY); return; } league = shortLeague(fullLeague, this.index.leagues); }
      if ((!this.currency || this.currency.key !== league || Date.now() - this.currency.at > HOUR) && this._can('currency', league)) {
        try { await this._currency(league); } catch { this._fail('currency', league, RETRY); }
      }
      const goal = normGoal(goalIn);
      const key = goal && `${league}|${goalKey(goal)}`;
      if (goal && (!this.cache || this.cache.key !== key || Date.now() - this.cache.at > HOUR) && this._can('goal', key)) {
        try { if (!(await this._goal(league, goal, this.cache && this.cache.key === key ? this.cache.type : null))) this._fail('goal', key, RETRY_NOT_FOUND); }
        catch { this._fail('goal', key, RETRY); }
      }
    } finally { this.busy = false; }
  }

  // Cached goal for this league + goal, or null. Starts a refresh in the background when something is due.
  get(fullLeague, goalIn) {
    this.refresh(fullLeague, goalIn).catch(() => {});
    const goal = normGoal(goalIn);
    const c = this.cache;
    return goal && c && c.key.endsWith('|' + goalKey(goal)) ? c : null;
  }

  // 24 h price change (%) for an item name, from what's already loaded (currency, goal categories). null when unknown.
  change(name) {
    if (!name) return null;
    if (this.currency && name in this.currency.changes) return this.currency.changes[name];
    for (const t of Object.values(this.items)) { const l = t.lines.find(x => x.name === name && !x.links && !x.relic && x.change != null); if (l) return l.change; }
    return null;
  }
}

module.exports = { NinjaPrice, shortLeague, normGoal, goalKey, ITEM_TYPES };
