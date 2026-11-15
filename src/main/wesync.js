'use strict';
// Background Wealthy Exile sync (option B): the userscript in Firefox asks Exilogue every ~10 s
// "should I sync now?" over http://127.0.0.1:47615/we-sync. Exilogue answers yes about every N minutes while you play
// (game running, not away), wherever you are: hideout, town or map. Also yes once right after you press the tile button.
// No WE tab open = nobody asks = no sync. Only localhost; the answer is a single yes/no, nothing else leaves.
const http = require('http');

const PORT = 47615;

// s: { enabled, everyMin, gameRunning, idleMs, now, lastSyncAt, lastExportAt }
function shouldSync(s) {
  if (!s.enabled || !s.gameRunning) return false;
  if (s.idleMs >= 60 * 1000) return false;
  const last = Math.max(s.lastSyncAt || 0, s.lastExportAt || 0);
  return s.now - last >= s.everyMin * 60 * 1000;
}

class WeSyncServer {
  constructor({ decide, onAsk, onFailed }) { this.decide = decide; this.onAsk = onAsk; this.onFailed = onFailed; this.server = null; this.error = null; }
  start() {
    const srv = http.createServer((req, res) => {
      // Only the userscript: it sends X-Exilogue (a web page can't add that header without a CORS preflight we never allow),
      // never an Origin (browsers add one to page requests), and the Host must be ours (no DNS rebinding).
      const ok = req.method === 'GET' && req.headers['x-exilogue'] === '1' && !req.headers.origin &&
        (req.headers.host === `127.0.0.1:${PORT}` || req.headers.host === `localhost:${PORT}`);
      const url = req.url || '';
      if (!ok || !/^\/we-sync(\/failed)?(\?|$)/.test(url)) { res.writeHead(404); res.end(); return; }
      const q = new URLSearchParams(url.split('?')[1] || '');
      if (url.startsWith('/we-sync/failed')) {
        const id = /^\d{1,9}$/.test(q.get('id') || '') ? Number(q.get('id')) : null;
        try { this.onFailed && this.onFailed(id); } catch { /* ignore */ }
        res.writeHead(204); res.end(); return;
      }
      let r = { go: false };
      try {
        const d = this.decide({ busy: q.get('busy') === '1' });
        r = d && typeof d === 'object' ? { go: !!d.go, ...(d.go && d.id ? { id: d.id } : {}) } : { go: !!d };
      } catch { r = { go: false }; }
      try { this.onAsk && this.onAsk(r.go); } catch { /* ignore */ }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(r));
    });
    srv.on('error', e => { this.error = e.code || String(e); });
    srv.listen(PORT, '127.0.0.1');
    srv.unref();
    this.server = srv;
  }
  stop() { if (this.server) { this.server.close(); this.server = null; } }
}

module.exports = { shouldSync, WeSyncServer, PORT };
