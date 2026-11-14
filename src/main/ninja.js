'use strict';
// Live item price from poe.ninja (public API, no account), for the Home goal ("Mageblood: 43%").
// Looks the item up in the unique-item categories until it finds the name; the category is remembered.
// One request per category tried, then at most one per hour.
const TYPES = ['UniqueAccessory', 'UniqueArmour', 'UniqueWeapon', 'UniqueJewel', 'UniqueFlask', 'UniqueRelic', 'UniqueMap', 'Invitation', 'Memory'];
const MAX_AGE = 60 * 60 * 1000;
const RETRY = 10 * 60 * 1000;          // after a network error
const RETRY_NOT_FOUND = 6 * 3600 * 1000; // the name isn't a unique on poe.ninja (or a typo): ask again much later
const MAX_BYTES = 8 * 1024 * 1024;

class NinjaPrice {
  constructor({ fetch, userAgent }) {
    this.fetch = fetch; this.ua = userAgent;
    this.cache = null;   // { key, divines, chaos, at, type, name }
    this.failed = null; // { key, at, wait }
    this.busy = false;
  }

  async _json(url) {
    const r = await this.fetch(url, { headers: { 'User-Agent': this.ua, Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const text = await r.text();
    if (text.length > MAX_BYTES) throw new Error('too large');
    return JSON.parse(text);
  }

  // → cached { divines, chaos, at, name } or null. Refreshes in the background when old.
  get(league, name) {
    const key = `${league}|${(name || '').trim().toLowerCase()}`;
    const c = this.cache && this.cache.key === key ? this.cache : null;
    const stale = !c || Date.now() - c.at > MAX_AGE;
    const f = this.failed && this.failed.key === key ? this.failed : null; // a failure for another name doesn't hold this one up
    if (stale && !this.busy && (!f || Date.now() - f.at > f.wait) && name && name.trim()) this._refresh(league, name.trim(), key, c && c.type).catch(() => {});
    return c;
  }

  async _refresh(league, name, key, knownType) {
    this.busy = true;
    try {
      const want = name.toLowerCase();
      for (const type of knownType ? [knownType] : TYPES) {
        const data = await this._json(`https://poe.ninja/api/data/itemoverview?league=${encodeURIComponent(league)}&type=${type}`);
        const lines = (data && Array.isArray(data.lines) ? data.lines : []).filter(l => l && typeof l.name === 'string' && l.name.toLowerCase() === want);
        if (!lines.length) continue;
        // The plain version: no links, no relic; the cheapest if there are still several.
        const plain = lines.filter(l => !l.links && !/relic/i.test(l.detailsId || '')).sort((a, b) => (a.chaosValue || 0) - (b.chaosValue || 0))[0] || lines[0];
        const prev = this.cache;
        this.cache = { key, type, name: plain.name, chaos: Number(plain.chaosValue) || null, divines: Number(plain.divineValue) || null, at: Date.now() };
        this.changed = !prev || prev.divines !== this.cache.divines;
        this.failed = null;
        return;
      }
      this.failed = { key, at: Date.now(), wait: RETRY_NOT_FOUND };
    } catch (e) {
      this.failed = { key, at: Date.now(), wait: RETRY };
    } finally { this.busy = false; }
  }
}

module.exports = { NinjaPrice };
