'use strict';
// Built-in Wealthy Exile (experiment): Exilogue opens wealthyexile.com in its own window with its own, persistent
// login (separate from any browser), presses sync, waits, then "··· › Export CSV". The CSV download is saved straight
// into the Downloads folder Exilogue already watches, so the existing import picks it up.
// No browser, extension or userscript needed. Same DOM steps as the userscript (Mantine markup, Nov 2026).
const { BrowserWindow, session, shell } = require('electron');
const path = require('path');

const PARTITION = 'persist:wealthyexile';
const HOME = 'https://wealthyexile.com/stash';
const ALLOWED = /(^|\.)(wealthyexile\.com|pathofexile\.com|steamcommunity\.com|steampowered\.com)$/i; // the site and the PoE (or Steam) login
const EXPORT_NAME = /^Wealthy-Exile-export-.*\.csv$/i;

// Runs inside the page (main world). Returns { ok, step, log: [] }. Kept free of outside variables: it is sent as text.
function pageSync() {
  const out = [];
  const log = m => { out.push(m); console.log('[Exilogue] ' + m); };
  const FRESH = /Synced\s+(just now|a few seconds|less than a minute|\d{1,2} seconds?)\b/i;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const visible = el => !!(el && el.getClientRects().length);
  const waitFor = async (fn, ms) => { const end = Date.now() + ms; while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(400); } return null; };
  const syncedLabel = () => {
    for (const el of document.querySelectorAll('span,div,p,small')) {
      const t = (el.textContent || '').trim();
      if (t.length < 40 && /^Synced\b/i.test(t) && visible(el) && !el.querySelector('button')) return el;
    }
    return null;
  };
  const syncButton = () => {
    const label = syncedLabel();
    if (!label) return null;
    for (const scope of [label, label.parentElement]) {
      for (let s = scope && scope.nextElementSibling; s; s = s.nextElementSibling) {
        const b = s.matches('button') ? s : s.querySelector('button');
        if (b) return b;
      }
    }
    return null;
  };
  const isLoading = b => !!(b && (b.disabled || b.hasAttribute('data-loading') || b.getAttribute('aria-busy') === 'true' || b.querySelector('[class*="loader" i]')));
  const moreButton = () => {
    for (const b of document.querySelectorAll('button')) {
      const l = (b.getAttribute('aria-label') || '').toLowerCase();
      if (visible(b) && (l.startsWith('more') || b.querySelector('svg.tabler-icon-dots'))) return b;
    }
    return null;
  };
  const exportItem = () => {
    for (const el of document.querySelectorAll('[role="menuitem"]')) {
      if (/^\s*Export CSV\s*$/i.test((el.querySelector('[data-menu-item-label]') || el).textContent || '') && visible(el)) return el;
    }
    return null;
  };
  const stashLink = () => {
    for (const a of document.querySelectorAll('a[href]')) {
      try { if (/^\/stash\/?$/.test(new URL(a.href, location.href).pathname) && visible(a)) return a; } catch { /* ignore */ }
    }
    return null;
  };
  return (async () => {
    log('page: ' + location.href);
    if (!/\/stash\b/.test(location.pathname)) {
      const link = await waitFor(stashLink, 15000);
      log(link ? 'Stash link found, clicking' : 'no Stash link (logged out?)');
      if (!link) return { ok: false, step: 'stash', log: out };
      link.click();
    }
    const btn = await waitFor(syncButton, 45000);
    if (!btn) { log('sync button not found (logged out, or the page changed)'); return { ok: false, step: 'sync-button', log: out }; }
    if (isLoading(btn)) { log('sync button busy/disabled (Wealthy Exile cooldown?)'); return { ok: false, step: 'cooldown', log: out }; }
    log('sync button found, clicking');
    btn.click();
    const started = await waitFor(() => isLoading(btn) || isLoading(syncButton()), 5000);
    const done = await waitFor(() => {
      const b = syncButton() || btn, l = syncedLabel();
      const fresh = l && FRESH.test(l.textContent || '');
      return started ? (!isLoading(b) && fresh) : fresh;
    }, 3 * 60 * 1000);
    if (!done) { log('sync not confirmed within 3 min'); return { ok: false, step: 'sync-wait', log: out }; }
    log('synced');
    await sleep(1500);
    const more = moreButton();
    if (!more) { log('··· button not found'); return { ok: false, step: 'more', log: out }; }
    more.click();
    const item = await waitFor(exportItem, 5000);
    if (!item) { log('"Export CSV" not found'); return { ok: false, step: 'export', log: out }; }
    item.click();
    log('Export CSV clicked');
    return { ok: true, step: 'done', log: out };
  })();
}

class WeBrowser {
  // opts: { downloads (folder Exilogue watches), onExport(file) }
  constructor(opts) {
    this.o = opts;
    this.win = null;
    this.busy = false;
    this.ses = session.fromPartition(PARTITION);
    // A plain Chrome user agent: some login pages refuse ones that say "Electron".
    this.ses.setUserAgent(this.ses.getUserAgent().replace(/\s(Electron|Exilogue|exilogue)\/\S+/g, ''));
    this.ses.on('will-download', (_e, item) => {
      const name = item.getFilename();
      if (!EXPORT_NAME.test(name)) { item.cancel(); return; } // only the export, nothing else
      const file = path.join(this.o.downloads, name);
      item.setSavePath(file);
      item.once('done', (_ev, state) => { if (state === 'completed' && this.o.onExport) this.o.onExport(file); });
    });
  }

  _create(show) {
    if (this.win && !this.win.isDestroyed()) return this.win;
    this.win = new BrowserWindow({
      width: 1280, height: 860, show, title: 'Wealthy Exile · Exilogue', autoHideMenuBar: true,
      webPreferences: { partition: PARTITION, contextIsolation: true, sandbox: true, nodeIntegration: false },
    });
    const wc = this.win.webContents;
    // The site and the PoE account login stay inside; anything else opens in the normal browser.
    wc.setWindowOpenHandler(({ url }) => {
      let host = '';
      try { host = new URL(url).hostname; } catch { /* bad url */ }
      if (ALLOWED.test(host)) return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, webPreferences: { partition: PARTITION, contextIsolation: true, sandbox: true } } };
      if (/^https:/i.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
    wc.on('will-navigate', (e, url) => {
      let host = '';
      try { host = new URL(url).hostname; } catch { /* bad url */ }
      if (!ALLOWED.test(host)) { e.preventDefault(); if (/^https:/i.test(url)) shell.openExternal(url); }
    });
    this.win.on('closed', () => { this.win = null; });
    this.win.loadURL(HOME);
    return this.win;
  }

  // Shown, so you can log in (once; the login is kept in Exilogue's own storage).
  open() {
    const w = this._create(true);
    if (!w.isVisible()) w.show();
    w.focus();
  }

  // Sync + export in the built-in window (shown during the test, so you can watch it).
  async syncExport({ show = true } = {}) {
    if (this.busy) return { ok: false, step: 'busy', log: ['already running'] };
    this.busy = true;
    try {
      const w = this._create(show);
      if (show && !w.isVisible()) w.show();
      const wc = w.webContents;
      if (wc.isLoading()) await new Promise(r => wc.once('did-stop-loading', r));
      if (!/wealthyexile\.com/i.test(wc.getURL())) { await w.loadURL(HOME); }
      const r = await wc.executeJavaScript('(' + pageSync.toString() + ')()', true);
      return r && typeof r === 'object' ? { ok: !!r.ok, step: String(r.step || ''), log: Array.isArray(r.log) ? r.log.map(String).slice(0, 30) : [] } : { ok: false, step: 'no-result', log: [] };
    } catch (e) {
      return { ok: false, step: 'error', log: [String(e && e.message || e).slice(0, 200)] };
    } finally { this.busy = false; }
  }

  // Forget the login (clears only this window's own storage).
  async logout() {
    if (this.win && !this.win.isDestroyed()) this.win.destroy();
    await this.ses.clearStorageData();
  }
}

module.exports = { WeBrowser, PARTITION };
