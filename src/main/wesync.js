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
  // script(): the userscript text Exilogue ships (served at /exilogue.user.js).
  constructor({ decide, onAsk, onFailed, script }) { this.decide = decide; this.onAsk = onAsk; this.onFailed = onFailed; this.script = script; this.server = null; this.error = null; }
  start() {
    const srv = http.createServer((req, res) => {
      // Only the userscript: it sends X-Exilogue (a web page can't add that header without a CORS preflight we never allow),
      // never an Origin (browsers add one to page requests), and the Host must be ours (no DNS rebinding).
      const ok = req.method === 'GET' && req.headers['x-exilogue'] === '1' && !req.headers.origin &&
        (req.headers.host === `127.0.0.1:${PORT}` || req.headers.host === `localhost:${PORT}`);
      const url = req.url || '';
      const hostOk = req.headers.host === `127.0.0.1:${PORT}` || req.headers.host === `localhost:${PORT}`;
      // The userscript itself, for installing and for Tampermonkey's update check (a normal browser visit, so no
      // X-Exilogue header). Only the script text: nothing about you or Exilogue's state.
      // Sec-Fetch-Dest: a web page embedding this (<script>, <img>, <iframe>…) is turned away, so its load/error event
      // can't tell a site that Exilogue is installed. Opening the address (document) and Tampermonkey's own
      // install/update requests (empty, or no header) still work. A page's fetch() only gets an opaque answer either way.
      const dest = req.headers['sec-fetch-dest'];
      const fromPage = !!dest && dest !== 'document' && dest !== 'empty';
      if (req.method === 'GET' && hostOk && /^\/exilogue\.user\.js(\?|$)/.test(url) && this.script && !fromPage) {
        let body = '';
        try { body = this.script(); } catch { body = ''; }
        if (!body) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(body);
        return;
      }
      if (!ok || !/^\/we-sync(\/failed)?(\?|$)/.test(url)) { res.writeHead(404); res.end(); return; }
      const ver = String(req.headers['x-exilogue-script'] || '').slice(0, 20);
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
      try { this.onAsk && this.onAsk(r.go, /^\d+(\.\d+){0,3}$/.test(ver) ? ver : null); } catch { /* ignore */ }
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
