'use strict';
// GGG's public currency exchange history: one file per hour (https://web.poecdn.com/api/currency-exchange/<unix hour>),
// documented under "Public API" in GGG's developer docs; no account or key. Each file is ~1.5 MB for all leagues, so
// only a small summary for your league is kept, on disk too (%APPDATA%\Exilogue\cx), so a restart doesn't download
// the same hours again. Keeps the last HOURS hours; asks for one hour at a time, a few seconds apart.
//  - An hour is only kept when GGG says it is complete (its next_change_id is the following hour).
//  - GGG publishes an hour some time after it ends: the newest hour asked for is the one before the last.
//  - Rate limits: on 429 or a server error everything stops until Retry-After (or 15 minutes) has passed.
const fs = require('fs');
const path = require('path');
const { summarizeHour, aggregate } = require('../core/cxprices');

const URL = ts => `https://web.poecdn.com/api/currency-exchange/${ts}`;
const HOURS = 12;
const MAX_BYTES = 8 * 1024 * 1024;
const GAP_MS = 3000;          // between two downloads
const RETRY_MS = 15 * 60e3;   // an hour that wasn't published yet is tried again after this
const safe = s => String(s).replace(/[^A-Za-z0-9 -]/g, '');

class CxHistory {
  constructor({ fetch, userAgent, dir }) {
    this.fetch = fetch; this.ua = userAgent; this.dir = dir;
    this.hours = new Map();     // ts -> summary (for this.league); an hour without trades in the league has items {}
    this.failed = new Map();    // ts -> when
    this.pauseUntil = 0;        // after a 429 / server error
    this.league = null; this.busy = false; this.rev = 0; this.agg = null; this.lastError = null;
  }

  // Hours to keep: the HOURS hours before the newest one GGG has probably published (2 hours back).
  static wanted(now = Date.now()) {
    const top = Math.floor(now / 3600e3) * 3600 - 2 * 3600;
    return Array.from({ length: HOURS }, (_, i) => top - i * 3600);
  }

  _file(ts) { return path.join(this.dir, `${safe(this.league)}-${ts}.json`); }

  // This league's saved hours into memory; other leagues' files are deleted (a league change leaves them behind).
  _loadDisk() {
    let names = [];
    try { names = fs.readdirSync(this.dir); } catch { return; }
    for (const f of names) {
      const m = /^(.+)-(\d{10})\.json$/.exec(f);
      if (!m) continue;
      if (m[1] !== safe(this.league)) { try { fs.unlinkSync(path.join(this.dir, f)); } catch { /* in use */ } continue; }
      try { const s = JSON.parse(fs.readFileSync(path.join(this.dir, f), 'utf8')); if (s && s.items) this.hours.set(Number(m[2]), s); } catch { /* skip */ }
    }
  }

  async _get(ts) {
    const r = await this.fetch(URL(ts), { headers: { 'User-Agent': this.ua, Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
    if (r.status === 429 || r.status >= 500) {
      const ra = Number(r.headers && r.headers.get && r.headers.get('retry-after'));
      const e = new Error(`HTTP ${r.status}`); e.pause = (Number.isFinite(ra) && ra > 0 ? Math.min(ra, 3600) * 1000 : RETRY_MS); throw e;
    }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const len = Number(r.headers && r.headers.get && r.headers.get('content-length'));
    if (len > MAX_BYTES) throw new Error('too large');
    const text = await r.text();
    if (text.length > MAX_BYTES) throw new Error('too large');
    return JSON.parse(text);
  }

  // league: the league's name as GGG's exchange uses it (e.g. "Covens", "Hardcore Covens"). Never throws.
  async refresh(league) {
    if (this.busy || !league || Date.now() < this.pauseUntil) return;
    this.busy = true;
    try {
      if (league !== this.league) { this.league = league; this.hours.clear(); this.failed.clear(); this.agg = null; this._loadDisk(); this.rev++; }
      const want = CxHistory.wanted();
      for (const ts of [...this.hours.keys()]) if (!want.includes(ts)) { this.hours.delete(ts); try { fs.unlinkSync(this._file(ts)); } catch { /* gone */ } this.agg = null; }
      let first = true;
      for (const ts of want) { // newest first
        if (this.hours.has(ts)) continue;
        const f = this.failed.get(ts);
        if (f && Date.now() - f < RETRY_MS) continue;
        if (!first) await new Promise(r => setTimeout(r, GAP_MS));
        first = false;
        try {
          const j = await this._get(ts);
          // Not published (yet): GGG answers with the stream's end, not the following hour.
          if (!j || Number(j.next_change_id) !== ts + 3600) { this.failed.set(ts, Date.now()); continue; }
          const s = summarizeHour(j, league, ts);
          this.hours.set(ts, s); this.failed.delete(ts); this.agg = null; this.lastError = null; this.rev++;
          try { fs.mkdirSync(this.dir, { recursive: true }); fs.writeFileSync(this._file(ts), JSON.stringify(s)); } catch { /* memory only */ }
        } catch (e) {
          this.failed.set(ts, Date.now()); this.lastError = String((e && e.message) || e).slice(0, 120);
          if (e && e.pause) { this.pauseUntil = Date.now() + e.pause; break; } // rate limit or server trouble: stop for now
        }
      }
    } finally { this.busy = false; }
  }

  // { prices, hours (with trades in the league), newest } or null before the first hour with data is in.
  get() {
    const hs = [...this.hours.entries()].filter(([, s]) => s.rate && Object.keys(s.items).length);
    if (!hs.length) return null;
    if (!this.agg) this.agg = { prices: aggregate(hs.map(([, s]) => s)), hours: hs.length, newest: Math.max(...hs.map(([ts]) => ts)) * 1000 };
    return this.agg;
  }
}

// GGG's exchange league name from Exilogue's league setting: poe.ninja's short name ("Covens", "Hardcore Covens"),
// with "Ruthless" put back where GGG uses it ("Ruthless Covens", "HC Ruthless Covens"). SSF leagues have no exchange.
function exchangeLeague(full, short) {
  if (/\bssf\b|solo self.found/i.test(full)) return null;
  if (!/ruthless/i.test(full) || /ruthless/i.test(short)) return short;
  const base = short.replace(/^(Hardcore|HC)\s+/i, '');
  return /hardcore|\bhc\b/i.test(full) ? `HC Ruthless ${base}` : `Ruthless ${base}`;
}

module.exports = { CxHistory, HOURS, exchangeLeague };
