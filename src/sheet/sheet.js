'use strict';
// Cheat-sheet window: your sheets as tabs; per item its picture and its price next to the chaos or divine picture.
// Price = your own value when you set one, otherwise poe.ninja. Views: ratio (1 : 5.5 or 3.5 : 1), each (= 0.29), stack (10× = 2.9).
(function () {
  const E = window.EX, ej = window.ej;
  const appEl = document.getElementById('app'), bodyEl = document.getElementById('body'), footEl = document.getElementById('foot');
  const tabsEl = appEl.querySelector('.sh-tabs'), pinEl = appEl.querySelector('[data-act="pin"]'), sortEl = appEl.querySelector('[data-act="sort"]');
  const st = { cfg: null, snap: null, icons: {} };

  const SVG = {
    min: '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1 5h8" stroke="currentColor" stroke-width="1.2"/></svg>',
    close: '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" stroke-width="1.2"/></svg>',
    sort: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3h12M2 7h9M2 11h6M2 15h3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    pin: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M9.8 1.5l4.7 4.7-1.6.5-2.6 2.6-.4 3.2-1.1 1.1-2.6-2.6-3.4 3.4-.9-.1-.1-.9 3.4-3.4-2.6-2.6 1.1-1.1 3.2-.4 2.6-2.6z" fill="currentColor"/></svg>',
  };
  appEl.querySelector('[data-win="min"]').innerHTML = SVG.min;
  appEl.querySelector('[data-win="close"]').innerHTML = SVG.close;
  pinEl.innerHTML = SVG.pin;
  sortEl.innerHTML = SVG.sort;

  // Two decimals at most (Marcel's ask); very small values keep two significant digits so they don't read as 0.
  const fmt = v => {
    if (v == null || !Number.isFinite(v)) return '–';
    const d = v >= 0.01 ? 2 : Math.min(6, 1 - Math.floor(Math.log10(v)));
    return v.toLocaleString('en-US', { maximumFractionDigits: d });
  };
  const img = (src, alt) => (src ? `<img src="${E.esc(src)}" alt="${E.esc(alt)}">` : `<span class="sh-noimg" aria-hidden="true"></span>`);

  function applyConfig(c) {
    st.cfg = c;
    const u = c.ui;
    const dark = u.theme === 'dark' || (u.theme === 'system' && c.systemDark);
    appEl.className = `app win t-${dark ? u.darkPalette : u.lightPalette} f-${u.font}`;
    document.documentElement.classList.toggle('no-motion', !u.motion);
    const pin = !!c.sheets.win.pin;
    pinEl.setAttribute('aria-pressed', String(pin));
    pinEl.setAttribute('aria-label', pin ? 'Always on top: on' : 'Always on top: off');
    pinEl.title = pin ? 'Always on top (on)' : 'Always on top';
    render();
  }

  // Only touch what changed: rebuilding the tabs every update would drop keyboard focus, and a rebuilt
  // footer would make screen readers repeat it.
  const last = new WeakMap();
  const put = (el, html) => { if (last.get(el) !== html) { last.set(el, html); el.innerHTML = html; } };

  function render() {
    if (!st.cfg) return;
    const sh = st.cfg.sheets;
    const active = sh.list.find(x => x.id === sh.active) || sh.list[0];
    const focusTab = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.tab : null;
    put(tabsEl, sh.list.map(x => `<button role="tab" id="tab-${x.id}" data-tab="${x.id}" aria-selected="${x === active}" tabindex="${x === active ? 0 : -1}">${E.esc(x.name)}</button>`).join(''));
    if (focusTab && document.activeElement === document.body) { const f = tabsEl.querySelector(`[data-tab="${focusTab}"]`); if (f) f.focus(); }
    if (!active) {
      sortEl.disabled = true;
      put(bodyEl, '<div class="sh-empty"><b>No cheat sheets yet</b><span class="sub">Make one in Exilogue: Tools › Cheat sheets.</span></div>');
      put(footEl, '');
      return;
    }
    bodyEl.setAttribute('aria-labelledby', 'tab-' + active.id);
    const byValue = active.sort === 'value';
    sortEl.disabled = false;
    sortEl.setAttribute('aria-pressed', String(byValue));
    sortEl.setAttribute('aria-label', byValue ? 'Sorted by value, highest first. Switch to your own order' : 'Your own order. Sort by value, highest first');
    sortEl.title = byValue ? 'Sorted by value (click for your own order)' : 'Sort by value, highest first';
    const info = (st.snap && st.snap.sheets) || { prices: {} };
    const unitIcon = active.unit === 'divine' ? st.icons['cur-divine'] : st.icons['cur-chaos'];
    const unitName = active.unit === 'divine' ? 'Divine Orb' : 'Chaos Orb';
    const perUnit = active.unit === 'divine' ? (info.divineChaos || null) : 1; // chaos per unit
    const rows = active.items.map((it, i) => {
      const k = it.type + ':' + it.id;
      const p = info.prices[k] || {};
      const chaos = it.override != null ? it.override : p.chaos;
      const v = chaos != null && perUnit ? chaos / perUnit : null; // value of one item in the sheet's unit
      return { it, i, v, own: it.override != null, icon: st.icons[(info.iconIds || {})[k]] };
    });
    if (active.sort === 'value') rows.sort((a, b) => (b.v ?? -1) - (a.v ?? -1) || a.i - b.i);

    const unit = `<span class="sh-u" title="${unitName}">${img(unitIcon, unitName)}</span>`;
    const price = r => {
      const view = r.it.view || active.view;
      if (r.v == null) return '<span class="sub">no price</span>';
      const item = `<span class="sh-u" title="${E.esc(r.it.name)}">${img(r.icon, r.it.name)}</span>`;
      if (view === 'each') return `<span class="sh-eq">=</span><b>${fmt(r.v)}</b>${unit}`;
      if (view === 'stack') return `<span class="sh-q">${active.stack}×</span>${item}<span class="sh-eq">=</span><b>${fmt(r.v * active.stack)}</b>${unit}`;
      // ratio: whole numbers on the cheap side, like the in-game exchange (1 : 5.5, or 3.5 : 1)
      return r.v >= 1
        ? `<span class="sh-q">1</span>${item}<span class="sh-eq">:</span><b>${fmt(r.v)}</b>${unit}`
        : `<b>${fmt(1 / r.v)}</b>${item}<span class="sh-eq">:</span><span class="sh-q">1</span>${unit}`;
    };
    put(bodyEl, rows.length
      ? `<ul class="sh-list">${rows.map(r => `<li>
          <span class="sh-ic">${img(r.icon, '')}</span>
          <span class="sh-name"><b>${E.esc(r.it.name)}</b>${r.it.label ? `<span class="sub">${E.esc(r.it.label)}</span>` : ''}</span>
          ${r.own ? '<span class="sh-own" title="Your own value, not poe.ninja">yours</span>' : ''}
          <span class="sh-val" aria-label="${E.esc(r.it.name)}: ${r.v == null ? 'no price' : fmt(r.v) + ' ' + (active.unit === 'divine' ? 'divine' : 'chaos') + ' each'}">${price(r)}</span></li>`).join('')}</ul>`
      : '<div class="sh-empty"><b>This sheet is empty</b><span class="sub">Add items in Exilogue: Tools › Cheat sheets.</span></div>');
    const missing = active.items.some(it => it.override == null && !(info.prices[it.type + ':' + it.id] || {}).chaos);
    const note = active.unit === 'divine' && !info.divineChaos ? '<span class="sub">Waiting for the divine price…</span>'
      : info.partial ? '<span class="sh-warn">Some prices could not be loaded</span>'
      : missing && info.at ? '<span class="sub">Some items have no price</span>' : '';
    put(footEl, `<span>poe.ninja${info.at ? ' · updated ' + E.esc(E.ago(info.at)) : ' · loading…'}</span>` + note);
  }

  // ---- events ----
  appEl.addEventListener('click', e => {
    const w = e.target.closest('[data-win]');
    if (w) { ej.win[w.dataset.win === 'close' ? 'close' : 'min'](); return; }
    if (e.target.closest('[data-act="pin"]')) { ej.sheetPin(!st.cfg.sheets.win.pin); return; }
    if (e.target.closest('[data-act="sort"]')) {
      const sh = st.cfg.sheets.list.find(x => x.id === st.cfg.sheets.active) || st.cfg.sheets.list[0];
      if (sh) ej.sheetSort(sh.id, sh.sort === 'value' ? 'manual' : 'value');
      return;
    }
    const t = e.target.closest('[data-tab]');
    if (t && t.dataset.tab !== st.cfg.sheets.active) ej.setConfig({ sheets: { active: t.dataset.tab } }).then(applyConfig);
  });
  // Arrow keys move between tabs (WAI-ARIA tabs pattern).
  tabsEl.addEventListener('keydown', e => {
    const tabs = [...tabsEl.querySelectorAll('[role="tab"]')];
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    let j = null;
    if (e.key === 'ArrowRight') j = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = tabs.length - 1;
    if (j == null) return;
    e.preventDefault();
    const id = tabs[j].dataset.tab;
    ej.setConfig({ sheets: { active: id } }).then(c => { applyConfig(c); const el = tabsEl.querySelector(`[data-tab="${id}"]`); if (el) el.focus(); });
  });

  const loadIcons = () => ej.icons().then(m => { st.icons = m || {}; render(); });
  ej.onConfig(applyConfig);
  ej.onSnapshot(s => { const r = !st.snap || s.iconsRev !== st.snap.iconsRev; st.snap = s; render(); if (r) loadIcons(); });
  Promise.all([ej.getConfig(), ej.snapshot()]).then(([c, s]) => { st.snap = s; applyConfig(c); loadIcons(); });
  setInterval(render, 30e3); // "updated x min ago"
})();
