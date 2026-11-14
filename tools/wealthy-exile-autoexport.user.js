// ==UserScript==
// @name         Exilogue – Wealthy Exile auto export
// @namespace    exilogue
// @version      1.5
// @description  After a sync on Wealthy Exile (yours, started from Exilogue's tile, or Exilogue's background sync while you play), waits until it is done and clicks ··· › Export CSV. Exilogue picks the file up from Downloads.
// @match        https://wealthyexile.com/*
// @match        https://www.wealthyexile.com/*
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// @noframes
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';
  // Runs at document-start: the site's router may rewrite the URL (and drop #exilogue-sync) once it loads,
  // so the marker is remembered for this tab right away.
  const MARK = 'exilogue-sync';
  try {
    if (location.hash === '#' + MARK) { sessionStorage.setItem(MARK, String(Date.now())); history.replaceState(null, '', location.pathname + location.search); }
  } catch { /* storage blocked */ }
  console.log('[Exilogue] userscript loaded on', location.href);
  // Wealthy Exile is built with Mantine (Nov 2026 markup):
  //  - "···" button: <button aria-label="more …"> with <svg class="tabler-icon-dots">
  //  - its menu: <a download="Wealthy-Exile-export-…" href="blob:…"><button role="menuitem">… Export CSV</button></a>
  //  - sync button: the small button right after the "Synced … ago" text
  // Sync is done when the sync button stops loading (Mantine sets data-loading / disabled while busy), or, as a
  // fallback, when the label reads "Synced just now / a few seconds ago".
  const FRESH = /Synced\s+(just now|a few seconds|less than a minute|\d{1,2} seconds?)\b/i;
  const WAIT_MS = 3 * 60 * 1000;
  let busy = false;

  const log = (...a) => console.log('[Exilogue]', ...a);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const visible = el => !!(el && el.getClientRects().length);

  // The element showing "Synced … ago" (may contain child spans), and the button next to it.
  function syncedLabel() {
    for (const el of document.querySelectorAll('span,div,p,small')) {
      const t = (el.textContent || '').trim();
      if (t.length < 40 && /^Synced\b/i.test(t) && visible(el) && !el.querySelector('button')) return el;
    }
    return null;
  }
  function syncButton() {
    const label = syncedLabel();
    if (!label) return null;
    // Only look close by: the label's own siblings, or its parent's (one level up).
    for (const scope of [label, label.parentElement]) {
      for (let s = scope && scope.nextElementSibling; s; s = s.nextElementSibling) {
        const b = s.matches('button') ? s : s.querySelector('button');
        if (b) return b;
      }
    }
    return null;
  }
  const isLoading = b => !!(b && (b.disabled || b.hasAttribute('data-loading') || b.getAttribute('aria-busy') === 'true' || b.querySelector('[class*="loader" i]')));

  function moreButton() {
    for (const b of document.querySelectorAll('button')) {
      const label = (b.getAttribute('aria-label') || '').toLowerCase();
      if (visible(b) && (label.startsWith('more') || b.querySelector('svg.tabler-icon-dots'))) return b;
    }
    return null;
  }
  function exportItem() {
    for (const el of document.querySelectorAll('[role="menuitem"]')) {
      if (/^\s*Export CSV\s*$/i.test((el.querySelector('[data-menu-item-label]') || el).textContent || '') && visible(el)) return el;
    }
    return null;
  }

  function toast(msg) {
    const d = document.createElement('div');
    d.textContent = msg;
    d.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:99999;background:#111927;color:#e9eef5;border:1px solid #31425f;padding:10px 14px;border-radius:8px;font:14px sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.5)';
    (document.body || document.documentElement).appendChild(d);
    setTimeout(() => d.remove(), 5000);
  }
  async function waitFor(fn, ms) {
    const end = Date.now() + ms;
    while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(400); }
    return null;
  }

  async function exportAfterSync(btn) {
    busy = true;
    try {
      log('sync clicked, waiting for it to finish…');
      // 1) did the button go into its loading state? (give it a moment to start)
      const started = await waitFor(() => isLoading(btn) || isLoading(syncButton()), 5000);
      // 2) wait until it's done: loading gone and the label says it just synced
      const done = await waitFor(() => {
        const b = syncButton() || btn;
        const l = syncedLabel();
        const fresh = l && FRESH.test(l.textContent || '');
        return started ? (!isLoading(b) && fresh) : fresh;
      }, WAIT_MS);
      if (!done) { toast('Exilogue: sync not confirmed, no export'); return false; }
      await sleep(1500); // let the table refresh
      const more = moreButton();
      if (!more) { toast('Exilogue: ··· button not found'); return false; }
      more.click();
      const item = await waitFor(exportItem, 5000);
      if (!item) { toast('Exilogue: "Export CSV" not found'); return false; }
      item.click(); // inside <a download href="blob:…">: the click starts the download
      log('exported');
      toast('Exilogue: CSV exported ✓');
      return true;
    } finally { busy = false; }
  }

  // In-site link to the stash page (an <a href="/stash">, or a menu entry called "Stash").
  function stashLink() {
    for (const a of document.querySelectorAll('a[href]')) {
      try { if (/^\/stash\/?$/.test(new URL(a.href, location.href).pathname) && visible(a)) return a; } catch { /* ignore */ }
    }
    for (const el of document.querySelectorAll('a,button,[role="tab"],[role="link"]')) {
      if (/^\s*Stash\s*$/i.test(el.textContent || '') && visible(el)) return el;
    }
    return null;
  }

  // Opened from Exilogue's tile (…/stash#exilogue-sync): press sync ourselves, then export.
  async function syncFromExilogue() {
    try { sessionStorage.removeItem(MARK); } catch { /* ignore */ } // a reload must not sync again
    toast('Exilogue: waiting for the stash page…');
    // A direct link to /stash lands on the home page: go to the stash page the way a click in the site would.
    if (!/\/stash\b/.test(location.pathname)) {
      const link = await waitFor(stashLink, 20000);
      if (link) link.click();
    }
    const btn = await waitFor(syncButton, 45000); // the stash page loads its data first (and maybe a login)
    if (!btn) { toast('Exilogue: sync button not found (open the Stash page, then try again)'); return false; }
    if (isLoading(btn)) { toast('Exilogue: sync not available right now (Wealthy Exile cooldown?)'); return false; }
    btn.click();
    return exportAfterSync(btn);
  }
  // Background sync: once a minute, ask Exilogue (on this PC only) whether now is a good moment.
  // It says yes at most every 30 minutes, between maps, while the game runs. Exilogue not running = no answer = nothing happens.
  function askExilogue() {
    if (busy || typeof GM_xmlhttpRequest !== 'function') return;
    GM_xmlhttpRequest({
      method: 'GET', url: 'http://127.0.0.1:47615/we-sync', timeout: 5000, headers: { 'X-Exilogue': '1' },
      onload: r => {
        let go = false;
        try { go = JSON.parse(r.responseText).go === true; } catch { /* not Exilogue */ }
        if (go && !busy) {
          log('background sync requested by Exilogue');
          syncFromExilogue().then(ok => { if (!ok) GM_xmlhttpRequest({ method: 'GET', url: 'http://127.0.0.1:47615/we-sync/failed', headers: { 'X-Exilogue': '1' } }); });
        }
      },
    });
  }

  const start = () => {
    setTimeout(askExilogue, 5000);
    setInterval(askExilogue, 60 * 1000);
    let at = 0;
    try { at = Number(sessionStorage.getItem(MARK) || 0); } catch { /* ignore */ }
    if (at && Date.now() - at < 120000) syncFromExilogue();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();

  // Only clicks on the sync button start it; the script's own clicks are ignored while busy.
  document.addEventListener('click', e => {
    if (busy || !e.isTrusted) return;
    const btn = e.target.closest && e.target.closest('button');
    if (!btn) return;
    const sync = syncButton();
    if (sync && btn === sync) exportAfterSync(sync);
  }, true);
})();
