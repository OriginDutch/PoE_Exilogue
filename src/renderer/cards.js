'use strict';
// Home cards. Each card renders itself for a size step (xs · s · m · l · xl).
// Principle when shrinking: full controls → key number + main button → logo, name, status.
(function () {
  const E = EX, ic = EX.icon;

  // ---------- shared bits ----------
  // Tool icon (fetched by main and cached in %APPDATA%\Exilogue\icons), or the monogram when there is none.
  // Bundled game art (src/renderer/art) wins for these: Campaign = Waypoint, Session & Maps = Map Device,
  // APT = its own logo (MIT, github.com/SnosMe/awakened-poe-trade; its exe has no icon Windows can read).
  const BUNDLED = { campaign: 'art/waypoint.webp', maps: 'art/map-device.webp', apt: 'art/apt.webp' };
  const iconOf = id => { if (BUNDLED[id]) return BUNDLED[id]; const s = EX.state; return s && s.icons && s.icons[id] || null; };
  // Session & Maps: the frame takes the tier colour of the highest tier reached (white 1–5, yellow 6–10, red 11+).
  const tierCls = id => {
    const t = id === 'maps' && EX.state && EX.state.snap && EX.state.snap.stats && EX.state.snap.stats.highestTier;
    return t ? (t >= 11 ? ' t-red' : t >= 6 ? ' t-yel' : ' t-wht') : '';
  };
  const logo = (def, lg) => {
    const src = iconOf(def.id);
    return src ? `<span class="logo img${lg ? ' lg' : ''}${tierCls(def.id)}" aria-hidden="true"><img src="${E.esc(src)}" alt=""></span>`
      : `<span class="logo${lg ? ' lg' : ''}" aria-hidden="true">${def.mono}</span>`;
  };
  EX.iconOf = iconOf; EX.logo = logo;
  function head(def, { lg = false, sub = '', right = '', size = 16 } = {}) {
    const open = def.kind === 'link'
      ? `<button class="open" data-url="${def.url}" style="font-size:${size}px">${def.name}</button>`
      : def.kind === 'soon'
        ? `<span class="open" style="font-size:${size}px">${def.name}</span>`
        : `<button class="open" data-nav="page:${def.id}" style="font-size:${size}px">${def.name}</button>`;
    return `<div class="ch">${logo(def, lg)}
      <div class="t">${open}${sub ? `<div class="sub">${sub}</div>` : ''}</div>${right}</div>`;
  }
  const xs = (def, pill) => `${logo(def)}
      ${def.kind === 'link' ? `<button class="open grow" data-url="${def.url}">${def.name}</button>`
        : def.kind === 'soon' || def.kind === 'widget' ? `<span class="open grow">${def.name}</span>`
          : `<button class="open grow" data-nav="page:${def.id}">${def.name}</button>`}${pill || ''}`;
  const statusPill = (on, onText, offText) => `<span class="pill${on ? ' ok' : ''}"><span class="d" aria-hidden="true"></span>${on ? onText : offText}</span>`;
  const noLog = what => `<div class="empty push"><b>No log</b><span>Needs Client.txt to ${what}.</span></div>`;
  const tierPill = (area) => area && area.kind === 'map' && area.tier ? `<span class="pill acc">Tier ${area.tier}</span>`
    : area && area.act ? `<span class="pill">Act ${area.act}</span>` : '';

  // ---------- shared Home bits (v0.5) ----------
  const num = (v, d = 1) => v == null ? '–' : Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-US') : v.toFixed(Math.abs(v) >= 100 ? 0 : d);
  const signed = (v, d = 1) => v == null ? '–' : `${v >= 0 ? '+' : '−'}${num(Math.abs(v), d)}`;
  const chip = (b, l, cls = '') => `<div class="chip${cls}"><b>${b}</b><span>${l}</span></div>`;
  const mapName = m => E.esc((m.zone || m.areaId || '').replace(/ Map$/, ''));
  // div per hour: this session's, else the last finished session's.
  const rateOf = (snap, st) => {
    const r = snap.divRate && snap.divRate.perHour;
    if (r != null) return { v: r, now: true };
    const ls = st && st.lastSession;
    return ls && ls.divPerHour != null ? { v: ls.divPerHour, now: false } : null;
  };
  function divBox(snap, st) {
    const r = rateOf(snap, st), ls = st && st.lastSession;
    const vs = r && r.now && ls && ls.divPerHour != null ? r.v - ls.divPerHour : null;
    const foot = !r ? (snap.wealth && snap.wealth.count ? 'needs a second export this session' : 'needs Wealthy Exile exports')
      : vs != null ? `<span class="${vs >= 0 ? 'good' : 'bad'}">${vs >= 0 ? '▲' : '▼'} ${num(Math.abs(vs), 2)}</span> vs last session`
        : r.now ? 'this session' : 'last session';
    return `<div class="divbox"><div class="lbl">Div / hour</div><div class="v">${r ? num(r.v, 2) : '–'}</div><div class="sub">${foot}</div></div>`;
  }
  const evDot = t => `var(--e-${({ level: 'lvl', death: 'death', act: 'act', campaign: 'camp', firstMap: 'map', tier: 'tier' })[t] || 'sess'})`;
  function recentEvents(st, n) {
    const evs = (st.latestEvents || []).slice(-n).reverse();
    if (!evs.length) return '<div class="sub">Nothing yet this league.</div>';
    return `<div class="evmini">${evs.map(ev => {
      const [title, , pill] = E.eventLine ? E.eventLine(ev) : [ev.type, '', ''];
      return `<div class="r"><span class="t">${E.clock(ev.t)}</span><span class="d" style="background:${evDot(ev.type)}"></span><span class="x ell">${title}${ev.type === 'death' && ev.zone ? ' in ' + E.esc(ev.zone) : ''}</span>${pill || ''}</div>`;
    }).join('')}</div>`;
  }

  // ---------- Path of Exile ----------
  function poe(size, { snap, cfg, st }) {
    const def = CARDS.poe;
    const ch = st && st.character;
    const area = st && st.area;
    const running = snap.gameRunning;
    const pathOk = snap.paths.poeExe;
    const pill = !pathOk ? `<span class="pill"><span class="d" aria-hidden="true"></span>Path not set</span>` : statusPill(running, 'Running', 'Not running');
    const playBtn = (cls = 'lg') => running
      ? `<button class="btn ${cls}" disabled>${ic.check()} Game running</button>`
      : `<button class="btn p ${cls}" data-act="play" ${pathOk ? '' : 'disabled'}>${ic.play()} Play</button>`;
    const leagueSub = E.esc(cfg.league.name) + ' league';
    const who = ch ? E.esc(ch.name) : 'No character yet';
    const zone = area && area.zone ? E.esc(area.zone) : '—';

    if (size === 'xs') return xs(def, pill);
    if (!pathOk && size !== 's') {
      return `${head(def, { lg: size === 'xl', sub: leagueSub, right: pill, size: size === 'xl' ? 20 : 16 })}
        <div class="empty" style="margin-top:${size === 'xl' ? 24 : 0}px"><b>Where is Path of Exile installed?</b><span>Set the game path once, and Play and the live status start working.</span></div>
        <div class="push"><button class="btn p ${size === 'xl' ? 'lg' : ''}" data-nav="settings:paths">Set game path</button></div>`;
    }
    if (size === 's') {
      return `${head(def, { right: pill })}
        <div class="row push" style="gap:10px">
          ${ch ? `<div class="lvl sm"><b>${ch.level}</b></div>` : ''}
          <div class="grow"><div style="font-size:16px;font-weight:600" class="ell">${who}</div><div class="sub">${ch ? E.esc(ch.cls) : 'No character yet'}</div></div>
          ${playBtn('sm')}
        </div>`;
    }
    if (size === 'm') {
      return `${head(def, { right: pill })}
        <div class="row" style="gap:10px">${ch ? `<div class="lvl sm"><b>${ch.level}</b></div>` : ''}<div class="grow"><div style="font-size:16px;font-weight:600" class="ell">${who}</div><div class="sub ell">${ch ? E.esc(ch.cls) + ' · ' : ''}${zone}</div></div></div>
        <div class="push">${playBtn('sm')}</div>`;
    }
    if (size === 'l') {
      return `${head(def, { right: pill + `<button class="btn i sm" data-nav="settings:paths" aria-label="Change game path">${ic.folder(15)}</button>` })}
        <div class="row push" style="gap:14px">
          ${ch ? `<div class="lvl md"><b>${ch.level}</b></div>` : ''}
          <div class="grow"><div style="font-size:18px;font-weight:600;line-height:1.15" class="ell">${who}</div><div class="sub ell">${ch ? E.esc(ch.cls) + ' · ' : ''}${zone}${area && area.kind === 'map' && area.tier ? ' · T' + area.tier : ''}</div></div>
          ${playBtn('')}
        </div>`;
    }
    // xl: character + div/h, zone, this (or the previous) session, the last 3 events, Play.
    const se = st && st.session && !st.session.ended ? st.session : null;
    const ls = st && st.lastSession;
    const wealthNow = snap.divRate && snap.divRate.divines;
    let sessLbl, chips;
    if (se || !ls) {
      sessLbl = 'This session';
      chips = chip(se ? E.fmt(se.elapsedMs, { hours: true }) : '–', 'played') + chip(se ? se.mapsDone : 0, 'maps') + chip(se ? se.deaths : 0, 'deaths', se && se.deaths ? ' bad' : '') +
        chip(wealthNow != null ? signed(wealthNow) : '–', 'div this session', wealthNow != null ? (wealthNow >= 0 ? ' good' : ' bad') : '');
    } else {
      sessLbl = `Previous session · ${E.date(ls.start)}`;
      chips = chip(E.fmt(ls.playedMs, { hours: true }), 'played') + chip(ls.maps, 'maps') + chip(ls.deaths, 'deaths', ls.deaths ? ' bad' : '') +
        chip(ls.wealthDiv != null ? signed(ls.wealthDiv) : (ls.levelTo > ls.levelFrom ? `${ls.levelFrom}→${ls.levelTo}` : '–'), ls.wealthDiv != null ? 'div' : 'levels', ls.wealthDiv != null ? (ls.wealthDiv >= 0 ? ' good' : ' bad') : '');
    }
    const brk = se ? (se.breaks ? `Breaks ${E.hm(se.breakMs)} · last ${E.ago(se.lastBreakEnd)}` : `No break yet · ${E.fmt(snap.now - se.start, { hours: true })} in`) : E.esc(cfg.league.name);
    return `${head(def, { lg: true, sub: leagueSub, right: pill, size: 20 })}
      <div class="row" style="gap:18px;align-items:stretch">
        <div class="row grow" style="gap:16px;min-width:0">${ch ? `<div class="lvl"><b>${ch.level}</b></div>` : ''}
          <div style="min-width:0"><div class="lbl">${running ? 'Character' : 'Last character'}</div>
            <div style="font-size:24px;font-weight:600;line-height:1.15;margin-top:2px" class="ell">${who}</div>
            <div class="muted" style="font-size:14px">${ch ? E.esc(ch.cls) : 'Shows up after your first level-up or death'}</div></div></div>
        ${divBox(snap, st)}
      </div>
      <div class="panel row" style="gap:12px"><span class="lbl">${running ? 'Current zone' : 'Last zone'}${area && area.zone ? ' · ' + E.fmt(area.elapsedMs) : ''}</span>${tierPill(area)}<span class="grow ell" style="font-size:18px;font-weight:600">${zone}</span></div>
      <div><div class="lbl lined">${sessLbl}</div><div class="chips">${chips}</div></div>
      <div><div class="row between lined"><span class="lbl">Recent</span><button class="lnk" data-nav="events">All in Events ›</button></div>${st ? recentEvents(st, 3) : ''}</div>
      <div class="row push" style="gap:12px">${playBtn('lg')}<span class="grow"></span><span class="sub">${brk}</span></div>`;
  }

  // ---------- Session & Maps ----------
  function maps(size, { snap, st }) {
    const def = CARDS.maps;
    if (!snap.paths.clientTxt || !st) return size === 'xs' ? xs(def) : `${head(def, { right: ic.chev() })}${size === 's' ? '' : noLog('track maps')}`;
    const m = st.inMap ? st.currentMap : null;
    const s = st.session, last = st.lastMap, fast = st.fastestMap;
    if (size === 'xs') return xs(def, m ? `<span class="pill acc"><span class="d" aria-hidden="true"></span>In map</span>` : '<span class="pill">Not in map</span>');
    const shown = m || last;
    const cur = shown
      ? `<div class="row between" style="align-items:flex-end;gap:10px"><div class="grow" style="min-width:0"><div class="lbl">${m ? 'Current map' : 'Last map'}</div><div style="font-size:16px;font-weight:600" class="ell">${mapName(shown)}</div><div class="sub">${shown.tier ? 'Tier ' + shown.tier : 'Area level ' + shown.level}${st.avgMapMsRecent != null ? ' · avg ' + E.fmt(st.avgMapMsRecent) : ''}</div></div><div class="big${m ? '' : ' dim'}">${E.fmt(shown.activeMs)}</div></div>`
      : `<div><div class="lbl">Current map</div><div style="font-size:16px;font-weight:600" class="dim">Not in a map</div><div class="sub">Maps start after the campaign</div></div>`;
    if (size === 's') {
      return `${head(def, { right: ic.chev() })}
        <div class="row between push" style="align-items:flex-end"><div class="grow"><div style="font-size:14px;font-weight:600" class="ell">${m ? mapName(m) + (m.tier ? ' · T' + m.tier : '') : 'Not in a map'}</div><div class="sub">${s ? s.mapsDone : 0} maps this session</div></div><div class="big">${m ? E.fmt(m.activeMs) : '–'}</div></div>`;
    }
    const best = fast ? `Fastest: ${mapName(fast)}${fast.tier ? ' T' + fast.tier : ''} ${E.fmt(fast.activeMs)}` : 'No maps yet';
    if (size === 'm') return `${head(def, { right: ic.chev() })}${cur}<div class="row between push"><span class="sub ell">${best}</span><span class="sub">${st.totals.mapsDone} maps</span></div>`;
    const league = `<dl class="kvs">
      <div><dt>Maps</dt><dd>${s ? s.mapsDone : 0} <span>/ ${st.totals.mapsDone} league</span></dd></div>
      <div><dt>Deaths</dt><dd>${s ? s.deaths : 0} <span>/ ${st.totals.deaths} league</span></dd></div>
      <div><dt>Fastest</dt><dd>${fast ? E.fmt(fast.activeMs) + ` <span>${mapName(fast)}</span>` : '–'}</dd></div></dl>`;
    if (size === 'l') {
      return `${head(def, { right: ic.chev() })}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;flex:1;min-height:0"><div style="min-width:0">${cur}</div><div style="border-left:1px solid var(--line);padding-left:20px;min-width:0">${league}</div></div>`;
    }
    const recent = (st.recentMaps || []).slice(0, 7).map(r => `<tr><td>${mapName(r)}</td><td class="r">${r.tier ? 'T' + r.tier : '–'}</td><td class="r">${E.fmt(r.activeMs)}</td><td class="r ${r.deaths ? 'bad' : 'dim'}">${r.deaths || '–'}</td></tr>`).join('');
    return `${head(def, { lg: true, right: ic.chev(), size: 20 })}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px"><div style="min-width:0">${cur}</div><div style="border-left:1px solid var(--line);padding-left:20px;min-width:0">${league}</div></div>
      <div class="hr"></div>
      ${recent ? `<div class="tblwrap"><table class="tbl"><thead><tr><th>Recent maps</th><th class="r">Tier</th><th class="r">Time</th><th class="r">Deaths</th></tr></thead><tbody>${recent}</tbody></table></div>` : '<div class="empty"><b>No maps yet</b><span>Your map history shows up here.</span></div>'}`;
  }

  // ---------- Campaign ----------
  function campaign(size, { snap, st }) {
    const def = CARDS.campaign;
    if (!snap.paths.clientTxt || !st) return size === 'xs' ? xs(def) : `${head(def, { right: ic.chev() })}${size === 's' ? '' : noLog('time runs')}`;
    const run = st.campaign;
    const done = st.lastFinishedRun;
    if (size === 'xs') return xs(def, run ? `<span class="pill ok"><span class="d" aria-hidden="true"></span>Act ${run.maxAct}</span>` : done ? '<span class="pill">Done</span>' : '');
    if (!run && !done) {
      return `${head(def, { right: ic.chev() })}<div class="empty push"><b>No runs yet</b><span>Create a new character and the timer starts by itself.</span></div>`;
    }
    const r = run || done;
    const ref = st.referenceRun;
    const completedAct = run ? run.maxAct - 1 : 10;
    const diff = ref && completedAct >= 1 && r.splits[completedAct] != null && ref.splits[completedAct] != null ? r.splits[completedAct] - ref.splits[completedAct] : null;
    // One bar per act: how long the act took vs the previous run (green faster, red slower), the current act lit.
    const actMs = a => r.splits[a] != null ? r.splits[a] - (a > 1 ? r.splits[a - 1] || 0 : 0) : null;
    const refMs = a => ref && ref.splits[a] != null ? ref.splits[a] - (a > 1 ? ref.splits[a - 1] || 0 : 0) : null;
    const acts = Array.from({ length: 10 }, (_, i) => {
      const a = i + 1, mine = actMs(a), theirs = refMs(a);
      const c = run && a === run.maxAct ? 'c' : mine == null ? '' : theirs == null ? 'd' : mine <= theirs ? 'd good' : 'd bad';
      return `<i class="${c}" title="Act ${a}${mine != null ? ' · ' + E.fmt(mine, { hours: true }) : ''}"></i>`;
    }).join('');
    const deaths = (r.deaths != null ? r.deaths : null);
    const sub = run ? `${E.esc(r.char || 'New character')} · Act ${run.maxAct} of 10` : `${E.esc(r.char || '?')} · done`;
    const live = run ? (snap.gameRunning ? `<span class="pill ok"><span class="d" aria-hidden="true"></span>Live</span>` : '<span class="pill">Paused</span>') : '';
    const right = diff != null ? `<span class="${E.diffCls(diff)}" style="font-size:14px;font-weight:600">${E.diff(diff)}</span>` : deaths != null ? `<span class="pill">${deaths} deaths</span>` : live;
    if (size === 's') {
      return `${head(def, { right: ic.chev() })}<div class="row between push" style="align-items:flex-end"><div class="grow"><div class="sub">${E.esc(r.char || 'New character')}</div><div style="font-size:14px;font-weight:600">${run ? 'Act ' + run.maxAct + ' of 10' : 'Done'}</div></div><div class="big">${E.fmt(r.activeMs, { hours: true })}</div></div>`;
    }
    const body = `<div class="row between"><div class="big">${E.fmt(r.activeMs, { hours: true })}</div>${right}</div>
      <div class="acts tall push" role="img" aria-label="Act ${run ? run.maxAct : 10} of 10">${acts}</div>`;
    if (size === 'm') return `${head(def, { right: ic.chev(), sub })}${body}`;
    const rows = Array.from({ length: 10 }, (_, i) => i + 1).filter(a => r.splits[a] != null || (run && a === run.maxAct)).slice(-(size === 'l' ? 3 : 10)).map(a => {
      const mine = run && a === run.maxAct ? null : r.splits[a];
      const theirs = ref && ref.splits[a];
      const d = mine != null && theirs != null ? mine - theirs : null;
      return `<tr><td>Act ${a}${mine == null ? ' <span class="dim">· now</span>' : ''}</td><td class="r">${mine != null ? E.fmt(mine, { hours: true }) : E.fmt(r.activeMs, { hours: true })}</td><td class="r dim">${theirs != null ? E.fmt(theirs, { hours: true }) : '–'}</td><td class="r ${E.diffCls(d)}">${E.diff(d)}</td></tr>`;
    }).join('');
    if (size === 'l') {
      const lines = rows ? `<div class="splits">${Array.from({ length: 10 }, (_, i) => i + 1).filter(a => r.splits[a] != null).slice(-3).map(a => {
        const d = ref && ref.splits[a] != null ? r.splits[a] - ref.splits[a] : null;
        return `<div class="row between"><span class="muted">Act ${a}</span><span>${E.fmt(r.splits[a], { hours: true })} <span class="${E.diffCls(d)}" style="display:inline-block;min-width:52px;text-align:right">${E.diff(d)}</span></span></div>`;
      }).join('')}</div>` : '';
      return `${head(def, { right: ic.chev(), sub })}<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;flex:1;min-height:0"><div style="display:flex;flex-direction:column;gap:10px;min-width:0">${body}</div><div style="border-left:1px solid var(--line);padding-left:20px;min-width:0">${lines || '<div class="sub">Splits show up after Act 1.</div>'}</div></div>`;
    }
    const tbl = `<div class="tblwrap"><table class="tbl"><thead><tr><th>Act</th><th class="r">Time</th><th class="r">Previous</th><th class="r">Diff</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    return `${head(def, { lg: true, right: ic.chev(), size: 20, sub })}${body}<div class="sub">${diff != null ? `After Act ${completedAct}, vs previous run` : ref ? 'No split yet' : 'First run: this one becomes the reference'}</div><div class="hr"></div>${tbl}`;
  }

  // ---------- Overlay ----------
  // A live copy of the in-game overlay, so the tile shows exactly what you see in game.
  function overlay(size, { snap, cfg, st }) {
    const def = CARDS.overlay;
    const o = cfg.overlay, on = o.enabled;
    if (size === 'xs') return xs(def, `<span class="pill${on ? ' ok' : ''}"><span class="d" aria-hidden="true"></span>${on ? 'On' : 'Off'}</span>`);
    const sw = E.sw(on, 'Show overlay', 'ov-toggle');
    const unlock = `<button class="btn sm" data-act="ov-unlock">${snap.overlayUnlocked ? ic.lock() + ' Lock' : ic.unlock() + ' Unlock to move'}</button>`;
    const hk = E.hotkey(cfg, snap, 'unlockOverlay');
    if (size === 's') return `${head(def, { right: sw })}<div class="row between push">${unlock}${hk}</div>`;
    const paused = !snap.gameRunning;
    const preview = E.overlayRows ? `<div class="ov ovmini sz-s${on ? '' : ' off'}" aria-label="Overlay preview">${E.overlayRows(cfg, st, paused, { divRate: snap.divRate })}</div>` : '';
    if (size === 'm') return `${head(def, { right: sw })}${preview}`;
    if (size === 'l') return `${head(def, { right: sw })}<div style="display:grid;grid-template-columns:1.2fr 1fr;gap:20px;flex:1;min-height:0">${preview}<div style="display:flex;flex-direction:column;gap:8px;justify-content:flex-end">${unlock}<div class="row between"><span class="sub">Toggle</span>${E.hotkey(cfg, snap, 'toggleOverlay')}</div></div></div>`;
    return `${head(def, { lg: true, right: sw, size: 20 })}${preview}<div class="row" style="gap:16px;flex-wrap:wrap"><span class="sub">Text size ${o.size.toUpperCase()}</span><span class="sub row" style="gap:6px">Toggle ${E.hotkey(cfg, snap, 'toggleOverlay')}</span></div><div class="row between push">${unlock}${hk}</div>`;
  }

  // ---------- Loot filter ----------
  function filter(size, { snap }) {
    const def = CARDS.filter;
    const ns = snap.neversink || {};
    const latest = ns.latest;
    const outdated = latest && ns.remind !== false && latest.tag !== ns.lastSyncedTag;
    const pill = !latest ? '' : outdated ? '<span class="pill acc">Update</span>' : '<span class="pill">Up to date</span>';
    if (size === 'xs') return xs(def, pill);
    const ver = latest ? `<div><div class="row" style="gap:8px"><span style="font-size:20px;font-weight:600">${E.esc(latest.tag)}</span>${pill}</div>
      <div class="sub" style="margin-top:2px">${ns.lastSyncedTag ? 'You synced ' + E.esc(ns.lastSyncedTag) : 'Not marked as synced yet'}</div></div>`
      : `<div class="empty"><b>No release info yet</b><span>Checks GitHub when online.</span></div>`;
    const btns = `<div class="row push" style="gap:8px;flex-wrap:wrap"><button class="btn p" style="flex:1 1 auto" data-url="https://www.filterblade.xyz">Open FilterBlade ${ic.ext()}</button>${outdated ? '<button class="btn" data-act="ns-synced">I\'ve synced</button>' : ''}</div>`;
    if (size === 's') return `${head(def, { right: pill })}${btns}`;
    if (size === 'm') return `${head(def, { sub: 'NeverSink · FilterBlade', right: latest ? `<span class="pill${outdated ? ' acc' : ''}">${E.esc(latest.tag)}</span>` : '' })}
      <div class="sub ell" style="white-space:nowrap">${!latest ? 'Checks GitHub when online.' : latest.notes && latest.notes.length ? `New: ${E.esc(latest.notes[0])}${latest.notes.length > 1 ? ` · +${latest.notes.length - 1} more` : ''}` : outdated ? (ns.lastSyncedTag ? `New release · you synced ${E.esc(ns.lastSyncedTag)}` : 'Not marked as synced yet') : 'Up to date'}</div>
      <div class="row push" style="gap:8px"><button class="btn p sm" data-url="https://www.filterblade.xyz">Open FilterBlade</button>${outdated ? '<button class="btn sm" data-act="ns-synced">I\'ve synced</button>' : ''}</div>`;
    return `${head(def, { lg: size === 'xl', sub: 'NeverSink · FilterBlade', size: size === 'xl' ? 20 : 16 })}${ver}${size === 'xl' && latest ? `<div class="sub">Released ${E.ago(new Date(latest.publishedAt).getTime())}</div>` : ''}${btns}`;
  }

  // ---------- Path of Building ----------
  function pob(size, { snap, cfg }) {
    const def = CARDS.pob;
    const ok = snap.paths.pobExe;
    if (size === 'xs') return xs(def, ok ? '' : '<span class="pill">Path not set</span>');
    const launch = `<button class="btn p push" data-act="pob" ${ok ? '' : 'disabled'}>${ic.play()} Launch</button>`;
    if (size === 's') return `${head(def)}${launch}`;
    const b = snap.pobBuild;
    if (b && size === 'm') {
      return `${head(def)}<div style="min-width:0"><div style="font-weight:600" class="ell">${E.esc(b.skill ? b.skill + (b.asc || b.cls ? ' ' + (b.asc || b.cls) : '') : b.name)}</div><div class="sub ell">Last build · edited ${E.ago(b.mtime)}</div></div>
        <div class="row push"><button class="btn sm" data-act="pob" ${ok ? '' : 'disabled'}>${ic.play()} Launch</button></div>`;
    }
    return `${head(def, { lg: size === 'xl', size: size === 'xl' ? 20 : 16 })}
      <div class="row" style="gap:6px"><div class="grow"><div class="lbl">Executable</div><div class="path">${ok ? E.esc(cfg.paths.pobExe) : 'Not set'}</div></div>
      <button class="btn i sm" data-nav="settings:paths" aria-label="Change Path of Building path">${ic.folder()}</button></div>${launch}`;
  }

  // ---------- Awakened PoE Trade ----------
  function apt(size, { snap }) {
    const def = CARDS.apt;
    const ok = snap.paths.aptExe;
    if (size === 'xs') return xs(def, ok ? `<button class="btn sm" data-act="apt">${ic.play()}</button>` : '<span class="pill">Path not set</span>');
    const btn = `<button class="btn ${size === 's' ? 'sm' : 'p'}" data-act="apt" ${ok ? '' : 'disabled'}>${ic.play()} Launch</button>`;
    return `${head(def, { sub: 'Price check overlay' })}${ok ? '' : '<div class="sub">Set the path in Settings › Paths.</div>'}<div class="row push">${btn}${ok ? '' : `<button class="btn q sm" data-nav="settings:paths">Set path</button>`}</div>`;
  }

  // ---------- Link cards ----------
  function link(id) {
    return size => {
      const def = CARDS[id];
      if (size === 'xs') return xs(def, `<span class="chev">${ic.ext()}</span>`);
      const big = size === 'l' || size === 'xl';
      const ql = big ? `<div class="qlinks">${def.quick.map(([l, u]) => `<a href="#" data-url="${u}">${l} ${ic.ext()}</a>`).join('')}</div>` : '';
      return `${big && !iconOf(id) ? `<span class="wm" aria-hidden="true">${def.mono}</span>` : ''}${head(def, { lg: size === 'xl', right: `<span class="chev">${ic.ext()}</span>`, size: size === 'xl' ? 20 : 16 })}
        ${size === 's' ? '' : `<div class="${size === 'xl' ? '' : 'muted'}" style="font-size:${size === 'xl' ? 20 : 14}px;line-height:1.35">${def.desc}</div>`}${ql}
        ${size === 'xl' ? `<div class="push" style="display:flex;flex-direction:column;gap:14px"><div class="hr"></div><div class="row between"><span class="sub">${def.host}</span><span class="sub">Opens in your browser</span></div></div>` : `<div class="sub push">${def.host}</div>`}`;
    };
  }

  // ---------- Wealthy Exile: value from the latest CSV export ----------
  const syncHint = w => {
    const left = (w.syncAt || 0) + (w.syncEvery || 0) - Date.now();
    return left > 0 ? `sync again in ${Math.ceil(left / 60000)} min` : 'click to sync';
  };
  function wealthy(size, { snap }) {
    const def = CARDS.wealthy;
    const w = snap && snap.wealth;
    const ext = `<span class="chev" title="Sync &amp; export">${ic.refresh()}</span>`;
    const has = w && w.count > 0;
    const num = (v, d = 1) => v == null ? '–' : v >= 1000 ? Math.round(v).toLocaleString('en-US') : v.toFixed(v >= 100 ? 0 : d);
    const val = has ? (w.divines != null ? `${num(w.divines)} div` : `${num(w.chaos, 0)}c`) : null;
    if (size === 'xs') return xs(def, has ? `<span class="pill">${val}</span>` : ext);
    const head0 = head(def, { lg: size === 'xl', right: ext, size: size === 'xl' ? 20 : 16, sub: size === 'l' && has ? 'Exported ' + E.ago(w.at) : '' });
    const openBtn = size === 's' ? '' : `<button class="btn sm" data-url="https://wealthyexile.com/">${size === 'm' ? 'Open' : 'Open Wealthy Exile'} ${ic.ext()}</button>`;
    const rate = rateOf(snap, snap.stats);
    if (!has) {
      return `${head0}<div class="muted" style="font-size:14px;line-height:1.35">${def.desc}</div>
        ${size === 's' || size === 'm' ? '' : `<div class="sub">Click the tile to sync &amp; export, or export yourself (··· › Export CSV); it's picked up from Downloads.</div>`}
        ${w && w.error ? `<div class="sub" style="color:var(--bad)">Couldn't read ${E.esc(w.error)}</div>` : ''}
        <div class="row between push" style="gap:10px"><span class="sub">${w ? syncHint(w) : ''}</span>${openBtn}</div>`;
    }
    const d = w.delta;
    const dTxt = d == null ? '' : `${d >= 0 ? '+' : '−'}${w.divPrice ? num(Math.abs(d) / w.divPrice) + ' div' : num(Math.abs(d), 0) + 'c'}`;
    const delta = d == null ? '' : `<span style="font-weight:600;color:var(${d >= 0 ? "--ok" : "--bad"})">${dTxt}</span><span class="sub"> since previous</span>`;
    const topList = `<div style="display:flex;flex-direction:column;gap:6px;min-width:0"><div class="sub">Top items</div>
      ${w.top.slice(0, 3).map(t => `<div class="row between" style="gap:10px"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${E.esc(t.name)}${t.qty > 1 ? ` <span class="sub">×${num(t.qty, 0)}</span>` : ''}</span><span class="sub" style="white-space:nowrap">${w.divPrice ? num(t.total / w.divPrice) + ' div' : num(t.total, 0) + 'c'}</span></div>`).join('')}</div>`;
    const main = `<div><div style="font-size:${size === 'xl' ? 40 : 30}px;font-weight:700;line-height:1.1">${val}</div>
        ${size === 's' ? '' : `<div class="sub">${num(w.chaos, 0)} chaos${w.divPrice ? ` · ${num(w.divPrice, 0)}c per div` : ''}</div>`}
        ${size === 's' ? '' : `<div style="margin-top:8px">${delta}</div>`}</div>`;
    const foot = `<div class="row between push" style="gap:10px"><span class="sub">Exported ${E.ago(w.at)} · ${syncHint(w)}${w.error ? ` · <span style="color:var(--bad)">last file unreadable</span>` : ''}</span>${openBtn}</div>`;
    const rateCol = `<div style="text-align:right"><div style="font-size:22px;font-weight:700;line-height:1.1;color:var(--ok)">${rate ? num(rate.v, 2) : '–'}</div><div class="sub">div / h</div></div>`;
    if (size === 'm') {
      return `${head0}<div class="row between" style="align-items:flex-start;gap:10px"><div style="min-width:0"><div style="font-size:28px;font-weight:700;line-height:1.1">${val}</div><div style="margin-top:2px">${delta || '<span class="sub">first export</span>'}</div></div>${rateCol}</div>
        <div class="row between push" style="gap:10px"><span class="sub">Exported ${E.ago(w.at)}${w.error ? ` · <span style="color:var(--bad)">last file unreadable</span>` : ''}</span>${openBtn}</div>`;
    }
    // L is wide and short: value left, top items right. XL is tall: stacked.
    if (size === 'l') {
      const top3 = `<div style="display:flex;flex-direction:column;gap:4px;min-width:0">${w.top.slice(0, 3).map(t => `<div class="row between" style="gap:10px"><span class="ell">${E.esc(t.name)}${t.qty > 1 ? ` <span class="sub">×${num(t.qty, 0)}</span>` : ''}</span><span class="sub" style="white-space:nowrap">${w.divPrice ? num(t.total / w.divPrice) + ' div' : num(t.total, 0) + 'c'}</span></div>`).join('')}</div>`;
      return `${head0}<div style="display:grid;grid-template-columns:1fr 1.3fr;gap:24px;flex:1;min-height:0"><div style="display:flex;flex-direction:column;gap:4px"><div class="row" style="gap:14px;align-items:baseline"><span style="font-size:28px;font-weight:700;line-height:1.1">${val}</span><span style="color:var(--ok);font-weight:600">${rate ? num(rate.v, 2) + ' div/h' : ''}</span></div><div>${delta}</div><div class="push">${openBtn}</div></div>${top3}</div>`;
    }
    if (size === 'xl') return `${head0}${main}<div class="hr"></div>${topList}${foot}`;
    return `${head0}${main}${foot}`;
  }

  // ---------- Goal: an item to save for, against your Wealthy Exile value ----------
  function goal(size, { snap, st }) {
    const def = CARDS.goal;
    const g = snap.goal, w = snap.wealth;
    const title = `<div class="row between lined"><span style="font-weight:600" class="ell">Goal${g ? ' · ' + E.esc(g.name) + (g.label ? ' · ' + E.esc(g.label) : '') : ''}</span><span class="sub" style="flex:none">${g && g.price ? (g.source === 'ninja' ? 'poe.ninja · ' + (g.approx ? '≈ ' : '') : 'fixed · ') + num(g.price) + ' div' : ''}</span></div>`;
    if (!g || !g.price) {
      const msg = !g ? 'Pick an item to save for, like a Mageblood.' : `No poe.ninja price for ${E.esc(g.name)} yet. Set a fixed price as a fallback.`;
      if (size === 'xs') return xs(def, `<button class="btn q sm" data-nav="settings:league">Set goal</button>`);
      return `${title}<div class="sub">${msg}</div><div class="push"><button class="btn sm" data-nav="settings:league">Set goal</button></div>`;
    }
    const have = w && w.divines != null ? w.divines : null;
    const pct = have != null ? Math.max(0, Math.min(100, (100 * have) / g.price)) : null;
    if (size === 'xs') return xs(def, `<span class="pill">${pct != null ? Math.floor(pct) + '%' : '–'}</span>`);
    const r = rateOf(snap, st);
    const left = have != null ? g.price - have : null;
    const eta = left != null && left <= 0 ? 'reached 🎉' : r && r.v > 0 && left != null ? `~${Math.ceil(left / r.v)} h at ${r.now ? "this session's" : "last session's"} rate` : '';
    const bar = `<div class="bar" role="progressbar" aria-valuenow="${pct != null ? Math.round(pct) : 0}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct || 0}%"></i></div>`;
    return `${title}<div class="row push" style="gap:16px;align-items:center"><div style="font-size:${size === 's' ? 24 : 32}px;font-weight:700;line-height:1">${pct != null ? Math.floor(pct) + '%' : '–'}</div>
      <div class="grow" style="display:flex;flex-direction:column;gap:6px;min-width:0">${bar}<div class="sub ell">${have != null ? `${num(have)} of ${num(g.price)} div${eta ? ' · ' + eta : ''}` : 'Needs a Wealthy Exile export'}</div></div></div>`;
  }

  // ---------- Today: since 05:00, so a late night still counts as one day ----------
  function today(size, { snap }) {
    const def = CARDS.today;
    const t = snap.today;
    if (size === 'xs') return xs(def, `<span class="pill">${t ? t.maps : 0} maps</span>`);
    const title = `<div class="row between lined"><span style="font-weight:600">Today</span><span class="sub">${t && t.firstAt ? `since ${E.clock(t.firstAt)} · ${t.sessions} session${t.sessions === 1 ? '' : 's'}` : 'nothing played yet'}</span></div>`;
    if (!t || !t.firstAt) return `${title}<div class="sub push">Your day shows up here once you play.</div>`;
    const lv = t.levelTo != null && t.levelTo > t.levelFrom ? chip('+' + (t.levelTo - t.levelFrom), `levels ${t.levelFrom}→${t.levelTo}`) : chip(t.maps, 'maps');
    const best = t.best ? chip(E.fmt(t.best.activeMs), `best · ${mapName(t.best)}${t.best.tier ? ' T' + t.best.tier : ''}`) : chip(t.deaths, 'deaths');
    const all = [lv, chip(E.hm(t.breakMs), 'breaks'), chip(t.newTiers, 'new tiers'), best];
    return `${title}<div class="chips push${size === 'm' || size === 's' ? ' two' : ''}">${(size === 's' ? all.slice(0, 2) : all).join('')}</div>`;
  }

  // ---------- Coming soon ----------
  function soon(id) {
    return size => {
      const def = CARDS[id];
      const lockIc = `<span class="chev">${ic.lock()}</span>`;
      if (size === 'xs') return xs(def, lockIc);
      const big = size === 'l' || size === 'xl';
      return `${big ? `<span class="wm" aria-hidden="true">${def.mono}</span>` : ''}${head(def, { lg: size === 'xl', right: lockIc, size: size === 'xl' ? 20 : 16 })}
        <span class="pill" style="align-self:flex-start">Coming soon</span>
        ${big ? `<div class="muted push" style="font-size:${size === 'xl' ? 20 : 14}px;max-width:380px">${def.name} appears here when it's ready. You can already place and size the card.</div>` : ''}`;
    };
  }

  const CARDS = {
    poe: { id: 'poe', name: 'Path of Exile', mono: 'PE', kind: 'tool', render: poe, parts: 'Status, character, level, class, zone, Play, game path' },
    maps: { id: 'maps', name: 'Session &amp; Maps', mono: 'SM', kind: 'tool', render: maps, parts: 'Map, timer, maps, average, deaths' },
    campaign: { id: 'campaign', name: 'Campaign', mono: 'CP', kind: 'tool', render: campaign, parts: 'Timer, act, split vs previous run' },
    overlay: { id: 'overlay', name: 'Overlay', mono: 'OV', kind: 'tool', render: overlay, parts: 'Toggle, live preview, unlock, hotkey' },
    filter: { id: 'filter', name: 'Loot filter', mono: 'LF', kind: 'tool', render: filter, parts: 'Version, update state, both buttons' },
    pob: { id: 'pob', name: 'Path of Building', mono: 'PB', kind: 'tool', render: pob, parts: 'Last build, launch, path' },
    apt: { id: 'apt', name: 'Price check', mono: 'AT', kind: 'widget', render: apt, parts: 'Launch' },
    wealthy: { id: 'wealthy', name: 'Wealthy Exile', mono: 'WE', kind: 'link', url: 'https://wealthyexile.com', host: 'wealthyexile.com', desc: 'Stash value and net worth over the league.', quick: [['Open Wealthy Exile', 'https://wealthyexile.com']], parts: 'Link card' },
    ninja: { id: 'ninja', name: 'Goal & prices', mono: 'PN', kind: 'link', url: 'https://poe.ninja', host: 'poe.ninja', desc: 'Item prices and build ladders.', quick: [['Economy', 'https://poe.ninja/economy'], ['Builds', 'https://poe.ninja/builds']], parts: 'Link card' },
    trade: { id: 'trade', name: 'Trade', mono: 'TR', kind: 'link', url: 'https://www.pathofexile.com/trade', host: 'pathofexile.com/trade', desc: 'Official trade site.', quick: [['Search', 'https://www.pathofexile.com/trade/search'], ['Bulk exchange', 'https://www.pathofexile.com/trade/exchange']], parts: 'Link card' },
    goal: { id: 'goal', name: 'Goal', mono: 'GL', kind: 'widget', render: goal, parts: 'Item, poe.ninja price, progress, time to go' },
    today: { id: 'today', name: 'Today', mono: 'TD', kind: 'widget', render: today, parts: 'Levels, breaks, new tiers, best map' },
    fate: { id: 'fate', name: 'Fate Logger', mono: 'FL', kind: 'soon', parts: 'Coming soon' },
    threads: { id: 'threads', name: 'Threads Tracker', mono: 'TT', kind: 'soon', parts: 'Coming soon' },
  };
  CARDS.wealthy.render = wealthy; CARDS.ninja.render = link('ninja'); CARDS.trade.render = link('trade');
  CARDS.fate.render = soon('fate'); CARDS.threads.render = soon('threads');

  EX.CARDS = CARDS;
  EX.SIZES = ['xs', 's', 'm', 'l', 'xl'];
  EX.SIZE_LABEL = { xs: 'XS · 1 row', s: 'S · 2 rows', m: 'M · 1×1', l: 'L · 2×1', xl: 'XL · 2×2' };
  EX.defaultSize = id => (id === 'poe' ? 'xl' : id === 'ninja' || id === 'trade' ? 'xs' : id === 'goal' || id === 'today' ? 'l' : id === 'apt' ? 's' : 'm');

  EX.cardHtml = (id, size, ctx) => {
    const def = CARDS[id];
    const cls = ['card', `s-${size}`];
    if (id === 'poe') cls.push('poe');
    if (size === 'xs') cls.push('xs');
    if (def.kind === 'soon') cls.push('soon');
    if (def.kind === 'widget') cls.push('widget');
    if ((id === 'maps' || id === 'campaign') && !ctx.snap.paths.clientTxt) cls.push('wait');
    const glow = id === 'campaign' && ctx.st && ctx.st.campaign ? ' style="background:radial-gradient(90% 70% at 100% 0%,var(--glow),transparent 70%),var(--card)"' : '';
    // Wealthy Exile: the whole tile syncs and exports (button inside opens the site without that).
    const act = id === 'wealthy' ? ' data-act="wealth-sync" role="button" tabindex="0" title="Sync &amp; export in Wealthy Exile" style="cursor:pointer"' : '';
    return `<section class="${cls.join(' ')}" data-card="${id}"${act}${def.kind === 'soon' ? ' aria-disabled="true"' : ''}${glow}>${def.render(size, ctx)}</section>`;
  };
})();
