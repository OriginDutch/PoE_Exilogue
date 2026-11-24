'use strict';
(async function () {
  const E = EX, ic = EX.icon;
  const appEl = document.getElementById('app');
  const side = document.getElementById('side');
  const main = document.getElementById('main');

  const ui = { view: 'home', editing: false, settingsTab: 'appearance', recording: null };
  const state = EX.state = { cfg: await ej.getConfig(), snap: await ej.snapshot(), darkPalette: 'night' };
  state.icons = await ej.icons(); state.iconsRev = state.snap.iconsRev;
  let viewEl = null, currentKey = null;

  const ctx = () => ({ cfg: state.cfg, snap: state.snap, st: state.snap && state.snap.stats, ui, save });

  async function save(patch) {
    const c = await ej.setConfig(patch);
    if (c._error) { await E.toastError(c._error); return false; }
    applyConfig(c);
    render(true);
    return true;
  }
  EX.save = save; // for page modules with their own handlers (cheat sheets)

  // ---------- theme / font / motion ----------
  function applyConfig(c) {
    state.cfg = c;
    const u = c.ui;
    const dark = u.theme === 'dark' || (u.theme === 'system' && c.systemDark);
    const pal = dark ? u.darkPalette : u.lightPalette;
    state.darkPalette = u.darkPalette;
    appEl.className = `app win t-${pal} f-${u.font}`;
    document.documentElement.classList.toggle('no-motion', !u.motion);
    renderSide();
  }

  // The same chime the overlay plays for "Take a break?" (Settings: Test, and when you let go of the volume slider).
  function playChime(vol, file = state.cfg.breaks.sound.file) {
    try { const a = new Audio('sounds/' + (file === 'shrine' ? 'shrine.wav' : 'break-chime.wav')); a.volume = Math.max(0, Math.min(1, vol / 100)); a.play().catch(() => {}); } catch { /* no audio device */ }
  }

  // ---------- sidebar ----------
  const TOOLS = [['poe', 'PE', 'Path of Exile'], ['maps', 'SM', 'Session &amp; Maps'], ['campaign', 'CP', 'Campaign'], ['wealthy', 'WE', 'Wealthy Exile'], ['overlay', 'OV', 'Overlay'], ['filter', 'LF', 'Loot filter'], ['pob', 'PB', 'Path of Building'], ['sheets', 'CS', 'Cheat sheets']];
  // Links leave the app: they open in your browser, and say so.
  const LINKS = [['ninja', 'PN', 'poe.ninja', 'https://poe.ninja'], ['trade', 'TR', 'Trade', 'https://www.pathofexile.com/trade']];

  function renderSide() {
    const col = state.cfg.ui.sidebarCollapsed;
    side.classList.toggle('col', col);
    const item = (key, icon, label, attrs = '') => {
      const on = ui.view === key;
      return `<button class="nav${on ? ' on' : ''}" ${attrs} ${on ? 'aria-current="page"' : ''} title="${col ? label.replace('&amp;', '&') : ''}">${icon}<span class="lb">${label}</span></button>`;
    };
    // Same art as the tiles; the two-letter monogram only where there is none (yet).
    const mini = (id, m) => { const src = E.iconOf(id); return src ? `<span class="mini img" aria-hidden="true"><img src="${E.esc(src)}" alt=""></span>` : `<span class="mini" aria-hidden="true">${m}</span>`; };
    side.innerHTML = `<div class="brand">${ic.brand()}<span>Exilogue</span></div>
      ${item('home', `<span class="ic">${ic.home()}</span>`, 'Home', 'data-nav="home"')}
      ${item('events', `<span class="ic">${ic.events()}</span>`, 'Events', 'data-nav="events"')}
      <div class="sec">Tools</div>
      ${TOOLS.map(([id, m, l]) => item('page:' + id, mini(id, m), l, `data-nav="page:${id}"`)).join('')}
      <div class="sec">Links</div>
      ${LINKS.map(([id, m, l, u]) => item('link:' + id, mini(id, m), l + ` <span class="ext-mark" aria-label="(opens in your browser)">${ic.ext()}</span>`, `data-url="${u}"`)).join('')}
      <div class="spacer"></div>
      ${item('page:help', '<span class="ic" style="font-weight:700">?</span>', 'Help', 'data-nav="page:help"')}
      ${item('settings', `<span class="ic">${ic.settings()}</span>`, 'Settings', 'data-nav="settings"')}
      <button class="nav" data-act="collapse" aria-expanded="${!col}" aria-label="${col ? 'Expand sidebar' : 'Collapse sidebar'}" style="color:var(--tx3)"><span class="ic">${col ? ic.expand() : ic.collapse()}</span><span class="lb">Collapse</span></button>`;
  }

  // ---------- title bar ----------
  function renderWinCtl(maximized) {
    const [mn, mx, cl] = appEl.querySelectorAll('[data-win]');
    mn.innerHTML = ic.min(); cl.innerHTML = ic.close();
    mx.innerHTML = maximized ? ic.restore() : ic.max();
    mx.setAttribute('aria-label', maximized ? 'Restore down' : 'Maximize');
  }
  appEl.querySelector('.titlebar').addEventListener('click', e => {
    const b = e.target.closest('[data-win]'); if (!b) return;
    ej.win[b.dataset.win]();
  });
  appEl.querySelector('.titlebar').addEventListener('dblclick', e => { if (!e.target.closest('[data-win]')) ej.win.max(); });
  ej.win.onState(s => renderWinCtl(s.maximized));
  renderWinCtl((await ej.win.state()).maximized);

  // ---------- routing / rendering ----------
  function pageFor(view) {
    if (view === 'home') return E.pages.home;
    if (view === 'events') return E.pages.events;
    if (view === 'settings') return E.pages.settings;
    if (view.startsWith('page:')) return E.pages[view.slice(5)];
    return E.pages.home;
  }

  EX.ui = ui;
  EX.rerender = () => render(true);
  function render(force) {
    const page = pageFor(ui.view);
    const key = ui.view;
    if (key !== currentKey || !viewEl) {
      currentKey = key;
      viewEl = document.createElement('div');
      viewEl.className = 'view';
      viewEl.innerHTML = page.render(ctx());
      main.replaceChildren(viewEl);
      main.scrollTop = 0;
      if (page.mount) page.mount(viewEl, ctx());
      return;
    }
    if (force || page.live) E.morph(viewEl, page.render(ctx()));
  }

  // Events come from the database, already filtered, 200 at a time (newest first).
  // mode 'reset': first page · 'more': the page before the oldest shown · 'new': whatever arrived after the newest shown.
  // Loads run one after another, so two never start from the same old list.
  let evQueue = Promise.resolve();
  function loadEvents(mode = 'reset') {
    evQueue = evQueue.then(() => loadEventsNow(mode)).catch(() => {});
    return evQueue;
  }
  async function loadEventsNow(mode) {
    const q = E.pages.events.query(state.snap.stats, ui);
    const cur = ui.events;
    const same = cur && cur.rows.length && cur.query === JSON.stringify(q); // filter or default character unchanged
    ui.eventSeq = state.snap.stats && state.snap.stats.eventSeq;
    if (mode === 'more' && same) {
      const r = await ej.events({ ...q, before: cur.rows[cur.rows.length - 1].seq });
      ui.events = { ...r, rows: cur.rows.concat(r.rows), query: cur.query };
    } else if (mode === 'new' && same) {
      const r = await ej.events({ ...q, limit: 1000, after: cur.rows[0].seq });
      if (r.rows.length === 1000) ui.events = { ...(await ej.events(q)), query: JSON.stringify(q) }; // too many: start fresh, no holes
      else ui.events = { ...r, rows: r.rows.concat(cur.rows), query: cur.query };
    } else {
      ui.events = { ...(await ej.events(q)), query: JSON.stringify(q) };
    }
  }

  // Data a settings tab needs before it can draw.
  async function loadTab() {
    if (ui.settingsTab !== 'storage') return;
    await Promise.all([
      ej.listBackups().then(b => { ui.backups = b; }).catch(() => { ui.backups = []; }),
      ej.storage().then(d => { ui.storage = d; }).catch(() => { ui.storage = { failed: true }; }),
    ]);
  }
  // Draw the tab right away and fill it in when its data is there (the disk walk can take a moment).
  function refreshTab() {
    loadTab().then(() => { if (ui.view === 'settings') render(true); });
  }

  async function go(target) {
    if (ui.recording) stopRecording(); // leaving mid-recording must not leave the hotkeys paused
    if (target.startsWith('settings')) {
      const tab = target.split(':')[1];
      if (tab) ui.settingsTab = tab;
      ui.view = 'settings';
      refreshTab();
    } else {
      ui.view = target;
    }
    if (ui.view === 'events') await loadEvents();
    if (ui.view !== 'home') ui.editing = false;
    renderSide();
    render();
  }

  // ---------- actions ----------
  const ACTS = {
    ...EX.weSetup.actions(ui),
    'ws-toggle': () => { ui.wsOpen = !ui.wsOpen; render(true); },
    play: async () => { const r = await ej.launch('poe'); if (!r.ok) E.toastError(r.error); },
    pob: async () => { const r = await ej.launch('pob'); if (!r.ok) E.toastError(r.error); },
    'ov-toggle': () => save({ overlay: { enabled: !state.cfg.overlay.enabled } }),
    'we-keep': async b => { const ok = await ej.wealthResolve(b.dataset.id, true); state.snap = await ej.snapshot(); render(true); if (ok) E.toast('Counted: this is your stash now.', { kind: 'ok' }); else E.toast('That export was already answered.'); },
    'we-drop': async b => { await ej.wealthResolve(b.dataset.id, false); state.snap = await ej.snapshot(); render(true); },
    'we-refetch': async () => { const r = await ej.wealthRefetch(); ui.weWaitSince = Date.now(); ui.weWaitAt = (state.snap.wealth && state.snap.wealth.at) || 0; state.snap = await ej.snapshot(); render(true); E.toast(r && r.inTab ? 'Exporting in your open Wealthy Exile tab…' : 'Wealthy Exile opened, exporting…'); },
    'ess-toggle': () => save({ essences: { enabled: !state.cfg.essences.enabled } }),
    'launch-pob': () => save({ launch: { pob: !state.cfg.launch.pob } }),
    'launch-apt': () => save({ launch: { apt: !state.cfg.launch.apt } }),
    'launch-we': () => save({ launch: { we: !state.cfg.launch.we } }),
    'wesync-toggle': () => save({ weSync: { background: !state.cfg.weSync.background } }),
    'launch-browse': async () => { const f = await ej.pickFile({ filters: [{ name: 'Program', extensions: ['exe'] }] }); if (f) { ui.lnewTarget = f; render(true); } },
    'launch-add': async () => {
      const target = (ui.lnewTarget || '').trim();
      if (!/\.exe$/i.test(target) && !/^https:\/\//i.test(target)) { E.toast('Use a program (.exe) or a link starting with https://'); return; }
      const custom = state.cfg.launch.custom.concat([{ id: 'c' + Date.now().toString(36), name: (ui.lnewName || '').trim(), target, on: true }]);
      if (await save({ launch: { custom } })) { ui.lnewName = ''; ui.lnewTarget = ''; render(true); }
    },
    'apt': async () => { const r = await ej.launch('apt'); if (r && !r.ok) E.toastError(r.error); },
    'update-install': async () => { const r = await ej.updateInstall(); if (r && !r.ok) E.toastError(r.error); },
    'update-check': async () => { await ej.updateCheck(); E.toast('Checking for updates…'); setTimeout(() => render(true), 3000); },
    'brk-toggle': () => save({ breaks: { enabled: !state.cfg.breaks.enabled } }),
    'brk-campaign': () => save({ breaks: { campaign: !state.cfg.breaks.campaign } }),
    'brk-sound': () => save({ breaks: { sound: { on: !state.cfg.breaks.sound.on } } }),
    'brk-sound-test': () => playChime(state.cfg.breaks.sound.volume),
    'brk-taken': async () => { await ej.breakTaken(); E.toast(`Break noted. The next "Take a break?" comes after ${state.cfg.breaks.everyMin} minutes of play.`); },
    'ov-unlock': () => ej.lockOverlay(!!state.snap.overlayUnlocked),
    'ov-reset': () => ej.resetOverlay(),
    'ns-synced': async () => { await ej.neversinkSynced(); state.snap = await ej.snapshot(); render(true); },
    edit: () => { ui.editing = true; currentKey = null; render(); },
    'edit-done': () => { ui.editing = false; currentKey = null; render(); },
    'layout-reset': async () => {
      if (await E.confirm({ title: 'Reset layout?', body: 'All tiles go back to their default order, and hidden tiles come back.', ok: 'Reset' })) {
        await save({ _replaceLayout: true, layout: { order: E.TILE_ORDER.slice(), sizes: {}, hidden: {}, v: 6 } });
      }
    },
    hide: el => save({ layout: { hidden: { [el.dataset.id]: !state.cfg.layout.hidden[el.dataset.id] } } }),
    'welcome-later': () => save({ ui: { welcomeDone: true } }),
    'paths-auto': async b => {
      b.disabled = true;
      const r = await ej.pathsDetect().catch(() => null);
      state.snap = await ej.snapshot(); state.cfg = await ej.getConfig(); render(true);
      const names = { poeExe: 'Path of Exile', clientTxt: 'Client.txt', pobExe: 'Path of Building', aptExe: 'Awakened PoE Trade' };
      if (!r) return E.toastError('Looking for the game failed.');
      // A different log means rebuilding league stats: same question as Browse.
      if (r.suggestLog && await E.confirm({ title: 'Use the log it found?', body: `Found ${r.suggestLog}. Switching rebuilds all league stats from that file. A backup of your current stats is kept.`, ok: 'Use it' })) {
        if (await save({ paths: { clientTxt: r.suggestLog } })) r.changed.push('clientTxt');
      }
      const P = state.snap.paths;
      if (r.changed.length) E.toast('Filled in: ' + r.changed.map(k => names[k]).join(', '), { kind: 'ok' });
      else if (P.clientTxt && P.poeExe) E.toast('Your paths already work. Nothing changed.');
      else E.toast(r.found.length ? 'Nothing new found for the paths that are missing. Use Browse.' : 'Found nothing in the usual places. Use Browse.');
    },
    collapse: () => save({ ui: { sidebarCollapsed: !state.cfg.ui.sidebarCollapsed } }),
    motion: () => save({ ui: { motion: !state.cfg.ui.motion } }),
    'maps-all': async () => { ui.showAllMaps = !ui.showAllMaps; if (ui.showAllMaps) ui.allMaps = await ej.allMaps(); render(true); },
    'profile-check': async () => { await ej.checkProfile(); state.snap = await ej.snapshot(); render(true); },
    'goal-pick': async () => {
      if (ui.editing) return;
      const g = state.cfg.goal;
      const r = await E.goalPicker(g.name ? { name: g.name, label: g.label } : null);
      if (!r) return;
      if (r.clear) { await save({ goal: { name: '', id: null, type: null, label: '', divines: null } }); E.toast('Goal removed.'); }
      // A new goal starts without the old goal's fixed fallback price.
      else { await save({ goal: { name: r.name, id: r.id, type: r.type, label: r.label, divines: null } }); E.toast(`New goal: ${r.name}${r.label ? ' · ' + r.label : ''}`, { kind: 'ok' }); }
      state.snap = await ej.snapshot(); render(true);
    },
    'wealth-sync': async () => {
      if (ui.editing) return;
      const r = await ej.wealthSync();
      if (r.ok) { ui.weWaitSince = Date.now(); ui.weWaitAt = (state.snap.wealth && state.snap.wealth.at) || 0; }
      E.toast(r.ok ? (r.inTab ? 'Syncing in your open Wealthy Exile tab…' : 'Wealthy Exile opened, syncing…') : `Synced recently. Next sync in ${Math.ceil(r.left / 60000)} min${r.inTab ? '' : '; opened Wealthy Exile'}.`);
      state.snap = await ej.snapshot(); render(true);
    },
    'storage-refresh': () => refreshTab(),
    'pob-folder': async () => { const r = await ej.openPobFolder(); if (r && r.ok === false) E.toastError(`Could not open the folder: ${r.error}`); },
    'diag-copy': async () => { await ej.copyDiagnostics(); E.toast('Diagnostics copied. Paste them to whoever helps you.'); },
    'logs-open': async () => { const r = await ej.openDataFolder(); if (r && r.ok === false) E.toastError(`Could not open the folder: ${r.error}`); },
    'ns-off': () => save({ neversink: { remind: false } }),
    'ns-on': () => save({ neversink: { remind: true } }),
    'storage-open': async () => { const r = await ej.openDataFolder(); if (r && r.ok === false) E.toastError(`Could not open the folder: ${r.error}`); },
    'events-more': async () => { await loadEvents('more'); render(true); },
    rebuild: async () => {
      if (await E.confirm({ title: 'Rebuild league data?', body: 'Exilogue reads Client.txt again from the league start. A backup of your current stats is kept, so you can go back in Backups below.', ok: 'Rebuild', danger: true })) {
        const r = await ej.resetLeague();
        if (r && r.ok === false) E.toastError(r.error);
        state.snap = await ej.snapshot(); ui.events = null; await loadTab(); render(true);
      }
    },
  };

  main.addEventListener('click', async e => {
    const t = e.target;
    const url = t.closest('[data-url]');
    if (url) { e.preventDefault(); ej.openUrl(url.dataset.url); return; }
    const nav = t.closest('[data-nav]');
    if (nav) { go(nav.dataset.nav); return; }
    const act = t.closest('[data-act]');
    if (act && ACTS[act.dataset.act]) { ACTS[act.dataset.act](act); return; }
    if (act && act.dataset.act.startsWith('launchc:')) {
      const id = act.dataset.act.slice(8);
      return save({ launch: { custom: state.cfg.launch.custom.map(c => (c.id === id ? { ...c, on: !c.on } : c)) } });
    }
    const lr = t.closest('[data-lremove]');
    if (lr) return save({ launch: { custom: state.cfg.launch.custom.filter(c => c.id !== lr.dataset.lremove) } });
    const tab = t.closest('[data-tab]');
    if (tab) { ui.settingsTab = tab.dataset.tab; render(true); refreshTab(); return; }
    const br = t.closest('[data-browse]');
    if (br) {
      const key = br.dataset.browse;
      const f = await ej.pickFile(key === 'clientTxt' ? { filters: [{ name: 'Log file', extensions: ['txt'] }] } : { filters: [{ name: 'Program', extensions: ['exe'] }] });
      if (!f) return;
      // During the first start there are no stats to rebuild yet, and picking a file doesn't close the setup card (Start/Later do).
      const fresh = !state.cfg.ui.welcomeDone;
      if (key === 'clientTxt' && !fresh && !(await E.confirm({ title: 'Use this log?', body: 'Changing Client.txt rebuilds all league stats from the new file. A backup of your current stats is kept.', ok: 'Use it' }))) return;
      await save({ paths: { [key]: f } });
      return;
    }
    const rs = t.closest('[data-restore]');
    if (rs) {
      if (await E.confirm({ title: 'Restore this backup?', body: `Your current stats are replaced by the backup from ${E.date(ui.backups.find(b => b.file === rs.dataset.restore)?.at)}. What you have now is backed up first, so this can be undone too.`, ok: 'Restore' })) {
        const r = await ej.restoreBackup(rs.dataset.restore);
        if (!r.ok) E.toastError(r.error);
        state.cfg = await ej.getConfig(); // a backup for another log brings its path and start along
        state.snap = await ej.snapshot(); ui.events = null; await loadTab(); render(true);
      }
      return;
    }
    const hk = t.closest('[data-hk]');
    if (hk) { ui.recording = hk.dataset.hk; ej.pauseHotkeys(true); render(true); return; }
    const hc = t.closest('[data-hkclear]');
    if (hc) { const k = hc.dataset.hkclear; await save({ hotkeys: { [k]: '' } }); main.querySelector(`[data-hk="${k}"]`)?.focus(); return; }
    const ef = t.closest('[data-evfilter]');
    if (ef) { ui.eventsFilter = ef.dataset.evfilter; await loadEvents(); render(true); }
  });
  side.addEventListener('click', e => {
    const url = e.target.closest('[data-url]'); if (url) { ej.openUrl(url.dataset.url); return; }
    const nav = e.target.closest('[data-nav]'); if (nav) { go(nav.dataset.nav); return; }
    const act = e.target.closest('[data-act]'); if (act && ACTS[act.dataset.act]) ACTS[act.dataset.act](act);
  });

  // Typing in the "add a program" fields: kept in ui so a re-render doesn't lose it.
  main.addEventListener('input', e => {
    if (e.target.dataset && 'brkvol' in e.target.dataset) { const o = e.target.nextElementSibling; if (o) o.textContent = e.target.value + '%'; e.target.setAttribute('aria-valuetext', e.target.value + '%'); return; }
    const k = e.target.dataset && e.target.dataset.lnew;
    if (k === 'name') ui.lnewName = e.target.value; else if (k === 'target') ui.lnewTarget = e.target.value;
  });
  main.addEventListener('change', async e => {
    const t = e.target;
    if ('brkevery' in t.dataset) return save({ breaks: { everyMin: Number(t.value) } });
    if ('essdisp' in t.dataset) return save({ essences: { display: t.value === 'auto' ? null : Number(t.value) } });
    if ('brkvol' in t.dataset) { // arrow keys fire a change per step: save and preview once you stop
      const v = Number(t.value); clearTimeout(ui.volTimer);
      ui.volTimer = setTimeout(() => { save({ breaks: { sound: { volume: v } } }); playChime(v); }, 350);
      return;
    }
    if ('brksnd' in t.dataset) { await save({ breaks: { sound: { file: t.value } } }); playChime(state.cfg.breaks.sound.volume, t.value); return; }
    if ('weevery' in t.dataset) return save({ weSync: { everyMin: Number(t.value) } });
    if ('wsbrowser' in t.dataset) { ui.wsBrowser = t.value; render(true); return; }
    if ('ovfont' in t.dataset) return save({ overlay: { font: t.value } });
    if ('ovsize' in t.dataset) return save({ overlay: { size: t.value } });
    if ('theme' in t.dataset) return save({ ui: { theme: t.value } });
    if (t.dataset.pal) return save({ ui: { [t.dataset.pal]: t.value } });
    if ('font' in t.dataset) return save({ ui: { font: t.value } });
    if (t.dataset.sizesel) return save({ layout: { sizes: { [t.dataset.sizesel]: t.value } } });
    if ('evchar' in t.dataset) { ui.eventsChar = t.value; await loadEvents(); return render(true); }
    if (t.dataset.path) {
      const p = t.dataset.path, prev = p.split('.').reduce((o, k) => o && o[k], state.cfg) || '';
      const val = t.value.trim();
      if (val === String(prev).slice(0, p === 'league.start' ? 16 : undefined)) return;
      if ((p === 'paths.clientTxt' || p === 'league.start') && state.cfg.ui.welcomeDone &&
        !(await E.confirm({ title: 'Rebuild league stats?', body: 'This rebuilds all league stats from Client.txt. A backup of your current stats is kept.', ok: 'Rebuild' }))) {
        t.value = p === 'league.start' ? String(prev).slice(0, 16) : prev; return;
      }
      const patch = {}; let o = patch; const parts = p.split('.');
      parts.slice(0, -1).forEach(k => { o = o[k] = {}; });
      o[parts[parts.length - 1]] = val;
      if (!(await save(patch))) t.value = p === 'league.start' ? String(prev).slice(0, 16) : prev;
    }
  });

  // ---------- hotkey recording ----------
  // KeyboardEvent.code -> Electron accelerator key name
  const CODE_MAP = { Comma: ',', Period: '.', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'",
    Backquote: '`', Slash: '/', Backslash: '\\', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Space: 'Space',
    Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete', Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'PageUp',
    PageDown: 'PageDown', NumpadAdd: 'numadd', NumpadSubtract: 'numsub', NumpadMultiply: 'nummult', NumpadDivide: 'numdiv', NumpadDecimal: 'numdec' };
  function accelKey(e) {
    const c = e.code;
    if (/^Key[A-Z]$/.test(c)) return c.slice(3);
    if (/^Digit\d$/.test(c)) return c.slice(5);
    if (/^Numpad\d$/.test(c)) return 'num' + c.slice(6);
    if (/^F([1-9]|1\d|2[0-4])$/.test(c)) return c;
    return CODE_MAP[c] || null;
  }
  function stopRecording() { ui.recording = null; ej.pauseHotkeys(false); }
  // Switching to another window (the game) while a key is being recorded cancels the recording.
  window.addEventListener('blur', () => { if (ui.recording) { stopRecording(); render(true); } });
  window.addEventListener('keydown', e => {
    if (!ui.recording) return;
    e.preventDefault(); e.stopPropagation();
    const key = ui.recording;
    if (e.key === 'Escape') { ui.recording = null; ej.pauseHotkeys(false); render(true); return; }
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;
    const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift'].filter(Boolean);
    const k = accelKey(e);
    if (!k) return; // a key Electron can't use as a hotkey
    // Numpad and F13–F24 work alone (made for macro keys); anything else needs a modifier so typing stays free.
    if (!mods.length && !/^num/.test(k) && !/^F(1[3-9]|2[0-4])$/.test(k)) return;
    ui.recording = null;
    ej.pauseHotkeys(false);
    save({ hotkeys: { [key]: [...mods, k].join('+') } });
  }, true);

  // Never let a dropped file navigate the window away.
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop', e => e.preventDefault());

  // ---------- live data ----------
  // Full snapshot: data changed. Tick: only the running timers. Nothing is drawn while the window can't be seen
  // (minimized, or covered by the game); main stops sending then, and a fresh snapshot is fetched when it shows again.
  function onData(full, prevHk) {
    if (ui.editing || document.hidden) return;
    const page = pageFor(ui.view);
    if (ui.view === 'events') {
      if (full && state.snap.stats && state.snap.stats.eventSeq !== ui.eventSeq) loadEvents('new').then(() => render(true));
      return;
    }
    if (ui.view === 'settings') { if (full) render(JSON.stringify([state.snap.hotkeys, state.snap.hotkeyGame, state.snap.profileStatus, state.snap.update]) !== prevHk); return; }
    if (full) render(page.data !== false); else if (page.live) render();
  }
  // Tool icons come separately (data: URLs, only when they change), not with every snapshot.
  function syncIcons() {
    const rev = state.snap && state.snap.iconsRev;
    if (rev == null || rev === state.iconsRev) return;
    state.iconsRev = rev;
    ej.icons().then(map => { state.icons = map || {}; renderSide(); if (!ui.editing && !document.hidden) render(true); });
  }
  ej.onSnapshot(s => {
    const prevHk = JSON.stringify([state.snap && state.snap.hotkeys, state.snap && state.snap.hotkeyGame, state.snap && state.snap.profileStatus, state.snap && state.snap.update]);
    state.snap = s;
    // After a sync from the tile: say so once the new export has been picked up (gives up after 5 minutes).
    if (ui.weWaitSince) {
      const at = s.wealth && s.wealth.at;
      const w = s.wealth || {};
      if (at && at > ui.weWaitAt) { ui.weWaitSince = 0; E.toast('Wealthy Exile export picked up ✓', { kind: 'ok' }); }
      else if (w.manualExpiredAt > ui.weWaitSince) { ui.weWaitSince = 0; E.toastError("Your Wealthy Exile tab didn't respond. Press sync again to open it in a new tab."); }
      else if (w.failAt > ui.weWaitSince) { ui.weWaitSince = 0; E.toastError("Wealthy Exile couldn't sync. Firefox shows why."); }
      else if (Date.now() - ui.weWaitSince > 5 * 60e3) ui.weWaitSince = 0;
    }
    syncIcons();
    onData(true, prevHk);
  });
  // Pli-pling when an export comes in with other tabs than last time (the question is on Home).
  ej.onWealthCheck(async () => {
    const sv = state.cfg.breaks && state.cfg.breaks.sound && state.cfg.breaks.sound.volume;
    const v = Number.isFinite(sv) ? sv : 60; // follows the break sound's volume slider
    try { const a = new Audio('sounds/export-check.wav'); a.volume = Math.max(0, Math.min(1, v / 100)); a.play().catch(() => {}); } catch { /* no audio device */ }
    state.snap = await ej.snapshot(); render(true);
    if (ui.view !== 'home') E.toast('Your Wealthy Exile export needs an answer: see Home.');
  });
  ej.onTick(t => { E.applyTick(state.snap, t); onData(false); });
  document.addEventListener('visibilitychange', async () => {
    ej.setVisible(!document.hidden);
    if (document.hidden) return;
    state.snap = await ej.snapshot();
    syncIcons();
    if (ui.view === 'events') await loadEvents('new');
    render(true);
  });
  ej.onConfig(c => { applyConfig(c); render(true); });

  applyConfig(state.cfg);
  go(location.hash.slice(1) || 'home');
})();
