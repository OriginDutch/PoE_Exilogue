'use strict';
// Goal picker: search every unique on poe.ninja (each variant, link count and relic separately) and pick one.
// Resolves with { name, id, type, label } for a pick, { clear: true } for "No goal", or null when closed.
(function () {
  const EX = window.EX;
  const num = v => (v == null ? '–' : Number(v).toLocaleString('en-US', { maximumFractionDigits: v >= 100 ? 0 : v >= 10 ? 1 : 2 }));

  EX.goalPicker = current => new Promise(resolve => {
    if (document.querySelector('.dialog.gp')) { resolve(null); return; } // one at a time
    const opener = document.activeElement;
    const wrap = document.createElement('div');
    wrap.className = 'scrim';
    wrap.innerHTML = `<div class="dialog gp" role="dialog" aria-modal="true" aria-labelledby="gp-t">
      <h2 id="gp-t">Choose a goal</h2>
      <p>Any unique on poe.ninja. Variants, 6-links and relics are listed separately, each with its own price.</p>
      <div class="field"><label class="lbl" for="gp-q">Search</label>
        <input id="gp-q" class="input" autocomplete="off" spellcheck="false" placeholder="e.g. mageblood, headhunter 6l, foulborn"
          role="combobox" aria-expanded="false" aria-controls="gp-list" aria-autocomplete="list"></div>
      <div class="gp-st sub" id="gp-st" role="status" aria-live="polite">${current && current.name ? `Now: ${EX.esc(current.name)}${current.label ? ' · ' + EX.esc(current.label) : ''}` : 'No goal set.'}</div>
      <ul class="gp-list" id="gp-list" role="listbox" aria-label="Uniques"></ul>
      <div class="row" style="justify-content:space-between;gap:8px">
        ${current && current.name ? '<button class="btn q" data-gp="clear">No goal</button>' : '<span></span>'}
        <button class="btn" data-gp="close">Cancel</button>
      </div></div>`;
    document.querySelector('.app').appendChild(wrap);
    const input = wrap.querySelector('#gp-q'), list = wrap.querySelector('#gp-list'), st = wrap.querySelector('#gp-st');
    let items = [], active = -1, seq = 0, timer = 0, first = true;

    const done = v => {
      clearTimeout(timer); wrap.remove(); document.removeEventListener('keydown', onKey, true);
      // Back to the button that opened it (if a re-render replaced it, to the same action's button).
      const back = opener && opener.isConnected ? opener : document.querySelector('[data-act="goal-pick"]');
      if (back && back.focus) back.focus();
      resolve(v);
    };
    const setActive = i => {
      active = items.length ? Math.max(0, Math.min(items.length - 1, i)) : -1;
      list.querySelectorAll('[role="option"]').forEach((el, k) => el.setAttribute('aria-selected', k === active ? 'true' : 'false'));
      const el = list.children[active];
      if (el) { input.setAttribute('aria-activedescendant', el.id); el.scrollIntoView({ block: 'nearest' }); } else input.removeAttribute('aria-activedescendant');
    };
    const draw = () => {
      list.innerHTML = items.map((it, i) => `<li role="option" id="gp-o${i}" aria-selected="false" data-i="${i}">
        <span class="gp-n"><b>${EX.esc(it.name)}</b><span class="sub">${EX.esc([it.label, it.base].filter(Boolean).join(' · '))}</span></span>
        <span class="gp-p">${it.divines != null && it.divines >= 1 ? num(it.divines) + ' div' : it.chaos != null ? Math.round(it.chaos).toLocaleString('en-US') + 'c' : '–'}</span></li>`).join('');
      input.setAttribute('aria-expanded', items.length ? 'true' : 'false');
      setActive(items.length ? 0 : -1);
    };
    const pick = i => { const it = items[i]; if (it) done({ name: it.name, id: it.id, type: it.type, label: it.label || '' }); };

    async function run() {
      const q = input.value.trim();
      const my = ++seq;
      if (q.length < 2) { items = []; draw(); st.textContent = 'Type at least 2 letters.'; return; }
      st.textContent = first ? 'Loading the item list from poe.ninja…' : 'Searching…';
      const r = await window.ej.goalSearch(q);
      if (my !== seq || !wrap.isConnected) return; // a newer search is on its way
      first = false;
      if (!r || !r.ok) { items = []; draw(); st.textContent = (r && r.error) || 'Search failed.'; return; }
      items = r.items || [];
      draw();
      const part = r.partial ? ' Some categories could not be loaded from poe.ninja, so the list may be incomplete.' : '';
      st.textContent = (items.length ? `${items.length === 40 ? '40+' : items.length} result${items.length === 1 ? '' : 's'}. Arrow keys to move, Enter to pick.` : `Nothing found for "${q}".`) + part;
    }

    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 220); });
    const onKey = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); done(null); return; }
      if (e.key === 'Tab') { // keep focus inside the dialog
        const f = [...wrap.querySelectorAll('input, button')].filter(el => !el.disabled && el.offsetParent !== null);
        if (!f.length) return;
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && (i === -1 || i === f.length - 1)) { e.preventDefault(); f[0].focus(); }
        return;
      }
      if (document.activeElement !== input) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
      else if (e.key === 'Enter') { e.preventDefault(); pick(active); }
    };
    document.addEventListener('keydown', onKey, true);
    list.addEventListener('click', e => { const o = e.target.closest('[role="option"]'); if (o) pick(+o.dataset.i); });
    wrap.addEventListener('click', e => {
      const b = e.target.closest('[data-gp]');
      if (b) done(b.dataset.gp === 'clear' ? { clear: true } : null);
      else if (e.target === wrap) done(null);
    });
    input.focus();
  });
})();
