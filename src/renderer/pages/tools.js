'use strict';
// Full tool pages, opened from a card or the sidebar.
(function () {
  const E = EX, ic = EX.icon;
  EX.pages = EX.pages || {};

  const ph = (mono, title, sub, right) => `<div class="ph"><span class="logo lg" aria-hidden="true">${mono}</span>
    <div class="grow"><h1 class="h">${title}</h1>${sub ? `<div class="sub" style="margin-top:4px">${sub}</div>` : ''}</div>${right || ''}</div>`;
  const noLogBox = what => `<section class="box span2"><div class="empty"><b>No log yet</b><span>Exilogue needs Client.txt to ${what}. <button class="btn sm" data-nav="settings:paths" style="margin-left:6px">Settings › Paths</button></span></div></section>`;
  const playBtn = snap => snap.gameRunning ? ''
    : snap.paths.poeExe ? `<button class="btn p lg" data-act="play">${ic.play()} Play</button>` : `<span class="sub">Game path not set</span><button class="btn lg" data-nav="settings:paths">Set path</button>`;
  const status = snap => snap.gameRunning ? `<span class="pill ok"><span class="d" aria-hidden="true"></span>Running</span>` : `<span class="pill"><span class="d" aria-hidden="true"></span>Not running</span>`;
  const pathRow = (label, key, value, ok, hint) => `<section class="box span2"><div class="bh"><h2>${label}</h2>${E.pathSt(ok)}</div>
    <div class="row" style="gap:8px"><input class="input" aria-label="${label}" value="${E.esc(value)}" readonly><button class="btn" data-browse="${key}">${ic.folder()} Browse</button></div>${hint ? E.note(hint) : ''}</section>`;

  // ---------- Path of Exile ----------
  EX.pages.poe = {
    live: true,
    render({ snap, cfg, st }) {
      const ch = st && st.character, area = st && st.area;
      const chars = st ? Object.entries(st.chars || {}).map(([n, c]) => [n, { ...c, last: Math.max(c.lastSeen || 0, c.lastLogin || 0) || null }]).sort((a, b) => (b[1].last || 0) - (a[1].last || 0)) : [];
      const played = st && st.played, deathsRep = st && st.deathsReported;
      // Level over time for this character, from its level-up and death events (loaded once per new event).
      const U = EX.ui;
      const lvKey = ch ? ch.name + '\u0000' + st.eventSeq : null;
      if (ch && U.lvFor !== lvKey && !U.lvLoading) { U.lvLoading = true; ej.events({ char: ch.name, types: ['level', 'death'], limit: 1000 }).then(r => { U.lvRows = (r && r.rows || []).slice().reverse(); U.lvChar = ch.name; U.lvFor = lvKey; }).catch(() => { U.lvRows = []; U.lvChar = ch.name; U.lvFor = lvKey; }).finally(() => { U.lvLoading = false; EX.rerender && EX.rerender(); }); }
      const lvRows = ch && U.lvChar === ch.name ? U.lvRows || [] : [];
      const lv = lvRows.filter(e => e.type === 'level'), deaths = lvRows.filter(e => e.type === 'death');
      let chart = '';
      if (lv.length > 1) {
        const t0 = Math.min(lv[0].t, ...deaths.map(e => e.t)), t1 = Math.max(lv[lv.length - 1].t, ...deaths.map(e => e.t)), W = 600, H = 150;
        const X = t => ((t - t0) / (t1 - t0 || 1)) * W, Y = l => H - (l / 100) * H;
        const d = lv.map((e, i) => `${i ? 'L' : 'M'}${X(e.t).toFixed(1)} ${Y(e.level).toFixed(1)}`).join(' ');
        const dots = deaths.map(e => `<line x1="${X(e.t).toFixed(1)}" x2="${X(e.t).toFixed(1)}" y1="${H - 12}" y2="${H}" stroke="var(--bad)" stroke-width="2" vector-effect="non-scaling-stroke"><title>Died ${E.clock(e.t)}</title></line>`).join('');
        chart = `<section class="box"><div class="bh"><h2>Level over time</h2><span class="sub">first level-up to the latest · red ticks: deaths</span></div>
          <div class="lvwrap"><div class="lvy sub">${[80, 60, 40, 20].map(l => `<span style="top:${100 - l}%">${l}</span>`).join('')}</div>
          <svg class="lvchart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Level ${lv[0].level} to ${lv[lv.length - 1].level}">
            ${[20, 40, 60, 80].map(l => `<line x1="0" x2="${W}" y1="${Y(l)}" y2="${Y(l)}" stroke="var(--line)" stroke-dasharray="3 4" vector-effect="non-scaling-stroke"/>`).join('')}
            <path d="${d}" fill="none" stroke="var(--acc)" stroke-width="2" vector-effect="non-scaling-stroke"/>${dots}</svg></div>
          <div class="lvax sub"><span>${E.date(t0)}</span><span>${E.date(t1)}</span></div></section>`;
      } else chart = `<section class="box"><div class="bh"><h2>Level over time</h2></div><div class="empty"><b>${!ch ? 'No character yet' : U.lvChar !== ch.name || U.lvLoading && !lv.length ? 'Loading…' : 'Not enough level-ups yet'}</b><span>The curve of your current character shows up here after a few level-ups.</span></div></section>`;
      return ph('PE', 'Path of Exile', `${E.esc(cfg.league.name)} league · your characters`, `${status(snap)}${snap.gameRunning ? '' : playBtn(snap)}`) + `<div class="charrow">
        <section class="box"><div class="bh"><h2>Character</h2><span class="sub">From the game log</span></div>
          ${ch ? `<div class="row" style="gap:20px;align-items:flex-end"><div class="lvl"><b>${ch.level}</b></div>
            <div class="grow"><div style="font-size:28px;font-weight:600;line-height:1.1" class="ell">${E.esc(ch.name)}</div><div class="muted" style="font-size:16px">${E.esc(ch.cls)}</div></div></div>`
            : `<div class="empty"><b>No character yet</b><span>Shows up after your first level-up or death.</span></div>`}
          <div class="hr"></div>
          <div class="row between" style="align-items:flex-end"><div style="min-width:0"><div class="lbl">${snap.gameRunning ? 'Current zone' : 'Last zone'}</div>
            <div style="font-size:20px;font-weight:600;margin-top:4px" class="ell">${area && area.zone ? E.esc(area.zone) : '—'}</div>
            <div class="sub">${area ? [area.kind === 'map' && area.tier ? 'Tier ' + area.tier : area.act ? 'Act ' + area.act : '', area.level ? 'area level ' + area.level : ''].filter(Boolean).join(' · ') : ''}</div></div>
            <div style="text-align:right"><div class="lbl">Time in zone</div><div class="big" style="margin-top:6px">${area ? E.fmt(area.elapsedMs) : '–'}</div></div></div>
          <div class="hr"></div>
          <div class="row between"><span class="sub">/played <b style="color:var(--tx)">${played ? E.duration(played.seconds) : '–'}</b> · /deaths <b style="color:var(--tx)">${deathsRep ? deathsRep.count : '–'}</b></span><span class="sub">type /played or /deaths in game to update</span></div>
        </section>
        ${chart}</div><div class="cols" style="margin-top:16px">
        <section class="box span2"><div class="bh"><h2>Characters</h2><span class="sub">${snap.profileStatus && snap.profileStatus.state === 'ok' ? 'From your public profile and the game log' : 'Every character that levelled up or died since league start'}</span></div>
          ${chars.length ? `<div class="tblwrap"><table class="tbl"><thead><tr><th>Character</th><th>Class</th><th>League</th><th class="r">Level</th><th>Campaign</th><th>Last active</th></tr></thead><tbody>
            ${chars.map(([n, c]) => `<tr class="${ch && ch.name === n ? 'cur' : ''}"><td style="font-weight:600">${E.esc(n)}</td><td>${E.esc(c.cls || '–')}</td><td>${E.esc(c.league || '–')}</td><td class="r">${c.level || '–'}</td>
              <td>${c.campaign === 'done' ? '<span class="pill acc">Done</span>' : c.campaign === 'running' ? `<span class="pill ok"><span class="d" aria-hidden="true"></span>Act ${c.act}</span>` : c.campaign === 'abandoned' ? `<span class="pill" style="color:var(--tx3)">Abandoned · Act ${c.act}</span>` : '<span class="pill" title="Exilogue never saw this character go through the campaign. It turns Done when it enters a map.">Unknown</span>'}</td>
              <td>${c.last ? E.date(c.last) : '–'}</td></tr>`).join('')}
          </tbody></table></div>
          ${E.note('Campaign shows <b style="color:var(--tx)">Unknown</b> for characters Exilogue never saw level through the acts. Entering a map marks it Done, since maps only open after Kitava.')}`
          : '<div class="empty"><b>Nobody yet</b><span>Characters appear after a level-up or death, or from your public profile (Settings › League).</span></div>'}
        </section>
      </div>`;
    },
  };

  // ---------- Session & Maps ----------
  // ---------- Session & Maps: a statsheet, one row per map and tier (Strand T6 ≠ Strand T16) ----------
  const TIER_FILTERS = [['all', 'All tiers', () => true], ['w', 'T1–5', t => t >= 1 && t <= 5], ['y', 'T6–10', t => t >= 6 && t <= 10], ['r', 'T11–16', t => t >= 11]];
  const COLS = [ // key, label, value of a group, numeric, align right
    ['name', 'Map', g => g.name.toLowerCase(), false, false], ['tier', 'Tier', g => g.tier || 0, true, false],
    ['runs', 'Runs', g => g.runs, true, true], ['avg', 'Avg time', g => g.avg, true, true], ['best', 'Fastest', g => g.best, true, true],
    ['deaths', 'Deaths', g => g.deaths, true, true], ['dpm', 'Deaths / map', g => g.deaths / g.runs, true, true], ['last', 'Last run', g => g.last, true, false],
  ];
  // Numbers start high-to-low (most runs first); names and times start low-to-high (A–Z, fastest first).
  const defaultDir = k => (k === 'name' || k === 'avg' || k === 'best' ? 1 : -1);
  function groupMaps(list) {
    const by = new Map();
    for (const m of list) {
      const name = (m.zone || m.areaId || '?').replace(/ Map$/, '');
      const key = name + '|' + (m.tier || 0);
      let g = by.get(key);
      if (!g) by.set(key, g = { key, name, tier: m.tier || null, runs: 0, ms: 0, best: Infinity, deaths: 0, last: 0, list: [] });
      g.runs++; g.ms += m.activeMs || 0; g.deaths += m.deaths || 0;
      g.best = Math.min(g.best, m.activeMs || 0); g.last = Math.max(g.last, m.end || 0); g.list.push(m);
    }
    const out = [...by.values()];
    for (const g of out) g.avg = g.ms / g.runs;
    return out;
  }
  function loadMaps(st, ui) {
    const n = st.totals.mapsDone;
    if (ui.mapsFor === n || ui.mapsLoading) return;
    ui.mapsLoading = true;
    ej.allMaps().then(list => { ui.allMaps = list; ui.mapsFor = n; }).catch(() => {}).finally(() => { ui.mapsLoading = false; if (EX.rerender) EX.rerender(); });
  }
  const relDay = t => { const d0 = new Date(); d0.setHours(0, 0, 0, 0); return t >= d0.getTime() ? 'today ' + E.clock(t) : t >= d0.getTime() - 864e5 ? 'yesterday ' + E.clock(t) : E.date(t); };

  EX.pages.maps = {
    live: true,
    render({ snap, st, ui }) {
      const m0 = st && st.inMap ? st.currentMap : null;
      const pill = m0 ? `<span class="pill acc"><span class="d" aria-hidden="true"></span>In map · ${E.esc((m0.zone || m0.areaId).replace(/ Map$/, ''))}${m0.tier ? ' T' + m0.tier : ''} · ${E.fmt(m0.activeMs)}</span>` : '';
      const head = ph('SM', 'Session &amp; Maps', 'Only time inside the map counts. Hideout and town pause it.', pill);
      if (!snap.paths.clientTxt || !st) return head + `<div class="cols">${noLogBox('track maps')}</div>`;
      loadMaps(st, ui);
      const s = st.session, t = st.totals;
      const sessionOnly = (ui.mapScope || 'session') === 'session' && s && !s.ended;
      const chips = (sessionOnly ? [
        [E.hm(s.elapsedMs), 'played'],
        [s.mapsDone, 'maps'],
        [s.mapsDone ? (s.mapsDone / (s.elapsedMs / 3600e3)).toFixed(1) : '–', 'maps / hour played'],
        [E.fmt(s.mapsDone ? s.mapMs / s.mapsDone : null), 'avg map'],
        [s.deaths, 'deaths'],
        [snap.divRate && snap.divRate.perHour != null ? snap.divRate.perHour.toFixed(2) : '–', 'div / hour'],
      ] : [
        [t.mapsDone, 'maps'],
        [E.fmt(t.mapMs, { hours: true }), 'in maps'],
        [E.fmt(st.avgMapMs), 'avg map'],
        [st.avgMapMsRecent != null ? E.fmt(st.avgMapMsRecent) : '–', 'avg last 20'],
        [st.highestTier ? 'T' + st.highestTier : '–', 'highest tier'],
        [t.deaths, 'deaths'],
      ]).map(([b, l]) => `<div class="chip"><b>${b}</b><span>${l}</span></div>`).join('');
      let list = ui.allMaps || [];
      if (sessionOnly && s) list = list.filter(m => m.start >= s.start);
      const tf = TIER_FILTERS.find(f => f[0] === (ui.mapTier || 'all')) || TIER_FILTERS[0];
      const q = (ui.mapQ || '').trim().toLowerCase();
      let groups = groupMaps(list).filter(g => tf[2](g.tier || 0) && (!q || g.name.toLowerCase().includes(q)));
      const sortKey = ui.mapSort || 'runs', col = COLS.find(c => c[0] === sortKey) || COLS[2];
      const dir = ui.mapDir || defaultDir(sortKey);
      groups.sort((a, b) => { const x = col[2](a), y = col[2](b); return (x < y ? -1 : x > y ? 1 : 0) * dir || b.runs - a.runs; });
      const maxDpm = Math.max(0.01, ...groups.map(g => g.deaths / g.runs));
      const allAvg = st.avgMapMs;
      const th = COLS.map(([k, l, , , r]) => `<th class="${r ? 'r' : ''}" aria-sort="${k === sortKey ? (dir < 0 ? 'descending' : 'ascending') : 'none'}"><button class="thb" data-msort="${k}">${l}${k === sortKey ? (dir < 0 ? ' ▾' : ' ▴') : ''}</button></th>`).join('');
      const rows = groups.map(g => {
        const dpm = g.deaths / g.runs;
        const avgCls = ''; // neutral: no judgement on map speed (layout, mobs and luck decide most of it)
        const open = ui.mapOpen === g.key;
        const main = `<tr class="click${open ? ' is-open' : ''}" data-mgroup="${E.esc(g.key)}"><td style="font-weight:600">${E.esc(g.name)}</td><td>${g.tier ? 'T' + g.tier : '–'}</td><td class="r">${g.runs}</td>
          <td class="r ${avgCls}">${E.fmt(g.avg)}</td><td class="r">${E.fmt(g.best)}</td><td class="r ${g.deaths && dpm >= 0.5 ? 'bad' : ''}">${g.deaths}</td>
          <td class="r"><span class="dpm"><span class="${dpm >= 0.5 ? 'bad' : ''}">${dpm.toFixed(2)}</span><span class="minibar"><i class="${dpm >= 0.5 ? 'bad' : ''}" style="width:${Math.round(100 * dpm / maxDpm)}%"></i></span></span></td>
          <td class="dim">${relDay(g.last)}</td></tr>`;
        const runs = open ? g.list.slice().reverse().slice(0, 50).map(r => `<tr class="sub-row"><td colspan="2" class="dim">${relDay(r.end)}</td><td></td><td class="r">${E.fmt(r.activeMs)}</td><td></td><td class="r ${r.deaths ? 'bad' : 'dim'}">${r.deaths || '–'}</td><td></td><td class="dim">area level ${r.level}</td></tr>`).join('') : '';
        return main + runs;
      }).join('');
      const tiers = TIER_FILTERS.map(([k, l]) => `<button class="fchip${(ui.mapTier || 'all') === k ? ' on' : ''}" data-mtier="${k}" aria-pressed="${(ui.mapTier || 'all') === k}">${l}</button>`).join('');
      const empty = !ui.allMaps ? '<div class="empty"><b>Loading maps…</b></div>'
        : !t.mapsDone ? '<div class="empty"><b>No maps yet</b><span>Maps start after the campaign.</span></div>'
          : '<div class="empty"><b>No maps match</b><span>Try another name or tier.</span></div>';
      // Two small charts. allMaps is newest first.
      const scoped = (ui.allMaps || []).filter(m => !sessionOnly || m.start >= s.start);
      const all = scoped.slice(0, 40).reverse();
      const mxT = Math.max(1, ...all.map(m => m.activeMs || 0)), avgT = (sessionOnly ? (s.mapsDone ? s.mapMs / s.mapsDone : 0) : st.avgMapMs) || 0;
      const trend = all.length ? `<section class="box"><div class="bh"><h2>Map times</h2><span class="sub">last ${all.length} maps, newest right · line = your average</span></div>
        <div class="mp-trend" role="img" aria-label="Map times of the last ${all.length} maps; your average is ${E.fmt(avgT)}">${all.map(m => `<i class="${m.deaths ? 'd' : ''}" style="height:${Math.round(100 * (m.activeMs || 0) / mxT)}%" title="${E.esc((m.zone || '').replace(/ Map$/, ''))} T${m.tier || '?'} · ${E.fmt(m.activeMs)}${m.deaths ? ' · ' + m.deaths + ' death(s)' : ''}"></i>`).join('')}<span class="avgline" style="bottom:${Math.min(100, Math.round(100 * avgT / mxT))}%"></span></div>
        <div class="sub" style="margin-top:6px">Red: you died in that map. Hover a bar for the map.</div></section>` : '';
      const tierCount = {}; scoped.forEach(m => { const k = m.tier || 0; tierCount[k] = (tierCount[k] || 0) + 1; });
      const tiersList = Object.keys(tierCount).map(Number).filter(Boolean).sort((a, b) => a - b), mxC = Math.max(1, ...Object.values(tierCount));
      const spread = tiersList.length ? `<section class="box"><div class="bh"><h2>Maps per tier</h2><span class="sub">${sessionOnly ? 'this session' : 'this league'}</span></div>
        <div class="tierbars" role="img" aria-label="${tiersList.map(k => 'tier ' + k + ': ' + tierCount[k]).join(', ')}">${tiersList.map(k => `<div><span class="lbl">T${k}</span><span class="mp-tb"><i style="width:${Math.round(100 * tierCount[k] / mxC)}%"></i></span><b>${tierCount[k]}</b></div>`).join('')}</div></section>` : '';
      const scope = `<div class="row between" style="margin-bottom:10px"><div class="scope" role="group" aria-label="Show numbers for">${[['session', 'This session'], ['league', 'This league']].map(([k, l]) => `<button data-mscope="${k}" aria-pressed="${(sessionOnly ? 'session' : 'league') === k}" ${k === 'session' && !(s && !s.ended) ? 'disabled title="No session running"' : ''}>${l}</button>`).join('')}</div>${s && !s.ended ? `<span class="sub">session started ${E.clock(s.start || Date.now() - s.elapsedMs)}</span>` : ''}</div>`;
      return head + scope + `<div class="chips six" style="margin-bottom:16px">${chips}</div>
        <div class="cols2" style="margin-bottom:16px">${trend}${spread}</div>
        <section class="box">
          <div class="row" style="gap:10px;flex-wrap:wrap">
            <input class="input" style="max-width:280px" type="search" placeholder="Search map…" aria-label="Search map" data-msearch value="${E.esc(ui.mapQ || '')}">
            <div class="row" style="gap:6px">${tiers}</div><span class="grow"></span>
            <span class="sub">Grouped per map and tier · ${groups.length} row${groups.length === 1 ? '' : 's'}</span>
          </div>
          ${rows ? `<div class="tblwrap"><table class="tbl mapstat"><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table></div>
            <div class="sub">Click a column to sort · click a map for its runs.</div>` : empty}
        </section>`;
    },
    mount(el) {
      const ui = EX.ui;
      el.addEventListener('input', e => { if ('msearch' in e.target.dataset) { ui.mapQ = e.target.value; EX.rerender(); } });
      el.addEventListener('click', e => { const b = e.target.closest('button[data-mscope]'); if (b) { ui.mapScope = b.dataset.mscope; EX.rerender(); } });
      el.addEventListener('click', e => {
        const s = e.target.closest('[data-msort]');
        if (s) {
          const k = s.dataset.msort, cur = ui.mapSort || 'runs';
          if (cur === k) ui.mapDir = -(ui.mapDir || defaultDir(k)); else { ui.mapSort = k; ui.mapDir = defaultDir(k); }
          return EX.rerender();
        }
        const tb = e.target.closest('[data-mtier]');
        if (tb) { ui.mapTier = tb.dataset.mtier; return EX.rerender(); }
        const g = e.target.closest('[data-mgroup]');
        if (g) { ui.mapOpen = ui.mapOpen === g.dataset.mgroup ? null : g.dataset.mgroup; EX.rerender(); }
      });
    },
  };

  // ---------- Campaign ----------
  EX.pages.campaign = {
    live: true,
    render({ snap, st }) {
      const head = ph('CP', 'Campaign', 'Starts in the first zone of a new character, pauses while the game is closed, ends in Karui Shores.');
      if (!snap.paths.clientTxt || !st) return head + `<div class="cols">${noLogBox('time runs')}</div>`;
      const run = st.campaign, r = run || st.lastFinishedRun, ref = st.referenceRun;
      if (!r) return head + `<div class="cols"><section class="box span2"><div class="empty"><b>No runs yet</b><span>Create a new character and the timer starts by itself in The Twilight Strand.</span></div></section></div>`;
      const completed = run ? run.maxAct - 1 : 10;
      const total = run ? null : (ref && ref.splits[10] != null && r.splits[10] != null ? r.splits[10] - ref.splits[10] : null);
      const last = completed >= 1 && ref && r.splits[completed] != null && ref.splits[completed] != null ? r.splits[completed] - ref.splits[completed] : null;
      const d = run ? last : total;
      const actbar = Array.from({ length: 10 }, (_, i) => i + 1).map(a => `<span class="${a <= completed ? 'd' : run && a === run.maxAct ? 'c' : ''}">${a}</span>`).join('');
      const hasRef = !!ref; // the tracker never returns the run itself as its reference
      const maxDf = Math.max(60e3, ...Array.from({ length: 10 }, (_, i) => hasRef && r.splits[i + 1] != null && ref.splits[i + 1] != null ? Math.abs(r.splits[i + 1] - ref.splits[i + 1]) : 0));
      const projected = run && hasRef && last != null && ref.splits[10] != null ? ref.splits[10] + last : null;
      const splitRows = Array.from({ length: 10 }, (_, i) => i + 1).map(a => {
        const mine = r.splits[a], theirs = hasRef ? ref.splits[a] : null, cur = run && a === run.maxAct;
        const df = mine != null && theirs != null ? mine - theirs : null;
        const bar = df == null ? '' : `<span class="dfbar"><i class="${df <= 0 ? 'ok' : 'bad'}" style="${df <= 0 ? 'right:50%' : 'left:50%'};width:${Math.round(50 * Math.abs(df) / maxDf)}%"></i></span>`;
        return `<tr class="${cur ? 'cur' : ''}"><td style="font-weight:600">Act ${a}${cur ? ' <span class="dim" style="font-weight:400">· now</span>' : ''}</td>
          <td class="r">${mine != null ? E.fmt(mine, { hours: true }) : cur ? E.fmt(run.activeMs, { hours: true }) : '–'}</td>
          <td class="r dim">${mine != null && (a === 1 || r.splits[a - 1] != null) ? E.fmt(mine - (a > 1 ? r.splits[a - 1] : 0)) : cur && (a === 1 || r.splits[a - 1] != null) ? E.fmt(run.activeMs - (a > 1 ? r.splits[a - 1] : 0)) : '–'}</td>
          ${hasRef ? `<td class="r dim">${theirs != null ? E.fmt(theirs, { hours: true }) : '–'}</td>
          <td class="r ${E.diffCls(df)}" style="font-weight:600">${E.diff(df)}</td><td style="width:34%">${bar}</td>` : ''}</tr>`;
      }).join('');
      const runs = [...st.runs].reverse();
      return head + `<div class="charrow">
        <section class="box"><div class="bh"><h2>${run ? 'Current run' : 'Latest run'}</h2>${run ? '<span class="pill ok"><span class="d" aria-hidden="true"></span>Running</span>' : '<span class="pill acc">Done</span>'}</div>
          <div class="row between" style="align-items:flex-end"><div style="min-width:0"><div style="font-size:20px;font-weight:600" class="ell">${E.esc(r.char || 'New character')}</div><div class="sub">${E.esc(r.cls || '')}${r.level ? ' · level ' + r.level : ''}</div></div>
            <div style="text-align:right"><div style="font-size:40px;font-weight:600;line-height:1">${E.fmt(r.activeMs, { hours: true })}</div>
              ${d != null ? `<div class="${E.diffCls(d)}" style="font-size:14px;font-weight:600;margin-top:4px">${E.diff(d)} vs previous run${run ? ' after Act ' + completed : ''}</div>` : `<div class="sub" style="margin-top:4px">${ref ? 'No split yet' : 'First run: becomes the reference'}</div>`}</div></div>
          <div class="actbar" role="img" aria-label="${run ? 'Act ' + run.maxAct + ' of 10' : 'Acts completed: 10 of 10'}">${actbar}</div>
          ${projected != null ? `<div class="cp-proj"><span class="lbl">On pace for</span><b>${E.fmt(projected, { hours: true })}</b><span class="sub">if you keep the gap you have now</span></div>` : ''}
          <dl class="kv"><dt>Deaths this run</dt><dd>${r.deaths}</dd><dt>Started</dt><dd>${E.date(r.startedAt)}</dd>${run ? '' : `<dt>Finished</dt><dd>${E.date(r.finishedAt)}</dd>`}</dl>
        </section>
        <section class="box"><div class="bh"><h2>Splits</h2><span class="sub">${hasRef ? 'vs ' + E.esc(ref.char || 'previous run') : 'Time at the end of each act'}</span></div>
          <div class="tblwrap"><table class="tbl"><thead><tr><th>Act</th><th class="r">Your time</th><th class="r">This act</th>${hasRef ? '<th class="r">Previous run</th><th class="r">Difference</th><th><span class="sub" style="text-transform:none;letter-spacing:0">← faster · slower →</span></th>' : ''}</tr></thead><tbody>${splitRows}</tbody></table></div>
          ${hasRef ? '' : E.note('Your next character races this run: its splits show up here side by side.')}</section></div>
        <div class="cols" style="margin-top:16px"><section class="box span2"><div class="bh"><h2>All runs</h2><span class="sub">The previous run is the last one with status Done</span></div>
          <div class="tblwrap"><table class="tbl"><thead><tr><th>Character</th><th>Class</th><th>Status</th><th class="r">Time</th><th class="r">Deaths</th><th>Started</th></tr></thead><tbody>
          ${runs.map(x => `<tr class="${run && x.id === run.id ? 'cur' : ''}"><td style="font-weight:600">${E.esc(x.char || 'New character')}</td><td>${E.esc(x.cls || '–')}</td>
            <td>${x.finished ? '<span class="pill acc">Done</span>' : x.abandoned ? `<span class="pill" style="color:var(--tx3)">Abandoned · Act ${x.maxAct}</span>` : '<span class="pill ok"><span class="d" aria-hidden="true"></span>Running</span>'}</td>
            <td class="r">${E.fmt(x.activeMs, { hours: true })}</td><td class="r">${x.deaths}</td><td>${E.date(x.startedAt)}</td></tr>`).join('')}
          </tbody></table></div>
          ${E.note('A run counts as abandoned when you start a new character before finishing it. It picks up again when that character levels up or dies.')}</section>
      </div>`;
    },
  };

  // ---------- Overlay ----------
  // One hotkey control everywhere: the keys when set, otherwise a "Set hotkey" chip in the same place.
  const hk = (cfg, key, label, snap = EX.state && EX.state.snap) => cfg.hotkeys[key] && !E.hkUsable(snap, key) ? `<button class="hkchip hkchip-bad" data-nav="settings:hotkeys" aria-label="Hotkey for ${label} not available">Not available</button>` : cfg.hotkeys[key] ? `<button class="hkchip" data-nav="settings:hotkeys" title="Change in Settings › Hotkeys">${E.kbd(cfg.hotkeys[key])}</button>` : `<button class="hkchip hkchip-none" data-nav="settings:hotkeys" aria-label="Set a hotkey for ${label}">+ Set hotkey</button>`;
  EX.overlayControls = (cfg, snap) => {
    const o = cfg.overlay;
    const b = cfg.breaks || { enabled: true, campaign: true, everyMin: 60 };
    const snd = b.sound || { on: false, volume: 50 };
    const fonts = [['app', 'Same as app'], ['source', 'Source Sans 3'], ['bahnschrift', 'Bahnschrift'], ['inter', 'Inter'], ['segoe', 'Segoe UI']];
    return `<section class="box"><div class="bh"><h2>Overlay</h2>${E.sw(o.enabled, 'Show overlay', 'ov-toggle')}</div>
        <div class="row between"><span class="muted">Show / hide</span>${hk(cfg, 'toggleOverlay', 'show / hide')}</div>
        <div class="row between"><span class="muted">Unlock to move</span>${hk(cfg, 'unlockOverlay', 'unlock')}</div>
        ${E.note('Unlocked, you can drag the overlay and pull its corners to change the width. Lock it again to click through it. Needs windowed fullscreen.')}
        <div class="row" style="gap:8px"><button class="btn sm" data-act="ov-unlock">${snap.overlayUnlocked ? ic.lock() + ' Lock' : ic.unlock() + ' Unlock to move'}</button><button class="btn q sm" data-act="ov-reset">${ic.refresh()} Reset position</button></div></section>
      <section class="box"><div class="bh"><h2>Take a break?</h2>${E.sw(b.enabled, 'Ask me to take a break', 'brk-toggle')}</div>
        <div class="row between"><span class="muted">Ask after</span><select class="select" style="width:auto" data-brkevery>${[30, 45, 60, 90, 120].map(m => `<option value="${m}" ${b.everyMin === m ? 'selected' : ''}>${m} min of play</option>`).join('')}</select></div>
        <div class="row between"><span class="muted">Also during the campaign</span>${E.sw(b.campaign, 'Also during the campaign', 'brk-campaign')}</div>
        <div class="row between"><span class="muted">"I took a break" key</span>${hk(cfg, 'breakTaken', 'I took a break')}</div>
        <div class="row between"><span class="muted">Play a sound</span>${E.sw(snd.on, 'Play a sound when it asks', 'brk-sound')}</div>
        <div class="row between"><label class="muted" for="brksnd">Sound</label><select id="brksnd" class="select" style="width:auto" data-brksnd ${snd.on ? '' : 'disabled'}>${[['chime', 'Chime'], ['shrine', 'Shrine (in-game)']].map(([v, l]) => `<option value="${v}" ${snd.file === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="row" style="gap:10px;align-items:center"><label class="muted" for="brkvol" style="white-space:nowrap">Volume</label>
          <input id="brkvol" type="range" min="0" max="100" step="5" value="${snd.volume}" data-brkvol class="grow" ${snd.on ? '' : 'disabled'} aria-valuetext="${snd.volume}%">
          <span class="sub" style="flex:none;min-width:4.5ch;overflow:visible;text-align:right;font-variant-numeric:tabular-nums">${snd.volume}%</span>
          <button class="btn q sm" data-act="brk-sound-test" ${snd.on ? '' : 'disabled'}>Test</button></div>
        ${E.note('Never in a map: it asks in your hideout or a town. A minute away from the keyboard counts as a break by itself.')}
        <div><button class="btn sm" data-act="brk-taken">I took a break</button></div></section>
      <section class="box"><div class="bh"><h2>Essence upgrades</h2>${E.sw(cfg.essences.enabled, 'Essence upgrade overlay', 'ess-toggle')}</div>
        <div class="field"><label class="lbl" for="essdisp">Which screen is the game on?</label><select id="essdisp" class="select" data-essdisp>${(() => {
          const ds = snap.displays || [], name = d => `Screen ${d.n} · ${d.w}×${d.h}${d.label ? ' · ' + E.esc(d.label) : ''}${d.primary ? ' (main)' : ''}`;
          const auto = ds.find(d => d.id === snap.gameDisplayId);
          return `<option value="auto" ${cfg.essences.display == null ? 'selected' : ''}>Automatic${auto ? ' · ' + name(auto) : ' · not found, main screen'}</option>`
            + ds.map(d => `<option value="${d.id}" ${cfg.essences.display === d.id ? 'selected' : ''}>${name(d)}</option>`).join('');
        })()}</select></div>
        <div class="row between"><span class="muted">Show / hide</span>${hk(cfg, 'essenceOverlay', 'essence upgrades')}</div>
        ${E.note('Open your essence stash tab and press the hotkey: green is worth upgrading, red is not.')}
        <details class="howto"><summary>How it decides</summary><p class="sub" style="white-space:normal;margin:6px 0 0">Green when 3 essences are worth less than 1 of the next tier, chains included, with the profit per row and in total. Counts come from your newest Wealthy Exile export (a fresh one first when it is older than 15 minutes), prices from poe.ninja. Only while the game runs.</p></details></section>
      <section class="box"><h2>Overlay text</h2>
        <div class="field"><label class="lbl" for="ovf">Font</label><select id="ovf" class="select" data-ovfont>${fonts.map(([v, l]) => `<option value="${v}" ${o.font === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><span class="lbl" id="ovs-l">Size</span><div role="radiogroup" aria-labelledby="ovs-l" class="seg" style="align-self:flex-start">
          ${['s', 'm', 'l'].map(sz => `<label><input type="radio" name="ovs" value="${sz}" data-ovsize ${o.size === sz ? 'checked' : ''}>${sz.toUpperCase()}</label>`).join('')}</div></div></section>`;
  };

  // Compact overlay: one main row that shows what matters where you are, and a thin footer.
  //  campaign zone: run time + last act split · map: map timer + tier · town/hideout: dimmed last thing
  EX.overlayRows = (cfg, st, paused, extra = {}) => {
    if (!st) return '<div class="pz">Waiting for Client.txt…</div>';
    const area = st.area, run = st.campaign && !st.campaign.finished ? st.campaign : null;
    const ref = st.referenceRun;
    const row = (k, b, v, small, cls = '', vcls = '') => `<div class="r${cls}"><div class="k">${k}${b != null ? `<b>${b}</b>` : ''}</div><div class="v ${vcls}">${v}${small ? `<small>${small}</small>` : ''}</div></div>`;
    const kind = area && area.kind;
    const place = kind === 'hideout' ? 'In Hideout' : 'In Town';
    let main;
    if (st.inMap && st.currentMap) {
      const m = st.currentMap;
      main = row(`Map${m.tier ? ' · T' + m.tier : ''}`, E.esc((m.zone || m.areaId || '').replace(/ Map$/, '')), E.fmt(m.activeMs), st.avgMapMsRecent != null ? 'avg ' + E.fmt(st.avgMapMsRecent) : '');
    } else if (run && (kind === 'campaign' || kind === 'town' || kind === 'hideout')) {
      const a = run.maxAct - 1;
      const d = ref && a >= 1 && run.splits[a] != null && ref.splits[a] != null ? run.splits[a] - ref.splits[a] : null;
      const split = d != null ? `<span class="${d <= 0 ? 'ahead' : 'behind'}">Act ${a} ${E.diff(d)}</span>` : `Act ${run.maxAct}`;
      main = kind === 'campaign'
        ? row('Campaign', `Act ${run.maxAct} · ${E.esc(area.zone || '…')}`, E.fmt(run.activeMs, { hours: true }), split)
        : row(place, E.esc(area.zone || ''), E.fmt(run.activeMs, { hours: true }), split);
    } else if (kind === 'hideout' || kind === 'town') {
      const lm = st.lastMap;
      main = lm ? row(place, `Last map · ${E.esc((lm.zone || lm.areaId || '').replace(/ Map$/, ''))}`, E.fmt(lm.activeMs), 'map done', ' dim')
        : row(place, E.esc(area.zone || ''), E.fmt(area.elapsedMs), '', ' dim');
    } else {
      main = row('Zone', E.esc(area && area.zone || '—'), area ? E.fmt(area.elapsedMs) : '–:––');
    }
    const se = st.session;
    const rate = extra.divRate;
    const right = rate && rate.perHour != null
      ? `<span class="${rate.perHour >= 0 ? 'ahead' : 'behind'}"><b>${rate.perHour.toFixed(2)}</b> div/h</span>`
      : `Breaks <b>${E.fmt(se ? se.breakMs || 0 : 0, { hours: true })}</b>`;
    const foot = `<div class="ft"><span>Session <b>${se ? E.fmt(se.elapsedMs, { hours: true }) : '–:––'}</b></span><span>${right}</span></div>`;
    return (paused ? `<div class="pz">${ic.pause()} Paused · game closed</div>` : '') + main + foot;
  };

  // "Take a break?" next to the overlay, same height as the timer row.
  EX.breakPrompt = (cfg, bp, status) => {
    if (!bp) return '';
    const key = cfg.hotkeys && cfg.hotkeys.breakTaken && (!status || status.breakTaken === 'ok') ? cfg.hotkeys.breakTaken : null; // only a key that works
    return `<div class="r"><div class="k" style="color:var(--live)">Take a break?<b>${key ? E.esc(key) + ' = yes' : cfg.hotkeys && cfg.hotkeys.breakTaken ? 'hotkey not available' : 'no hotkey set'}</b></div><div class="v">${E.hm(bp.sinceMs)}<small>since last</small></div></div>`;
  };

  EX.pages.overlay = {
    live: true,
    render({ snap, cfg, st }) {
      const o = cfg.overlay, paused = !snap.gameRunning;
      const font = o.font === 'app' ? '' : ` f-${o.font}`;
      const pal = EX.state.darkPalette;
      const fsWarn = snap.exclusiveFullscreen ? `<div class="banner warn" role="alert" style="margin-bottom:16px"><span class="bi">${ic.warn()}</span><div class="grow"><div class="bt">The game runs in exclusive fullscreen</div><div class="sub">Nothing can be drawn over it then. In game: Options › Graphics › Mode: Windowed fullscreen.</div></div></div>` : '';
      return fsWarn + ph('OV', 'Overlay', 'Floats over the game. Click-through while locked.', o.enabled ? '<span class="pill ok"><span class="d" aria-hidden="true"></span>Showing in game</span>' : '<span class="pill">Hidden</span>') + `
        <div style="display:grid;grid-template-columns:minmax(0,340px) minmax(0,1fr);gap:16px;align-items:start;max-width:1100px">
          <section class="box"><div class="bh"><h2>Preview</h2><span class="sub">${paused ? 'Game closed' : 'Live'}</span></div>
            <div class="ov ovmini ovt-${pal} sz-${o.size}${paused ? ' paused' : ''}${font}" style="--ovf:var(--ui)">${EX.overlayRows(cfg, st, paused, { divRate: snap.divRate })}</div>
            ${E.note('In a map: map timer and tier. In the campaign: run time and act split. In town or hideout: dimmed, the timer keeps going.')}</section>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px;min-width:0">${EX.overlayControls(cfg, snap)}</div>
        </div>`;
    },
  };

  // ---------- Wealthy Exile ----------
  // Net worth and profit from the exports, sync settings and the connection (Tampermonkey + the script Exilogue ships).
  // "Connected" = the script has talked to Exilogue at least once; a closed browser tab doesn't undo that.
  EX.pages.wealthy = {
    live: true,
    render({ snap, cfg }) {
      const w = snap.wealth || {}, ui = EX.ui, ws = EX.weSetup;
      const n = (v, d = 1) => v == null || !Number.isFinite(v) ? '–' : Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-US') : v.toFixed(Math.abs(v) >= 100 ? 0 : d);
      const live = w.scriptSeenAt && Date.now() - w.scriptSeenAt < 3 * 60e3;
      const hk = (key, label) => cfg.hotkeys[key] && !E.hkUsable(snap, key) ? `<button class="hkchip hkchip-bad" data-nav="settings:hotkeys" aria-label="Hotkey for ${label} not available">Not available</button>` : cfg.hotkeys[key] ? `<button class="hkchip" data-nav="settings:hotkeys" title="Change in Settings › Hotkeys">${E.kbd(cfg.hotkeys[key])}</button>` : `<button class="hkchip hkchip-none" data-nav="settings:hotkeys" aria-label="Set a hotkey for ${label}">+ Set hotkey</button>`;
      const ever = w.scriptEverAt || w.scriptSeenAt; // kept across restarts
      const connected = !!(ever || w.scriptVersion);
      const silent = connected && !live && ever && Date.now() - ever > 3 * 86400e3;
      const problem = w.serverError || w.scriptOld; // these need the steps (or a restart), so they come first
      const [pillCls, pillTxt] = w.serverError ? ['', 'Port 47615 is taken'] : w.scriptOld ? ['acc', 'Script update ready'] : live ? ['ok', 'Connected'] : silent ? ['', 'Not heard from in days'] : connected ? ['acc', 'No Wealthy Exile tab open'] : ['', 'Not set up yet'];
      const right = `<span class="pill ${pillCls}"><span class="d" aria-hidden="true"></span>${pillTxt}</span>
        <button class="btn lg" data-url="https://wealthyexile.com/">Open site ${ic.ext()}</button>
        ${connected ? `<button class="btn p lg" data-act="wealth-sync" title="${live ? 'Sync and export in your open tab' : 'Opens Wealthy Exile, syncs and exports'}">${ic.refresh()} Sync &amp; export</button>` : ''}`;
      const dr = snap.divRate || {};
      const sg = v => v == null || !Number.isFinite(v) ? '–' : `<span class="${v >= 0 ? 'ok' : 'bad'}">${v >= 0 ? '+' : '−'}${n(Math.abs(v))} div</span>`;
      // Same rules as the background sync itself (main.js weBgNext).
      const bn = w.bgNext || {}, nextTxt = { off: 'off', 'no-game': 'when you play', away: 'when you are back at the PC', 'no-tab': 'waits for a Wealthy Exile tab', reading: 'after Exilogue has read the log' }[bn.state]
        || (bn.at ? (bn.at - Date.now() <= 60e3 ? 'any moment' : 'in ~' + Math.round((bn.at - Date.now()) / 60e3) + ' min') : '–');
      const top = (w.top || []).map(t => `<tr><td>${E.esc(t.name)}</td><td class="r">${t.qty > 1 ? n(t.qty, 0) : '1'}</td><td class="r">${w.divPrice ? n(t.total / w.divPrice) + ' div' : n(t.total, 0) + 'c'}</td></tr>`).join('');
      const steps = connected && !problem && !ui.wsOpen ? `<div style="display:flex;flex-direction:column;gap:10px">${ws.statusHtml(snap)}<div><button class="btn q sm" data-act="ws-toggle">Show the setup steps</button></div></div>` : ws.html(snap, ui, 'settings') + (connected && !problem ? '<div style="margin-top:10px"><button class="btn q sm" data-act="ws-toggle">Hide the steps</button></div>' : '');
      return `<div class="ph"><span class="logo lg" aria-hidden="true">WE</span><div class="grow"><h1 class="h">Wealthy Exile</h1><div class="sub" style="margin-top:4px">Net worth and profit per hour, from your Wealthy Exile exports</div></div><div class="row" style="gap:10px">${right}</div></div>
        <div class="cols" style="align-items:stretch">
          ${connected || w.count ? '' : `<section class="box span2 we-intro"><h2>What you get</h2><p class="sub" style="white-space:normal;margin:0">Your net worth over the league, profit per hour on Home and in the overlay, and how close you are to your goal. Wealthy Exile counts your stash; Exilogue asks it to sync while you play. Set it up once below, or export by hand in Wealthy Exile (··· › Export CSV): Exilogue picks the file up from Downloads.</p></section>`}
          ${connected && !w.count ? `<section class="box span2"><h2>No export yet</h2><p class="sub" style="white-space:normal;margin:0">Press Sync &amp; export, or export in Wealthy Exile yourself (··· › Export CSV). Exilogue picks the file up from Downloads.</p></section>` : ''}
          ${w.error ? `<section class="box span2"><div class="tile-err">${ic.warn()}<span>Couldn't read the newest export: ${E.esc(String(w.error).replace(/\.\s*$/, ''))}.${w.count ? ' The numbers below are from the export before.' : ''}</span></div></section>` : ''}
          ${w.count ? `          <section class="box span2"><div class="bh"><h2>Net worth</h2><span class="sub">Exported ${w.at ? E.ago(w.at) : '–'}</span></div>
            <div><div style="font-size:40px;font-weight:600;line-height:1">${w.divines != null ? n(w.divines) + ' div' : n(w.chaos, 0) + 'c'}</div>
              <div class="sub" style="margin-top:6px">${[n(w.chaos, 0) + 'c', w.divPrice ? '1 div = ' + n(w.divPrice, 0) + 'c' : '', w.delta != null && w.divPrice ? `${sg(w.delta / w.divPrice)} since previous export` : ''].filter(Boolean).join(' · ')}</div></div>
            <div class="we-big">${EX.spark(w.history)}</div></section>
          <section class="box"><div class="bh"><h2>This session</h2><span class="sub">from exports during play</span></div>
            <div class="dlist"><div><span>Profit per hour</span><b class="${dr.perHour == null ? '' : dr.perHour >= 0 ? 'ok' : 'bad'}">${n(dr.perHour, 2)} div/h</b></div><div><span>Gained this session</span><b>${sg(dr.divines)}</b></div><div><span>Exports this league</span><b>${w.count || 0}</b></div><div><span>Next background sync</span><b>${nextTxt}</b></div></div></section>
          <section class="box"><div class="bh"><h2>Biggest items</h2><span class="sub">in your newest export</span></div>
            ${top ? '' : '<div class="sub">Shows up with the next export.</div>'}<table class="tbl"${top ? '' : ' hidden'}><thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Worth</th></tr></thead><tbody>${top}</tbody></table></section>
` : ''}
${connected ? '' : `          <section class="box box-full"><div class="bh"><h2>Connection</h2><span class="sub">Tampermonkey + the Exilogue script, set up once</span></div>${steps}</section>`}
          ${connected ? `<section class="box"><div class="bh"><h2>Sync while you play</h2>${E.sw(cfg.weSync.background, 'Sync Wealthy Exile in the background', 'wesync-toggle')}</div>
            <div class="row between"><span class="muted">At most every</span><select class="select" style="width:auto" data-weevery>${[15, 30, 45, 60, 90].map(m => `<option value="${m}" ${cfg.weSync.everyMin === m ? 'selected' : ''}>${m} min</option>`).join('')}</select></div>
            <div class="row between"><span class="muted">Hotkey</span>${hk('weSync', 'sync and export')}</div>
            ${E.note('About every ' + cfg.weSync.everyMin + ' minutes while you play, in a map or out of one; not while you are away from the PC. Needs an open Wealthy Exile tab in your browser.')}</section>` : ''}
${connected ? `          <section class="box"><div class="bh"><h2>Connection</h2><span class="sub">Tampermonkey + the Exilogue script, set up once</span></div>${steps}</section>` : ''}
        </div>`;
    },
  };


  // ---------- Help ----------
  EX.pages.help = {
    live: false,
    render({ snap }) {
      const q = (t, a) => `<details class="help-q"><summary>${t}</summary><p>${a}</p></details>`;
      return ph('?', 'Help', 'Common questions. Each answer says where to fix it.') + `<div class="cols">
        <section class="box span2">
          ${q('The overlay doesn\'t show in game', 'Set the game to <b>Windowed fullscreen</b> (Options › Graphics). Check that the overlay is switched on (Overlay page) and that the game runs. Its hotkey shows or hides it.')}
          ${q('Exilogue doesn\'t see my zones or maps', 'It reads the game\'s log, Client.txt. Check Settings › Paths (the dot must be green) and the league start in Settings › League: anything before the start is ignored.')}
          ${q('Wealthy Exile doesn\'t sync', 'Keep a Wealthy Exile tab open in your browser. The Wealthy Exile page shows whether the script is connected; if not, follow its steps again. In Chrome and Edge, “Allow User Scripts” must stay on.')}
          ${q('Prices or the goal are missing', 'Prices come from poe.ninja. If it is down or your league name differs from poe.ninja\'s, prices stay empty. Check the league name in Settings › League.')}
          ${q('A hotkey doesn\'t work', 'Another program may use the same keys: Settings › Hotkeys shows it in red. Numpad keys need Num Lock on.')}
          ${q('Where are my files and backups?', 'Settings › Storage &amp; backups, with Open folder. A backup is made before every rebuild or path change.')}
        </section>
        <section class="box"><h2>Still stuck?</h2><p class="sub" style="white-space:normal;margin:0">Copy the diagnostics and send them to whoever helps you (or paste them in a GitHub issue). They hold versions, which paths were found and the last errors; no account details.</p>
          <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn p" data-act="diag-copy">Copy diagnostics</button><button class="btn" data-act="logs-open">${ic.folder()} Open Exilogue's folder</button></div>
          <div><button class="btn q sm" data-url="https://github.com/OriginDutch/PoE_Exilogue/issues">Report on GitHub ${ic.ext()}</button></div>
          <div class="sub">Exilogue ${E.esc((snap.update && snap.update.version) || '')}</div></section>
      </div>`;
    },
  };
  // ---------- Loot filter ----------
  EX.pages.filter = {
    live: false, // no timers on this page
    render({ snap }) {
      const ns = snap.neversink || {}, latest = ns.latest, off = ns.remind === false, outdated = latest && !off && latest.tag !== ns.lastSyncedTag;
      return ph('LF', 'Loot filter', 'NeverSink · FilterBlade', off ? '<span class="pill">Reminders off</span>' : latest ? (outdated ? '<span class="pill acc"><span class="d" aria-hidden="true"></span>Update available</span>' : '<span class="pill">Up to date</span>') : '') + `<div class="cols">
        <section class="box"><div class="bh"><h2>Latest NeverSink</h2><button class="btn q" data-url="${latest ? E.esc(latest.url) : 'https://github.com/NeverSinkDev/NeverSink-Filter/releases'}">Release notes ${ic.ext()}</button></div>
          ${latest ? `<div><div style="font-size:40px;font-weight:600;line-height:1">${E.esc(latest.tag)}</div><div class="sub" style="margin-top:6px">Released ${E.date(new Date(latest.publishedAt).getTime())} · ${E.ago(new Date(latest.publishedAt).getTime())}</div></div>`
            : '<div class="empty"><b>Not checked yet</b><span>Exilogue asks GitHub for the latest release when you are online.</span></div>'}</section>
        <section class="box"><div class="bh"><h2>Your filter</h2><span class="sub">Last synced version</span></div>
          ${ns.lastSyncedTag ? `<div><div style="font-size:40px;font-weight:600;line-height:1" class="muted">${E.esc(ns.lastSyncedTag)}</div><div class="sub" style="margin-top:6px">Marked as synced ${ns.syncedAt ? E.date(ns.syncedAt) : ''}</div></div>`
            : '<div class="empty"><b>Not marked yet</b><span>Press "I\'ve synced" after you sync in FilterBlade.</span></div>'}</section>
        ${latest && latest.notes && latest.notes.length ? `<section class="box span2"><div class="bh"><h2>What's new in ${E.esc(latest.tag)}</h2><span class="sub">${latest.notes.length} change${latest.notes.length === 1 ? '' : 's'} · from GitHub</span></div>
          <ul class="notes">${latest.notes.map(n => `<li>${E.esc(n)}</li>`).join('')}</ul></section>` : ''}
        <section class="box span2"><h2>Update your filter</h2>
          <ol class="steps"><li>Open FilterBlade. It loads the latest NeverSink.</li><li>Sync it to your account in FilterBlade.</li><li>In game: Options › Game › Item filter, pick it again (or reload it).</li><li>Come back and press I've synced.</li></ol>
          <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn p lg" data-url="https://www.filterblade.xyz">Open FilterBlade ${ic.ext()}</button>
            ${latest ? `<button class="btn lg" data-act="ns-synced" ${latest.tag !== ns.lastSyncedTag ? '' : 'disabled'}>I've synced ${E.esc(latest.tag)}</button>` : ''}</div>
          ${E.note('FilterBlade keeps your own tweaks when you re-sync, so updating does not reset your changes.')}
          <div>${off ? '<span class="sub">Reminders are off. </span><button class="btn q sm" data-act="ns-on">Remind me again</button>' : '<button class="btn q sm" data-act="ns-off">I don\'t use NeverSink: stop reminding me</button>'}</div></section></div>`;
    },
  };

  // ---------- Path of Building ----------
  EX.pages.pob = {
    live: false,
    render({ snap }) {
      const b = snap.pobBuild, st = (b && b.stats) || {};
      const big = v => v == null ? '–' : v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : v >= 1e4 ? Math.round(v / 1e3) + 'k' : Math.round(v).toLocaleString('en-US');
      const head = ph('PB', 'Path of Building', b ? 'Your most recently saved build' : 'Build planner', snap.paths.pobExe ? `<button class="btn p lg" data-act="pob">${ic.play()} Launch</button>` : `<span class="sub">Path not set</span><button class="btn lg" data-nav="settings:paths">Set path</button>`);
      if (!b) return head + `<div class="cols"><section class="box span2"><div class="empty"><b>No builds found</b><span>Looks in Documents\\Path of Building\\Builds. Save a build in Path of Building and it shows up here.</span></div></section></div>`;
      const res = [['Fire', 'FireResist', '#ec7f6e'], ['Cold', 'ColdResist', '#8fb4f0'], ['Lightning', 'LightningResist', '#e2c56f'], ['Chaos', 'ChaosResist', '#c3a5f0']];
      const supp = st.EffectiveSpellSuppressionChance ?? st.SpellSuppressionChance;
      const stat = (k, v, cls = '') => `<div class="pbs"><span class="lbl">${k}</span><b class="${cls}">${v}</b></div>`;
      return head + `<div class="charrow">
        <section class="box"><div class="bh"><h2>Build</h2><span class="sub">saved ${E.ago(b.mtime)}</span></div>
          <div><div style="font-size:26px;font-weight:600;line-height:1.15">${E.esc(b.skill || b.name)}</div>
          <div class="sub" style="margin-top:4px">${E.esc([b.asc || b.cls, b.level ? 'level ' + b.level : ''].filter(Boolean).join(' · '))}</div></div>
          <div class="sub ell" title="${E.esc(b.file)}">${E.esc(b.name)}.xml</div>
          <div class="row" style="gap:8px"><button class="btn sm" data-act="pob-folder">${ic.folder()} Open builds folder</button></div></section>
        <section class="box"><div class="bh"><h2>Numbers</h2><span class="sub">as Path of Building calculated them when you saved</span></div>
          <div class="pbgrid">${stat('DPS', big(st.CombinedDPS || st.FullDPS || st.TotalDPS))}${stat('Life', big(st.Life))}${stat('Energy shield', big(st.EnergyShield))}${stat('Evasion', big(st.Evasion))}${stat('Spell suppression', supp != null ? Math.round(supp) + '%' : '–', supp >= 100 ? 'ok' : '')}</div>
          <div class="lbl" style="margin-top:6px">Resistances</div>
          <div class="res big">${res.filter(([, k]) => st[k] != null).map(([l, k, c]) => `<span style="--c:${c}"><small>${l}</small>${Math.round(st[k])}%</span>`).join('')}</div>
          ${st.ChaosResist < 0 ? `<div class="sub">${ic.warn()} Chaos resistance is negative.</div>` : ''}</section>
      </div>`;
    },
  };
})();
