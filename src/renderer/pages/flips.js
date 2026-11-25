'use strict';
// Easyflips: "buy → convert in-game → sell" flips from poe.ninja prices. A card per flip; clicking one opens its steps.
// Prices are refreshed every minute while this page is open (poe.ninja's lists are at most 5 minutes old).
(function () {
  const E = EX, ic = EX.icon;
  EX.pages = EX.pages || {};
  const st = () => EX.state, ui = () => EX.ui;
  const SPREAD = 0.03;
  const CATS = [['all', 'All'], ['essence', 'Essences'], ['card', 'Div cards'], ['splinter', 'Splinters & shards'], ['unique', 'Uniques'], ['oil', 'Oils'], ['own', 'From what you own']];
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
    return out.join('');
  }
  const WHY = { margin: 'margin below your limit', thin: 'thin volume', maxDiv: 'over your divine limit', divine: 'divine price unsure', loss: 'no profit' };
  const volText = f => (f.inVol == null ? 'no volume data' : `${f.in[0].name} trades ≈ ${fmt(f.inVol)}c an hour`);
  const sub = f => `${f.in[0].n} → ${f.out.n > 1 ? f.out.n + ' × ' : ''}${label(f)}${f.kind === 'essence' && f.upgrades === 2 ? ' · 2 upgrades' : ''}`;

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
      has(f.cxOut) && f.out.name !== 'Divine Orb' ? `<div><span class="ef-cxl">Sell</span>${cxPair(f.cxOut, 'sell')}</div>` : ''].join('');
    return rows ? `<div class="ef-cx">${rows}</div>` : '';
  };
  const hrs = () => (data() && data().cx ? data().cx.hours : 12);

  function card(f, hidden) {
    const reasons = f.reasons.map(r => WHY[r]).filter(Boolean);
    return `<div class="ef-card${f.below ? ' dim' : ''}" role="button" tabindex="0" data-ef="open" data-id="${f.id}">
      <div class="ef-rec">${recipe(f, 46)}<div class="ef-nm"><span class="ef-kind">${KIND[f.kind] || ''}</span><b>${E.esc(f.in[0].name)}</b><span class="sub">${E.esc(sub(f))}</span></div></div>
      ${flags(f) ? `<div class="ef-flags">${flags(f)}</div>` : ''}
      <div class="ef-nums"><div><span>You pay</span><b>${money(f, f.payNow)}</b>${f.own ? `<small>for ${f.in[0].n - f.own} more</small>` : ''}</div><div><span>You get</span><b>${money(f, f.get)}</b></div>
        <div><span>Profit</span><b class="${f.profit > 0 ? 'good' : 'bad'}">${signed(f, f.profit)}</b><small>${pct(f.margin)}</small></div></div>
      ${cxRow(f)}
      <div class="sub ef-foot">${E.esc(volText(f))}${f.below && reasons.length ? ' · ' + reasons.join(', ') : ''}${hidden ? ' · hidden' : ''}</div></div>`;
  }

  function list(d) {
    const e = cfgE(), u = ui().ef, hidden = new Set(e.hidden);
    const cat = u.cat || 'all';
    return d.flips.filter(f => {
      if (u.showHidden ? !hidden.has(f.id) : hidden.has(f.id)) return false;
      if (!e.highStakes && f.highStakes) return false;
      if (!e.showBelow && f.below) return false;
      if (cat === 'own') return f.own > 0;
      if (cat === 'splinter') return f.kind === 'splinter' || f.kind === 'shard';
      return cat === 'all' || f.kind === cat;
    });
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
      const shown = list(d);
      const nHidden = d.flips.filter(f => e.hidden.includes(f.id)).length;
      const filters = `<div class="ef-bar" role="group" aria-label="Show">${CATS.map(([k, l]) => `<button class="ef-chip${(u.cat || 'all') === k ? ' on' : ''}" data-ef="cat" data-cat="${k}" aria-pressed="${(u.cat || 'all') === k}">${E.esc(l)}</button>`).join('')}</div>
        <div class="ef-bar">${numField('minMargin', 'Min margin', '%', e.minMargin)}${numField('maxDiv', 'Max', 'divine', e.maxDiv)}
          <span class="spacer"></span>
          <button class="ef-chip${e.showBelow ? ' on' : ''}" data-ef="tog" data-k="showBelow" aria-pressed="${e.showBelow}">Show below limits</button>
          <button class="ef-chip${e.highStakes ? ' on' : ''}" data-ef="tog" data-k="highStakes" aria-pressed="${e.highStakes}">High stakes</button>
          <button class="ef-chip${u.showHidden ? ' on' : ''}" data-ef="hidden" aria-pressed="${!!u.showHidden}" ${nHidden || u.showHidden ? '' : 'disabled'}>Hidden flips (${nHidden})</button></div>`;
      const grid = shown.length ? `<div class="ef-grid">${shown.map(f => card(f, u.showHidden)).join('')}</div>`
        : `<section class="box"><div class="empty"><b>${u.showHidden ? 'No hidden flips' : 'No flips here right now'}</b><span>${u.showHidden ? '' : 'Prices move all the time: try again later, or loosen your limits.'}</span></div></section>`;
      return head + filters + grid + `<div class="note">${ic.info()}<span>Sorted by margin, flips marked “verify” after the rest. Buy/Sell rows: the same item in the exchange's chaos market and divine market (typical hourly price over the last ${hrs()} hours, GGG's history; the better one is bold, not when the divine side barely traded). Volume is poe.ninja's chaos traded per hour; under 1,000c an hour counts as thin. Uniques: bench six-link (needs item level 50+, not corrupted) and Breach blessings (sell the unique and the blessing to a vendor).${d.partial ? ' Some poe.ninja lists could not be loaded.' : ''}</span></div>`;
    },
    mount(el) {
      load(false);
      const tick = setInterval(() => { if (!el.isConnected) { clearInterval(tick); return; } load(false); }, 60e3);
      el.addEventListener('click', onClick);
      el.addEventListener('keydown', ev => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches('[data-ef="open"]')) { ev.preventDefault(); openFlip(ev.target.dataset.id); } });
      el.addEventListener('change', ev => {
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
    const t = ev.target.closest('[data-ef]'); if (!t) return;
    const a = t.dataset.ef, u = ui().ef;
    if (a === 'open') return openFlip(t.dataset.id);
    if (a === 'refresh') return load(true);
    if (a === 'cat') { u.cat = t.dataset.cat; return redraw(); }
    if (a === 'hidden') { u.showHidden = !u.showHidden; return redraw(); }
    if (a === 'tog') return EX.save({ easyflips: { [t.dataset.k]: !cfgE()[t.dataset.k] } }).then(redraw);
  }

  // ---------- the steps popup ----------
  let dlg = null;
  function steps(f, n) {
    const m = f.in[0], sc = window.EasyflipsCore.scale(f, n, SPREAD), buyN = sc.buyN;
    const most = `Pay at most ${fmt(f.payAtMost)}c each: that still leaves your ${cfgE().minMargin}% margin.`;
    const btns = (name, unique) => `<button class="btn sm" data-efd="copy" data-name="${E.esc(name)}">Copy name</button><button class="btn sm q" data-efd="trade" data-name="${E.esc(name)}" data-unique="${unique ? 1 : 0}">Trade site ${ic.ext()}</button>`;
    const buyBtns = btns(m.name, f.kind === 'unique');
    const sellBtns = `<button class="btn sm" data-efd="copy" data-name="${E.esc(f.out.name)}">Copy name</button>`;
    // Which exchange market to use, from GGG's last 12 hours (text only; the HTML line is added below the step).
    const mkt = (c, side) => {
      if (!advise(c, side)) return '';
      const best = side === 'buy' ? c.buy : c.sell, by = gap(c, side);
      const batch = c.perDivine && c.perDivine >= 1 ? ` (1 divine ≈ ${c.perDivine >= 10 ? Math.round(c.perDivine) : Math.round(c.perDivine * 10) / 10} items)` : '';
      return side === 'buy' ? ` Over the last ${hrs()} h it was ${by}% cheaper to buy with ${best === 'chaos' ? 'chaos' : 'divines' + batch}.`
        : ` Over the last ${hrs()} h it paid ${by}% more to sell for ${best === 'chaos' ? 'chaos' : 'divines' + batch}.`;
    };
    const buy = [m.name, m.n, sc.own ? `Buy ${buyN} more × ${m.name}` : `Buy ${buyN} × ${m.name}`, (sc.own ? `You already own ${sc.own}. ` : '') + most + mkt(f.cxIn, 'buy'), buyBtns];
    // Bench currency is counted in what you pay; a blessing has to be bought like the unique.
    const extra = f.in.slice(1).map(x => [x.name, x.n, x.cost ? `Have ${(x.n * n).toLocaleString('en-US')} × ${x.name}` : `Buy ${(x.n * n).toLocaleString('en-US')} × ${x.name}`, 'Counted in what you pay.', x.cost ? '' : btns(x.name, false)]);
    const sellEach = f.out.n > 1 ? `${fmt(f.get / f.out.n)}c each` : `${fmt(f.get)}c`;
    const sell = [f.out.name, f.out.n, `Sell ${(f.out.n * n).toLocaleString('en-US')} × ${label(f)}`, f.out.name === 'Divine Orb' ? 'Divine Orbs are money: nothing to sell.' : `Around ${sellEach} after the spread.` + mkt(f.cxOut, 'sell'), f.out.name === 'Divine Orb' ? '' : sellBtns];
    let conv;
    if (f.kind === 'essence') conv = f.upgrades === 2 ? ['Upgrade twice in your essence tab', `Press Upgrade: ${m.n * n} → ${3 * n} of the tier between, then again → ${n}.`] : ['Upgrade in your essence tab', `Put them in the essence tab and press Upgrade: every 3 become 1 ${f.out.name}.`];
    else if (f.kind === 'card') conv = [n > 1 ? `Turn in ${n} full sets` : 'Turn in the full set', 'At Lilly Roth in your hideout, or Tasuni in Highgate.'];
    else if (f.kind === 'oil') conv = ['Combine at a vendor', `Sell 3 ${m.name}s to a vendor for 1 ${f.out.name}.`];
    else if (f.kind === 'splinter' || f.kind === 'shard') conv = ['Combine in your inventory', `A full stack of ${m.n} in your inventory turns into ${f.out.name}. If it doesn't, split one off and drop it back. Not in a stash tab.`];
    else if (f.sixLink) conv = ['Six-link at the crafting bench', 'Needs item level 50 or more, not corrupted, and the six-link recipe unlocked. If it has fewer than 6 sockets, the 350 Jeweller\'s make them first.'];
    else if (f.vendor) conv = ['Sell both to a vendor', `Sell ${m.name} together with ${f.in[1] ? f.in[1].name : 'the blessing'} to any vendor. You get ${f.out.name}, with new rolls.`];
    const rows = [buy, ...extra, [f.out.name, f.out.n, conv[0], conv[1], ''], sell];
    return rows.map((x, i) => `<li class="ef-st" data-step="${i}"><span class="ef-no" aria-hidden="true">${i + 1}</span><div><div class="row" style="gap:10px">${pic(x[0], 30, x[1])}<b>${E.esc(x[2])}</b></div><p class="sub">${E.esc(x[3])}</p>${x[4] ? `<div class="row" style="gap:6px;flex-wrap:wrap">${x[4]}</div>` : ''}</div></li>`).join('');
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
      <div class="ef-dh">${recipe(f, 52)}<div class="grow"><span class="ef-kind">${KIND[f.kind] || ''}</span><h2 id="ef-t">${E.esc(m.name)}</h2><span class="sub">${E.esc(sub(f))}</span></div>
        <button class="btn i" data-efd="close" aria-label="Close">×</button></div>
      ${route}${flags(f) ? `<div class="ef-flags">${flags(f)}</div>` : ''}
      <div class="ef-qty"><span>How many times</span><button class="btn i sm" data-efd="n" data-d="-1" aria-label="Fewer" ${n <= 1 ? 'disabled' : ''}>−</button><b aria-live="polite">${n}×</b><button class="btn i sm" data-efd="n" data-d="1" aria-label="More">+</button><span class="spacer"></span><span class="sub">${E.esc(volText(f))}</span></div>
      <div class="ef-nums big"><div><span>You pay</span><b>${money(f, payNow)}</b>${sc.own ? `<small>for ${buyN} more</small>` : ''}</div><div><span>You get</span><b>${money(f, f.get * n)}</b></div><div><span>Profit</span><b class="${profit > 0 ? 'good' : 'bad'}">${signed(f, profit)}</b><small>${pct(sc.margin)}</small></div></div>
      ${bar('Buying', sc.buyShare)}${bar('Selling', sc.sellShare)}
      ${data() && data().cx ? `<div class="ef-cxbox"><b>Exchange markets</b> <span class="sub">GGG, last ${data().cx.hours} h: typical hourly price per item, in chaos</span>${cxRow(f)}</div>` : ''}
      ${div && payNow > 20 * div ? `<div class="ef-risk">You tie up ${D(payNow)}. A 1% move in the reward's price is ${C(f.getAvg * n * 0.01)}.</div>` : ''}
      <ol class="ef-steps">${steps(f, n)}</ol>
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
