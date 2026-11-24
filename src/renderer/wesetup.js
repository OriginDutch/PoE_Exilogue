'use strict';
// "Connect Wealthy Exile": the three steps (Tampermonkey, allow user scripts, install Exilogue's script).
// Used on the Wealthy Exile page; Home offers it once to new installs. The script itself is served by Exilogue.
(function () {
  const E = window.EX, ic = () => E.icon;
  const NAMES = { firefox: 'Firefox', chrome: 'Chrome', edge: 'Edge' };
  const ADDR = { chrome: 'chrome://extensions/?id=dhdgffkkebhmkfjojejmpbldmpobfkfo', edge: 'edge://extensions/?id=iikmkjmpaadaobahmlepeloendndfphd' };
  let asked = false;

  // Which browser: what Windows opens links in, until you pick another one here.
  function browser(ui) {
    if (!ui.wsBrowser && !asked) {
      asked = true;
      ej.weSetupInfo().then(r => { if (!ui.wsBrowser) { ui.wsBrowser = r && NAMES[r.browser] ? r.browser : 'other'; E.rerender(); } }).catch(() => { ui.wsBrowser = 'other'; E.rerender(); });
    }
    return ui.wsBrowser || null;
  }

  // Where the script stands: connected, outdated, or not heard from.
  function status(snap) {
    const w = snap.wealth || {};
    if (w.serverError) return { kind: 'port', w };
    const seen = w.scriptSeenAt && Date.now() - w.scriptSeenAt < 3 * 60e3;
    if (w.scriptOld) return { kind: 'old', w };
    return { kind: seen ? 'ok' : 'none', w };
  }

  function statusHtml(snap) {
    const s = status(snap), w = s.w;
    if (s.kind === 'port') return `<span class="st no" style="white-space:normal">${ic().warn()} Port 47615 is taken by another program (${E.esc(w.serverError)}). The script can't reach Exilogue, and can't be installed, until Exilogue restarts.</span>`;
    if (s.kind === 'old') return `<span class="st no" style="white-space:normal">${ic().warn()} Your script is ${!w.scriptVersion || w.scriptVersion === '1.x' ? 'an older version' : 'version ' + E.esc(w.scriptVersion)}; Exilogue has ${E.esc(w.scriptShipped || '')}. Press Install the script below and Tampermonkey replaces it.</span>`;
    if (s.kind === 'ok') return `<span class="st ok">${ic().check()} Connected · script ${E.esc(w.scriptVersion || '')} · last asked ${E.ago(w.scriptSeenAt)}</span>`;
    const ever = w.scriptEverAt || w.scriptSeenAt; // kept across restarts
    if (!ever) return `<span class="muted" style="font-size:13px">Waiting for the script. It says hello once a Wealthy Exile tab is open.</span>`;
    if (Date.now() - ever > 3 * 86400e3) return `<span class="st no" style="white-space:normal">${ic().warn()} Not heard from in ${E.ago(ever).replace(' ago', '')}. If you did use Wealthy Exile since, check that Tampermonkey and the script are still on.</span>`;
    return `<span class="sub" style="white-space:normal">Set up. Last heard ${E.ago(ever)}; the script only talks to Exilogue while a Wealthy Exile tab is open. Sync &amp; export opens one for you.</span>`;
  }

  // Drawn, not a screenshot: the extension's details page with the one switch that matters.
  const picture = b => `<svg class="ws-pic" viewBox="0 0 360 150" role="img" aria-label="Tampermonkey's details page in ${NAMES[b]}, with the Allow User Scripts switch turned on">
    <rect x="1" y="1" width="358" height="148" rx="10" fill="var(--card2)" stroke="var(--line2)"/>
    <rect x="1" y="1" width="358" height="26" rx="10" fill="var(--card)" stroke="var(--line2)"/><rect x="1" y="16" width="358" height="11" fill="var(--card)"/>
    <rect x="12" y="8" width="150" height="11" rx="5.5" fill="var(--line2)"/><text x="18" y="17" font-size="8.5" fill="var(--tx3)" font-family="inherit">${b}://extensions/?id=…</text>
    <rect x="14" y="38" width="22" height="22" rx="5" fill="#222"/><rect x="19" y="45" width="5" height="5" rx="2.5" fill="#fff"/><rect x="26" y="45" width="5" height="5" rx="2.5" fill="#fff"/><rect x="18" y="52" width="14" height="3" rx="1.5" fill="#fff"/>
    <text x="44" y="53" font-size="12" font-weight="600" fill="var(--tx)" font-family="inherit">Tampermonkey</text>
    <g fill="var(--tx3)" font-size="10" font-family="inherit"><text x="14" y="80">On</text><text x="14" y="100">Site access</text></g>
    <rect x="316" y="72" width="26" height="12" rx="6" fill="var(--tx3)"/><circle cx="335" cy="78" r="5" fill="var(--card2)"/>
    <line x1="14" y1="88" x2="346" y2="88" stroke="var(--line)"/><line x1="14" y1="108" x2="346" y2="108" stroke="var(--line)"/>
    <rect x="8" y="112" width="344" height="28" rx="7" fill="none" stroke="var(--acc)" stroke-width="2"/>
    <text x="16" y="130" font-size="11" font-weight="600" fill="var(--tx)" font-family="inherit">Allow User Scripts</text>
    <rect x="314" y="119" width="30" height="14" rx="7" fill="var(--acc)"/><circle cx="337" cy="126" r="5.5" fill="var(--acc-ink)"/>
    <path d="M296 104 l12 14 m0 0 l-1 -8 m1 8 l-8 -2" stroke="var(--acc)" stroke-width="2" fill="none" stroke-linecap="round"/>
  </svg>`;

  // The steps, on the Wealthy Exile page.
  function html(snap, ui, where) {
    const b = browser(ui), s = status(snap);
    const pick = `<label class="ws-pick"><span class="muted">Your browser</span><select class="select" style="width:auto" data-wsbrowser aria-label="Your browser">
      ${b ? '' : '<option>Looking…</option>'}${['firefox', 'chrome', 'edge'].map(k => `<option value="${k}" ${b === k ? 'selected' : ''}>${NAMES[k]}</option>`).join('')}<option value="other" ${b === 'other' ? 'selected' : ''}>Another browser</option></select></label>`;
    const known = b && NAMES[b];
    const chromium = b === 'chrome' || b === 'edge';
    const step1 = `<li><div><b>Install Tampermonkey</b>
        <p>A free browser add-on that runs small scripts on websites. ${known ? `This opens its page in the ${NAMES[b]} add-on store; press ${b === 'firefox' ? 'Add to Firefox' : b === 'edge' ? 'Get' : 'Add to Chrome'} there.` : 'Exilogue has steps for Firefox, Chrome and Edge. In another browser, install Tampermonkey from its own add-on store, then do step 2 (Install the script).'}</p>
        <button class="btn" data-act="ws-store" ${known ? '' : 'disabled'}>Open Tampermonkey${known ? ' for ' + NAMES[b] : ''}</button></div></li>`;
    const step2 = chromium ? `<li><div><b>Allow user scripts</b>
        <p>${NAMES[b]} asks this once. Right-click the Tampermonkey icon next to the address bar (it may be under the puzzle piece) › <b>Manage extension</b>, then switch on <b>Allow User Scripts</b>. ${NAMES[b]} doesn't let programs open that page for you, so you can also paste the address below into the address bar.</p>
        ${picture(b)}
        <div class="row" style="gap:8px;flex-wrap:wrap;align-items:center"><code class="ws-addr">${ADDR[b]}</code><button class="btn sm" data-act="ws-copy">Copy address</button></div>
        <p class="muted" style="font-size:12px;margin-top:6px">No such switch? Older ${NAMES[b]} versions use <b>Developer mode</b> at the top right of the extensions page instead.</p></div></li>` : '';
    const step3 = `<li><div><b>Install the Exilogue script</b>
        <p>Tampermonkey shows the script; press <b>Install</b>${s.kind === 'old' ? ' (or Update)' : ''}. After that it follows Exilogue's updates by itself. Then open Wealthy Exile and log in; the tab may stay open in the background.</p>
        <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn p" data-act="ws-script" ${s.kind === 'port' ? 'disabled' : ''}>Install the script</button><button class="btn" data-act="ws-site">Open Wealthy Exile</button></div>
        <div style="margin-top:10px" role="status">${statusHtml(snap)}</div></div></li>`;
    const later = '';
    return `<div class="wesetup">
      <div class="row between" style="gap:12px;flex-wrap:wrap;margin-bottom:14px">${pick}${later}</div>
      <ol class="steps ws-steps">${step1}${step2}${step3}</ol></div>`;
  }

  // Home: once for new installs, after the game paths. One line; the steps are on the Wealthy Exile page.
  function homeCard(snap, cfg, ui) {
    if (cfg.weSync.setup !== 'new' || !snap.paths.clientTxt || snap.logMissing) return '';
    return `<div class="banner" role="status"><span class="bi">${ic().refresh()}</span>
      <div class="grow"><div class="bt">Connect Wealthy Exile (optional)</div><div class="sub" style="white-space:normal">Net worth and profit per hour on Home and in the overlay. 3 steps, about 2 minutes.</div></div>
      <div class="row" style="gap:8px"><button class="btn p" data-nav="page:wealthy">Set up</button><button class="btn q" data-act="ws-later">Later</button></div></div>`;
  }

  // Home: an old script (from before Exilogue shipped it) can't update itself, so it gets one nudge.
  function homeOutdated(snap) {
    const w = snap.wealth || {};
    if (w.scriptVersion !== '1.x' || w.serverError) return '';
    return `<div class="banner live" role="status"><span class="bi">${E.icon.refresh()}</span>
      <div class="grow"><div class="bt">New Wealthy Exile script</div><div class="sub" style="white-space:normal">From now on Exilogue ships the script and keeps it up to date. Replace yours once: press Install and Tampermonkey swaps it.</div></div>
      <button class="btn p" data-act="ws-script">Install</button></div>`;
  }

  const actions = ui => ({
    'ws-store': () => { if (NAMES[ui.wsBrowser]) ej.weSetupOpen('store', ui.wsBrowser); },
    'ws-copy': async () => { if (await ej.weSetupCopy(ui.wsBrowser)) E.toast('Address copied. Paste it in ' + NAMES[ui.wsBrowser] + "'s address bar.", { kind: 'ok' }); },
    'ws-script': async () => { if (!(await ej.weSetupOpen('script'))) E.toastError("Exilogue can't serve the script right now (port 47615 is taken, or the script is missing). Restart Exilogue and try again."); },
    'ws-site': () => ej.weSetupOpen('site'),
    'ws-later': async () => { await ej.weSetupSkip(); E.toast('You can set it up any time on the Wealthy Exile page, in the menu on the left.'); },
  });

  E.weSetup = { html, statusHtml, homeCard, homeOutdated, actions, NAMES };
})();
