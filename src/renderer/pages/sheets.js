'use strict';
// Cheat sheets: manage your sheets (list left, the chosen sheet right). The sheet window shows them as tabs.
(function () {
  const E = EX, ic = EX.icon;
  EX.pages = EX.pages || {};
  const VIEWS = [['ratio', 'Ratio (1 : 5.5)'], ['each', 'Each (= 0.29)'], ['stack', 'Per stack (10× = 2.9)']];
  const TYPE_LABEL = t => t.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^Unique /, 'Unique ');
  const newId = () => Math.random().toString(36).slice(2, 10);
  const fmt = v => (v == null || !Number.isFinite(v) ? '–' : v.toLocaleString('en-US', { maximumFractionDigits: v >= 0.01 ? 2 : 4 }));
  const opt = (pairs, cur) => pairs.map(([v, l]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${l}</option>`).join('');
  const st = () => EX.state;
  const ui = () => EX.ui;

  const sheets = () => st().cfg.sheets.list;
  const selected = () => { const l = sheets(); return l.find(x => x.id === ui().csSel) || l.find(x => x.id === st().cfg.sheets.active) || l[0] || null; };
  // Every change saves the whole list (small; arrays are replaced, never merged). Changes run one after another, each
  // on the list as the previous one left it: a value typed and a button clicked right after can't overwrite each other.
  let queue = Promise.resolve();
  const mutate = fn => (queue = queue.then(async () => {
    const list = JSON.parse(JSON.stringify(sheets()));
    const extra = fn(list);
    if (extra === false) return false; // nothing to change
    return EX.save({ sheets: { list, ...(extra || {}) } });
  }).catch(() => false));
  const update = fn => mutate(list => { const sh = list.find(x => x.id === (selected() || {}).id); if (!sh) return false; return fn(sh, list); });

  // Search results live in ui state, so a re-render (a snapshot arriving) keeps them.
  function resultsHtml(sh, res, act) {
    const have = new Set(sh.items.map(it => it.type + ':' + it.id));
    return res.map((r, i) => `<li role="option" id="cs-o${i}" aria-selected="${i === act}" data-i="${i}" ${have.has(r.type + ':' + r.id) ? 'aria-disabled="true"' : ''}>
      <span class="gp-n"><b>${E.esc(r.name)}</b><span class="sub">${E.esc([r.label, TYPE_LABEL(r.type)].filter(Boolean).join(' · '))}${have.has(r.type + ':' + r.id) ? ' · already in this sheet' : ''}</span></span>
      <span class="gp-p">${r.chaos != null ? fmt(r.chaos) + 'c' : '–'}</span></li>`).join('');
  }

  EX.pages.sheets = {
    render({ cfg, snap }) {
      const list = cfg.sheets.list, sh = selected();
      const info = (snap && snap.sheets) || { prices: {} };
      const icons = st().icons || {};
      const head = `<div class="ph"><span class="logo lg" aria-hidden="true">CS</span><div class="grow"><h1 class="h">Cheat sheets</h1>
        <div class="sub" style="margin-top:4px">Your own price lists, from poe.ninja unless you set a value yourself. The sheet window shows them as tabs.</div></div>
        <button class="btn p" data-cs="open">Open sheet window</button></div>`;
      const side = `<section class="box cs-side"><div class="bh"><h2>Sheets</h2><span class="sub">${list.length}</span></div>
        ${list.length ? `<ul class="cs-sheets" aria-label="Sheets">${list.map((x, i) => `<li class="${sh && x.id === sh.id ? 'on' : ''}">
          <button class="cs-pick" data-cs="sel" data-id="${x.id}" ${sh && x.id === sh.id ? 'aria-current="true"' : ''}><b>${E.esc(x.name)}</b><span class="sub">${x.items.length} item${x.items.length === 1 ? '' : 's'}${cfg.sheets.active === x.id ? ' · in window' : ''}</span></button>
          <span class="cs-mv"><button class="btn i sm" data-cs="sheet-up" data-id="${x.id}" aria-label="Move ${E.esc(x.name)} up" ${i ? '' : 'disabled'}>↑</button><button class="btn i sm" data-cs="sheet-down" data-id="${x.id}" aria-label="Move ${E.esc(x.name)} down" ${i < list.length - 1 ? '' : 'disabled'}>↓</button></span></li>`).join('')}</ul>`
          : '<div class="empty"><b>No sheets yet</b><span>Make your first one.</span></div>'}
        <button class="btn" data-cs="new" style="margin-top:10px">+ New sheet</button></section>`;
      if (!sh) return head + `<div class="cs-grid">${side}</div>`;

      const settings = `<div class="cs-set">
          <div class="field"><label class="lbl" for="cs-name">Name</label><input id="cs-name" class="input" maxlength="40" value="${E.esc(sh.name)}" data-csf="name"></div>
          <div class="field"><label class="lbl" for="cs-unit">Compare with</label><select id="cs-unit" class="select" data-csf="unit">${opt([['chaos', 'Chaos Orb'], ['divine', 'Divine Orb']], sh.unit)}</select></div>
          <div class="field"><label class="lbl" for="cs-view">Show as</label><select id="cs-view" class="select" data-csf="view">${opt(VIEWS, sh.view)}</select></div>
          <div class="field"><label class="lbl" for="cs-stack">Stack size</label><input id="cs-stack" class="input" type="number" min="1" max="1000" value="${sh.stack}" data-csf="stack"></div>
          <div class="field"><label class="lbl" for="cs-sort">Order</label><select id="cs-sort" class="select" data-csf="sort">${opt([['manual', 'Your order'], ['value', 'By value, highest first']], sh.sort)}</select></div>
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          ${cfg.sheets.active === sh.id ? `<span class="st ok">${ic.check()} Front tab in the sheet window</span>` : '<button class="btn" data-cs="show">Make it the front tab</button>'}
          <button class="btn" data-cs="dup">Duplicate</button>
          <button class="btn q" data-cs="del">Delete sheet</button></div>`;

      const q = ui().csQuery || '';
      const res = ui().csResults || [], act = ui().csActive ?? -1;
      const add = `<div class="field cs-add"><label class="lbl" for="cs-q">Add an item</label>
        <input id="cs-q" class="input" autocomplete="off" spellcheck="false" placeholder="Search poe.ninja: currency, threads, oils, essences, uniques, maps …" value="${E.esc(q)}"
          role="combobox" aria-expanded="${res.length ? 'true' : 'false'}" aria-controls="cs-res" aria-autocomplete="list" ${act >= 0 && res[act] ? `aria-activedescendant="cs-o${act}"` : ''}>
        <div class="sub cs-st" id="cs-st" role="status" aria-live="polite">${E.esc(ui().csMsg || '')}</div>
        <ul class="gp-list cs-res" id="cs-res" role="listbox" aria-label="Search results">${resultsHtml(sh, res, act)}</ul></div>`;

      const rows = sh.items.map((it, i) => {
        const k = it.type + ':' + it.id, p = info.prices[k] || {};
        const icon = icons[(info.iconIds || {})[k]];
        return `<tr>
          <td class="cs-ic">${icon ? `<img src="${E.esc(icon)}" alt="">` : '<span class="sh-noimg" aria-hidden="true"></span>'}</td>
          <td class="cs-nm"><b>${E.esc(it.name)}</b><span class="sub">${E.esc([it.label, TYPE_LABEL(it.type)].filter(Boolean).join(' · '))}</span></td>
          <td class="num">${it.override != null ? `<s class="dim">${p.chaos != null ? fmt(p.chaos) + 'c' : '–'}</s>` : (p.chaos != null ? fmt(p.chaos) + 'c' : '–')}</td>
          <td><input class="input cs-ov" type="number" min="0" step="any" inputmode="decimal" placeholder="–" value="${it.override ?? ''}" data-csi="override" data-i="${i}" aria-label="Your own value for ${E.esc(it.name)}, in chaos (empty: poe.ninja)"></td>
          <td><select class="select select-ghost" data-csi="view" data-i="${i}" aria-label="Show ${E.esc(it.name)} as">${opt([['', 'Sheet default'], ...VIEWS], it.view || '')}</select></td>
          <td class="cs-act"><button class="btn i sm" data-cs="up" data-i="${i}" aria-label="Move ${E.esc(it.name)} up" ${i ? '' : 'disabled'}>↑</button><button class="btn i sm" data-cs="down" data-i="${i}" aria-label="Move ${E.esc(it.name)} down" ${i < sh.items.length - 1 ? '' : 'disabled'}>↓</button><button class="btn i sm" data-cs="rm" data-i="${i}" aria-label="Remove ${E.esc(it.name)}">×</button></td></tr>`;
      }).join('');
      const table = sh.items.length ? `<table class="cs-tbl"><thead><tr><th></th><th>Item</th><th class="num">poe.ninja</th><th>Your price (c)</th><th>Show as</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
        : '<div class="empty"><b>No items yet</b><span>Search above to add some.</span></div>';
      const main = `<section class="box cs-main"><div class="bh"><h2>${E.esc(sh.name)}</h2><span class="sub">${info.at ? 'poe.ninja prices from ' + E.esc(E.ago(info.at)) : 'Loading prices…'}</span></div>
        ${settings}<div class="hr"></div>${add}${table}</section>`;
      // What the sheet window shows, right under the list of sheets.
      const ordered = sh.sort === 'value' ? sh.items.slice().sort((x, y) => ((y.override ?? (info.prices[y.type + ':' + y.id] || {}).chaos) || 0) - ((x.override ?? (info.prices[x.type + ':' + x.id] || {}).chaos) || 0)) : sh.items;
      const pv = ordered.slice(0, 6).map(it => { const k = it.type + ':' + it.id, p = info.prices[k] || {}; const v = it.override ?? p.chaos, view = it.view || sh.view, u = sh.unit === 'divine' ? (v != null && info.divineChaos ? v / info.divineChaos : null) : v;
        const txt = u == null ? '–' : view === 'each' ? '= ' + fmt(u) : view === 'stack' ? sh.stack + '× = ' + fmt(u * sh.stack) : u >= 1 ? '1 : ' + fmt(u) : fmt(1 / u) + ' : 1';
        return `<div class="cs-pv-row"><span class="sh-noimg" aria-hidden="true"></span><span class="ell">${E.esc(it.name)}</span><b>${txt}</b></div>`; }).join('');
      const preview = `<section class="box cs-prev"><div class="bh"><h2>In the window</h2><span class="sub">${sh.items.length > 6 ? 'first 6 of ' + sh.items.length : ''}</span></div><div class="cs-pv">${pv || '<div class="sub">Add items to see them here.</div>'}</div></section>`;
      return head + `<div class="cs-grid"><div style="display:flex;flex-direction:column;gap:16px">${side}${preview}</div>${main}</div>`;
    },

    mount(el) {
      let timer = 0, seq = 0;
      const $ = s2 => el.querySelector(s2);
      const U = ui();
      // Draw the results now (from ui state); render() draws the same, so later re-renders keep them.
      const drawResults = msg => {
        if (msg != null) U.csMsg = msg;
        const list = $('#cs-res'), stEl = $('#cs-st'), q = $('#cs-q'), sh = selected();
        if (!list || !sh) return;
        const res = U.csResults || [], act = U.csActive ?? -1;
        list.innerHTML = resultsHtml(sh, res, act);
        q.setAttribute('aria-expanded', res.length ? 'true' : 'false');
        if (act >= 0 && list.children[act]) { q.setAttribute('aria-activedescendant', 'cs-o' + act); list.children[act].scrollIntoView({ block: 'nearest' }); } else q.removeAttribute('aria-activedescendant');
        stEl.textContent = U.csMsg || '';
      };
      const setRes = (r, a, msg) => { U.csResults = r; U.csActive = a; drawResults(msg); };
      const search = async () => {
        const q = ($('#cs-q') || {}).value || '';
        U.csQuery = q;
        const my = ++seq;
        if (q.trim().length < 2) { setRes([], -1, q ? 'Type at least 2 letters.' : ''); return; }
        drawResults('Searching… (the first search loads the lists from poe.ninja)');
        const r = await ej.sheetSearch(q.trim());
        if (my !== seq || !el.isConnected) return;
        if (!r || !r.ok) { setRes([], -1, (r && r.error) || 'Search failed.'); return; }
        setRes(r.items, r.items.length ? 0 : -1, (r.items.length ? `${r.items.length === 50 ? '50+' : r.items.length} results. Arrow keys to move, Enter to add.` : `Nothing found for "${q.trim()}".`)
          + (r.partial ? ' Some categories could not be loaded, so the list may be incomplete.' : ''));
      };
      const addItem = i => {
        const r = (U.csResults || [])[i];
        const sh = selected();
        if (!r || !sh) return;
        if (sh.items.some(it => it.type === r.type && it.id === r.id)) { E.toast(`${r.name} is already in this sheet.`); return; }
        if (sh.items.length >= 80) { E.toastError('A sheet holds at most 80 items.'); return; }
        update(s2 => { if (s2.items.some(it => it.type === r.type && it.id === r.id)) return false; s2.items.push({ type: r.type, id: r.id, name: r.name, label: r.label || '', override: null, view: null }); })
          .then(ok => { if (ok === false) return; E.toast(`Added ${r.name}.`, { kind: 'ok' }); const q = $('#cs-q'); if (q) { q.focus(); q.select(); } drawResults(); });
      };

      el.addEventListener('input', e => { if (e.target.id === 'cs-q') { clearTimeout(timer); timer = setTimeout(search, 250); } });
      el.addEventListener('keydown', e => {
        const res = U.csResults || [];
        if (e.target.id !== 'cs-q' || !res.length) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); U.csActive = Math.min(res.length - 1, (U.csActive ?? -1) + 1); drawResults(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); U.csActive = Math.max(0, (U.csActive ?? 0) - 1); drawResults(); }
        else if (e.key === 'Enter') { e.preventDefault(); addItem(U.csActive ?? -1); }
        else if (e.key === 'Escape') setRes([], -1, '');
      });
      el.addEventListener('change', e => {
        const t = e.target;
        if (t.dataset.csf) {
          const f = t.dataset.csf;
          const v = f === 'stack' ? Math.round(Number(t.value) || 10) : t.value;
          if (f === 'name' && !String(v).trim()) { t.value = selected().name; return; }
          update(s => { s[f] = v; });
        } else if (t.dataset.csi) {
          const i = Number(t.dataset.i), f = t.dataset.csi;
          update(s => {
            const it = s.items[i]; if (!it) return;
            if (f === 'override') { const n = Number(String(t.value).replace(',', '.')); it.override = t.value === '' || !(n > 0) ? null : n; }
            else it.view = t.value || null;
          });
        }
      });
      el.addEventListener('click', async e => {
        const o = e.target.closest('#cs-res [role="option"]');
        if (o) { if (o.getAttribute('aria-disabled') !== 'true') addItem(Number(o.dataset.i)); return; }
        const b = e.target.closest('[data-cs]');
        if (!b || b.disabled) return;
        const a = b.dataset.cs;
        const move = (arr, i, d) => { const j = i + d; if (i < 0 || j < 0 || j >= arr.length) return false; [arr[i], arr[j]] = [arr[j], arr[i]]; return true; };
        if (a === 'open') ej.sheetOpen();
        else if (a === 'sel') { U.csSel = b.dataset.id; setRes([], -1, ''); U.csQuery = ''; EX.rerender(); }
        else if (a === 'sheet-up' || a === 'sheet-down') mutate(list => (move(list, list.findIndex(x => x.id === b.dataset.id), a === 'sheet-up' ? -1 : 1) ? {} : false));
        else if (a === 'new') {
          if (sheets().length >= 60) { E.toastError('You can have at most 60 sheets.'); return; }
          const id = newId();
          await mutate(list => { list.push({ id, name: 'New sheet', unit: 'chaos', view: 'ratio', stack: 10, sort: 'manual', items: [] }); U.csSel = id; return list.length === 1 ? { active: id } : {}; });
          const n = $('#cs-name'); if (n) { n.focus(); n.select(); }
        } else if (a === 'dup') {
          if (sheets().length >= 60) { E.toastError('You can have at most 60 sheets.'); return; }
          const id = newId(), srcId = (selected() || {}).id;
          mutate(list => { const i = list.findIndex(x => x.id === srcId); if (i < 0) return false; list.splice(i + 1, 0, { ...JSON.parse(JSON.stringify(list[i])), id, name: (list[i].name + ' (copy)').slice(0, 40) }); U.csSel = id; });
        } else if (a === 'del') {
          const sh = selected();
          if (!sh) return;
          if (!(await E.confirm({ title: `Delete "${sh.name}"?`, body: `This removes the sheet and its ${sh.items.length} item${sh.items.length === 1 ? '' : 's'}. This can't be undone.`, ok: 'Delete', danger: true }))) return;
          mutate(list => { const i = list.findIndex(x => x.id === sh.id); if (i < 0) return false; list.splice(i, 1); U.csSel = (list[i] || list[i - 1] || {}).id || null; });
        } else if (a === 'show') { const id = (selected() || {}).id; if (id) mutate(() => ({ active: id })); }
        else if (a === 'up' || a === 'down') update(s2 => (move(s2.items, Number(b.dataset.i), a === 'up' ? -1 : 1) ? undefined : false));
        else if (a === 'rm') update(s2 => { s2.items.splice(Number(b.dataset.i), 1); });
      });
      if (ui().csQuery) search(); // back on this page with a search typed: show its results again
    },
  };
})();
