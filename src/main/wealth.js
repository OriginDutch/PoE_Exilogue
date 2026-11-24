'use strict';
// Wealthy Exile CSV exports: picked up from the Downloads folder as soon as they appear, read, and moved into
// %APPDATA%\Exilogue\wealth (the newest 2 files are kept, older ones deleted). The totals per export are kept for
// good in wealth.db, separate from the league stats, so a rebuild or restore of the stats never touches them.
// Export format (Wealthy Exile, Nov 2026): UTF-8 with BOM, all fields quoted: "Name","Tab","Quantity","Price","Total".
// Prices are in chaos; "Price" is rounded for display, "Total" is exact, so sums use Total.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const NAME = /^Wealthy-Exile-export-.*\.csv$/i;
const KEEP_FILES = 2;
const MAX_FILE = 5 * 1024 * 1024;

// RFC 4180-ish: quoted fields, "" inside quotes, commas and newlines inside quotes.
function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// → { chaos, divPrice, items: [{ name, tab, qty, total }], tabs: { tab: chaos } } or throws.
function readExport(text) {
  const rows = parseCsv(text);
  const head = (rows.shift() || []).map(h => h.trim().toLowerCase());
  const col = n => head.indexOf(n);
  const [iName, iTab, iQty, iPrice, iTotal] = ['name', 'tab', 'quantity', 'price', 'total'].map(col);
  if (iName < 0 || iTotal < 0) throw new Error('Not a Wealthy Exile export (columns missing).');
  const num = v => {
    const s = String(v || '').trim();
    let n = Number(s);
    if (!Number.isFinite(n)) n = Number(s.replace(/[^\d.eE+-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  };
  const items = [], tabs = {};
  let chaos = 0, divPrice = null;
  for (const r of rows) {
    const name = (r[iName] || '').trim();
    if (!name) continue;
    const total = num(r[iTotal]);
    const tab = iTab >= 0 ? (r[iTab] || '').trim() : '';
    items.push({ name, tab, qty: iQty >= 0 ? num(r[iQty]) : null, total });
    chaos += total;
    tabs[tab] = (tabs[tab] || 0) + total;
    if (name === 'Divine Orb') {
      const q = iQty >= 0 ? num(r[iQty]) : 0;
      divPrice = q > 0 && total > 0 ? total / q : (iPrice >= 0 && num(r[iPrice]) > 0 ? num(r[iPrice]) : divPrice); // Total/Quantity is exact
    }
  }
  if (!items.length) throw new Error('the export is empty.'); // a glitch, not a real 0
  items.sort((a, b) => b.total - a.total);
  return { chaos, divPrice, items, tabs };
}

class Wealth {
  // opts: { dir (userData), downloads, onChange(), onPending(p), divPrice() → chaos per divine or null (poe.ninja) }
  constructor(opts) {
    this.o = opts;
    this.archive = path.join(opts.dir, 'wealth');
    this.db = new DatabaseSync(path.join(opts.dir, 'wealth.db'));
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS exports (id INTEGER PRIMARY KEY, t INTEGER NOT NULL, hash TEXT UNIQUE, chaos REAL NOT NULL,
        div_price REAL, top TEXT NOT NULL, tabs TEXT NOT NULL, items INTEGER NOT NULL);
    `);
    // status: 'ok' counts; 'pending' = other tabs than the export before it, waiting for "on purpose?"; 'discarded' = no.
    const cols = this.db.prepare('PRAGMA table_info(exports)').all().map(c => c.name);
    if (!cols.includes('status')) this.db.exec("ALTER TABLE exports ADD COLUMN status TEXT NOT NULL DEFAULT 'ok'");
    this.written = 0; this.read = 0; // for the Storage tab (approximate for the database: row bytes)
    this.rev = 0;
    this.watcher = null;
    this.pending = new Map(); // file -> timer
    this.failed = new Map();  // file -> "size|mtime" of a version that couldn't be read (not retried until it changes)
    this.lastError = null;    // { file, msg }
  }

  start() {
    this.scan();
    try {
      this.watcher = fs.watch(this.o.downloads, (ev, name) => { if (name && NAME.test(name)) this._soon(path.join(this.o.downloads, name)); });
      this.watcher.on('error', () => { this.watcher = null; });
    } catch { this.watcher = null; } // no watch: scan() on start and on window focus still picks files up
  }

  stop() {
    try { this.watcher && this.watcher.close(); } catch { /* closed */ }
    this.watcher = null;
    for (const t of this.pending.values()) clearTimeout(t);
    this.pending.clear();
  }

  // Exports already sitting in Downloads (app was closed when they came in).
  scan() {
    let names = [];
    try { names = fs.readdirSync(this.o.downloads).filter(n => NAME.test(n)); } catch { return; }
    for (const n of names) this._soon(path.join(this.o.downloads, n));
    // An error about a file that is gone (deleted or replaced) no longer applies.
    if (this.lastError && !fs.existsSync(this.lastError.file)) this._setError(null);
  }

  _setError(err) {
    const same = JSON.stringify(err) === JSON.stringify(this.lastError);
    this.lastError = err;
    if (!same) { this.rev++; if (this.o.onChange) this.o.onChange(); }
  }

  // Firefox writes to a .part file and renames when done; still wait until the size holds still.
  _soon(file) {
    clearTimeout(this.pending.get(file));
    this.pending.set(file, setTimeout(() => { this.pending.delete(file); this._import(file).catch(() => {}); }, 1500));
  }

  async _import(file) {
    let st1, st2;
    try { st1 = fs.statSync(file); } catch { return; } // gone (moved already)
    if (!st1.isFile() || st1.size === 0) return;     // Firefox's empty placeholder: the rename after the download brings it back
    const ver = `${st1.size}|${st1.mtimeMs}`;
    if (this.failed.get(file) === ver) return;      // this exact version couldn't be read before
    if (st1.size > MAX_FILE) { this.failed.set(file, ver); return this._setError({ file, msg: 'the file is too large (over 5 MB).' }); }
    await new Promise(r => setTimeout(r, 500));
    try { st2 = fs.statSync(file); } catch { return; }
    if (st2.size !== st1.size) return this._soon(file);
    let buf;
    try { buf = fs.readFileSync(file); } catch { return; } // locked (antivirus, Excel): the next scan tries again
    this.read += buf.length;
    const hash = crypto.createHash('sha1').update(buf).digest('hex');
    const t = Math.min(Date.now(), Math.round(st2.mtimeMs) || Date.now());
    let added = false;
    try {
      const exists = this.db.prepare('SELECT id, t FROM exports WHERE hash = ?').get(hash);
      if (!exists) {
        const ex = readExport(buf.toString('utf8'));
        const top = JSON.stringify(ex.items.slice(0, 5));
        const tabs = JSON.stringify(ex.tabs);
        // No Divine Orb line of your own (you had none): poe.ninja's divine price, else the last one known.
        let div = ex.divPrice;
        if (!(div > 0)) { try { div = this.o.divPrice ? this.o.divPrice() : null; } catch { div = null; } }
        if (!(div > 0)) { const r = this.db.prepare('SELECT div_price FROM exports WHERE div_price > 0 ORDER BY t DESC LIMIT 1').get(); div = r ? r.div_price : null; }
        // Other tabs than the last export that counts (a filter in Wealthy Exile, a tab emptied or new): ask first.
        const prev = this.db.prepare("SELECT tabs FROM exports WHERE status = 'ok' AND t <= ? ORDER BY t DESC LIMIT 1").get(t);
        const diff = prev ? tabDiff(Object.keys(JSON.parse(prev.tabs)), Object.keys(ex.tabs)) : null;
        const status = diff && (diff.missing.length || diff.added.length) ? 'pending' : 'ok';
        if (status === 'pending') this.db.prepare("UPDATE exports SET status = 'discarded' WHERE status = 'pending'").run(); // only the newest one asks
        this.db.prepare('INSERT INTO exports (t, hash, chaos, div_price, top, tabs, items, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .run(t, hash, ex.chaos, div, top, tabs, ex.items.length, status);
        if (status === 'pending' && this.o.onPending) this.o.onPending(this.pendingExport());
        this.written += top.length + tabs.length + 120;
        added = true;
      } else if (t > exists.t) {
        // Same stash as an earlier export: nothing changed, but this is the newest moment it was confirmed.
        this.db.prepare('UPDATE exports SET t = ? WHERE id = ?').run(t, exists.id);
        this.written += 64;
        added = true;
      }
    } catch (e) {
      this.failed.set(file, ver);
      return this._setError({ file, msg: e.message });
    }
    this.failed.delete(file);
    this._archive(file, !added);
    if (added) this.rev++;
    this._setError(null);
    if (added && this.o.onChange) this.o.onChange();
  }

  // Move into the archive (a rename on the same drive), keep the newest KEEP_FILES. A file that added nothing new
  // (an older duplicate) is simply removed, so it can't push a real export out of the archive.
  _archive(file, duplicate) {
    try {
      if (duplicate) { fs.unlinkSync(file); return; }
      fs.mkdirSync(this.archive, { recursive: true });
      const base = path.basename(file, '.csv');
      let dest = path.join(this.archive, base + '.csv');
      for (let i = 2; fs.existsSync(dest); i++) dest = path.join(this.archive, `${base} (${i}).csv`); // same minute, same name
      try { fs.renameSync(file, dest); } catch (e) {
        if (e.code !== 'EXDEV') return; // locked (EBUSY/EPERM): stays in Downloads, imported already, moved on a later scan
        const buf = fs.readFileSync(file); // Downloads on another drive
        fs.writeFileSync(dest, buf); this.written += buf.length;
        try { fs.unlinkSync(file); } catch { /* removed on a later scan */ }
      }
    } catch { return; }
    const files = fs.readdirSync(this.archive).filter(n => NAME.test(n))
      .map(n => ({ n, t: fs.statSync(path.join(this.archive, n)).mtimeMs })).sort((a, b) => b.t - a.t);
    for (const f of files.slice(KEEP_FILES)) { try { fs.unlinkSync(path.join(this.archive, f.n)); } catch { /* in use */ } }
  }

  // For the snapshot: latest export since `since` (league start, ms) and the one before it.
  summary(since) {
    const rows = this.db.prepare("SELECT t, chaos, div_price, top FROM exports WHERE t >= ? AND status = 'ok' ORDER BY t DESC LIMIT 2").all(since || 0);
    const count = this.db.prepare("SELECT COUNT(*) n FROM exports WHERE t >= ? AND status = 'ok'").get(since || 0).n;
    if (!rows.length) return { count: 0, error: this.lastError ? `${path.basename(this.lastError.file)}: ${this.lastError.msg}` : null };
    const [a, b] = rows;
    const div = a.div_price || (b && b.div_price) || null;
    return {
      count, at: a.t, chaos: a.chaos, divPrice: div, divines: div ? a.chaos / div : null,
      delta: b ? a.chaos - b.chaos : null, prevAt: b ? b.t : null,
      top: JSON.parse(a.top).slice(0, 3), error: this.lastError ? `${path.basename(this.lastError.file)}: ${this.lastError.msg}` : null,
    };
  }

  // Chaos value over time since `since`, evenly thinned to at most `max` points: [{ t, divines }].
  history(since, max = 40) {
    const rows = this.db.prepare("SELECT t, chaos, div_price FROM exports WHERE t >= ? AND status = 'ok' ORDER BY t ASC").all(since);
    const pts = rows.filter(r => r.div_price > 0).map(r => ({ t: r.t, divines: r.chaos / r.div_price }));
    if (pts.length <= max) return pts;
    const out = [];
    for (let i = 0; i < max; i++) out.push(pts[Math.round(i * (pts.length - 1) / (max - 1))]);
    return out;
  }

  // Every line of the newest export still on disk (the archive keeps the newest KEEP_FILES CSVs), for the essence
  // overlay: the database only keeps totals. → { at, items: [{ name, tab, qty, total }] } or null.
  latestItems() {
    let files = [];
    try {
      files = fs.readdirSync(this.archive).filter(n => NAME.test(n))
        .map(n => ({ f: path.join(this.archive, n), t: fs.statSync(path.join(this.archive, n)).mtimeMs })).sort((a, b) => b.t - a.t);
    } catch { return null; }
    for (const { f, t } of files) {
      try {
        const buf = fs.readFileSync(f);
        this.read += buf.length;
        return { at: Math.round(t), items: readExport(buf.toString('utf8')).items };
      } catch { /* unreadable: try the one before it */ }
    }
    return null;
  }

  latestAt() { const r = this.db.prepare('SELECT MAX(t) t FROM exports').get(); return (r && r.t) || 0; }

  // Wealth change over a play session (Marcel, Nov 2026): from the first export IN the session, so market moves
  // and trades between sessions never show up as this session's profit or loss.
  // end: the first export up to 30 minutes after the session (you often export after closing the game), else the last one in it.
  // breaks: [{ t, ms }] — only the part of a break inside the measured stretch is taken off the play time.
  // Only exports that count (status 'ok'). → { divines, perHour, from, to } or null until there are two in the session.
  sessionChange(start, end, breaks = []) {
    const base = this.db.prepare("SELECT t, chaos, div_price FROM exports WHERE t >= ? AND t <= ? AND status = 'ok' ORDER BY t ASC LIMIT 1").get(start, end);
    const last = this.db.prepare("SELECT t, chaos, div_price FROM exports WHERE t > ? AND t <= ? AND status = 'ok' ORDER BY t ASC LIMIT 1").get(end, end + 30 * 60e3)
      || this.db.prepare("SELECT t, chaos, div_price FROM exports WHERE t <= ? AND status = 'ok' ORDER BY t DESC LIMIT 1").get(end);
    if (!base || !last || last.t <= base.t) return null;
    const div = last.div_price || base.div_price;
    if (!div) return null;
    const divines = (last.chaos - base.chaos) / div;
    const a = base.t, b = Math.min(last.t, end);
    let off = 0;
    for (const br of breaks || []) off += Math.max(0, Math.min(b, br.t + (br.ms || 0)) - Math.max(a, br.t));
    const ms = b - a - off;
    return { divines, perHour: ms >= 10 * 60e3 ? divines / (ms / 3600e3) : null, from: base.t, to: last.t };
  }

  // The export waiting for "on purpose?": { id, t, chaos, items, missing: [tab], added: [tab] } or null.
  pendingExport() {
    const r = this.db.prepare("SELECT id, t, chaos, tabs, items FROM exports WHERE status = 'pending' ORDER BY t DESC LIMIT 1").get();
    if (!r) return null;
    const prev = this.db.prepare("SELECT tabs FROM exports WHERE status = 'ok' AND t <= ? ORDER BY t DESC LIMIT 1").get(r.t);
    const d = tabDiff(prev ? Object.keys(JSON.parse(prev.tabs)) : [], Object.keys(JSON.parse(r.tabs)));
    return { id: r.id, t: r.t, chaos: r.chaos, items: r.items, ...d };
  }

  // keep = true: on purpose, the export is complete and counts (its tabs are the new normal). false: dropped.
  resolve(id, keep) {
    const r = this.db.prepare("UPDATE exports SET status = ? WHERE id = ? AND status = 'pending'").run(keep ? 'ok' : 'discarded', id);
    if (r.changes) { this.rev++; this.written += 32; if (this.o.onChange) this.o.onChange(); }
    return r.changes > 0;
  }

  close() { this.stop(); try { this.db.close(); } catch { /* closed */ } }
}

// Tab names that are gone and new, compared with the export before.
function tabDiff(before, now) {
  const a = new Set(before), b = new Set(now);
  return { missing: [...a].filter(x => !b.has(x)).sort(), added: [...b].filter(x => !a.has(x)).sort() };
}

module.exports = { Wealth, readExport, parseCsv, tabDiff };
