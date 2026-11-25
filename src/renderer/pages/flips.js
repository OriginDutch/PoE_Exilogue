'use strict';
// Easyflips: "buy → convert in-game → sell" flips from poe.ninja prices. A card per flip; clicking one opens its steps.
// Prices are refreshed every minute while this page is open (poe.ninja's lists are at most 5 minutes old).
(function () {
  const E = EX, ic = EX.icon;
  EX.pages = EX.pages || {};
  const st = () => EX.state, ui = () => EX.ui;
  const SPREAD = 0.03;
  const CATS = [['all', 'All'], ['essence', 'Essences'], ['card', 'Div cards'], ['splinter', 'Splinters & shards'], ['unique', 'Uniques'], ['oil', 'Oils'], ['own', 'From what you own']];
  const cats = () => CATS.filter(([k]) => k !== 'own' || cfgE().countOwned);
  const KIND = { essence: 'Essence', card: 'Div card', splinter: 'Splinter', shard: 'Shard', unique: 'Unique', oil: 'Oil' };

  const slug = n => ('ef-' + String(n).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')).slice(0, 60);
  const iconSrc = name => (st().icons || {})[slug(name)] || null;
  const curIc = id => { const s = E.iconOf(id); return s ? `<img class="ef-cur" src="${E.esc(s)}" alt="">` : ''; };
  const fmt = v => { const a = Math.abs(v); return a >= 1000 ? Math.round(v).toLocaleString('en-US') : a >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10); };
  const divOf = () => (data() && data().divine) || null;
  // Chaos below 1 divine-ish amounts; expensive flips (input set over 5 div) in divines.
  const inDiv = f => { const d = divOf(); return d && f.pay > 5 * d; };
  const C = v => `${fmt(v)}${curIc('cur-chaos') || '<span class="ef-u">c</span>'}<span class="vh"> chaos</span>`;
  const D = v => { const d = divOf(); return `${(Math.round((v / d) * 100) / 100).toLocaleString('en-US')}${curIc('cur-divine') || '<span class="ef-u"> div</span>'}<span class="vh"> divine</span>`; };
  const money = (f, v) => (inDiv(f) ? D(v) : C(v));
  const signed = (f, v) => `${v < 0 ? '−' : '+'}${money(f, Math.abs(v))}`;
  const pct = v => `${Math.round(v)}%`;

  const data = () => ui().ef && ui().ef.data;
  const cfgE = () => st().cfg.easyflips;
  const label = f => (f.out.label ? `${f.out.name} (${f.out.label})` : f.out.name);

  function pic(name, size, n, alt) {
    const src = iconSrc(name);
    return `<span class="ef-ic" style="--s:${size}px" ${alt ? `role="img" aria-label="${E.esc(alt)}"` : 'aria-hidden="true"'}>${src ? `<img src="${E.esc(src)}" alt="">` : '<span class="ef-noimg"></span>'}${n > 1 ? `<b aria-hidden="true">${n.toLocaleString('en-US')}</b>` : ''}</span>`;
  }
  const recipe = (f, size) => `${pic(f.in[0].name, size, f.in[0].n, `${f.in[0].n} × ${f.in[0].name}`)}${f.in.slice(1).map(x => `<span class="ef-plus" aria-hidden="true">+</span>${pic(x.name, size * 0.7, x.n, `${x.n} × ${x.name}`)}`).join('')}<span class="ef-arrow" aria-hidden="true">→</span>${pic(f.out.name, size, f.out.n, `${f.out.n} × ${label(f)}`)}`;

  function flags(f) {
    const out = [];
    if (f.verify) out.push('<span class="ef-flag warn">⚠ Verify: margin above 50%</span>');
    if (f.divUnsure) out.push('<span class="ef-flag warn">⚠ Divine price unsure</span>');
    if (f.rerolls) out.push('<span class="ef-flag roll">Result has new rolls</span>');
    if (f.own) out.push(`<span class="ef-flag own">You own ${f.own}/${f.in[0].n}</span>`);
    if (f.highStakes) out.push('<span class="ef-flag roll">High stakes</span>');
    if (realFlag(f)) out.push(realFlag(f));
    return out.join('');
  }
  const WHY = { margin: 'margin below your limit', thin: 'thin volume', maxDiv: 'over your divine limit', divine: 'divine price unsure', loss: 'no profit', unconfirmed: 'not confirmed by real trades' };
  // GGG's real trades of the last hours: confirmed flips get a badge; how many flips an hour fit (10% of what trades).
  const realFlag = f => (f.real && f.real.reason === 'quiet' ? '<span class="ef-flag warn">No real trades lately</span>' : f.real && f.real.status === 'confirmed' ? `<span class="ef-flag ok">✓ Real trades: ${pct(f.real.margin)}</span>` : f.real && f.real.status === 'unconfirmed' ? `<span class="ef-flag warn">Real trades: ${pct(f.real.margin)}</span>` : '');
  const capText = f => (f.real && f.real.perHour != null ? (f.real.perHour < 1 ? 'under 1 flip an hour fits' : `≈ ${f.real.perHour.toLocaleString('en-US')} flips an hour fit`) : '');
  const volText = f => (f.inVol == null ? 'no volume data' : `${f.in[0].name} trades ≈ ${fmt(f.inVol)}c an hour`);
  const sub = f => `${f.in[0].n} → ${f.out.n > 1 ? f.out.n + ' × ' : ''}${label(f)}${f.kind === 'essence' && f.upgrades === 2 ? ' · 2 upgrades' : ''}`;
  // Same text with an essence's tier word in capitals and colour (titles on cards and in the popup).
  const tierHtml = text => String(text).split(/(\b(?:Whispering|Muttering|Weeping|Wailing|Screaming|Shrieking|Deafening)\b)/).map((p, i) => (i % 2 ? `<span class="ef-tier">${p.toUpperCase()}</span>` : E.esc(p))).join('');

  // GGG's exchange, last 12 hours: the same item's price in the chaos market and in the divine market (in chaos).
  // side 'buy': lower is better; 'sell': higher is better. The better market is bold.
  const cxPrice = v => (v == null ? '–' : `${fmt(v)}c`);
  // buy: how much cheaper the better market is; sell: how much more it pays.
  const gap = (c, side) => { const lo = Math.min(c.chaos, c.divine), hi = Math.max(c.chaos, c.divine); return Math.round(100 * (side === 'buy' ? 1 - lo / hi : hi / lo - 1)); };
  const advise = (c, side) => c && c.pct != null && !c.thin && gap(c, side) >= 1;
  function cxPair(c, side) {
    if (!c || (c.chaos == null && c.divine == null)) return '<span class="sub">no exchange data</span>';
    const best = advise(c, side) ? (side === 'buy' ? c.buy : c.sell) : null;
    const one = (k, l) => `<span class="${best === k ? 'ef-mk on' : 'ef-mk'}">${l} ${cxPrice(c[k])}</span>`;
    const diff = best ? ` <span class="sub">(${side === 'buy' ? '−' : '+'}${gap(c, side)}%)</span>` : c.thin && c.divine != null ? ' <span class="sub">(few divine trades)</span>' : '';
    return `${one('chaos', 'chaos')}${one('divine', 'divine')}${diff}`;
  }
  // A row only where the exchange has the item (uniques aren't on it; Divine Orbs are the money itself).
  const has = c => c && (c.chaos != null || c.divine != null);
  const cxRow = f => {
    if (!(data() && data().cx)) return '';
    const rows = [has(f.cxIn) ? `<div><span class="ef-cxl">Buy</span>${cxPair(f.cxIn, 'buy')}</div>` : '',
      has(f.cxOut) && f.out.name !== 'Divine Orb' && f.out.name !== 'Chaos Orb' ? `<div><span class="ef-cxl">Sell</span>${cxPair(f.cxOut, 'sell')}</div>` : ''].join('');
    return rows ? `<div class="ef-cx">${rows}</div>` : '';
  };
  const hrs = () => (data() && data().cx ? data().cx.hours : 12);

  function card(f, hidden) {
    const reasons = f.reasons.map(r => WHY[r]).filter(Boolean);
    return `<div class="ef-card${f.below ? ' dim' : ''}" role="button" tabindex="0" data-ef="open" data-id="${f.id}">
      <div class="ef-rec">${recipe(f, 46)}<div class="ef-nm"><span class="ef-kind">${KIND[f.kind] || ''}</span><b>${tierHtml(f.in[0].name)}</b><span class="sub">${tierHtml(sub(f))}</span></div></div>
      ${flags(f) ? `<div class="ef-flags">${flags(f)}</div>` : ''}
      <div class="ef-nums"><div><span>You pay</span><b>${money(f, f.payNow)}</b>${f.own ? `<small>for ${f.in[0].n - f.own} more</small>` : ''}</div><div><span>You get</span><b>${money(f, f.get)}</b></div>
        <div><span>Profit</span><b class="${f.profit > 0 ? 'good' : 'bad'}">${signed(f, f.profit)}</b><small>${pct(f.margin)}</small></div></div>
      ${cxRow(f)}
      <div class="sub ef-foot">${E.esc([volText(f), capText(f)].filter(Boolean).join(' · '))}${f.below && reasons.length ? ' · ' + reasons.join(', ') : ''}${hidden ? ' · hidden' : ''}</div></div>`;
  }

  function list(d) {
    const e = cfgE(), u = ui().ef, hidden = new Set(e.hidden);
    const cat = u.cat === 'own' && !e.countOwned ? 'all' : (u.cat || 'all');
    return d.flips.filter(f => {
      if (u.showHidden ? !hidden.has(f.id) : hidden.has(f.id)) return false;
      if (!e.highStakes && f.highStakes) return false;
      if (!e.showBelow && f.below) return false;
      if (cat === 'own') return f.own > 0;
      if (cat === 'splinter') return f.kind === 'splinter' || f.kind === 'shard';
      return cat === 'all' || f.kind === cat;
    }).sort(sortOf('recipes')[2]);
  }

  // Sorting per tab: [key, label, compare]. Flips within your limits always come before the ones below them.
  const byName = (a, b) => String(a.name || (a.in && a.in[0].name)).localeCompare(String(b.name || (b.in && b.in[0].name)));
  const lim = f => (a, b) => (a.below - b.below) || f(a, b);
  const SORTS = {
    recipes: [['margin', 'Margin', lim((a, b) => (a.verify - b.verify) || b.margin - a.margin)], ['profit', 'Profit per flip', lim((a, b) => b.profit - a.profit)],
      ['real', 'Real-trade margin', lim((a, b) => ((b.real && b.real.margin) ?? -1e9) - ((a.real && a.real.margin) ?? -1e9))], ['cost', 'Cost, low first', lim((a, b) => a.pay - b.pay)], ['name', 'Name', lim(byName)]],
    orders: [['margin', 'Margin', (a, b) => b.margin - a.margin], ['steady', 'Steadiest price', (a, b) => (a.drift ?? 1e9) - (b.drift ?? 1e9)],
      ['volume', 'Most traded', (a, b) => b.chaosPerHour - a.chaosPerHour], ['price', 'Price, low first', (a, b) => a.typical - b.typical], ['name', 'Name', byName]],
    // Like recipes: gaps flagged "verify" (over 50%) after the rest.
    exchange: [['net', 'Net margin', (a, b) => ((a.gap > 50) - (b.gap > 50)) || b.net - a.net], ['volume', 'Most traded (divines)', (a, b) => b.divPerHour - a.divPerHour], ['name', 'Name', byName]],
  };
  const sortOf = tab => { const u = ui().ef; const k = (u.sort && u.sort[tab]) || SORTS[tab][0][0]; return SORTS[tab].find(s => s[0] === k) || SORTS[tab][0]; };
  const sortSel = tab => `<label class="ef-lim"><span>Sort</span><select class="input" data-efsort="${tab}" aria-label="Sort">${SORTS[tab].map(([k, l]) => `<option value="${k}" ${sortOf(tab)[0] === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;

  // ---------- Order flips and exchange flips (GGG's hourly exchange history) ----------
  const copyBtn = name => `<button class="btn sm" data-efc="${E.esc(name)}">Copy name</button>`;
  function orderCard(o) {
    return `<div class="ef-card ef-plain"><div class="ef-rec">${pic(o.name, 46, 1, o.name)}<div class="ef-nm"><span class="ef-kind">Order flip</span><b>${tierHtml(o.name)}</b><span class="sub">typical ${fmt(o.typical)}c · traded ${fmt(o.lo)}–${fmt(o.hi)}c within an hour</span></div></div>
      <div class="ef-nums"><div><span>Buy order</span><b>${C(o.buy)}</b><small>each</small></div><div><span>Sell order</span><b>${C(o.sell)}</b><small>each</small></div><div><span>Margin</span><b class="good">+${pct(o.margin)}</b><small>if both fill</small></div></div>
      <div class="sub">${E.esc(`Trades reached your buy price in ${o.buyHours} of ${o.hours} hours, your sell price in ${o.sellHours} of ${o.hours}.`)}</div>
      <div class="sub ef-foot">${E.esc(`≈ ${Math.round(o.perHour).toLocaleString('en-US')} traded an hour · price moves ≈ ${o.drift == null ? '?' : Math.round(o.drift * 10) / 10}% hour to hour · ${o.hours} h of data`)}</div>
      <div class="row" style="gap:6px">${copyBtn(o.name)}</div></div>`;
  }
  function exchangeCard(x) {
    const where = k => (k === 'chaos' ? 'chaos market' : 'divine market');
    const batch = x.perDivine && x.perDivine >= 1 ? ` · 1 divine ≈ ${x.perDivine >= 10 ? Math.round(x.perDivine).toLocaleString('en-US') : Math.round(x.perDivine * 10) / 10} items` : '';
    return `<div class="ef-card ef-plain"><div class="ef-rec">${pic(x.name, 46, 1, x.name)}<div class="ef-nm"><span class="ef-kind">Exchange flip</span><b>${tierHtml(x.name)}</b><span class="sub">buy in the ${where(x.buy)}, sell in the ${where(x.sell)}</span></div></div>
      ${x.gap > 50 ? '<div class="ef-flags"><span class="ef-flag warn">⚠ Verify: gap above 50%</span></div>' : ''}
      <div class="ef-nums"><div><span>Buy (${x.buy})</span><b>${C(x.buy === 'chaos' ? x.chaos : x.divine)}</b><small>each</small></div><div><span>Sell (${x.sell})</span><b>${C(x.sell === 'chaos' ? x.chaos : x.divine)}</b><small>each</small></div><div><span>Net</span><b class="good">+${pct(x.net)}</b><small>gap ${pct(x.gap)}</small></div></div>
      <div class="sub ef-foot">${E.esc(`≈ ${Math.round(x.divPerHour * 10) / 10} divines traded an hour in the divine market${batch} · ${x.hours} h of data`)}</div>
      <div class="row" style="gap:6px">${copyBtn(x.name)}</div></div>`;
  }
  function otherTab(d, tab) {
    const all = tab === 'orders' ? d.orders || [] : d.exchange || [];
    const l = [...all].sort(sortOf(tab)[2]);
    const intro = tab === 'orders'
      ? `Place a buy order and a sell order on the in-game currency exchange. Prices: halfway between the typical low and the typical price, and halfway between the typical price and the typical high, over GGG's last ${hrs()} hours. Only items of 10c or more with at least 10,000c traded an hour. Your orders can sit unfilled; you hold the stock in between.`
      : `The same item, priced differently in the chaos market and the divine market over GGG's last ${hrs()} hours: buy where it is cheaper, sell where it is dearer. "Net" counts 3% worse prices on the buy, the sell and turning the divines back into chaos. Only flips with at least ${cfgE().exchangeMin}% net, where both markets really trade and someone holds the currency you sell into. Divines come in whole numbers: sell in batches.`;
    const bar = `<div class="ef-bar">${tab === 'exchange' ? numField('exchangeMin', 'Min net', '%', cfgE().exchangeMin) : ''}<span class="spacer"></span>${sortSel(tab)}</div>`;
    const grid = !d.cx ? `<section class="box"><div class="empty"><b>No exchange history yet</b><span>Exilogue downloads GGG's hourly exchange history in the background; this fills in within a few minutes.</span></div></section>`
      : l.length ? `<div class="ef-grid">${l.map(tab === 'orders' ? orderCard : exchangeCard).join('')}</div>`
      : `<section class="box"><div class="empty"><b>Nothing here right now</b><span>${tab === 'orders' && (d.cx.hours || 0) < 8 ? `Only ${d.cx.hours} hours of exchange history so far: Exilogue is still downloading the rest.` : 'Try again after the next hour comes in.'}</span></div></section>`;
    return bar + grid + `<div class="note">${ic.info()}<span>${E.esc(intro)} These are averages of past trades, not the live order book: check the exchange before you place anything.</span></div>`;
  }

  function numField(key, labelText, unit, val) {
    return `<label class="ef-lim"><span>${labelText}</span><input class="input" type="number" min="0" step="1" inputmode="numeric" value="${val}" data-eflim="${key}" aria-label="${labelText}">${unit ? `<span class="sub">${unit}</span>` : ''}</label>`;
  }

  function age(t) { return t ? E.ago(t) : 'not yet'; }

  EX.pages.flips = {
    live: false,
    render() {
      const u = ui().ef = ui().ef || { cat: 'all' };
      const d = data(), e = cfgE();
      const head = `<div class="ph">${(m => (m ? `<span class="logo lg img" aria-hidden="true"><img src="${E.esc(m)}" alt=""></span>` : '<span class="logo lg" aria-hidden="true">EF</span>'))(E.iconOf('flips'))}<div class="grow"><h1 class="h">Easyflips</h1>
        <div class="sub" style="margin-top:4px">${d ? `poe.ninja data ${d.changedAt ? 'changed ' + age(d.changedAt) : 'unchanged since Exilogue started'} · checked ${age(d.checkedAt)} · ` : ''}buy, convert in game, sell. Profit counts 3% worse buy and sell prices, no gold fees. Check the real price before you buy.</div></div>
        <button class="btn" data-ef="refresh" ${u.loading ? 'disabled' : ''}>${ic.refresh()} ${u.loading ? 'Loading…' : 'Refresh'}</button></div>`;
      if (!d) return head + `<section class="box"><div class="empty"><b>${u.error ? 'No prices' : 'Loading prices from poe.ninja…'}</b>${u.error ? `<span>${E.esc(u.error)}</span>` : ''}</div></section>`;
      const tab = u.tab || 'recipes';
      const tabs = `<div class="tabs ef-tabs" role="tablist">${[['recipes', 'Recipes', d.flips.filter(f => !f.below).length], ['orders', 'Order flips', (d.orders || []).length], ['exchange', 'Exchange flips', (d.exchange || []).length]]
        .map(([k, l, n]) => `<button role="tab" class="tab${tab === k ? ' on' : ''}" aria-selected="${tab === k}" data-ef="tab" data-tab="${k}">${l} <span class="sub">${n}</span></button>`).join('')}</div>`;
      if (tab !== 'recipes') return head + tabs + `<div role="tabpanel" aria-label="${E.esc({ orders: 'Order flips', exchange: 'Exchange flips' }[tab])}">${otherTab(d, tab)}</div>`;
      const shown = list(d);
      const nHidden = d.flips.filter(f => e.hidden.includes(f.id)).length;
      const filters = `<div class="ef-bar" role="group" aria-label="Show">${cats().map(([k, l]) => `<button class="ef-chip${(u.cat || 'all') === k ? ' on' : ''}" data-ef="cat" data-cat="${k}" aria-pressed="${(u.cat || 'all') === k}">${E.esc(l)}</button>`).join('')}</div>
        <div class="ef-bar">${numField('minMargin', 'Min margin', '%', e.minMargin)}${numField('maxDiv', 'Max', 'divine', e.maxDiv)}
          <span class="spacer"></span>
          <button class="ef-chip${e.showBelow ? ' on' : ''}" data-ef="tog" data-k="showBelow" aria-pressed="${e.showBelow}">Show below limits</button>
          <button class="ef-chip${e.highStakes ? ' on' : ''}" data-ef="tog" data-k="highStakes" aria-pressed="${e.highStakes}">High stakes</button>
          <button class="ef-chip${e.countOwned ? ' on' : ''}" data-ef="tog" data-k="countOwned" aria-pressed="${e.countOwned}" title="Use your newest Wealthy Exile export: flips you can partly do from your stash">Count what I own</button>
          <button class="ef-chip${u.showHidden ? ' on' : ''}" data-ef="hidden" aria-pressed="${!!u.showHidden}" ${nHidden || u.showHidden ? '' : 'disabled'}>Hidden flips (${nHidden})</button>${sortSel('recipes')}</div>`;
      const grid = shown.length ? `<div class="ef-grid">${shown.map(f => card(f, u.showHidden)).join('')}</div>`
        : `<section class="box"><div class="empty"><b>${u.showHidden ? 'No hidden flips' : 'No flips here right now'}</b><span>${u.showHidden ? '' : 'Prices move all the time: try again later, or loosen your limits.'}</span></div></section>`;
      return head + tabs + filters + grid + `<div class="note">${ic.info()}<span>Flips that real exchange trades of the last 3 hours don't confirm are greyed out ("not confirmed by real trades"); “flips an hour fit” = 10% of what trades per hour on the thinner side. Buy/Sell rows: the same item in the exchange's chaos market and divine market (typical hourly price over the last ${hrs()} hours, GGG's history; the better one is bold, not when the divine side barely traded). Volume is poe.ninja's chaos traded per hour; under 1,000c an hour counts as thin. Uniques: bench six-link (needs item level 50+, not corrupted) and Breach blessings (sell the unique and the blessing to a vendor).${d.partial ? ' Some poe.ninja lists could not be loaded.' : ''}</span></div>`;
    },
    mount(el) {
      load(false);
      const tick = setInterval(() => { if (!el.isConnected) { clearInterval(tick); return; } load(false); }, 60e3);
      el.addEventListener('click', onClick);
      el.addEventListener('keydown', ev => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches('[data-ef="open"]')) { ev.preventDefault(); openFlip(ev.target.dataset.id); } });
      el.addEventListener('change', ev => {
        const st2 = ev.target.dataset && ev.target.dataset.efsort;
        if (st2) { const u = ui().ef; u.sort = { ...(u.sort || {}), [st2]: ev.target.value }; return redraw(); }
        const k = ev.target.dataset && ev.target.dataset.eflim;
        if (k) EX.save({ easyflips: { [k]: Number(ev.target.value) } }).then(() => load(true));
      });
    },
  };

  let loadSeq = 0;
  async function load(force) {
    const u = ui().ef = ui().ef || { cat: 'all' };
    const my = ++loadSeq;
    u.loading = true; redraw();
    const r = await window.ej.flips(force).catch(() => null);
    if (my !== loadSeq) return;
    u.loading = false;
    if (r && r.data) { u.data = r.data; u.error = null; } else u.error = (r && r.error) || 'poe.ninja could not be reached.';
    redraw();
    if (dlg) dlg.draw();
  }
  function redraw() {
    const v = document.querySelector('.view');
    if (v && ui().view === 'page:flips') E.morph(v, EX.pages.flips.render());
  }

  function onClick(ev) {
    const cp = ev.target.closest('[data-efc]');
    if (cp) { window.ej.copy(cp.dataset.efc); return E.toast(`Copied: ${cp.dataset.efc}`); }
    const t = ev.target.closest('[data-ef]'); if (!t) return;
    const a = t.dataset.ef, u = ui().ef;
    if (a === 'open') return openFlip(t.dataset.id);
    if (a === 'refresh') return load(true);
    if (a === 'cat') { u.cat = t.dataset.cat; return redraw(); }
    if (a === 'tab') { u.tab = t.dataset.tab; return redraw(); }
    if (a === 'hidden') { u.showHidden = !u.showHidden; return redraw(); }
    if (a === 'tog') return EX.save({ easyflips: { [t.dataset.k]: !cfgE()[t.dataset.k] } }).then(() => { if (t.dataset.k === 'countOwned') { if (u.cat === 'own') u.cat = 'all'; load(true); } else redraw(); });
  }

  // ---------- the steps popup ----------
  let dlg = null;
  // Steps per item, not per amount: you decide how many. Names are escaped here; the tier word of an essence (the
  // only part that tells Screaming, Shrieking and Deafening apart) is in capitals and coloured, so buy and sell can't mix up.
  const TIER = /^(Whispering|Muttering|Weeping|Wailing|Screaming|Shrieking|Deafening)( .*)$/;
  const nm = name => { const m = TIER.exec(name); return m ? `<b class="ef-tier">${m[1].toUpperCase()}</b>${E.esc(m[2])}` : `<b>${E.esc(name)}</b>`; };
  function steps(f) {
    const m = f.in[0];
    const btns = (name, unique) => `<button class="btn sm" data-efd="copy" data-name="${E.esc(name)}">Copy name</button><button class="btn sm q" data-efd="trade" data-name="${E.esc(name)}" data-unique="${unique ? 1 : 0}">Trade site ${ic.ext()}</button>`;
    const copy = name => `<button class="btn sm" data-efd="copy" data-name="${E.esc(name)}">Copy name</button>`;
    // Which exchange market to use, from GGG's last hours.
    const mkt = (c, side) => {
      if (!advise(c, side)) return '';
      const best = side === 'buy' ? c.buy : c.sell, by = gap(c, side);
      const batch = c.perDivine && c.perDivine >= 1 ? ` (1 divine ≈ ${c.perDivine >= 10 ? Math.round(c.perDivine) : Math.round(c.perDivine * 10) / 10} items)` : '';
      return side === 'buy' ? ` Over the last ${hrs()} h it was ${by}% cheaper to buy with ${best === 'chaos' ? 'chaos' : 'divines' + batch}.`
        : ` Over the last ${hrs()} h it paid ${by}% more to sell for ${best === 'chaos' ? 'chaos' : 'divines' + batch}.`;
    };
    // Break-even sell price per item: at the expected buy price (poe.ninja + 3%) and at step 1's "pay at most".
    const other = f.pay - m.unit * m.n * (1 + SPREAD);
    const paidExp = m.unit * (1 + SPREAD);
    const sellMin = f.pay / f.out.n, sellMinMax = (f.payAtMost * m.n + other) / f.out.n;
    const rows = [];
    rows.push([m.name, 1, `Buy ${nm(m.name)}${f.kind === 'unique' && f.sixLink ? ' (unlinked)' : ''}`,
      E.esc((f.own ? `You already own ${f.own}. ` : '') + `Pay at most ${fmt(f.payAtMost)}c each.` + mkt(f.cxIn, 'buy')), btns(m.name, f.kind === 'unique')]);
    for (const x of f.in.slice(1)) rows.push(x.cost
      ? [x.name, 1, `Have ${x.n.toLocaleString('en-US')} ${nm(x.name)} per item`, 'Counted in what you pay.', '']
      : [x.name, 1, `Buy ${nm(x.name)}`, `One per ${E.esc(m.name)}. Counted in what you pay.`, btns(x.name, false)]);
    let conv;
    if (f.kind === 'essence') conv = [`Upgrade to ${nm(f.out.name)}`, E.esc(`In your essence tab: ${m.n} → 1 (press Upgrade${f.upgrades === 2 ? ' twice' : ''}).`)];
    else if (f.kind === 'card') conv = [`Turn in for ${nm(f.out.name)}`, E.esc(`A full set of ${m.n} at Lilly Roth in your hideout, or Tasuni in Highgate. You get ${f.out.n}.`)];
    else if (f.kind === 'oil') conv = [`Combine into ${nm(f.out.name)}`, E.esc(`Sell ${m.n} to any vendor: ${m.n} → 1.`)];
    else if (f.kind === 'splinter' || f.kind === 'shard') conv = [`Combine into ${nm(f.out.name)}`, E.esc(`A full stack of ${m.n} in your inventory turns into 1. If it doesn't, split one off and drop it back. Not in a stash tab.`)];
    else if (f.sixLink) conv = [`Six-link at the crafting bench`, E.esc(`Needs item level 50 or more, not corrupted, and the six-link recipe unlocked. Fewer than 6 sockets: the Jeweller's make them first.`)];
    else if (f.vendor) conv = [`Sell both to a vendor for ${nm(f.out.name)}`, E.esc(`${m.name} together with ${f.in[1] ? f.in[1].name : 'the blessing'}. The result has new rolls.`)];
    else conv = ['Convert', ''];
    rows.push([f.out.name, 1, conv[0], conv[1], '']);
    if (f.out.name === 'Divine Orb' || f.out.name === 'Chaos Orb') rows.push([f.out.name, 1, `Keep the ${nm(f.out.name)}s`, 'They are the money: nothing to sell.', '']);
    else rows.push([f.out.name, 1, `Sell ${nm(f.out.name)}${f.out.label ? ` (${E.esc(f.out.label)})` : ''}`,
      `Break-even: <b>${fmt(sellMin)}c each</b> if you paid about ${fmt(paidExp)}c, <b>${fmt(sellMinMax)}c each</b> if you paid the most (${fmt(f.payAtMost)}c). Sell below that and you lose money.${E.esc(mkt(f.cxOut, 'sell'))}`, f.kind === 'unique' ? btns(f.out.name, true) : copy(f.out.name)]);
    return rows.map((x, i) => `<li class="ef-st" data-step="${i}"><span class="ef-no" aria-hidden="true">${i + 1}</span><div><div class="row" style="gap:10px">${pic(x[0], 30, 1)}<span class="ef-sth">${x[2]}</span></div><p class="sub">${x[3]}</p>${x[4] ? `<div class="row" style="gap:6px;flex-wrap:wrap">${x[4]}</div>` : ''}</div></li>`).join('');
  }
  function bar(labelText, share) {
    if (share == null) return `<div class="ef-share"><span>${labelText}</span><span class="sub">no volume data</span></div>`;
    const p = share * 100, lvl = p < 2 ? 'g' : p <= 10 ? 'o' : 'r', word = p < 2 ? 'small' : p <= 10 ? 'noticeable' : 'moves the price';
    const shownP = p > 0 && p < 0.1 ? 'under 0.1' : String(Math.round(p * 10) / 10);
    return `<div class="ef-share"><span>${labelText}</span><span class="ef-track" aria-hidden="true"><span class="ef-fill ${lvl}" style="width:${Math.min(100, p * 5)}%"></span></span><span>${shownP}% of a day · ${word}</span></div>`;
  }
  function popupHtml(f, n) {
    const m = f.in[0], sc = window.EasyflipsCore.scale(f, n, SPREAD);
    const { buyN, payNow, profit } = sc;
    const div = divOf();
    const hidden = cfgE().hidden.includes(f.id);
    const route = f.route ? `<p class="sub">Cheapest route: ${f.route.best.n} × ${E.esc(f.route.best.name)} (${fmt(f.route.best.pay)}c). Other: ${f.route.alt.n} × ${E.esc(f.route.alt.name)} (${fmt(f.route.alt.pay)}c).</p>` : '';
    return `<div class="dialog ef-dlg" role="dialog" aria-modal="true" aria-labelledby="ef-t">
      <div class="ef-dh">${recipe(f, 52)}<div class="grow"><span class="ef-kind">${KIND[f.kind] || ''}</span><h2 id="ef-t">${tierHtml(m.name)}</h2><span class="sub">${tierHtml(sub(f))}</span></div>
        <button class="btn i" data-efd="close" aria-label="Close">×</button></div>
      ${route}${flags(f) ? `<div class="ef-flags">${flags(f)}</div>` : ''}
      <div class="ef-qty"><span>How many times</span><button class="btn i sm" data-efd="n" data-d="-1" aria-label="Fewer" ${n <= 1 ? 'disabled' : ''}>−</button><b aria-live="polite">${n}×</b><button class="btn i sm" data-efd="n" data-d="1" aria-label="More">+</button><span class="spacer"></span><span class="sub">${E.esc(volText(f))}</span></div>
      <div class="ef-nums big"><div><span>You pay</span><b>${money(f, payNow)}</b>${sc.own ? `<small>for ${buyN} more</small>` : ''}</div><div><span>You get</span><b>${money(f, f.get * n)}</b></div><div><span>Profit</span><b class="${profit > 0 ? 'good' : 'bad'}">${signed(f, profit)}</b><small>${pct(sc.margin)}</small></div></div>
      ${bar('Buying', sc.buyShare)}${bar('Selling', sc.sellShare)}
      ${data() && data().cx ? `<div class="ef-cxbox"><b>Exchange markets</b> <span class="sub">GGG, last ${data().cx.hours} h: typical hourly price per item, in chaos</span>${cxRow(f)}
        ${!f.real || f.real.reason === 'nodata' ? '<div class="sub">No recent exchange hours yet: not checked against real trades.</div>'
          : f.real.reason === 'absent' ? '<div class="sub">Not (all) on the exchange: not checked against real trades.</div>'
          : f.real.reason === 'quiet' ? `<div class="sub">No real trades in the last ${f.real.hours} h for part of this flip: not confirmed.</div>`
          : `<div class="sub">Real trades, last ${f.real.hours} h: margin <b>${pct(f.real.margin)}</b>${f.real.status === 'confirmed' ? '' : ' (below your limit)'}${f.real.perHour != null ? ` · ${capText(f)} (10% of what trades on the thinner side)` : ''}.</div>`}</div>` : ''}
      ${div && payNow > 20 * div ? `<div class="ef-risk">You tie up ${D(payNow)}. A 1% move in the reward's price is ${C(f.getAvg * n * 0.01)}.</div>` : ''}
      <ol class="ef-steps">${steps(f)}</ol>
      ${sc.own ? `<p class="sub">Profit counts your ${sc.own} owned ${E.esc(m.name)} at their sell price (3% under poe.ninja), because selling them is your alternative.</p>` : ''}
      <p class="sub">Profit counts 3% worse prices on both sides. Gold fees on the currency exchange are not included. Prices are poe.ninja averages: check the real price before you buy.</p>
      <div class="row" style="justify-content:flex-end;gap:8px"><button class="btn q" data-efd="hide">${hidden ? 'Show this flip again' : 'Hide this flip'}</button><button class="btn" data-efd="close">Close</button></div></div>`;
  }

  function openFlip(id) {
    if (dlg) dlg.close();
    const opener = document.activeElement;
    const wrap = document.createElement('div');
    wrap.className = 'scrim';
    let n = 1;
    const flip = () => (data() && data().flips.find(f => f.id === id)) || null;
    // keep: after a price refresh, put focus back on the same control.
    const draw = (focusSel, keep) => {
      const f = flip();
      if (!f) { close(); return; }
      if (keep) {
        const a = document.activeElement;
        if (a && wrap.contains(a) && a.dataset.efd) {
          const stp = a.closest('[data-step]');
          focusSel = `${stp ? `[data-step="${stp.dataset.step}"] ` : ''}[data-efd="${a.dataset.efd}"]${a.dataset.d ? `[data-d="${a.dataset.d}"]` : ''}${a.dataset.name ? `[data-name="${CSS.escape(a.dataset.name)}"]` : ''}`;
        }
      }
      wrap.innerHTML = popupHtml(f, n);
      const el = focusSel && wrap.querySelector(focusSel);
      if (el && !el.disabled) el.focus(); else if (focusSel) wrap.querySelector('[data-efd="close"]').focus();
    };
    const close = () => {
      wrap.remove(); document.removeEventListener('keydown', onKey, true); dlg = null;
      // The card (a hidden flip's card is gone: then the first card, or Refresh).
      const back = document.querySelector(`[data-ef="open"][data-id="${CSS.escape(id)}"]`) || (opener && opener.isConnected && opener !== document.body ? opener : null)
        || document.querySelector('[data-ef="open"]') || document.querySelector('[data-ef="refresh"]');
      if (back && back.focus) back.focus();
    };
    const onKey = ev => {
      if (ev.key === 'Escape') { ev.stopPropagation(); close(); return; }
      if (ev.key !== 'Tab') return;
      const fs = [...wrap.querySelectorAll('button:not([disabled])')];
      if (!fs.length) return;
      const i = fs.indexOf(document.activeElement);
      if (ev.shiftKey && i <= 0) { ev.preventDefault(); fs[fs.length - 1].focus(); }
      else if (!ev.shiftKey && (i === -1 || i === fs.length - 1)) { ev.preventDefault(); fs[0].focus(); }
    };
    wrap.addEventListener('click', ev => {
      if (ev.target === wrap) return close();
      const b = ev.target.closest('[data-efd]'); if (!b) return;
      const a = b.dataset.efd;
      if (a === 'close') return close();
      if (a === 'n') { n = Math.max(1, Math.min(9999, n + Number(b.dataset.d))); return draw(`[data-efd="n"][data-d="${b.dataset.d}"]`); }
      if (a === 'copy') { window.ej.copy(b.dataset.name); return E.toast(`Copied: ${b.dataset.name}`); }
      if (a === 'trade') {
        const lg = encodeURIComponent(st().cfg.league.name);
        const url = b.dataset.unique === '1' ? `https://www.pathofexile.com/trade/search/${lg}?q=${encodeURIComponent(JSON.stringify({ query: { name: b.dataset.name } }))}` : `https://www.pathofexile.com/trade/exchange/${lg}`;
        return window.ej.openUrl(url);
      }
      if (a === 'hide') {
        const h = cfgE().hidden, on = h.includes(id);
        return EX.save({ easyflips: { hidden: on ? h.filter(x => x !== id) : [...h, id] } }).then(() => { redraw(); close(); E.toast(on ? 'Flip shown again' : 'Flip hidden. “Hidden flips” brings it back.'); });
      }
    });
    document.querySelector('.app').appendChild(wrap);
    document.addEventListener('keydown', onKey, true);
    dlg = { close, draw: () => draw(null, true) };
    draw('[data-efd="close"]');
  }
})();
