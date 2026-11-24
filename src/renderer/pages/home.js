'use strict';
(function () {
  const E = EX, ic = EX.icon;

  function banners({ snap, cfg }) {
    const corrupt = snap.stateCorrupt ? `<div class="banner warn" role="alert"><span class="bi">${ic.warn()}</span><div class="grow"><div class="bt">Saved stats couldn't be read</div>
      <div class="sub" style="white-space:normal">The file was kept as ${E.esc(snap.stateCorrupt)} and Exilogue started fresh from Client.txt. Older backups are in Settings › League.</div></div>
      <button class="btn" data-nav="settings:league">Open backups</button></div>` : '';
    const u = snap.update;
    const upd = u && u.state === 'ready' ? `<div class="banner live" role="status"><span class="bi">${ic.refresh()}</span>
      <div class="grow"><div class="bt">Exilogue ${E.esc(u.next || '')} is ready</div><div class="sub">It installs by itself when you close Exilogue${snap.gameRunning ? '. Restarting is possible once the game is closed.' : ', or restart now.'}</div></div>
      ${snap.gameRunning ? '' : '<button class="btn p" data-act="update-install">Restart and update</button>'}</div>` : '';
    const w = snap.wealth || {}, pe = w.pending;
    const tabs = a => a.length ? a.map(t => `<b style="color:var(--tx)">${E.esc(t || '(no tab)')}</b>`).join(', ') : 'none';
    const check = pe ? `<div class="banner warn" role="alert"><span class="bi">${ic.warn()}</span>
      <div class="grow"><div class="bt">Your last Wealthy Exile export has other tabs than the one before</div>
        <div class="sub" style="white-space:normal">Missing this time: ${tabs(pe.missing)} · New: ${tabs(pe.added)} · ${pe.items} items. A filter in Wealthy Exile? Until you answer, this export doesn't count.</div></div>
      <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn p" data-act="we-keep" data-id="${pe.id}">On purpose, it's complete</button><button class="btn" data-act="we-drop" data-id="${pe.id}">Not on purpose</button></div></div>`
      : w.fixing ? `<div class="banner live" role="status"><span class="bi">${ic.refresh()}</span>
      <div class="grow"><div class="bt">Fix it in Wealthy Exile</div><div class="sub" style="white-space:normal">Clear the tab or item filter there so all your tabs are in, then press Done: Exilogue gets a new export.</div></div>
      <button class="btn p" data-act="we-refetch">Done, export again</button></div>` : '';
    if (!cfg.ui.welcomeDone) return corrupt + upd; // first start: the setup card says the rest
    return corrupt + upd + check + EX.weSetup.homeOutdated(snap) + bannersMain({ snap, cfg }) + EX.weSetup.homeCard(snap, cfg, EX.ui);
  }
  function bannersMain({ snap, cfg }) {
    if (!snap.paths.clientTxt || snap.logMissing) {
      return `<div class="banner warn" role="alert"><span class="bi">${ic.warn()}</span>
        <div class="grow"><div class="bt">Client.txt not found</div><div class="sub" style="white-space:normal">Exilogue looked for ${E.esc(cfg.paths.clientTxt || 'a log file')} and found nothing. Zones, maps, runs and events are paused until it can read it.</div></div>
        <button class="btn p" data-nav="settings:paths">Fix in Settings › Paths</button></div>`;
    }
    if (snap.catchup) {
      const c = snap.catchup, done = c.at - c.from, all = Math.max(1, c.to - c.from), pct = Math.round(100 * done / all);
      const mb = b => b >= 1e9 ? (b / 1e9).toFixed(2) + ' GB' : Math.round(b / 1e6) + ' MB';
      return `<div class="banner live" role="status"><span class="bi">${ic.refresh()}</span>
        <div class="grow" style="display:flex;flex-direction:column;gap:8px">
          <div class="row between"><span class="bt">Catching up on your log</span><span class="sub">${mb(done)} of ${mb(all)} · ${pct}%</span></div>
          <div class="prog" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Reading Client.txt"><i style="width:${pct}%"></i></div>
          <div class="sub">Reading Client.txt from the league start. You can keep playing; live tracking continues right after.</div>
        </div></div>`;
    }
    return '';
  }

  function headline(cfg) {
    const day = E.leagueDay(cfg.league.start);
    return `${E.esc(cfg.league.name)}${day ? ' · Day ' + day : day === 0 ? ' · starts ' + E.esc(cfg.league.start.slice(0, 16)) : ''}`;
  }

  function sizeOf(cfg, id) { return cfg.layout.sizes[id] || E.defaultSize(id); }

  // First start: one checklist of what Exilogue found on this PC (main looks in Steam, the standalone client and Epic),
  // instead of a grid of empty tiles. Start or Later closes it; picking a file doesn't.
  function setupCard({ snap, cfg }) {
    const P = cfg.paths, found = snap.paths, src = snap.pathSource || {};
    const row = (state, name, where, act) => `<li class="su-row su-${state}"><span class="su-ic">${state === 'ok' ? ic.check() : state === 'miss' ? ic.warn() : '–'}</span>
      <div class="grow" style="min-width:0"><div style="font-weight:600">${name}</div><div class="sub ell">${where}</div></div>${act}</li>`;
    const find = key => `<button class="btn sm" data-browse="${key}">${ic.folder()} Find it</button>`;
    const logOk = !!found.clientTxt, gameOk = !!found.poeExe, waiting = gameOk && !logOk; // waiting: game found, never started yet
    return `<section class="hm-setup">
      <div><div class="lbl" style="margin-bottom:8px">Welcome</div><h2>${logOk ? 'Exilogue found your game' : waiting ? 'Start Path of Exile once' : 'Where is Path of Exile?'}</h2>
        <p class="muted" style="margin:0 0 16px;font-size:15.5px">${logOk ? 'It looked in the usual places on this PC. Check the list, then start.' : waiting ? 'Exilogue found the game, but the game hasn\'t written its log yet. Start it once and log in; Exilogue picks the log up by itself.' : 'Exilogue looked in the usual places (Steam, the standalone client, Epic) and didn\'t find it. Point it to the game once.'}</p>
        <div class="row" style="gap:8px;flex-wrap:wrap">${logOk || waiting ? '<button class="btn p lg" data-act="welcome-later">Start</button>' : `<button class="btn p lg" data-browse="poeExe">${ic.folder()} Find PathOfExile.exe</button><button class="btn q lg" data-act="welcome-later">Later</button>`}</div>
        <div class="su-check sub" style="margin-top:18px;white-space:normal">${logOk ? `${ic.info()} To check it works: start the game and enter any zone. The Path of Exile tile on Home then shows where you are.` : 'Your tiles fill in once Exilogue can read the game\'s log.'}</div></div>
      <ol class="su-list">
        ${row(found.poeExe ? 'ok' : 'miss', 'Path of Exile', found.poeExe ? `Found${src.poe ? ' (' + E.esc(src.poe) + ')' : ''} · ${E.esc(P.poeExe || '')}` : 'Not found', found.poeExe ? '<button class="btn q sm" data-nav="settings:paths">Change</button>' : '')}
        ${row(logOk ? 'ok' : 'opt', 'Game log (Client.txt)', logOk ? 'Found next to the game' : waiting ? 'Appears after you start the game once' : 'Comes with the game', waiting ? find('clientTxt') : '')}
        ${row('ok', 'League', `${E.esc(cfg.league.name)} · started ${E.esc(cfg.league.start.slice(0, 16))}`, '<button class="btn q sm" data-nav="settings:league">Change</button>')}
        ${row(cfg.account ? 'ok' : 'opt', 'Account name <span class="sub">optional</span>', cfg.account ? E.esc(cfg.account) : 'Shows which characters are yours', `<button class="btn q sm" data-nav="settings:league">${cfg.account ? 'Change' : 'Add'}</button>`)}
        ${row(found.pobExe ? 'ok' : 'opt', 'Path of Building <span class="sub">optional</span>', found.pobExe ? 'Found' : 'Not found', found.pobExe ? '' : find('pobExe'))}
        ${row(found.aptExe ? 'ok' : 'opt', 'Awakened PoE Trade <span class="sub">optional</span>', found.aptExe ? 'Found' : 'Not found', found.aptExe ? '' : find('aptExe'))}
        ${row('opt', 'Wealthy Exile <span class="sub">optional</span>', 'Net worth and profit per hour. About 2 minutes.', '<button class="btn sm" data-nav="settings:launch">Set up</button>')}
      </ol></section>`;
  }
  EX.pages = EX.pages || {};
  EX.pages.home = {
    live: true,
    render(ctx) {
      const { cfg } = ctx;
      const editing = ctx.ui.editing;
      const head = `<div class="head"><div><div class="lbl" style="margin-bottom:6px">${headline(cfg)}</div><h1 class="h">Home</h1></div>
        ${editing || !cfg.ui.welcomeDone ? '' : `<button class="btn" data-act="edit">${ic.grid()} Edit layout</button>`}</div>`;
      if (editing) return head + editView(ctx);
      if (!cfg.ui.welcomeDone) return head + banners(ctx) + setupCard(ctx);
      const tiles = E.tileOrder(cfg).filter(id => !cfg.layout.hidden[id]).map(id => E.tileHtml(id, ctx)).join('');
      return head + banners(ctx) + `<div class="dense-grid">${tiles}</div>`;
    },
    mount(el, ctx) {
      // drag & drop for edit mode
      let dragId = null;
      el.addEventListener('dragstart', e => {
        const c = e.target.closest('[data-edcard]'); if (!c) return;
        dragId = c.dataset.edcard; c.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move';
      });
      el.addEventListener('dragend', e => { const c = e.target.closest('[data-edcard]'); if (c) c.classList.remove('dragging'); el.querySelectorAll('.over').forEach(x => x.classList.remove('over')); });
      el.addEventListener('dragover', e => {
        const c = e.target.closest('[data-edcard]'); if (!c || !dragId) return;
        e.preventDefault(); el.querySelectorAll('.over').forEach(x => x !== c && x.classList.remove('over')); c.classList.add('over');
      });
      el.addEventListener('drop', e => {
        const c = e.target.closest('[data-edcard]'); if (!c || !dragId) return;
        e.preventDefault();
        if (c.dataset.edcard === dragId) { dragId = null; return; } // dropped on itself: nothing moves
        const order = E.tileOrder(EX.state.cfg).filter(id => id !== dragId);
        order.splice(order.indexOf(c.dataset.edcard), 0, dragId);
        order.push(...EX.state.cfg.layout.order.filter(id => !order.includes(id)));
        dragId = null;
        ctx.save({ layout: { order } });
      });
      el.addEventListener('keydown', e => {
        const g = e.target.closest('[data-grip]'); if (!g) return;
        const delta = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key]; if (!delta) return;
        e.preventDefault();
        const id = g.dataset.grip, order = E.tileOrder(EX.state.cfg), i = order.indexOf(id), j = i + delta;
        if (j < 0 || j >= order.length) return;
        [order[i], order[j]] = [order[j], order[i]];
        order.push(...EX.state.cfg.layout.order.filter(x => !order.includes(x)));
        ctx.save({ layout: { order } }).then(() => el.querySelector(`[data-grip="${id}"]`)?.focus());
      });
      el.addEventListener('input', e => {
        const r = e.target.closest('[data-size]'); if (!r) return;
        const size = E.SIZES[+r.value];
        r.setAttribute('aria-valuetext', E.SIZE_LABEL[size]);
        ctx.save({ layout: { sizes: { [r.dataset.size]: size } } });
      });
    },
  };

  function editView(ctx) {
    const { cfg } = ctx;
    const tiles = E.tileOrder(cfg).map(id => {
      const t = E.TILES[id], hidden = !!cfg.layout.hidden[id];
      return `<section class="card dn ed${t.wide ? ' wide' : ''}${hidden ? ' hid' : ''}" data-edcard="${id}" draggable="true">
        <div class="ch"><button class="grip" data-grip="${id}" aria-label="Move ${E.esc(t.name)}: drag, or use arrow keys">${ic.grip()}</button>
          ${E.logo({ id, mono: E.CARDS[id] ? E.CARDS[id].mono : id.slice(0, 2).toUpperCase() })}
          <div class="t"><span class="ell" style="display:block;font-size:15px;font-weight:600">${E.esc(t.name)}</span><div class="sub">${t.wide ? 'Two columns wide' : 'One column'}${hidden ? ' · hidden' : ''}</div></div>
          <button class="btn i sm" data-act="hide" data-id="${id}" aria-pressed="${hidden}" aria-label="${hidden ? 'Show' : 'Hide'} ${E.esc(t.name)}">${hidden ? ic.eyeOff() : ic.eye()}</button></div>
      </section>`;
    }).join('');
    return `<div class="editbar">${ic.grid()}
      <div class="grow"><div style="font-weight:600">Editing layout</div><div class="sub">Drag to reorder (or focus the handle and use the arrow keys) · hide what you don't use. Saved automatically.</div></div>
      <button class="btn q" data-act="layout-reset">Reset to default</button><button class="btn p" data-act="edit-done">Done</button></div>
      <div class="dense-grid">${tiles}</div>`;
  }

  function editViewOld(ctx) {
    const { cfg } = ctx;
    const cards = cfg.layout.order.filter(id => E.CARDS[id] && E.CARDS[id].kind !== 'soon').map(id => {
      const def = E.CARDS[id], size = sizeOf(cfg, id), idx = E.SIZES.indexOf(size), hidden = !!cfg.layout.hidden[id];
      const ticks = E.SIZES.map(s => (s === size ? `<b>${s.toUpperCase()}</b>` : `<span>${s.toUpperCase()}</span>`)).join('');
      const compact = size === 'xs';
      return `<section class="card ed s-${size}${hidden ? ' hid' : ''}${compact ? ' xs' : ''}" data-edcard="${id}" draggable="true">
        <div class="ch" style="${compact ? 'flex:1' : ''}">
          <button class="grip" data-grip="${id}" aria-label="Move ${def.name}: drag, or use arrow keys">${ic.grip()}</button>
          <span class="logo${size === 'xl' ? ' lg' : ''}" aria-hidden="true">${def.mono}</span>
          <div class="t"><span class="ell" style="display:block;font-size:${size === 'xl' ? 20 : 16}px;font-weight:600">${def.name}</span>${compact ? '' : `<div class="sub">${E.SIZE_LABEL[size]}${hidden ? ' · hidden' : ''}</div>`}</div>
          <button class="btn i sm" data-act="hide" data-id="${id}" aria-pressed="${hidden}" aria-label="${hidden ? 'Show' : 'Hide'} ${def.name}">${hidden ? ic.eyeOff() : ic.eye()}</button>
          ${compact ? `<select class="select" data-sizesel="${id}" aria-label="Size of ${def.name}" style="height:30px">${E.SIZES.map(s => `<option value="${s}" ${s === size ? 'selected' : ''}>${s.toUpperCase()}</option>`).join('')}</select>` : ''}
        </div>
        ${compact ? '' : `${size === 's' ? '' : `<div class="sub" style="white-space:normal">${def.parts}</div>`}
        <div class="size">
          <div class="row between"><label class="lbl" for="sz-${id}">Size</label><span class="sub">${E.SIZE_LABEL[size]}</span></div>
          <input id="sz-${id}" class="range" type="range" min="0" max="4" step="1" value="${idx}" data-size="${id}" aria-valuetext="${E.SIZE_LABEL[size]}" style="--fill:${idx * 25}%">
          <div class="ticks" aria-hidden="true">${ticks}</div>
        </div>`}
      </section>`;
    }).join('');
    return `<div class="editbar">${ic.grid()}
      <div class="grow"><div style="font-weight:600">Editing layout</div><div class="sub">Drag to reorder (or focus the handle and use the arrow keys) · set a size per card · hide what you don't use. Saved automatically.</div></div>
      <button class="btn q" data-act="layout-reset">Reset to default</button><button class="btn p" data-act="edit-done">Done</button></div>
      <div class="grid">${cards}</div>`;
  }
})();
