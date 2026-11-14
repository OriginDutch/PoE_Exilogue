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

class NinjaPrice {
  constructor({ fetch, userAgent }) {
    this.fetch = fetch; this.ua = userAgent;
    this.index = null;      // { leagues, at }
    this.currency = null;   // { key, at, divineChaos, icons: { divine, chaos }, changes: { name: pct } }
    this.cache = null;      // goal: { key, at, type, name, chaos, divines, icon, change }
    this.items = {};        // type -> { key, at, lines } (lines kept short: name, chaos, divines, change, icon)
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

  async _items(league, type) {
    const key = `${league}|${type}`;
    const c = this.items[type];
    if (c && c.key === key && Date.now() - c.at < HOUR) return c.lines;
    const j = await this._json(`${BASE}/economy/stash/current/item/overview?league=${encodeURIComponent(league)}&type=${type}`);
    const lines = (j && Array.isArray(j.lines) ? j.lines : []).filter(l => l && typeof l.name === 'string').map(l => ({
      name: l.name, chaos: Number(l.chaosValue) || null, divines: Number(l.divineValue) || null, links: l.links || 0,
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

  async _goal(league, name, knownType) {
    const want = name.toLowerCase();
    for (const type of knownType ? [knownType] : ITEM_TYPES) {
      const lines = (await this._items(league, type)).filter(l => l.name.toLowerCase() === want);
      if (!lines.length) continue;
      // The plain version: no links, no relic; the cheapest if there are still several (e.g. flask-count variants).
      const plain = lines.filter(l => !l.links && !l.relic).sort((a, b) => (a.chaos || 0) - (b.chaos || 0))[0] || lines[0];
      this.cache = { key: `${league}|${want}`, type, at: Date.now(), name: plain.name, chaos: plain.chaos, divines: plain.divines, icon: plain.icon, change: plain.change };
      this.rev++;
      return true;
    }
    return false;
  }

  // Everything due, one request after another. Never throws.
  async refresh(fullLeague, goalName) {
    if (this.busy) return;
    this.busy = true;
    try {
      let league;
      if (!this.index && !this._can('index', fullLeague)) return;
      try { league = await this._league(fullLeague); } catch { if (!this.index) { this._fail('index', fullLeague, RETRY); return; } league = shortLeague(fullLeague, this.index.leagues); }
      if ((!this.currency || this.currency.key !== league || Date.now() - this.currency.at > HOUR) && this._can('currency', league)) {
        try { await this._currency(league); } catch { this._fail('currency', league, RETRY); }
      }
      const name = String(goalName || '').trim();
      const key = `${league}|${name.toLowerCase()}`;
      if (name && (!this.cache || this.cache.key !== key || Date.now() - this.cache.at > HOUR) && this._can('goal', key)) {
        try { if (!(await this._goal(league, name, this.cache && this.cache.key === key ? this.cache.type : null))) this._fail('goal', key, RETRY_NOT_FOUND); }
        catch { this._fail('goal', key, RETRY); }
      }
    } finally { this.busy = false; }
  }

  // Cached goal for this league + name, or null. Starts a refresh in the background when something is due.
  get(fullLeague, name) {
    this.refresh(fullLeague, name).catch(() => {});
    const want = String(name || '').trim().toLowerCase();
    const c = this.cache;
    return c && c.key.endsWith('|' + want) ? c : null;
  }

  // 24 h price change (%) for an item name, from what's already loaded (currency, goal categories). null when unknown.
  change(name) {
    if (!name) return null;
    if (this.currency && name in this.currency.changes) return this.currency.changes[name];
    for (const t of Object.values(this.items)) { const l = t.lines.find(x => x.name === name && !x.links && !x.relic && x.change != null); if (l) return l.change; }
    return null;
  }
}

module.exports = { NinjaPrice, shortLeague };
