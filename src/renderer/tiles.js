'use strict';
// Home tiles (v0.6): every tile shows real information from its tool, so Home is one place for everything.
// Fixed sizes (PoE and Session & Maps are two columns wide); Edit layout changes order and hides tiles.
(function () {
  const E = EX, ic = EX.icon;
  const esc = s => E.esc(s == null ? '' : String(s));
  const num = (v, d = 1) => v == null || !Number.isFinite(v) ? '–' : Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-US') : v.toFixed(Math.abs(v) >= 100 ? 0 : d);
  const signed = (v, d = 1) => v == null ? '–' : `${v >= 0 ? '+' : '−'}${num(Math.abs(v), d)}`;
  const big = n => n == null ? '–' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'k' : Math.round(n).toLocaleString('en-US');
  const kv = (k, v, cls = '') => `<div><span>${k}</span><b class="${cls}">${v}</b></div>`;
  const band = t => (!t ? 'n' : t <= 5 ? 'w' : t <= 10 ? 'y' : 'r');
  const tier = t => (t ? `<span class="dt ${band(t)}">T${t}</span>` : '');
  const zoneName = z => esc(String(z || '').replace(/ Map$/, ''));
  const glyphId = z => 'map-' + String(z || '').replace(/ Map$/, '').replace(/[^A-Za-z]/g, '').toLowerCase();
  // Real art from GGG (via the icon cache), or nothing: never a stand-in.
  const art = (id, cls) => { const src = E.iconOf(id); return src ? `<img class="gi ${cls}" src="${esc(src)}" alt="">` : ''; };
  // Map icon as in game: GGG serves only the glyph; the round base in the tier colour is drawn here.
  const mapIc = (zone, t, lg) => { const src = E.iconOf(glyphId(zone)); return src ? `<span class="mapic ${band(t)}${lg ? ' lg' : ''}" aria-hidden="true"><img src="${esc(src)}" alt=""></span>` : ''; };
  // nav: the title opens the tile's page. 'title' = only the title does (the rest of the tile has its own click action).
  const head = (id, name, sub, right = '', nav = true) => {
    const def = { id, mono: E.CARDS[id] ? E.CARDS[id].mono : ({ days: 'MD', fun: 'FS' }[id] || id.slice(0, 2).toUpperCase()) };
    const open = nav ? `<button class="open${nav === 'title' ? ' open-title' : ''}" data-nav="page:${id}">${name}</button>` : `<span class="open">${name}</span>`;
    return `<div class="ch">${E.logo(def)}<div class="t">${open}${sub ? `<div class="sub ell">${sub}</div>` : ''}</div>${right}</div>`;
  };
  const pill = (on, a, b) => `<span class="pill${on ? ' ok' : ''}"><span class="d" aria-hidden="true"></span>${on ? a : b}</span>`;
  const noLog = what => `<div class="empty push"><b>No log</b><span>Needs Client.txt to ${what}.</span></div>`;

  // Ascendancy → base class (Client.txt and the profile give the ascendancy once you have one).
  const BASE = { Slayer: 'Duelist', Gladiator: 'Duelist', Champion: 'Duelist', Assassin: 'Shadow', Saboteur: 'Shadow', Trickster: 'Shadow',
    Juggernaut: 'Marauder', Berserker: 'Marauder', Chieftain: 'Marauder', Necromancer: 'Witch', Occultist: 'Witch', Elementalist: 'Witch',
    Deadeye: 'Ranger', Raider: 'Ranger', Pathfinder: 'Ranger', Inquisitor: 'Templar', Hierophant: 'Templar', Guardian: 'Templar',
    Ascendant: 'Scion', Warden: 'Ranger' };
  const clsLine = c => (BASE[c] ? `${esc(c)} · ${BASE[c]}` : esc(c));

  // ---------- Path of Exile ----------
  function poe({ snap, cfg, st }) {
    const ch = st && st.character, area = st && st.area, running = snap.gameRunning, pathOk = snap.paths.poeExe;
    const right = !pathOk ? `<span class="pill"><span class="d"></span>Path not set</span>` : pill(running, 'Running', 'Not running');
    const sub = `${esc(cfg.league.name)}${E.leagueDay(cfg.league.start) ? ' · Day ' + E.leagueDay(cfg.league.start) : ''}`;
    if (!pathOk) return `${head('poe', 'Path of Exile', sub, right)}<div class="empty"><b>Where is Path of Exile installed?</b><span>Set the game path once, and Play and the live status start working.</span></div><div class="push"><button class="btn p" data-nav="settings:paths">Set game path</button></div>`;
    const r = snap.divRate && snap.divRate.perHour, ls = st && st.lastSession;
    const vs = r != null && ls && ls.divPerHour != null ? r - ls.divPerHour : null;
    const rate = r != null ? r : ls && ls.divPerHour;
    const se = st && st.session && !st.session.ended ? st.session : null;
    const m = st && st.inMap ? st.currentMap : null;
    const now = m ? `<div style="font-weight:600" class="ell">${zoneName(m.zone)} ${tier(m.tier)}</div><div class="sub">${E.fmt(m.activeMs)} in map${st.avgMapMsRecent != null ? ' · avg ' + E.fmt(st.avgMapMsRecent) : ''}</div>`
      : `<div style="font-weight:600" class="ell">${area && area.zone ? esc(area.zone) : '—'}</div><div class="sub">${area && area.kind === 'hideout' ? 'In hideout' : area && area.kind === 'town' ? 'In town' : running ? 'In game' : 'Game closed'}</div>`;
    const sess = se ? `<div style="font-weight:600">${E.hm(se.elapsedMs)} · ${se.mapsDone} map${se.mapsDone === 1 ? '' : 's'}</div><div class="sub ell">${se.deaths ? `<span class="bad">${se.deaths} death${se.deaths === 1 ? '' : 's'}</span>` : 'no deaths'}${snap.divRate && snap.divRate.divines != null ? ` · <span class="${snap.divRate.divines >= 0 ? 'ok' : 'bad'}">${signed(snap.divRate.divines)} div</span>` : ''}${se.breaks ? ' · breaks ' + E.hm(se.breakMs) : ''}</div>`
      : ls ? `<div style="font-weight:600">Last: ${E.hm(ls.playedMs)} · ${ls.maps} maps</div><div class="sub">${E.date(ls.start)}${ls.deaths ? ` · <span class="bad">${ls.deaths} deaths</span>` : ''}</div>` : '<div class="sub">No session yet</div>';
    // Character info: ascendancy and base class, campaign time, last level-up.
    const run = st && [st.campaign, st.lastFinishedRun].find(x => x && ch && x.char === ch.name);
    const lv = st && (st.latestEvents || []).slice().reverse().find(e => e.type === 'level' && ch && e.char === ch.name);
    const info = ch ? `<div style="font-weight:600" class="ell">${clsLine(ch.cls)}</div><div class="sub ell">${run ? `Campaign ${E.fmt(run.activeMs, { hours: true })}${run === st.campaign ? ' (running)' : ''}` : 'Campaign unknown'}${lv ? ' · lvl ' + lv.level + ' ' + E.ago(lv.t) : ''}</div>` : '<div class="sub">Shows up after your first level-up or death</div>';
    const evs = st ? (st.latestEvents || []).slice(-3).reverse().map(e => { const [t] = E.eventLine ? E.eventLine(e) : [e.type]; return `${E.clock(e.t)} ${t}`; }).join(' · ') : '';
    const play = running ? '' : `<button class="btn p" data-act="play">${ic.play()} Play</button>`;
    return `${head('poe', 'Path of Exile', sub, right)}
      <div class="row" style="gap:16px;align-items:flex-start">
        ${ch ? `<div class="lvl"><b>${ch.level}</b></div>` : ''}
        <div style="flex:1;min-width:0"><div style="font-size:20px;font-weight:600" class="ell">${ch ? esc(ch.name) : 'No character yet'}</div><div class="sub">${ch ? clsLine(ch.cls) : ''}</div></div>
        <div style="text-align:right"><div class="lbl">Div / hour</div><div class="dv">${art('cur-divine', 'cur')}${rate != null ? num(rate, 2) : '–'}</div>
          <div class="sub">${vs != null ? `${vs >= 0 ? '▲' : '▼'} ${num(Math.abs(vs), 2)} vs last session` : r != null ? 'this session' : rate != null ? 'last session' : snap.wealth && snap.wealth.count ? 'needs a 2nd export this session' : 'needs Wealthy Exile exports'}</div></div>
      </div>
      <div class="dgrid3">
        <div class="dbox"><div class="lbl">${running ? 'Now' : 'Last zone'}</div>${now}</div>
        <div class="dbox"><div class="lbl">${se ? 'This session' : 'Previous session'}</div>${sess}</div>
        <div class="dbox"><div class="lbl">Character</div>${info}</div>
      </div>
      ${snap.breakPrompt ? `<div class="row push poe-foot brkline"><span class="brk-q">Time for a break?</span><span class="sub ell">${E.hm(snap.breakPrompt.sinceMs)} since your last one</span><span class="grow"></span><button class="btn sm" data-act="brk-taken">I took a break</button></div>`
        : `<div class="row push poe-foot">${play}${evs ? `<button class="evstrip sub" data-nav="events" title="All events">${esc(evs)} ›</button>` : ''}</div>`}`;
  }

  // ---------- Wealthy Exile ----------
  // Net worth over the league, placed on real time (an export gap of 10 h is wider than one of 5 min),
  // with a time axis: times of day for under ~36 h, otherwise dates.
  function spark(pts) {
    if (!pts || pts.length < 2) return '<div class="sub" style="height:54px;display:grid;place-items:center">The chart fills in with your exports</div>';
    const w = 220, h = 54, v = pts.map(p => p.divines), mx = Math.max(...v), mn = Math.min(...v);
    const t0 = pts[0].t, t1 = pts[pts.length - 1].t, span = t1 - t0 || 1;
    const X = p => ((p.t - t0) / span) * w, Y = x => h - 4 - ((x - mn) / (mx - mn || 1)) * (h - 10);
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p).toFixed(1)} ${Y(p.divines).toFixed(1)}`).join(' ');
    const short = span < 36 * 3600e3;
    const fmt = t => {
      const dt = new Date(t);
      return short ? dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
        : dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    };
    const ticks = [t0, t0 + span / 2, t1].map(fmt);
    const ax = `<div class="spark-ax" aria-hidden="true"><span>${esc(ticks[0])}</span><span>${esc(ticks[1])}</span><span>${esc(ticks[2])}</span></div>`;
    return `<div class="spark-wrap"><svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Net worth from ${esc(fmt(t0))} to ${esc(fmt(t1))}: ${num(v[0])} to ${num(v[v.length - 1])} div"><path d="${d} L${w} ${h} L0 ${h}Z" fill="var(--ok)" opacity=".12"/><path d="${d}" fill="none" stroke="var(--ok)" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>${ax}</div>`;
  }
  EX.spark = spark;
  function wealthy({ snap }) {
    const w = snap.wealth;
    const ext = `<button class="btn i sm" data-act="wealth-sync" aria-label="Sync and export in Wealthy Exile" title="Sync &amp; export">${ic.refresh()}</button>`;
    const syncBtn = `<button class="btn sm" data-act="wealth-sync">${ic.refresh()} Sync &amp; export</button>`;
    if (!w || !w.count) {
      const ready = !!(w && (w.scriptVersion || w.scriptEverAt)); // the script has connected at least once (kept across restarts)
      return `${head('wealthy', 'Wealthy Exile', ready ? 'No export yet' : 'Not set up yet', ready ? '' : ic.chev(), ready ? 'title' : true)}<div class="sub" style="white-space:normal">${ready
        ? 'Press sync, or export yourself in Wealthy Exile (··· › Export CSV); Exilogue picks the file up from Downloads.'
        : 'Net worth and profit per hour, from your Wealthy Exile stash. About 2 minutes to set up. Or export by hand (··· › Export CSV) and Exilogue picks it up from Downloads.'}</div>
        <div class="push">${ready ? syncBtn : '<button class="btn sm" data-nav="page:wealthy">Set up</button>'}</div>`;
    }
    const top = (w.top || []).slice(0, 3).map(t => kv(`<span class="ell">${esc(t.name)}${t.qty > 1 ? ' ×' + num(t.qty, 0) : ''}</span>`, w.divPrice ? num(t.total / w.divPrice) + ' div' : num(t.total, 0) + 'c')).join('');
    const tooBig = w.error && /too large/.test(w.error);
    const errRow = w.error ? `<div class="tile-err">${ic.warn()}<span>Couldn't read the newest export${tooBig ? ' (over 5 MB)' : ''}, so these numbers are from ${E.ago(w.at)}.${tooBig ? ' A filter in Wealthy Exile can make the export smaller.' : ' Press Sync &amp; export to try again.'}</span></div>` : '';
    const failed = w.failAt && (!w.syncAt || w.failAt > w.syncAt) ? `<span class="sub bad">last sync failed ${E.ago(w.failAt)}</span>` : '';
    return `${head('wealthy', 'Wealthy Exile', 'Exported ' + E.ago(w.at), ext, 'title')}${errRow}
      <div class="row between" style="align-items:flex-end"><div><div class="dv lg">${w.divines != null ? art('cur-divine', 'cur lg') + num(w.divines) + ' div' : num(w.chaos, 0) + 'c'}</div><div class="sub">${w.delta != null && w.divPrice ? `<span class="${w.delta >= 0 ? 'ok' : 'bad'}">${signed(w.delta / w.divPrice)}</span> since previous export` : 'first export'}</div></div>
        <div class="sub" style="text-align:right">${num(w.chaos, 0)}c<br>${w.divPrice ? '1 div = ' + num(w.divPrice, 0) + 'c' : ''}</div></div>
      ${spark(w.history)}
      <div class="dlist">${top}</div>
      ${w.error || failed ? `<div class="row push between" style="gap:8px">${syncBtn}${failed}</div>` : ''}`;
  }

  // ---------- poe.ninja: goal, prices, your items over 24 h ----------
  function ninja({ snap }) {
    const g = snap.goal, w = snap.wealth, p = snap.prices || {};
    let goal;
    if (!g) goal = `<div class="sub">No goal set. <button class="lnk" data-act="goal-pick">Pick an item to save for</button></div>`;
    else if (!g.price) goal = `<div class="sub">No price for ${esc(g.name)} yet. <button class="lnk" data-nav="settings:league">Set a fixed price</button></div>`;
    else {
      const have = w && w.divines != null ? w.divines : null, pct = have != null ? Math.max(0, Math.min(100, 100 * have / g.price)) : null;
      const r = snap.divRate && snap.divRate.perHour != null ? snap.divRate.perHour : snap.stats && snap.stats.lastSession && snap.stats.lastSession.divPerHour;
      const left = have != null ? g.price - have : null;
      const eta = left != null && left <= 0 ? 'reached' : r > 0 && left != null ? `~${Math.ceil(left / r)} h at this pace` : '';
      goal = `<div class="row" style="gap:10px"><b class="uni" style="font-size:22px">${pct != null ? Math.floor(pct) + '%' : '–'}</b><div class="bar grow uni"><i style="width:${pct || 0}%"></i></div></div>
        <div class="sub">${have != null ? `${num(have)} of ${num(g.price)} div` : 'Needs a Wealthy Exile export'}${eta ? ' · ' + eta : ''}</div>`;
    }
    const changes = Object.entries(p.changes || {}).slice(0, 3).map(([n, c]) => kv(esc(n), `${c >= 0 ? '▲' : '▼'} ${num(Math.abs(c), 0)}%`, c >= 0 ? 'ok' : 'bad')).join('');
    return `${head('ninja', 'Goal &amp; prices', 'poe.ninja · ' + esc(EX.state.cfg.league.name), `<button class="btn i sm" data-url="https://poe.ninja/" aria-label="Open poe.ninja">${ic.ext()}</button>`, false)}
      <div><div class="row between" style="gap:10px"><span class="lbl">Goal</span><span class="sub" style="flex:none">${g && g.price ? (g.source === 'ninja' ? (g.approx ? '≈ ' : '') + num(g.price) + ' div' : 'fixed ' + num(g.price) + ' div') : ''}</span></div>
        ${g ? `<button class="goal-btn goal-line" data-act="goal-pick" title="${esc(g.name)}${g.label ? ' (' + esc(g.label) + ')' : ''} · click to change" aria-label="Goal: ${esc(g.name)}${g.label ? ', ' + esc(g.label) : ''}. Change goal">${g.source === 'ninja' && g.art ? art(g.art, 'item') : ''}<span class="goal-name">${esc(g.name)}${g.label ? ' <span class="sub">' + esc(g.label) + '</span>' : ''}</span></button>` : ''}${goal}</div>
      <div class="dlist">${p.divineChaos ? `<div><span class="row" style="gap:6px">${art('cur-divine', 'cur')}Divine Orb</span><b class="row" style="gap:4px">${num(p.divineChaos, 0)}${art('cur-chaos', 'cur')}${E.iconOf('cur-chaos') ? '' : 'c'}</b></div>` : '<div><span>Divine Orb</span><b class="dim">no price yet</b></div>'}</div>
      ${changes ? `<div><div class="lbl" style="margin-bottom:2px">Your items, 24 h</div><div class="dlist">${changes}</div></div>` : ''}`;
  }

  // ---------- Session & Maps ----------
  function maps({ snap, st }) {
    if (!snap.paths.clientTxt || !st) return `${head('maps', 'Session &amp; Maps', '', ic.chev())}${noLog('track maps')}`;
    const m = st.inMap ? st.currentMap : null, shown = m || st.lastMap, se = st.session;
    const recent = (st.recentMaps || []).slice(0, 5);
    // Neutral facts only: no "best map" (map speed is mostly layout, mobs and luck).
    const most = snap.mostRun; // over all maps this league
    const dpm = st.totals.mapsDone ? (st.totals.deaths / st.totals.mapsDone) : null;
    const rows = recent.map(r => `<tr><td><span class="row" style="gap:8px">${mapIc(r.zone || r.areaId, r.tier)}<span class="ell">${zoneName(r.zone || r.areaId)}</span></span></td><td>${tier(r.tier)}</td><td class="r">${E.fmt(r.activeMs)}</td><td class="r ${r.deaths ? 'bad' : 'dim'}">${r.deaths || '–'}</td></tr>`).join('');
    return `${head('maps', 'Session &amp; Maps', `${se ? se.mapsDone : 0} maps this session · ${st.totals.mapsDone} this league`, ic.chev())}
      <div class="mapsgrid">
        <div style="display:flex;flex-direction:column;gap:8px;min-width:0">
          <div><div class="lbl">${m ? 'Current map' : 'Last map'}</div>${shown ? `<div class="row between" style="align-items:center;gap:10px"><div class="row" style="min-width:0;gap:0">${mapIc(shown.zone || shown.areaId, shown.tier, true)}<div style="min-width:0"><div style="font-size:17px;font-weight:600;line-height:1.2">${zoneName(shown.zone || shown.areaId)}</div>${tier(shown.tier).replace('class="dt', 'style="margin-left:0" class="dt')}</div></div><div class="bigt${m ? '' : ' dim'}">${E.fmt(shown.activeMs)}</div></div>` : '<div class="sub">No maps yet. Maps start after the campaign.</div>'}</div>
          <div class="dlist">${kv('Average', st.avgMapMs != null ? E.fmt(st.avgMapMs) : '–')}${kv('Most run', most ? `${zoneName(most.zone)} ${tier(most.tier)} ×${most.runs}` : '–')}${kv('Highest tier', st.highestTier ? tier(st.highestTier) : '–')}${kv('Deaths / map', dpm != null ? dpm.toFixed(2) : '–', dpm >= 0.5 ? 'bad' : '')}</div>
        </div>
        ${rows ? `<table class="dtbl"><thead><tr><th>Last maps</th><th>Tier</th><th class="r">Time</th><th class="r">Deaths</th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="empty"><b>No maps yet</b><span>Your last maps show up here.</span></div>'}
      </div>`;
  }

  // ---------- Path of Building ----------
  function pob({ snap }) {
    const b = snap.pobBuild, ok = snap.paths.pobExe;
    const launch = ic.chev();
    const launchBtn = ok ? `<button class="btn sm" data-act="pob">${ic.play()} Launch PoB</button>` : '<button class="btn q sm" data-nav="settings:paths">Set path</button>';
    if (!b) return `${head('pob', 'Path of Building', ok ? 'No builds found' : 'Path not set', launch)}<div class="sub" style="white-space:normal">Looks in Documents\\Path of Building\\Builds. Save a build in PoB and it shows up here.</div><div class="row push" style="gap:8px">${launchBtn}</div>`;
    const s = b.stats || {}, dps = s.CombinedDPS || s.FullDPS || s.TotalDPS;
    const res = [['FireResist', '#ec7f6e'], ['ColdResist', '#8fb4f0'], ['LightningResist', '#e2c56f'], ['ChaosResist', '#c3a5f0']].filter(([k]) => s[k] != null);
    const supp = s.EffectiveSpellSuppressionChance ?? s.SpellSuppressionChance;
    return `${head('pob', 'Path of Building', 'Edited ' + E.ago(b.mtime), launch)}
      <div style="min-width:0"><div style="font-weight:600" class="ell">${esc(b.skill ? b.skill + (b.asc || b.cls ? ' ' + (b.asc || b.cls) : '') : b.name)}</div><div class="sub ell">${esc(b.name)}${b.level ? ' · level ' + b.level : ''}</div></div>
      <div class="dlist">${dps != null ? kv('DPS', big(dps)) : ''}${s.Life != null || s.EnergyShield != null ? kv('Life / ES', `${big(s.Life || 0)} / ${big(s.EnergyShield || 0)}`) : ''}${s.Evasion != null || supp != null ? kv('Evasion · Spell supp', `${big(s.Evasion || 0)} · ${supp != null ? Math.round(supp) + '%' : '–'}`) : ''}${s.Armour ? kv('Armour', big(s.Armour)) : ''}</div>
      ${res.length ? `<div class="res">${res.map(([k, c]) => `<span style="--c:${c}" title="${k.replace('Resist', '')} resistance"><small>${{ FireResist: 'Fire', ColdResist: 'Cold', LightningResist: 'Lightn.', ChaosResist: 'Chaos' }[k]}</small>${Math.round(s[k])}</span>`).join('')}</div>` : '<div class="sub">Open the build in PoB once to save its stats.</div>'}
      <div class="row push" style="gap:8px">${launchBtn}</div>`;
  }

  // ---------- Campaign ----------
  function campaign({ snap, st }) {
    if (!snap.paths.clientTxt || !st) return `${head('campaign', 'Campaign', '', ic.chev())}${noLog('time runs')}`;
    const run = st.campaign, r = run || st.lastFinishedRun, ref = st.referenceRun;
    if (!r) return `${head('campaign', 'Campaign', 'No runs yet', ic.chev())}<div class="sub">Create a new character and the timer starts by itself.</div>`;
    const acts = Array.from({ length: 10 }, (_, i) => i + 1).filter(a => r.splits[a] != null);
    const pick = acts.length <= 4 ? acts : [acts[0], acts[Math.round((acts.length - 1) / 3)], acts[Math.round(2 * (acts.length - 1) / 3)], acts[acts.length - 1]];
    const last = acts.length ? acts[acts.length - 1] : null;
    const total = last && ref && ref.splits[last] != null ? r.splits[last] - ref.splits[last] : null;
    const rows = [...new Set(pick)].map(a => { const d = ref && ref.splits[a] != null ? r.splits[a] - ref.splits[a] : null; return `<div><span>Act ${a}</span><b>${E.fmt(r.splits[a], { hours: true })}${d != null ? ` <span class="${E.diffCls(d)}" style="font-weight:500;margin-left:6px">${E.diff(d)}</span>` : ''}</b></div>`; }).join('');
    return `${head('campaign', 'Campaign', `${esc(r.char || 'New character')} · ${run ? 'Act ' + run.maxAct + ' of 10' : 'done'}`, ic.chev())}
      <div class="row between" style="align-items:flex-end"><div class="bigt">${E.fmt(r.activeMs, { hours: true })}</div>${total != null ? `<span class="${E.diffCls(total)}" style="font-weight:600">${E.diff(total)}</span>` : ''}</div>
      <div class="dlist">${rows || '<div><span>Splits show up after Act 1</span></div>'}</div>
      <div class="sub">${r.deaths != null ? r.deaths + ' deaths · ' : ''}${ref ? 'vs your previous run' : 'first run: this one becomes the reference'}</div>`;
  }

  // ---------- Loot filter ----------
  function filter({ snap }) {
    const ns = snap.neversink || {}, latest = ns.latest, outdated = latest && ns.remind !== false && ns.lastSyncedTag !== latest.tag;
    const notes = latest && latest.notes ? latest.notes.slice(0, 3) : [];
    const pillTxt = ns.remind === false ? '<span class="pill">Reminders off</span>' : !latest ? '' : outdated ? '<span class="pill acc">New version</span>' : '<span class="pill">Up to date</span>';
    return `${head('filter', 'Loot filter', 'NeverSink', pillTxt)}
      <div style="font-weight:600">${!latest ? 'Checks GitHub when online' : ns.remind === false ? `Latest is ${esc(latest.tag)}` : outdated ? `${esc(latest.tag)} is out` : `On ${esc(latest.tag)}`}</div>
      ${!latest || ns.remind === false ? '' : `<div class="sub">${!ns.lastSyncedTag ? 'Not marked as synced yet' : outdated ? `You're on ${esc(ns.lastSyncedTag)}${ns.syncedAt ? ', synced ' + E.ago(ns.syncedAt) : ''}` : ns.syncedAt ? 'Synced ' + E.ago(ns.syncedAt) : 'Synced'}</div>`}
      ${notes.length ? `<ul class="dnotes">${notes.map(n => `<li class="ell">${esc(n)}</li>`).join('')}</ul>` : ''}
      <div class="row push" style="gap:8px"><button class="btn sm" data-url="https://www.filterblade.xyz">Open FilterBlade ${ic.ext()}</button>${outdated ? '<button class="btn sm" data-act="ns-synced">I\'ve synced</button>' : ''}</div>`;
  }

  // ---------- Overlay ----------
  function overlay({ snap, cfg, st }) {
    const on = cfg.overlay.enabled;
    return `${head('overlay', 'Overlay', on ? (snap.gameRunning ? 'Showing in game' : 'Shows when the game runs') : 'Off', E.sw(on, 'Show overlay', 'ov-toggle'))}
      <div class="ov ovmini sz-s${on ? '' : ' off'}" aria-label="Overlay preview">${E.overlayRows(cfg, st, !snap.gameRunning, { divRate: snap.divRate })}</div>
      <div class="row push" style="gap:8px"><button class="btn sm" data-act="ov-unlock">${snap.overlayUnlocked ? ic.lock() + ' Lock' : ic.unlock() + ' Unlock to move'}</button>${E.kbd(cfg.hotkeys.unlockOverlay)}</div>`;
  }

  // ---------- Awakened PoE Trade ----------
  function apt({ snap }) {
    const a = snap.apt, ok = snap.paths.aptExe;
    const right = !ok ? '<span class="pill">Path not set</span>' : pill(a && a.running, 'Running', 'Not running');
    return `${head('apt', 'Price check', 'Awakened PoE Trade', right, false)}
      <div class="dlist">${kv('Check an item', a && a.key ? E.kbd(a.key.replace(/ /g, '')) : '<span class="dim">set in Awakened PoE Trade</span>')}${kv('Started', a && a.running ? (a.launchedAt ? 'by Exilogue, ' + E.ago(a.launchedAt) : 'outside Exilogue') : '–')}</div>
      <div class="row push" style="gap:8px">${ok && !(a && a.running) ? `<button class="btn p sm" data-act="apt">${ic.play()} Launch</button>` : ''}<button class="btn sm" data-url="https://www.pathofexile.com/trade">Trade site ${ic.ext()}</button>${ok ? '' : '<button class="btn q sm" data-nav="settings:paths">Set path</button>'}</div>`;
  }

  // ---------- Today ----------
  function today({ snap }) {
    const t = snap.today;
    const sub = t && t.firstAt ? `since ${E.clock(t.firstAt)} · day starts 05:00` : 'nothing played yet';
    if (!t || !t.firstAt) return `${head('today', 'Today', sub, '', false)}<div class="sub">Your day shows up here once you play. A day starts at 05:00.</div>`;
    return `${head('today', 'Today', sub, '', false)}
      <div class="dlist">${kv('Levels', t.levelTo != null && t.levelTo > t.levelFrom ? `${t.levelFrom} → ${t.levelTo}` : '–')}${kv('Maps', t.maps)}${kv('Breaks', E.hm(t.breakMs))}${kv('New tiers', t.newTiers)}${kv('Most run', t.mostRun ? `${zoneName(t.mostRun.zone)} ${tier(t.mostRun.tier)} ×${t.mostRun.runs}` : '–')}${kv('Deadliest', t.deadliest ? `${zoneName(t.deadliest.zone)} · ${t.deadliest.deaths}` : 'no deaths', t.deadliest ? 'bad' : '')}</div>`;
  }

  // Maps per league day (05:00 to 05:00): how many, average time, deaths. The last 14 days.
  function days({ snap }) {
    const L = snap.league;
    const all = (L && L.perDay) || [];
    const total = all.reduce((a, d) => a + d.maps, 0);
    if (!total) return `${head('days', 'Maps per day', 'this league', '', false)}<div class="sub">Each league day gets a column once you run maps. A day starts at 05:00.</div>`;
    const shown = all.slice(-14), max = Math.max(...shown.map(d => d.maps), 1);
    const ms = v => { if (v == null) return '–'; const s2 = Math.round(v / 1000); return `${Math.floor(s2 / 60)}:${String(s2 % 60).padStart(2, '0')}`; };
    const cols = shown.map(d => {
      const today = d === all[all.length - 1];
      const label = `Day ${d.day}${today ? ' (today)' : ''}: ${d.maps} map${d.maps === 1 ? '' : 's'}${d.maps ? `, average ${ms(d.avgMs)}, ${d.deaths} death${d.deaths === 1 ? '' : 's'}` : ''}`;
      return `<div class="pd-col${today ? ' now' : ''}" role="group" aria-label="${esc(label)}">
        <b aria-hidden="true">${d.maps || ''}</b>
        <span class="pd-bar" aria-hidden="true"><i style="height:${Math.round((d.maps / max) * 100)}%"></i></span>
        <span class="pd-d" aria-hidden="true">${d.date ? `${new Date(d.date).toLocaleDateString('en-GB', { weekday: 'short' })}<br><small>${new Date(d.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</small>` : 'D' + d.day}</span>
        <span class="pd-s" aria-hidden="true">${d.maps ? ms(d.avgMs) : ''}</span>
        <span class="pd-s" aria-hidden="true">${d.maps ? d.deaths + ' †' : ''}</span></div>`;
    }).join('');
    return `${head('days', 'Maps per day', `${total} maps over ${all.length} day${all.length === 1 ? '' : 's'}`, '', false)}
      <div class="pd" style="--n:${shown.length}">${cols}</div>
      <div class="pd-key sub" aria-hidden="true"><span>bar: maps</span><span>average map time</span><span>† deaths</span></div>`;
  }

  // One fun fact about your league, a new one every minute.
  function fun({ snap }) {
    const f = (snap.league && snap.league.fun) || [];
    if (!f.length) return `${head('fun', 'League facts', 'this league', '', false)}<div class="sub">Facts about your league show up once you run maps.</div>`;
    return `${head('fun', 'League facts', 'this league', '', false)}
      <div class="fslist">${f.slice(0, 4).map(x => `<div><b>${esc(x.text)}</b><span class="sub">${esc(x.sub)}</span></div>`).join('')}</div>`;
  }

  EX.TILES = {
    poe: { name: 'Path of Exile', wide: true, render: poe },
    wealthy: { name: 'Wealthy Exile', render: wealthy },
    ninja: { name: 'Goal & prices', render: ninja },
    maps: { name: 'Session & Maps', wide: true, render: maps },
    pob: { name: 'Path of Building', render: pob },
    campaign: { name: 'Campaign', render: campaign },
    filter: { name: 'Loot filter', render: filter },
    overlay: { name: 'Overlay', render: overlay },
    apt: { name: 'Price check', render: apt },
    today: { name: 'Today', render: today },
    days: { name: 'Maps per day', wide: true, render: days },
    fun: { name: 'League facts', render: fun },
  };
  EX.TILE_ORDER = ['poe', 'wealthy', 'ninja', 'maps', 'pob', 'campaign', 'filter', 'overlay', 'apt', 'today', 'days', 'fun'];
  // The user's order (from Edit layout), limited to these tiles, with any new tile added at its default place.
  EX.tileOrder = cfg => {
    const saved = (cfg.layout.order || []).filter(id => EX.TILES[id]);
    for (const id of EX.TILE_ORDER) if (!saved.includes(id)) saved.splice(Math.min(EX.TILE_ORDER.indexOf(id), saved.length), 0, id);
    return saved;
  };
  EX.tileHtml = (id, ctx) => {
    const t = EX.TILES[id];
    // Clicking anywhere on the Wealthy Exile tile syncs & exports (mouse); the ↻ button in its header does the same for keyboards.
    // Not set up yet: the tile leads to the Wealthy Exile page instead (its title and Set up button).
    const w = ctx.snap && ctx.snap.wealth, weReady = !!(w && (w.count || w.scriptVersion || w.scriptEverAt));
    const act = id === 'wealthy' && weReady ? ' data-act="wealth-sync" title="Click to sync &amp; export in Wealthy Exile" style="cursor:pointer"' : '';
    return `<section class="card dn${t.wide ? ' wide' : ''}${id === 'poe' ? ' poe' : ''}" data-card="${id}"${act}>${t.render(ctx)}</section>`;
  };
})();
