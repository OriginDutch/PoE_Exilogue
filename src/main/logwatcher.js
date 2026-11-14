'use strict';
// Follows Client.txt: catch-up read from a byte offset (one chunk per tick, so the app stays responsive),
// then polls for appended bytes. Offsets are byte-exact: partial lines are kept as raw bytes.
// The file's first line identifies it, so a deleted-and-recreated Client.txt is noticed even when it has grown
// past the old offset. Reading from the start skips straight to the league start (binary search on timestamps).
const fs = require('fs');
const { EventEmitter } = require('events');

const CHUNK = 1024 * 1024;
const STAMP = /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}/;

class LogWatcher extends EventEmitter {
  // opts: { file, offset, minStamp, head }  minStamp = "YYYY/MM/DD HH:MM:SS"; older lines are skipped.
  // head = first line of the file the offset belongs to (null: unknown).
  constructor(opts) {
    super();
    this.file = opts.file;
    this.offset = opts.offset || 0; // bytes consumed (including the pending partial line)
    this.minStamp = opts.minStamp || null;
    this.head = opts.head || null;
    this.rest = Buffer.alloc(0);    // bytes of an unfinished last line
    this.buf = Buffer.allocUnsafe(CHUNK); // reused read buffer
    this.timer = null;
    this.busy = false;
    this.stopped = false;
    this.checkHead = true;          // on start and after the file was missing
    this.bytesRead = 0;
  }

  start(intervalMs = 750) {
    this.stop();
    this.stopped = false;
    this.timer = setInterval(() => this._poll(), intervalMs);
    this._poll(); // may stop() us synchronously (listeners), so the timer must exist first
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  _read(fd, len, pos) {
    const n = fs.readSync(fd, this.buf, 0, Math.min(len, CHUNK), pos);
    this.bytesRead += n;
    return this.buf.subarray(0, n);
  }

  // First line of the file, or null while it has no complete line yet.
  _firstLine() {
    const fd = fs.openSync(this.file, 'r');
    try {
      const b = this._read(fd, 512, 0);
      const nl = b.indexOf(0x0a);
      return nl < 0 ? null : b.subarray(0, nl).toString('utf8').replace(/\r$/, '');
    } finally { fs.closeSync(fd); }
  }

  // Byte offset of a line start at or before the first line >= minStamp. Assumes the log is in time order;
  // lines before minStamp are filtered anyway, so landing a bit early is harmless.
  _seek(size) {
    if (!this.minStamp || size < 4 * CHUNK) return 0;
    const fd = fs.openSync(this.file, 'r');
    try {
      const lineAt = pos => { // first complete line starting after pos: { start, stamp }
        const b = this._read(fd, 8192, pos);
        let i = 0;
        if (pos > 0) { i = b.indexOf(0x0a) + 1; if (i <= 0) return null; }
        while (i < b.length) {
          const nl = b.indexOf(0x0a, i);
          if (nl < 0) return null;
          const s = b.subarray(i, Math.min(nl, i + 19)).toString('latin1');
          if (STAMP.test(s)) return { start: pos + i, stamp: s };
          i = nl + 1;
        }
        return null;
      };
      let lo = 0, hi = size;
      while (hi - lo > 65536) {
        const mid = Math.floor((lo + hi) / 2);
        const r = lineAt(mid);
        if (r && r.stamp < this.minStamp && r.start < hi) lo = r.start;
        else hi = mid;
      }
      return lo;
    } finally { fs.closeSync(fd); }
  }

  _restart(size) {
    this.offset = this._seek(size);
    this.rest = Buffer.alloc(0);
  }

  _poll() {
    if (this.busy || this.stopped) return;
    let size;
    try { size = fs.statSync(this.file).size; } catch (e) { this.checkHead = true; this.emit('missing', e); return; }
    try {
      // Truncated in place (or replaced by a smaller file): start over, and learn the new first line.
      if (size < this.offset) { this.offset = 0; this.rest = Buffer.alloc(0); this.checkHead = true; }
      if (this.checkHead) {
        const first = this._firstLine();
        if (first != null) {
          this.checkHead = false;
          if (this.head && first !== this.head && this.offset > 0) { this.emit('replaced'); this.offset = 0; }
          if (first !== this.head) { this.head = first; this.emit('head', first); }
          this.rest = this.offset === 0 ? Buffer.alloc(0) : this.rest; // never glue an old half-line onto a new file
        }
      }
      if (this.offset === 0 && this.rest.length === 0) this._restart(size);
    } catch (e) { this.emit('error', e); return; }
    if (size === this.offset) { this.emit('idle'); return; }
    this.busy = true;
    const target = size;
    const catchingUp = target - this.offset > CHUNK;
    if (catchingUp) this.emit('catchup', { from: this.offset, to: target });
    this._readStep(target, catchingUp);
  }

  _readStep(target, catchingUp) {
    if (this.stopped) { this.busy = false; return; }
    try {
      const fd = fs.openSync(this.file, 'r');
      let chunk;
      try { chunk = this._read(fd, target - this.offset, this.offset); } finally { fs.closeSync(fd); }
      const n = chunk.length;
      if (n <= 0) { this.busy = false; return; }
      this.offset += n;
      const buf = Buffer.concat([this.rest, chunk]); // copies: the read buffer is reused
      const nl = buf.lastIndexOf(0x0a);
      if (nl >= 0) {
        this.rest = Buffer.from(buf.subarray(nl + 1));
        const lines = buf.subarray(0, nl + 1).toString('utf8').split(/\r?\n/);
        lines.pop(); // empty after the final newline
        const keep = this.minStamp ? lines.filter(l => l.slice(0, 19) >= this.minStamp) : lines;
        if (keep.length) this.emit('lines', keep);
      } else {
        this.rest = buf;
      }
      // Byte offset of the last complete line, after every chunk, so saved stats and offset always match.
      this.emit('offset', this.offset - this.rest.length);
      if (this.offset < target) {
        if (catchingUp) this.emit('progress', { at: this.offset, to: target });
        setImmediate(() => this._readStep(target, catchingUp));
        return;
      }
      this.emit('done');
      this.busy = false;
    } catch (e) {
      this.busy = false;
      this.emit('error', e);
    }
  }
}

module.exports = { LogWatcher };
