'use strict';
(function () {
  const E = EX, ic = EX.icon;
  const TYPES = [
    ['level', 'Level up', 'e-lvl'], ['death', 'Death', 'e-death'], ['act', 'New act', 'e-act'], ['campaign', 'Campaign', 'e-camp'],
    ['firstMap', 'First map', 'e-map'], ['tier', 'Highest tier', 'e-tier'], ['session', 'Session', 'e-sess'],
  ];
  const typeKey = t => (t === 'sessStart' || t === 'sessEnd' || t === 'break' || t === 'mark' ? 'session' : t);
  const cls = t => ({ level: 'e-lvl', death: 'e-death', act: 'e-act', campaign: 'e-camp', firstMap: 'e-map', tier: 'e-tier' }[t] || 'e-sess');

  let oneChar = false; // when the page shows one character, its name isn't repeated on every row
  function line(ev) {
    const pill = v => `<span class="pill">${v}</span>`;
    switch (ev.type) {
      case 'level': return [`Reached level ${ev.level}`, [oneChar ? '' : E.esc(ev.char) + ' · ' + E.esc(ev.cls), ev.zone ? 'in ' + E.esc(ev.zone) : ''].filter(Boolean).join(' · '), pill(ev.level)];
      case 'death': return ['Died', `${E.esc(ev.zone || '?')}${ev.nth ? ` · death ${ev.nth} this session` : ''}${ev.char && !oneChar ? ' · ' + E.esc(ev.char) : ''}`, ev.tier ? pill('T' + ev.tier) : ev.act ? pill('Act ' + ev.act) : '<span></span>'];
      case 'act': return [`Reached Act ${ev.act}`, ev.diff != null ? `Act ${ev.act - 1} split vs previous run <span class="${E.diffCls(ev.diff)}" style="font-weight:600">${E.diff(ev.diff)}</span>` : `${oneChar ? '' : E.esc(ev.char || 'New character') + ' · '}${E.fmt(ev.ms, { hours: true })}`, pill('Act ' + ev.act)];
      case 'campaign': return ['Campaign completed', `${oneChar ? '' : E.esc(ev.char || '?') + ' · '}Acts 1–10 in ${E.fmt(ev.ms, { hours: true })}${ev.diff != null ? ` · <span class="${E.diffCls(ev.diff)}" style="font-weight:600">${E.diff(ev.diff)}</span> vs previous run` : ''}`, `<span class="pill acc">${E.fmt(ev.ms, { hours: true })}</span>`, true];
      case 'firstMap': return ['First map of the league', `Entered the Atlas${ev.tier ? ' · Tier ' + ev.tier : ''}`, ev.tier ? pill('T' + ev.tier) : '<span></span>', true];
      case 'tier': return ['New highest map tier', `Tier ${ev.tier}`, pill('T' + ev.tier)];
      case 'sessStart': return ['Session started', ev.char ? `${E.esc(ev.char)}${ev.level ? ' · level ' + ev.level : ''}` : 'Game opened', '<span></span>'];
      case 'sessEnd': {
        const m = ev.summary;
        if (!m) return ['Session ended', ev.char ? E.esc(ev.char) : 'Game closed', '<span></span>'];
        const lv = m.levelFrom != null && m.levelTo != null && m.levelTo > m.levelFrom ? ` · level ${m.levelFrom} → ${m.levelTo}` : '';
        const wealth = m.wealthDiv != null ? ` · ${m.wealthDiv >= 0 ? '+' : '−'}${Math.abs(m.wealthDiv).toFixed(1)} div` : '';
        return ['Session ended', `${E.fmt(m.playedMs, { hours: true })} played · ${m.maps} maps${m.avgMapMs ? ` (avg ${E.fmt(m.avgMapMs)})` : ''} · ${m.deaths} deaths${lv}${m.breaks ? ` · ${m.breaks} breaks (${E.fmt(m.breakMs, { hours: true })})` : ''}${wealth}`, `<span class="pill">${E.fmt(m.playedMs, { hours: true })}</span>`];
      }
      case 'break': return [ev.kind === 'manual' ? 'Took a break' : 'Break', ev.kind === 'manual' ? 'Marked by you' : `Away for ${E.fmt(ev.ms, { hours: true })}`, ev.ms ? `<span class="pill">${E.fmt(ev.ms, { hours: true })}</span>` : '<span></span>'];
    }
    return [ev.type, '', '<span></span>'];
  }

  EX.eventLine = line;

  function dayLabel(t) {
    const d = new Date(t), today = new Date(); today.setHours(0, 0, 0, 0);
    const day0 = new Date(d); day0.setHours(0, 0, 0, 0);
    const diff = Math.round((today - day0) / 86400000);
    const long = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    return diff === 0 ? ['Today', long] : diff === 1 ? ['Yesterday', long] : [long, ''];
  }

  // Which character the page shows by default: the one playing now.
  function pick(st, ui) {
    const chars = st ? Object.keys(st.chars || {}) : [];
    const current = st && st.character && chars.includes(st.character.name) ? st.character.name : chars[0] || null;
    const who = ui.eventsChar === undefined ? (current || 'all') : ui.eventsChar;
    return { chars, current, who };
  }

  EX.pages = EX.pages || {};
  EX.pages.events = {
    live: false, // no timers; redrawn when the event list itself changes (app.js loadEvents)
    data: false,
    // Filter for the database query (main.js events:get).
    query(st, ui) {
      const filter = ui.eventsFilter || 'all';
      const types = filter === 'all' ? null : filter === 'session' ? ['sessStart', 'sessEnd', 'break'] : [filter];
      return { char: pick(st, ui).who, types, limit: 200 };
    },
    render({ cfg, ui, st }) {
      const res = ui.events || { rows: [], total: 0, any: 0 };
      const { chars, current, who } = pick(st, ui);
      const filter = ui.eventsFilter || 'all';
      const shown = res.rows; // newest first, already filtered and limited
      oneChar = who !== 'all';
      const chips = `<button class="fchip" aria-pressed="${filter === 'all'}" data-evfilter="all">All</button>` +
        TYPES.map(([k, l, c]) => `<button class="fchip" aria-pressed="${filter === k}" data-evfilter="${k}"><span class="d ${c}" style="background:var(--${c})" aria-hidden="true"></span>${l}</button>`).join('');
      const sel = `<label class="row" style="gap:8px"><span class="lbl">Character</span><select class="select" data-evchar>
          ${chars.map(c => `<option value="${E.esc(c)}" ${who === c ? 'selected' : ''}>${E.esc(c)}${c === current ? ' (current)' : ''}</option>`).join('')}
          <option value="all" ${who === 'all' ? 'selected' : ''}>All history</option></select></label>`;
      let body = '', lastDay = null;
      if (!shown.length) {
        body = `<div class="box" style="margin-top:24px"><div class="empty"><b>${res.any ? 'Nothing matches this filter' : 'No events yet'}</b><span>${res.any ? 'Try another type or character.' : 'Level-ups, deaths, acts, maps and sessions show up here as you play.'}</span></div></div>`;
      } else {
        for (const ev of shown) {
          const [d1, d2] = dayLabel(ev.t);
          if (d1 !== lastDay) {
            if (lastDay) body += '</div>';
            body += `<div class="day"><h2>${d1}</h2><span class="sub">${d2}</span></div><div class="feed">`;
            lastDay = d1;
          }
          const [tt, dd, right, hl] = line(ev);
          body += `<div class="ev${hl ? ' hl' : ''}"><time datetime="${new Date(ev.t).toISOString()}">${E.clock(ev.t)}</time>
            <span class="ei ${cls(ev.type)}">${(ic['e_' + ev.type] || ic.e_sessStart)()}</span>
            <div><div class="tt">${tt}</div><div class="dd">${dd}</div></div>${right}</div>`;
        }
        body += '</div>';
        if (res.total > shown.length) body += `<button class="more" data-act="events-more">Show earlier events</button>`;
      }
      return `<div style="max-width:920px">
        <div class="head" style="margin-bottom:18px"><div><div class="lbl" style="margin-bottom:6px">${E.esc(cfg.league.name)} · read from the game log</div><h1 class="h">Events</h1></div>${chars.length ? sel : ''}</div>
        <div class="row" style="gap:10px;flex-wrap:wrap;align-items:center"><div class="filters" role="group" aria-label="Filter by type">${chips}</div></div>${body}</div>`;
    },
  };
})();
