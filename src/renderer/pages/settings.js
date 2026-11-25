'use strict';
(function () {
  const E = EX, ic = EX.icon;
  const TABS = [['appearance', 'Appearance'], ['paths', 'Paths'], ['league', 'League'], ['launch', 'Launch'], ['hotkeys', 'Hotkeys'], ['storage', 'Storage & backups'], ['about', 'About & updates']];

  const mock = pal => `<div class="mock t-${pal}" aria-hidden="true"><div class="ms"><i class="a"></i><i></i><i></i><i></i></div><div class="mc"><div class="k poe"><div class="ln" style="width:60%"></div><div class="ln m"></div><div class="bt"></div></div><div class="k"><div class="dot"></div><div class="ln m"></div><div class="ln" style="width:50%"></div></div></div></div>`;
  const opt = (name, value, label, checked) => `<label class="opt"><input type="radio" name="${name}" value="${value}" data-pal="${name}" ${checked ? 'checked' : ''}>${mock(value)}<div class="nm">${label}<span class="on">${ic.check(12)}</span></div></label>`;

  // Settings › About & updates: the version, its update state and Check now.
  function updatesRow(snap, cfg) {
    const u = snap.update || { state: 'off' };
    const pill = { checking: 'Checking…', none: 'Up to date', downloading: `Downloading ${E.esc(u.next || '')}${u.pct ? ' · ' + u.pct + '%' : ''}`, ready: `${E.esc(u.next || '')} is ready`, error: 'Could not check' }[u.state];
    const detail = u.state === 'off' ? 'This copy doesn\'t update itself (installed versions do). Install Exilogue with the setup file to get updates.'
      : u.state === 'error' ? `Couldn't check for updates: ${E.esc(u.error || 'unknown error')}` : u.state === 'ready' ? (snap.gameRunning ? 'It installs when you close Exilogue after the game, or now with Restart and update.' : 'It installs when you close Exilogue, or now with Restart and update.') : '';
    return `<section class="setrow"><div><h2 data-act="ver-tap">Exilogue ${E.esc(u.version || '')}</h2><p>New versions come from GitHub. They download in the background and install when you close Exilogue (not while the game runs, unless you choose Restart and update).</p></div>
      <div style="display:flex;flex-direction:column;gap:10px;align-items:flex-start">
        ${pill ? `<span class="row" style="gap:10px;flex-wrap:wrap"><span class="pill${u.state === 'ready' ? ' acc' : ''}">${pill}</span>${u.at && u.state !== 'checking' ? `<span class="sub">checked ${E.ago(u.at)}</span>` : ''}</span>` : ''}
        ${detail ? `<span class="${u.state === 'error' ? 'st no' : 'muted'}" style="white-space:normal">${detail}</span>` : ''}
        <div class="row" style="gap:8px;flex-wrap:wrap">${u.state === 'ready' ? `<button class="btn p" data-act="update-install">Restart and update</button>${snap.gameRunning ? '<span class="sub">game is running: you\'ll be asked first</span>' : ''}` : u.state !== 'off' ? `<button class="btn" data-act="update-check" ${u.state === 'checking' || u.state === 'downloading' ? 'disabled' : ''}>Check now</button>` : ''}<button class="btn q" data-url="https://github.com/OriginDutch/PoE_Exilogue/releases">What's new ${ic.ext()}</button></div></div></section>${channelRow(cfg)}`;
  }
  // Hidden until the version above is clicked 5 times; stays while on Test, hides again when going back to Stable.
  function channelRow(cfg) {
    const up = cfg.updates || {}; if (!up.shown) return '';
    const test = up.channel === 'test';
    return `<section class="setrow" style="border-bottom:0"><div><h2>Release channel</h2><p>Test gets new versions first, and they can have bugs. Going back to Stable keeps the version you have until Stable is newer: it never installs an older version.</p></div>
      <div style="display:flex;flex-direction:column;gap:10px;align-items:flex-start"><div role="radiogroup" aria-label="Release channel" class="seg">${[['stable', 'Stable'], ['test', 'Test']].map(([v, l]) => `<label><input type="radio" name="channel" value="${v}" data-act="channel" ${up.channel === v ? 'checked' : ''}>${l}</label>`).join('')}</div>
      <span class="muted" style="white-space:normal">${test ? 'You get test versions. Found a bug? Copy the diagnostics on the Help page and send them.' : 'You get stable versions only.'}</span></div></section>`;
  }


  function appearance(cfg, snap) {
    const u = cfg.ui;
    const fonts = [['source', 'Source Sans 3', "'Source Sans 3', sans-serif"], ['bahnschrift', 'Bahnschrift', "Bahnschrift, Barlow, sans-serif"], ['inter', 'Inter', 'Inter, sans-serif'], ['segoe', 'Segoe UI', "'Segoe UI Variable', 'Segoe UI', sans-serif"]];
    return `<section class="setrow"><div><h2>Theme</h2><p>System follows Windows. Right now Windows is set to ${cfg.systemDark ? 'dark' : 'light'}.</p></div>
        <div role="radiogroup" aria-label="Theme" class="seg" style="align-self:start">${[['system', 'System'], ['dark', 'Dark'], ['light', 'Light']].map(([v, l]) => `<label><input type="radio" name="mode" value="${v}" data-theme ${u.theme === v ? 'checked' : ''}>${l}</label>`).join('')}</div></section>
      <section class="setrow"><div><h2>Dark palette</h2><p>Used in dark mode, and in System mode when Windows is dark. Light mode uses Cool Paper.</p></div>
        <div class="opts" role="radiogroup" aria-label="Dark palette">${opt('darkPalette', 'night', 'Umbra Night', u.darkPalette === 'night')}${opt('darkPalette', 'spectral', 'Spectral Teal', u.darkPalette === 'spectral')}${opt('darkPalette', 'silver', 'Silver &amp; Ink', u.darkPalette === 'silver')}</div></section>

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
    const where = snap.pathSource && snap.pathSource.poe ? `Your Path of Exile was found in ${E.esc(snap.pathSource.poe === 'standalone' ? 'the standalone client' : snap.pathSource.poe)}.` : 'It also runs by itself on the first start.';
    const auto = `<section class="setrow"><div><h2>Find automatically</h2><p>Exilogue looks in the usual places: Steam (all libraries), the standalone client, Epic, and the default folders of Path of Building and Awakened PoE Trade. It only fills in paths that don't work now.</p></div>
      <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-start"><button class="btn" data-act="paths-auto">${ic.refresh()} Look again</button><span class="sub" style="white-space:normal">${where}</span></div></section>`;
    return auto + row('clientTxt', 'Client.txt', 'The game log. Usually in the <code>logs</code> folder of your Path of Exile install. Changing it rebuilds league stats (a backup is kept).') +
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
    return `<section class="setrow"><div><h2>League</h2><p>Name and start of the league you are tracking. Anything in Client.txt before the start is ignored.</p></div>
        <div style="display:flex;flex-direction:column;gap:14px">
          <div class="field"><label class="lbl" for="lg-name">League name</label><input id="lg-name" class="input" data-path="league.name" value="${E.esc(cfg.league.name)}"></div>
          <div class="field"><label class="lbl" for="lg-start">Start (local time)</label><input id="lg-start" class="input" data-path="league.start" value="${E.esc(cfg.league.start.slice(0, 16))}" placeholder="YYYY/MM/DD HH:MM">
            <span class="sub">YYYY/MM/DD HH:MM, your local time (24-hour). Changing it rebuilds league stats (a backup is kept).</span></div>
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
`;
  }

  function launch(cfg, snap, ui) {
    const L = cfg.launch, P = cfg.paths, w = snap.wealth || {};
    const tool = (key, name, desc, ok) => `<div class="row between" style="gap:12px;padding:8px 0;border-bottom:1px solid var(--line)">
      <div class="grow" style="min-width:0"><div style="font-weight:600">${name}</div><div class="sub ell">${desc}</div></div>${ok === false ? '<span class="st no">' + ic.warn() + ' Path not set</span>' : ''}${E.sw(L[key], 'Start ' + name + ' with the game', 'launch-' + key)}</div>`;
    const custom = L.custom.map(c => `<div class="row between" style="gap:12px;padding:8px 0;border-bottom:1px solid var(--line)">
      <div class="grow" style="min-width:0"><div style="font-weight:600">${E.esc(c.name)}</div><div class="sub ell">${E.esc(c.target)}</div></div>
      <button class="btn q sm" data-lremove="${E.esc(c.id)}">Remove</button>${E.sw(c.on, 'Start ' + c.name + ' with the game', 'launchc:' + c.id)}</div>`).join('');
    return `<section class="setrow"><div><h2>Start with the game</h2><p>When you press Play in Exilogue, these start too. Tools that are already open are skipped. They keep running when the game closes. Starting the game outside Exilogue starts nothing.</p></div>
        <div>${tool('pob', 'Path of Building', P.pobExe || 'Set the path in Settings › Paths', snap.paths.pobExe)}${tool('apt', 'Awakened PoE Trade', P.aptExe || 'Set the path in Settings › Paths', snap.paths.aptExe)}${tool('we', 'Wealthy Exile', 'Opens wealthyexile.com in your browser')}${custom}</div></section>
      <section class="setrow"><div><h2>Add a program or link</h2><p>Any program (.exe) or https link, started along with the game.</p></div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <div class="field"><label class="lbl" for="lc-name">Name</label><input id="lc-name" class="input" data-lnew="name" value="${E.esc(ui.lnewName || '')}" placeholder="Optional"></div>
          <div class="field"><label class="lbl" for="lc-target">Program or link</label><div class="row" style="gap:8px"><input id="lc-target" class="input" data-lnew="target" value="${E.esc(ui.lnewTarget || '')}" placeholder="C:\\…\\Tool.exe or https://…"><button class="btn" data-act="launch-browse">${ic.folder()} Browse</button></div></div>
          <div><button class="btn p" data-act="launch-add">Add</button></div></div></section>
      <div class="note" style="margin-top:14px">${ic.info()}<span>Wealthy Exile (connecting, and syncing while you play) has its own page. <button class="lnk" data-nav="page:wealthy">Open Wealthy Exile</button></span></div>`;
  }

  function hotkeys(cfg, snap, ui) {
    const st = snap.hotkeys || {};
    const msg = { taken: 'Another app already uses this combination. Pick a different one.', duplicate: 'Two actions use the same combination.', invalid: 'Windows does not accept this combination.' };
    const row = (key, title, desc) => {
      const acc = cfg.hotkeys[key], rec = ui.recording === key;
      const err = st[key] === 'game' ? `Path of Exile uses this combination (${E.esc((snap.hotkeyGame || {})[key] || 'one of your game keys')}), so Exilogue leaves it to the game. Pick a different one.` : msg[st[key]];
      const cap = rec ? `<button class="hk rec" data-hk="${key}" aria-label="Recording ${title}. Press a combination, Escape cancels."><span class="dotrec" aria-hidden="true"></span>Press a combination…</button>`
        : `<button class="hk${err ? ' err' : ''}${acc ? '' : ' hk-none'}" data-hk="${key}" aria-label="${title}: ${acc || 'none'}. Click to record a new combination.">${acc ? acc.split('+').map(k => `<span class="kbd">${E.esc(k)}</span>`).join('<span class="plus" aria-hidden="true">+</span>') : '<span class="sub">+ Click to set a key</span>'}</button>`;
      return `<section class="setrow"><div><h2>${title}</h2><p>${desc}</p></div>
        <div style="display:flex;flex-direction:column;gap:8px"><div class="hkrow">${cap}${acc ? `<button class="btn q" data-hkclear="${key}">Clear</button>` : ''}</div>
        ${err ? `<div class="st no" style="white-space:normal">${ic.warn()} ${err}</div>` : ''}</div></section>`;
    };
    return row('toggleOverlay', 'Show / hide overlay', 'Show or hide the in-game overlay.') +
      row('unlockOverlay', 'Unlock overlay', 'Unlock to drag and resize the overlay; press again to lock.') +
      row('focusDashboard', 'Focus Exilogue', 'Bring this window to the front.') +
      row('breakTaken', 'I took a break', 'Answers "Take a break?" with yes, or marks a break you took yourself.') +
      row('weSync', 'Sync & export (Wealthy Exile)', 'Sync and export in your open Wealthy Exile tab, without leaving the game. With no tab open it does nothing, and the overlay (when it is on) says so.') +
      row('sheetWindow', 'Cheat sheet window', 'Brings the cheat sheet window over the game, without taking the keyboard from it. Press again to close it.') +
      row('essenceOverlay', 'Essence upgrade overlay', 'Open your essence stash tab and press it: marks what is worth upgrading. Press again to hide.') +
      `<div class="note" style="margin-top:14px">${ic.info()}<span>Hotkeys work while Path of Exile runs; outside the game the keys stay free for other programs. Exilogue never takes a key the game uses (your own keybinds, plus copy and paste of item text). Numpad keys and F13–F24 work on their own (handy for macro keys; numpad needs Num Lock on). Other keys need Ctrl, Alt or Shift, so normal typing stays free.</span></div>`;
  }

  function storage(ui) {
    const d = ui.storage;
    const ready = d && !d.failed && d.io && d.files;
    const io = ready ? d.io : {}, f = ready ? d.files : {}, B = E.bytes;
    const written = ready ? io.dbWritten + io.backupWritten + io.configWritten + (io.iconWritten || 0) + (io.wealthWritten || 0) : 0;
    const read = ready ? io.logRead + io.otherRead : 0;
    const days = io.since ? Math.max(1, (Date.now() - io.since) / 86400000) : null;
    const rows = list => list.map(([l, v, sub]) => `<tr><td>${l}${sub ? `<div class="sub">${sub}</div>` : ''}</td><td class="r">${B(v)}</td></tr>`).join('');
    const table = (list, total) => `<div class="tblwrap"><table class="tbl"><tbody>${rows(list)}</tbody>
      ${total != null ? `<tfoot><tr><td style="font-weight:600">Total</td><td class="r" style="font-weight:600">${B(total)}</td></tr></tfoot>` : ''}</table></div>`;
    const backups = ui.backups || [], backupsLoading = ui.backups == null;
    const diskBtns = `<span class="row" style="gap:8px"><button class="btn sm" data-act="storage-open">${ic.folder()} Open folder</button><button class="btn sm" data-act="storage-refresh">${ic.refresh()} Refresh</button></span>`;
    const disk = ready ? `<section class="setrow"><div><h2>Disk space</h2><p>Size of everything in Exilogue's folder right now.</p></div>
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
          <div class="row between"><span class="sub">Client.txt itself (written by the game): ${B(d.clientTxt)}</span><span class="row" style="gap:8px"><button class="btn sm" data-act="storage-open">${ic.folder()} Open folder</button><button class="btn sm" data-act="storage-refresh">${ic.refresh()} Refresh</button></span></div>
        </div></section>
`
      : `<section class="setrow"><div><h2>Disk space</h2><p>Size of everything in Exilogue's folder right now.</p></div>
        <div style="display:flex;flex-direction:column;gap:12px"><div class="sub">${d && d.failed ? 'Could not read the disk usage.' : 'Reading disk usage…'}</div><div class="row push">${diskBtns}</div></div></section>`;
    return disk + `      <section class="setrow"><div><h2>Rebuild league data</h2><p>Reads Client.txt again from the league start. Your current stats are kept as a backup first.</p></div>
        <div><button class="btn dout" data-act="rebuild">${ic.refresh()} Rebuild league data</button></div></section>
      <section class="setrow" style="border-bottom:0"><div><h2>Backups</h2><p>Made automatically before every rebuild, path change or restore. Restoring also backs up what you have now.</p></div>
        <div>${backups.length ? `<div class="tblwrap"><table class="tbl"><thead><tr><th>Made</th><th class="r">Size</th><th></th></tr></thead><tbody>
          ${backups.slice(0, 10).map(b => `<tr><td>${E.date(b.at)}</td><td class="r">${Math.max(1, Math.round(b.size / 1024))} KB</td><td class="r"><button class="btn sm" data-restore="${E.esc(b.file)}">Restore</button></td></tr>`).join('')}
          </tbody></table></div>` : backupsLoading ? '<div class="sub">Loading backups…</div>' : '<div class="empty"><b>No backups yet</b><span>One is made the first time you rebuild or change the log path.</span></div>'}</div></section>
` + (ready ? `      <details class="setdetails"><summary>Disk writes and reads (for the curious)</summary>
      <section class="setrow"><div><h2>Written to disk</h2><p>Everything Exilogue itself wrote, counted to the byte, since ${io.since ? E.date(io.since) : 'this version was installed'}.${days ? ` That's about ${B(written / days)} per day.` : ''}</p></div>
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
</details>` : '');
  }

  EX.pages = EX.pages || {};
  EX.pages.settings = {
    live: false,
    render({ cfg, snap, ui }) {
      const tab = ui.settingsTab || 'appearance';
      const body = tab === 'appearance' ? appearance(cfg, snap) : tab === 'paths' ? paths(cfg, snap) : tab === 'league' ? league(cfg, ui, snap)
        : tab === 'storage' ? storage(ui) : tab === 'about' ? updatesRow(snap, cfg) : tab === 'launch' ? launch(cfg, snap, ui)
        : tab === 'overlay' ? `<div class="note" style="margin-top:20px">${ic.info()}<span>Overlay settings are on the Overlay page. <button class="lnk" data-nav="page:overlay">Open Overlay</button></span></div>` : hotkeys(cfg, snap, ui);
      return `<div style="max-width:1000px"><div class="head" style="margin-bottom:16px"><h1 class="h">Settings</h1></div>
        <div class="tabs" role="tablist" aria-label="Settings sections">${TABS.map(([k, l]) => `<button role="tab" aria-selected="${tab === k}" data-tab="${k}">${l}</button>`).join('')}</div>
        <div role="tabpanel">${body}</div></div>`;
    },
  };
})();
