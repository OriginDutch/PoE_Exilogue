'use strict';
// The Wealthy Exile steps (same as the userscript, Mantine markup Nov 2026): press sync, wait until it's done,
// then "··· › Export CSV". Sent into the page as text, so it may not use anything from outside the function.
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

module.exports = { pageSync };
