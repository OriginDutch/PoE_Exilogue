'use strict';
(function () {
  const E = EX, ic = EX.icon;
  const TABS = [['appearance', 'Appearance'], ['paths', 'Paths'], ['league', 'League'], ['launch', 'Launch'], ['overlay', 'Overlay'], ['hotkeys', 'Hotkeys'], ['storage', 'Storage']];

  const mock = pal => `<div class="mock t-${pal}" aria-hidden="true"><div class="ms"><i class="a"></i><i></i><i></i><i></i></div><div class="mc"><div class="k poe"><div class="ln" style="width:60%"></div><div class="ln m"></div><div class="bt"></div></div><div class="k"><div class="dot"></div><div class="ln m"></div><div class="ln" style="width:50%"></div></div></div></div>`;
  const opt = (name, value, label, checked) => `<label class="opt"><input type="radio" name="${name}" value="${value}" data-pal="${name}" ${checked ? 'checked' : ''}>${mock(value)}<div class="nm">${label}<span class="on">${ic.check(12)}</span></div></label>`;

  function updatesRow(snap) {
    const u = snap.update || { state: 'off' };
    const st = { off: 'This copy doesn\'t update itself (installed versions do). Install Exilogue with the setup file to get updates.',
      checking: 'Checking for updates…', none: 'Up to date.' + (u.at ? ' Checked ' + E.ago(u.at) + '.' : ''),
      downloading: `Downloading version ${E.esc(u.next || '')}${u.pct ? ' · ' + u.pct + '%' : ''}…`,
      ready: `Version ${E.esc(u.next || '')} is ready. It installs when you close Exilogue.`,
      error: `Couldn't check for updates: ${E.esc(u.error || 'unknown error')}` }[u.state] || '';
    return `<section class="setrow"><div><h2>Updates</h2><p>Exilogue ${E.esc(u.version || '')}. New versions come from GitHub, download in the background and install when you close Exilogue, never while the game runs.</p></div>
      <div style="display:flex;flex-direction:column;gap:10px;align-items:flex-start"><span class="${u.state === 'error' ? 'st no' : 'muted'}" style="white-space:normal">${st}</span>
        <div class="row" style="gap:8px">${u.state === 'ready' ? `<button class="btn p" data-act="update-install" ${snap.gameRunning ? 'disabled' : ''}>Restart and update</button>${snap.gameRunning ? '<span class="sub">after you close the game</span>' : ''}` : u.state !== 'off' ? '<button class="btn" data-act="update-check">Check now</button>' : ''}</div></div></section>`;
  }

  function appearance(cfg, snap) {
    const u = cfg.ui;
    const fonts = [['source', 'Source Sans 3', "'Source Sans 3', sans-serif"], ['bahnschrift', 'Bahnschrift', "Bahnschrift, Barlow, sans-serif"], ['inter', 'Inter', 'Inter, sans-serif'], ['segoe', 'Segoe UI', "'Segoe UI Variable', 'Segoe UI', sans-serif"]];
    return (snap ? updatesRow(snap) : '') + `<section class="setrow"><div><h2>Theme</h2><p>System follows Windows. Right now Windows is set to ${cfg.systemDark ? 'dark' : 'light'}.</p></div>
        <div role="radiogroup" aria-label="Theme" class="seg" style="align-self:start">${[['system', 'System'], ['dark', 'Dark'], ['light', 'Light']].map(([v, l]) => `<label><input type="radio" name="mode" value="${v}" data-theme ${u.theme === v ? 'checked' : ''}>${l}</label>`).join('')}</div></section>
      <section class="setrow"><div><h2>Dark palette</h2><p>Used in dark mode, and in System mode when Windows is dark.</p></div>
        <div class="opts" role="radiogroup" aria-label="Dark palette">${opt('darkPalette', 'night', 'Umbra Night', u.darkPalette === 'night')}${opt('darkPalette', 'spectral', 'Spectral Teal', u.darkPalette === 'spectral')}${opt('darkPalette', 'silver', 'Silver &amp; Ink', u.darkPalette === 'silver')}</div></section>
      <section class="setrow"><div><h2>Light palette</h2><p>Used in light mode, and in System mode when Windows is light.</p></div>
        <div class="opts" role="radiogroup" aria-label="Light palette">${opt('lightPalette', 'paper', 'Cool Paper', true)}</div></section>
      <section class="setrow"><div><h2>Font</h2><p>Applies to the whole app. Numbers always use tabular figures. Bahnschrift comes with Windows.</p></div>
        <div class="fonts" role="radiogroup" aria-label="Font">${fonts.map(([v, l, ff]) => `<label class="fopt"><input type="radio" name="font" value="${v}" data-font ${u.font === v ? 'checked' : ''}><span class="fn">${l}</span><span class="smp" style="font-family:${ff}">TerribleLizard · 2:20 · 8.21.0</span></label>`).join('')}</div></section>
      <section class="setrow" style="border-bottom:0"><div><h2>Smooth transitions</h2><p>Short, equal-length transitions between screens and states. Turn off for instant changes.</p></div>
        <div class="row" style="align-self:start;gap:12px">${E.sw(u.motion, 'Smooth transitions', 'motion')}<span class="muted" aria-hidden="true">${u.motion ? 'On' : 'Off'}</span></div></section>`;
  }

  function paths(cfg, snap) {
    const row = (key, title, desc) => `<section class="setrow"><div><h2>${title}</h2><p>${desc}</p></div>
      <div class="field"><div class="row between"><label class="lbl" for="p-${key}">${title}</label>${E.pathSt(snap.paths[key])}</div>
        <div class="row" style="gap:8px"><input id="p-${key}" class="input" data-path="paths.${key}" value="${E.esc(cfg.paths[key] || '')}" placeholder="Not set">
        <button class="btn" data-browse="${key}">${ic.folder()} Browse</button></div></div></section>`;
    return row('clientTxt', 'Client.txt', 'The game log. Usually in the <code>logs</code> folder of your Path of Exile install. Changing it rebuilds league stats (a backup is kept).') +
      row('poeExe', 'Path of Exile', 'PathOfExile.exe or PathOfExile_x64.exe, for the Play button.') +
      row('pobExe', 'Path of Building', 'Optional, for Launch.') +
      row('aptExe', 'Awakened PoE Trade', 'Optional, for Launch.');
  }

  function profileLine(p) {
    const st = p && p.state;
    const at = p && p.at ? ' · checked ' + E.clock(p.at) : '';
    if (st === 'ok') return `<span class="st ok">${ic.check()} Public profile found: ${p.count} character${p.count === 1 ? '' : 's'}${at}</span><span class="sub" style="white-space:normal">Exilogue uses it to know which characters are yours and which one you logged in with last. Checked every 3 minutes.</span>`;
    if (st === 'private') return `<span class="st no" style="white-space:normal">${ic.warn()} Profile is private. On pathofexile.com, open My Account › Privacy and make the Characters tab public.</span>`;
    if (st === 'notfound') return `<span class="st no">${ic.warn()} Account not found. Use the full name with #, like Name#1234.</span>`;
    if (st === 'error' || st === 'offline') return `<span class="st no">${ic.warn()} Couldn't reach pathofexile.com${p.error ? ' (' + E.esc(p.error) + ')' : ''}${at}</span>`;
    return '<span class="sub" style="white-space:normal">Optional. With a public profile Exilogue knows which characters are yours (party members are ignored) and who is logged in.</span>';
  }

  function league(cfg, ui, snap) {
    const backups = ui.backups || [];
    return `<section class="setrow"><div><h2>League</h2><p>Name and start of the league you are tracking. Anything in Client.txt before the start is ignored.</p></div>
        <div style="display:flex;flex-direction:column;gap:14px">
          <div class="field"><label class="lbl" for="lg-name">League name</label><input id="lg-name" class="input" data-path="league.name" value="${E.esc(cfg.league.name)}"></div>
          <div class="field"><label class="lbl" for="lg-start">Start (local time)</label><input id="lg-start" class="input" data-path="league.start" value="${E.esc(cfg.league.start.slice(0, 16))}" placeholder="YYYY/MM/DD HH:MM">
            <span class="sub">Format YYYY/MM/DD HH:MM. Changing it rebuilds league stats (a backup is kept).</span></div>
          <div class="field"><label class="lbl" for="lg-acc">Account name</label>
            <div class="row" style="gap:8px"><input id="lg-acc" class="input" data-path="account" value="${E.esc(cfg.account)}" placeholder="Name#1234"><button class="btn" data-act="profile-check">${ic.refresh()} Check now</button></div>
            ${profileLine(snap.profileStatus)}</div></div></section>
      <section class="setrow"><div><h2>Goal</h2><p>An item you save for. Home shows how far your Wealthy Exile value is, with the live poe.ninja price.</p></div>
        <div style="display:flex;flex-direction:column;gap:14px">
          <div class="field"><span class="lbl" id="gl-l">Item</span>
            <div class="row" style="gap:8px;align-items:center"><span class="grow">${cfg.goal.name ? `<b>${E.esc(cfg.goal.name)}</b>${cfg.goal.label ? ` <span class="muted">· ${E.esc(cfg.goal.label)}</span>` : ''}` : '<span class="muted">No goal</span>'}</span>
              <button class="btn" data-act="goal-pick" aria-label="${cfg.goal.name ? `Change goal (now ${E.esc(cfg.goal.name)}${cfg.goal.label ? ', ' + E.esc(cfg.goal.label) : ''})` : 'Pick a goal item'}">${cfg.goal.name ? 'Change' : 'Pick an item'}</button></div>
            <span class="sub">Search any unique; variants, 6-links and relics each have their own price.</span></div>
          <div class="field"><label class="lbl" for="gl-div">Fixed price in divines (fallback)</label><input id="gl-div" class="input" data-path="goal.divines" inputmode="decimal" value="${cfg.goal.divines != null ? cfg.goal.divines : ''}" placeholder="Only used when poe.ninja has no price">
            ${snap.goal ? `<span class="sub">${snap.goal.source === 'ninja' ? `poe.ninja: ${snap.goal.price} div` : snap.goal.source === 'fixed' ? 'Using your fixed price (no poe.ninja price found yet)' : 'No price yet'}</span>` : ''}</div></div></section>
      <section class="setrow"><div><h2>Rebuild league data</h2><p>Reads Client.txt again from the league start. Your current stats are kept as a backup first.</p></div>
        <div><button class="btn dout" data-act="rebuild">${ic.refresh()} Rebuild league data</button></div></section>
      <section class="setrow" style="border-bottom:0"><div><h2>Backups</h2><p>Made automatically before every rebuild, path change or restore. Restoring also backs up what you have now.</p></div>
        <div>${backups.length ? `<div class="tblwrap"><table class="tbl"><thead><tr><th>Made</th><th class="r">Size</th><th></th></tr></thead><tbody>
          ${backups.slice(0, 10).map(b => `<tr><td>${E.date(b.at)}</td><td class="r">${Math.max(1, Math.round(b.size / 1024))} KB</td><td class="r"><button class="btn sm" data-restore="${E.esc(b.file)}">Restore</button></td></tr>`).join('')}
          </tbody></table></div>` : '<div class="empty"><b>No backups yet</b><span>One is made the first time you rebuild or change the log path.</span></div>'}</div></section>`;
  }

  function launch(cfg, snap, ui) {
    const L = cfg.launch, P = cfg.paths, w = snap.wealth || {};
    const tool = (key, name, desc, ok) => `<div class="row between" style="gap:12px;padding:8px 0;border-bottom:1px solid var(--line)">
      <div class="grow" style="min-width:0"><div style="font-weight:600">${name}</div><div class="sub ell">${desc}</div></div>${ok === false ? '<span class="st no">' + ic.warn() + ' Path not set</span>' : ''}${E.sw(L[key], 'Start ' + name + ' with the game', 'launch-' + key)}</div>`;
    const custom = L.custom.map(c => `<div class="row between" style="gap:12px;padding:8px 0;border-bottom:1px solid var(--line)">
      <div class="grow" style="min-width:0"><div style="font-weight:600">${E.esc(c.name)}</div><div class="sub ell">${E.esc(c.target)}</div></div>
      <button class="btn q sm" data-lremove="${E.esc(c.id)}">Remove</button>${E.sw(c.on, 'Start ' + c.name + ' with the game', 'launchc:' + c.id)}</div>`).join('');
    const ws = EX.weSetup, connected = w.scriptSeenAt && Date.now() - w.scriptSeenAt < 3 * 60e3 && !w.scriptOld && !w.serverError;
    // Connected and up to date: just the status, the steps fold away (still one click to see them).
    const setup = connected && !ui.wsOpen ? `<div style="display:flex;flex-direction:column;gap:10px">${ws.statusHtml(snap)}<div><button class="btn q sm" data-act="ws-toggle">Show the steps</button></div></div>`
      : ws.html(snap, ui, 'settings') + (connected ? '<div style="margin-top:10px"><button class="btn q sm" data-act="ws-toggle">Hide the steps</button></div>' : '');
    return `<section class="setrow"><div><h2>Start with the game</h2><p>When you press Play in Exilogue, these start too. Tools that are already open are skipped. They keep running when the game closes. Starting the game outside Exilogue starts nothing.</p></div>
        <div>${tool('pob', 'Path of Building', P.pobExe || 'Set the path in Settings › Paths', snap.paths.pobExe)}${tool('apt', 'Awakened PoE Trade', P.aptExe || 'Set the path in Settings › Paths', snap.paths.aptExe)}${tool('we', 'Wealthy Exile', 'Opens wealthyexile.com in your browser')}${custom}</div></section>
      <section class="setrow"><div><h2>Add a program or link</h2><p>Any program (.exe) or https link, started along with the game.</p></div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <div class="field"><label class="lbl" for="lc-name">Name</label><input id="lc-name" class="input" data-lnew="name" value="${E.esc(ui.lnewName || '')}" placeholder="Optional"></div>
          <div class="field"><label class="lbl" for="lc-target">Program or link</label><div class="row" style="gap:8px"><input id="lc-target" class="input" data-lnew="target" value="${E.esc(ui.lnewTarget || '')}" placeholder="C:\\…\\Tool.exe or https://…"><button class="btn" data-act="launch-browse">${ic.folder()} Browse</button></div></div>
          <div><button class="btn p" data-act="launch-add">Add</button></div></div></section>
      <section class="setrow"><div><h2>Connect Wealthy Exile</h2><p>Exilogue gets your net worth and profit per hour from Wealthy Exile. A small script in your browser (through Tampermonkey) syncs and exports there when Exilogue asks, and Exilogue reads the export from Downloads. Exilogue ships the script, so it stays in step with the version you have.</p></div>
        <div>${setup}</div></section>
      <section class="setrow" style="border-bottom:0"><div><h2>Wealthy Exile in the background</h2><p>While you play, Exilogue lets the userscript sync and export about every ${cfg.weSync.everyMin} minutes, in a map or out of one. Not while you're away from the PC. Only works while a Wealthy Exile tab is open in your browser; with one open, the tile button syncs there instead of opening a new tab.</p></div>
        <div style="display:flex;flex-direction:column;gap:12px">
          <div class="row between"><span>Sync in the background</span>${E.sw(cfg.weSync.background, 'Sync Wealthy Exile in the background', 'wesync-toggle')}</div>
          <div class="row between"><span class="muted">At most every</span><select class="select" style="width:auto" data-weevery>${[15, 30, 45, 60, 90].map(m => `<option value="${m}" ${cfg.weSync.everyMin === m ? 'selected' : ''}>${m} min</option>`).join('')}</select></div>
          </div></section>`;
  }

  function hotkeys(cfg, snap, ui) {
    const st = snap.hotkeys || {};
    const msg = { taken: 'Another app already uses this combination. Pick a different one.', duplicate: 'Two actions use the same combination.', invalid: 'Windows does not accept this combination.' };
    const row = (key, title, desc) => {
      const acc = cfg.hotkeys[key], rec = ui.recording === key, err = msg[st[key]];
      const cap = rec ? `<button class="hk rec" data-hk="${key}" aria-label="Recording ${title}. Press a combination, Escape cancels."><span class="dotrec" aria-hidden="true"></span>Press a combination…</button>`
        : `<button class="hk${err ? ' err' : ''}" data-hk="${key}" aria-label="${title}: ${acc || 'none'}. Click to record a new combination.">${acc ? acc.split('+').map(k => `<span class="kbd">${E.esc(k)}</span>`).join('<span class="plus" aria-hidden="true">+</span>') : '<span class="sub">None</span>'}</button>`;
      return `<section class="setrow"><div><h2>${title}</h2><p>${desc}</p></div>
        <div style="display:flex;flex-direction:column;gap:8px"><div class="hkrow">${cap}<button class="btn q" data-hkclear="${key}" ${acc ? '' : 'disabled'}>Clear</button></div>
        ${err ? `<div class="st no" style="white-space:normal">${ic.warn()} ${err}</div>` : ''}</div></section>`;
    };
    return row('toggleOverlay', 'Toggle overlay', 'Show or hide the in-game overlay.') +
      row('unlockOverlay', 'Unlock overlay', 'Unlock to drag and resize the overlay; press again to lock.') +
      row('focusDashboard', 'Focus Exilogue', 'Bring this window to the front.') +
      row('breakTaken', 'I took a break', 'Answers "Take a break?" with yes, or marks a break you took yourself.') +
      `<div class="note" style="margin-top:14px">${ic.info()}<span>Numpad keys and F13–F24 work on their own (handy for macro keys; numpad needs Num Lock on). Other keys need Ctrl, Alt or Shift, so normal typing stays free. A hotkey here is taken from the game while Exilogue runs.</span></div>`;
  }

  function storage(ui) {
    const d = ui.storage;
    if (!d) return '<div class="empty" style="margin-top:20px"><b>Reading disk usage…</b></div>';
    const io = d.io, f = d.files, B = E.bytes;
    const written = io.dbWritten + io.backupWritten + io.configWritten + (io.iconWritten || 0) + (io.wealthWritten || 0);
    const read = io.logRead + io.otherRead;
    const days = io.since ? Math.max(1, (Date.now() - io.since) / 86400000) : null;
    const rows = list => list.map(([l, v, sub]) => `<tr><td>${l}${sub ? `<div class="sub">${sub}</div>` : ''}</td><td class="r">${B(v)}</td></tr>`).join('');
    const table = (list, total) => `<div class="tblwrap"><table class="tbl"><tbody>${rows(list)}</tbody>
      ${total != null ? `<tfoot><tr><td style="font-weight:600">Total</td><td class="r" style="font-weight:600">${B(total)}</td></tr></tfoot>` : ''}</table></div>`;
    return `<section class="setrow"><div><h2>Written to disk</h2><p>Everything Exilogue itself wrote, counted to the byte, since ${io.since ? E.date(io.since) : 'this version was installed'}.${days ? ` That's about ${B(written / days)} per day.` : ''}</p></div>
        <div>${table([
          ['League database', io.dbWritten, 'Stats, events and maps. Saved at most every 30 seconds, only what changed.'],
          ['Backups', io.backupWritten, 'Made before a rebuild, a path or start change, or a restore.'],
          ['Settings', io.configWritten, 'config.json'],
          ['Tool icons', io.iconWritten || 0, 'Fetched once, refreshed at most monthly'],
          ['Wealth exports', io.wealthWritten || 0, 'Totals per Wealthy Exile export'],
        ], written)}</div></section>
      <section class="setrow"><div><h2>Read from disk</h2><p>Client.txt is read once, then only the new lines. Database reads are mostly served from memory by Windows and aren't counted.</p></div>
        <div>${table([
          ['Client.txt', io.logRead, 'The game log'],
          ['Backups and old saves', io.otherRead, 'Restores and the one-time move from v0.3'],
        ], read)}</div></section>
      <section class="setrow"><div><h2>Disk space</h2><p>Size of everything in Exilogue's folder right now.</p></div>
        <div style="display:flex;flex-direction:column;gap:12px">${table([
          ['League database', f.database],
          ['Backups', f.backups, `${f.backupCount} file${f.backupCount === 1 ? '' : 's'} · the newest ${f.keepBackups} are kept`],
          ['Settings', f.config],
          ['Tool icons', f.icons || 0],
          ['Wealth exports', f.wealth || 0, 'The newest 2 CSV files and the totals of all of them'],
          ...(f.other ? [['Old and set-aside files', f.other, 'state.json from v0.3, unreadable files kept for safety']] : []),
          ['Electron engine', f.engine, 'Caches of the engine Exilogue runs on'],
        ], f.total)}
          <div class="note">${ic.info()}<span>The Electron engine also writes its caches here. Windows can only report its disk writes mixed with network and internal traffic, so that part is shown as size, not as writes.</span></div>
          <div class="row between"><span class="sub">Client.txt itself (written by the game): ${B(d.clientTxt)}</span><button class="btn sm" data-act="storage-refresh">${ic.refresh()} Refresh</button></div>
        </div></section>`;
  }

  EX.pages = EX.pages || {};
  EX.pages.settings = {
    live: false,
    render({ cfg, snap, ui }) {
      const tab = ui.settingsTab || 'appearance';
      const body = tab === 'appearance' ? appearance(cfg, snap) : tab === 'paths' ? paths(cfg, snap) : tab === 'league' ? league(cfg, ui, snap)
        : tab === 'storage' ? storage(ui) : tab === 'launch' ? launch(cfg, snap, ui)
        : tab === 'overlay' ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px;margin-top:20px">${EX.overlayControls(cfg, snap)}</div>` : hotkeys(cfg, snap, ui);
      return `<div style="max-width:1000px"><div class="head" style="margin-bottom:16px"><h1 class="h">Settings</h1></div>
        <div class="tabs" role="tablist" aria-label="Settings sections">${TABS.map(([k, l]) => `<button role="tab" aria-selected="${tab === k}" data-tab="${k}">${l}</button>`).join('')}</div>
        <div role="tabpanel">${body}</div></div>`;
    },
  };
})();
