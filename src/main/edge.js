'use strict';
// Wealthy Exile through Microsoft Edge (experiment). Edge is on every Windows PC. Exilogue starts it as a normal
// browser with its own separate profile and the browser's official remote-debugging port, you log in yourself once
// in that window (any Cloudflare check you do yourself, as in any browser), and Exilogue then presses sync and
// "Export CSV" over the DevTools protocol: the same steps as the userscript, without an extension.
// Chrome and Edge only allow debugging a profile of its own, so this never touches your normal browser profile.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { pageSync } = require('./wepage');

const HOME = 'https://wealthyexile.com/stash';
// A tab really on wealthyexile.com (the host, not the URL text: the PoE login URL contains "client_id=wealthyexile").
const isWeTab = t => { try { return t.type === 'page' && /(^|\.)wealthyexile\.com$/i.test(new URL(t.url).hostname); } catch { return false; } };
const pickWeTab = list => { const we = list.filter(isWeTab); return we.find(t => /\/stash\b/.test(t.url)) || we[0] || null; };

function findEdge() {
  const roots = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(Boolean);
  for (const r of roots) {
    const p = path.join(r, 'Microsoft', 'Edge', 'Application', 'msedge.exe');
    if (fs.existsSync(p)) return p;
  }
  return null;
}

const getJson = (port, p) => new Promise((resolve, reject) => {
  const req = http.get({ host: '127.0.0.1', port, path: p, timeout: 3000 }, res => {
    let b = '';
    res.on('data', d => { b += d; });
    res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
  });
  req.on('error', reject);
  req.on('timeout', () => req.destroy(new Error('timeout')));
});

// One DevTools-protocol call over a websocket (Node's built-in WebSocket).
function cdp(wsUrl, calls) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const results = [];
    const timer = setTimeout(() => { try { ws.close(); } catch { /* closed */ } reject(new Error('DevTools timeout')); }, 5 * 60 * 1000);
    const next = () => {
      if (id >= calls.length) { clearTimeout(timer); ws.close(); resolve(results); return; }
      const c = calls[id];
      ws.send(JSON.stringify({ id: ++id, method: c.method, params: c.params || {} }));
    };
    ws.addEventListener('open', next);
    ws.addEventListener('message', ev => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.id !== id) return; // events
      if (m.error) { clearTimeout(timer); ws.close(); reject(new Error(m.error.message || 'DevTools error')); return; }
      results.push(m.result);
      next();
    });
    ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('DevTools connection failed')); });
  });
}

class EdgeWe {
  // opts: { profileDir, downloads }
  constructor(opts) { this.o = opts; this.busy = false; }

  _port() {
    try { return Number(fs.readFileSync(path.join(this.o.profileDir, 'DevToolsActivePort'), 'utf8').split(/\r?\n/)[0]) || null; } catch { return null; }
  }
  async _alive() {
    const port = this._port();
    if (!port) return null;
    try { await getJson(port, '/json/version'); return port; } catch { return null; }
  }

  // Starts Edge with its own profile on wealthyexile.com (or brings the page up if it already runs).
  async open() {
    const exe = findEdge();
    if (!exe) return { ok: false, step: 'no-edge', log: ['Microsoft Edge was not found.'] };
    fs.mkdirSync(this.o.profileDir, { recursive: true });
    if (await this._alive()) {
      spawn(exe, [`--user-data-dir=${this.o.profileDir}`, HOME], { detached: true, stdio: 'ignore' }).unref();
      return { ok: true, step: 'open', log: ['Edge was already running; opened Wealthy Exile.'] };
    }
    try { fs.unlinkSync(path.join(this.o.profileDir, 'DevToolsActivePort')); } catch { /* none */ }
    spawn(exe, [`--user-data-dir=${this.o.profileDir}`, '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check', HOME],
      { detached: true, stdio: 'ignore' }).unref();
    for (let i = 0; i < 40; i++) { if (await this._alive()) return { ok: true, step: 'open', log: ['Edge started with its own Exilogue profile.'] }; await new Promise(r => setTimeout(r, 250)); }
    return { ok: false, step: 'no-port', log: ['Edge started, but its debugging port did not answer.'] };
  }

  async syncExport() {
    if (this.busy) return { ok: false, step: 'busy', log: ['already running'] };
    this.busy = true;
    const log = [];
    try {
      let port = await this._alive();
      if (!port) {
        const r = await this.open();
        log.push(...r.log);
        if (!r.ok) return { ok: false, step: r.step, log };
        port = await this._alive();
        await new Promise(r2 => setTimeout(r2, 4000)); // let the page load
      }
      const ver = await getJson(port, '/json/version');
      // Downloads (the CSV) into the folder Exilogue watches, without a "save as" question.
      await cdp(ver.webSocketDebuggerUrl, [{ method: 'Browser.setDownloadBehavior', params: { behavior: 'allow', downloadPath: this.o.downloads } }]);
      const list = await getJson(port, '/json/list');
      let page = pickWeTab(list);
      if (!page) {
        log.push('no Wealthy Exile tab: opening one');
        spawn(findEdge(), [`--user-data-dir=${this.o.profileDir}`, HOME], { detached: true, stdio: 'ignore' }).unref();
        await new Promise(r => setTimeout(r, 5000));
        page = pickWeTab(await getJson(port, '/json/list'));
        if (!page) return { ok: false, step: 'no-tab', log: [...log, 'could not find the Wealthy Exile tab'] };
      }
      log.push('tab: ' + page.url);
      const [res] = await cdp(page.webSocketDebuggerUrl, [{ method: 'Runtime.evaluate', params: { expression: '(' + pageSync.toString() + ')()', awaitPromise: true, returnByValue: true } }]);
      const v = res && res.result && res.result.value;
      if (!v || typeof v !== 'object') return { ok: false, step: 'no-result', log: [...log, res && res.exceptionDetails ? String(res.exceptionDetails.text || 'error in page') : 'no answer from the page'] };
      return { ok: !!v.ok, step: String(v.step || ''), log: [...log, ...(Array.isArray(v.log) ? v.log.map(String) : [])].slice(0, 40) };
    } catch (e) {
      return { ok: false, step: 'error', log: [...log, String(e && e.message || e).slice(0, 200)] };
    } finally { this.busy = false; }
  }
}

module.exports = { EdgeWe, findEdge };
