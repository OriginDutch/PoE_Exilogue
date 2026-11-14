'use strict';
// Tiny JSON file store with atomic-ish writes.
const fs = require('fs');
const path = require('path');

class JsonStore {
  constructor(file, defaults) {
    this.file = file;
    this.defaults = defaults;
    this.data = this._load();
    this._timer = null;
  }
  _load() {
    let text;
    try { text = fs.readFileSync(this.file, 'utf8'); } catch { return structuredClone(this.defaults); } // no file yet
    try {
      return deepMerge(structuredClone(this.defaults), JSON.parse(text));
    } catch {
      // Unreadable: keep it aside instead of silently overwriting it with defaults.
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      this.corruptFile = this.file.replace(/\.json$/, `.corrupt-${stamp}.json`);
      try { fs.renameSync(this.file, this.corruptFile); } catch { /* ignore */ }
      return structuredClone(this.defaults);
    }
  }
  // Written to a temp file, flushed to disk, then renamed over the old one: a power cut leaves the old or the new file.
  save() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; } // this write covers a pending one
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    const text = JSON.stringify(this.data, null, 2);
    const fd = fs.openSync(tmp, 'w');
    try { fs.writeSync(fd, text); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(tmp, this.file);
    this.bytesWritten = (this.bytesWritten || 0) + Buffer.byteLength(text);
  }
  // Throttled: at most one write per `ms`, and never postponed forever by a steady stream of changes.
  saveSoon(ms = 2000) {
    if (this._timer) return;
    this._timer = setTimeout(() => { this._timer = null; this.save(); }, ms);
  }
}

function deepMerge(base, extra) {
  for (const [k, v] of Object.entries(extra || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      deepMerge(base[k], v);
    } else {
      base[k] = v;
    }
  }
  return base;
}

module.exports = { JsonStore, deepMerge };
