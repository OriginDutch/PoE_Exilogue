'use strict';
// League data in SQLite (built into Electron's Node: node:sqlite).
// Why: the old state.json was rewritten in full every few seconds. Here a save only writes what changed:
// new event rows, new map rows, and the few state keys whose value actually differs from the last save.
// Checkpoints (copying the WAL into the main file) are done by us, so every byte written can be counted.
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA = 1;
const META = ['offset', 'file', 'minStamp', 'head']; // where in which Client.txt the saved state ends
const CHECKPOINT_EVERY = 10; // commits (~5 minutes at one commit per 30 s)

function checkFile(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const ok = db.prepare('PRAGMA quick_check').get();
    if (!ok || Object.values(ok)[0] !== 'ok') throw new Error('quick_check failed');
    db.prepare('SELECT COUNT(*) n FROM state').get(); // is it ours?
    db.prepare('SELECT COUNT(*) n FROM events').get();
  } finally { db.close(); }
}

class LeagueDb {
  constructor(file) {
    this.file = file;
    this.corruptFile = null;
    this.io = { db: 0, backup: 0, read: 0 }; // bytes since this object was created; main adds them to the lifetime totals
    this._open();
  }

  _open() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    try {
      if (fs.existsSync(this.file)) checkFile(this.file);
      this.db = this._connect();
    } catch {
      // Unreadable: keep it aside instead of silently starting over on top of it.
      try { this.db && this.db.close(); } catch { /* ignore */ }
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      this.corruptFile = this.file.replace(/\.db$/, `.corrupt-${stamp}.db`);
      for (const ext of ['', '-wal', '-shm']) {
        try { fs.renameSync(this.file + ext, this.corruptFile + ext); } catch { /* missing */ }
      }
      this.db = this._connect();
    }
    this._prepare();
    this.pageSize = this.db.prepare('PRAGMA page_size').get().page_size;
    this.commits = 0;
    // A WAL left by a crash may or may not have been counted already; start counting from a clean slate
    // (after an unclean exit a few minutes of counts can be missing, never doubled).
    this.dirty = false;
    this.ckpt = { log: 0, done: 0, complete: true };
    try { this.checkpoint(); } catch { /* ignore */ }
    this.written = new Map(this.db.prepare('SELECT key, value FROM state').all().map(r => [r.key, r.value]));
  }

  _connect() {
    const db = new DatabaseSync(this.file);
    db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA wal_autocheckpoint = 0;
      CREATE TABLE IF NOT EXISTS state  (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY, t INTEGER NOT NULL, type TEXT NOT NULL, char TEXT, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS events_char ON events (char, seq);
      CREATE TABLE IF NOT EXISTS maps   (id INTEGER PRIMARY KEY AUTOINCREMENT, start INTEGER, mkey TEXT, data TEXT NOT NULL);
    `);
    // Databases from before the map key: add it (old rows keep NULL, which the unique index allows).
    if (!db.prepare('PRAGMA table_info(maps)').all().some(c => c.name === 'mkey')) db.exec('ALTER TABLE maps ADD COLUMN mkey TEXT');
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS maps_key ON maps (mkey)');
    db.prepare("INSERT OR IGNORE INTO state (key, value) VALUES ('schema', ?)").run(String(SCHEMA));
    return db;
  }

  _prepare() {
    const d = this.db;
    this.q = {
      putState: d.prepare('INSERT INTO state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
      delState: d.prepare('DELETE FROM state WHERE key = ?'),
      putEvent: d.prepare('INSERT OR REPLACE INTO events (seq, t, type, char, data) VALUES (?, ?, ?, ?, ?)'),
      putMap: d.prepare('INSERT OR IGNORE INTO maps (start, mkey, data) VALUES (?, ?, ?)'), // a retried save never doubles a map
    };
  }

  // Copies the WAL into the main file and counts what that wrote (WAL frames since the last checkpoint + pages copied).
  checkpoint() {
    const r = this.db.prepare('PRAGMA wal_checkpoint(PASSIVE)').get();
    if (!r || r.log < 0) return;
    if (this.dirty) {
      // After a complete checkpoint, the first write starts the WAL over: its counts start at 0 again.
      const prev = this.ckpt.complete ? { log: 0, done: 0 } : this.ckpt;
      const frames = Math.max(0, r.log - prev.log);
      this.io.db += frames * (this.pageSize + 24) + this._copiedPages(prev.done, r.checkpointed) * this.pageSize;
    }
    this.dirty = false;
    this.ckpt = { log: r.log, done: r.checkpointed, complete: r.busy === 0 && r.checkpointed === r.log };
  }

  // A checkpoint writes each changed page once, however many WAL frames hold it: count distinct page numbers
  // in the frame headers (WAL format: 32-byte header, then per frame a 24-byte header starting with the page number).
  _copiedPages(from, to) {
    if (to <= from) return 0;
    const fsz = this.pageSize + 24;
    let fd;
    try {
      fd = fs.openSync(this.file + '-wal', 'r');
      const pages = new Set(), hdr = Buffer.alloc(4);
      for (let i = from; i < to; i++) {
        if (fs.readSync(fd, hdr, 0, 4, 32 + i * fsz) < 4) break;
        pages.add(hdr.readUInt32BE(0));
      }
      return pages.size;
    } catch { return to - from; } // can't tell: count every frame (upper bound)
    finally { if (fd != null) fs.closeSync(fd); }
  }

  hasData() { for (const k of this.written.keys()) if (k.startsWith('t.')) return true; return false; }
  // Something worth keeping: at least one event or map (a freshly started tracker saves keys, but no content).
  hasContent() {
    try { return !!(this.db.prepare('SELECT 1 FROM events LIMIT 1').get() || this.db.prepare('SELECT 1 FROM maps LIMIT 1').get()); }
    catch { return this.hasData(); }
  }

  // { tracker, offset, file, minStamp, head, maps, tail } — tracker is null when nothing was saved yet.
  load() {
    const get = k => (this.written.has(k) ? JSON.parse(this.written.get(k)) : undefined);
    let tracker = null;
    for (const [k, v] of this.written) {
      if (!k.startsWith('t.')) continue;
      (tracker || (tracker = {}))[k.slice(2)] = JSON.parse(v);
    }
    const maps = this.db.prepare('SELECT data FROM maps ORDER BY id').all().map(r => JSON.parse(r.data));
    const tail = this.db.prepare('SELECT data FROM events ORDER BY seq DESC LIMIT 500').all().map(r => JSON.parse(r.data)).reverse();
    return { tracker, offset: get('offset') || 0, file: get('file') || null, minStamp: get('minStamp') || null, head: get('head') || null, maps, tail };
  }

  // One transaction: meta and state keys that changed, plus the new events and maps. Returns true if anything was written.
  // meta: { offset, file, minStamp, head }
  commit({ tracker, meta = {}, pending }) {
    const rows = META.filter(k => k in meta).map(k => [k, JSON.stringify(meta[k] ?? null)]);
    for (const [k, v] of Object.entries(tracker || {})) if (v !== undefined) rows.push(['t.' + k, JSON.stringify(v)]);
    const changed = rows.filter(([k, v]) => this.written.get(k) !== v);
    const gone = tracker ? [...this.written.keys()].filter(k => k.startsWith('t.') && !(k.slice(2) in tracker)) : [];
    const evs = (pending && pending.events) || [], maps = (pending && pending.maps) || [];
    if (!changed.length && !gone.length && !evs.length && !maps.length) return false;
    this.db.exec('BEGIN');
    try {
      for (const [k, v] of changed) this.q.putState.run(k, v);
      for (const k of gone) this.q.delState.run(k);
      for (const e of evs) this.q.putEvent.run(e.seq, e.t, e.type, e.char || null, JSON.stringify(e));
      for (const m of maps) this.q.putMap.run(m.start ?? null, `${m.start}:${m.seed}:${m.areaId}`, JSON.stringify(m));
      this.db.exec('COMMIT');
    } catch (e) {
      try { this.db.exec('ROLLBACK'); } catch { /* ignore */ }
      throw e;
    }
    for (const [k, v] of changed) this.written.set(k, v);
    for (const k of gone) this.written.delete(k);
    this.dirty = true;
    if (++this.commits % CHECKPOINT_EVERY === 0) {
      try { this.checkpoint(); } catch { /* the data is committed; the copy happens next time */ }
    }
    return true;
  }

  // Events for the Events page, newest first. pending = events not committed yet (merged in).
  // filter: { char: name | 'all', types: [type] | null, limit, before: seq, after: seq }
  // Deaths inside maps (the death event has a tier then) per hour of the day, since `since` (ms). 24 counts.
  deathHours(since, pending = []) {
    const out = new Array(24).fill(0);
    const add = t => { out[new Date(t).getHours()]++; };
    for (const r of this.db.prepare("SELECT t FROM events WHERE type = 'death' AND t >= ? AND json_extract(data, '$.tier') IS NOT NULL").all(since)) add(r.t);
    for (const e of pending) if (e && e.type === 'death' && e.t >= since && e.tier != null) add(e.t);
    return out;
  }

  events({ char = 'all', types = null, limit = 200, before = null, after = null } = {}, pending = []) {
    const base = [], args = [];
    if (char !== 'all') { base.push('char = ?'); args.push(char); }
    if (types && types.length) { base.push(`type IN (${types.map(() => '?').join(',')})`); args.push(...types); }
    const page = base.slice(), pargs = args.slice();
    if (before != null) { page.push('seq < ?'); pargs.push(before); }
    if (after != null) { page.push('seq > ?'); pargs.push(after); }
    const w = a => (a.length ? 'WHERE ' + a.join(' AND ') : '');
    const match = e => (char === 'all' || e.char === char) && (!types || !types.length || types.includes(e.type));
    const inPage = e => match(e) && (before == null || e.seq < before) && (after == null || e.seq > after);
    const extra = pending.filter(inPage).reverse();
    const rows = this.db.prepare(`SELECT data FROM events ${w(page)} ORDER BY seq DESC LIMIT ?`).all(...pargs, limit).map(r => JSON.parse(r.data));
    const total = this.db.prepare(`SELECT COUNT(*) n FROM events ${w(base)}`).get(...args).n + pending.filter(match).length;
    const any = this.db.prepare('SELECT COUNT(*) n FROM events').get().n + pending.length;
    return { rows: extra.concat(rows).slice(0, limit), total, any };
  }

  // Wipe league data (config is not in here).
  clear() {
    this.db.exec("BEGIN; DELETE FROM events; DELETE FROM maps; DELETE FROM state WHERE key <> 'schema'; COMMIT;");
    this.dirty = true;
    this.checkpoint();
    this.written = new Map(this.db.prepare('SELECT key, value FROM state').all().map(r => [r.key, r.value]));
  }

  // Compact consistent copy (works while open). Returns its size.
  backupTo(dest) {
    this.db.prepare('VACUUM INTO ?').run(dest);
    const size = fs.statSync(dest).size;
    this.io.backup += size;
    return size;
  }

  // Replace the live database with a backup copy. The backup is checked and copied next to the live file first,
  // and only then swapped in, so a failure leaves the current data untouched. Always reopens.
  restoreFrom(src) {
    checkFile(src); // throws: nothing has changed yet
    const tmp = this.file + '.restore-tmp';
    const data = fs.readFileSync(src);
    this.io.read += data.length;
    const fd = fs.openSync(tmp, 'w');
    try { fs.writeSync(fd, data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    this.io.db += data.length;
    this.close();
    try {
      for (const ext of ['-wal', '-shm']) { try { fs.unlinkSync(this.file + ext); } catch { /* missing */ } }
      fs.renameSync(tmp, this.file);
    } finally {
      try { fs.unlinkSync(tmp); } catch { /* moved */ }
      this._open();
    }
  }

  close() {
    try { this.checkpoint(); } catch { /* closed already */ }
    try { this.db.close(); } catch { /* already closed */ }
  }
}

module.exports = { LeagueDb, checkFile };
