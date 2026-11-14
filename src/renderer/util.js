'use strict';
// Shared helpers, icons and the tiny DOM morph used for 1s live refreshes.
window.EX = window.EX || {};

EX.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

EX.fmt = (ms, { hours = 'auto' } = {}) => {
  if (ms == null || isNaN(ms)) return '–';
  const neg = ms < 0; ms = Math.abs(ms);
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = n => String(n).padStart(2, '0');
  const out = (h > 0 || hours === true) ? `${h}:${p(m)}:${p(sec)}` : `${m}:${p(sec)}`;
  return (neg ? '−' : '') + out;
};

// Split difference: negative = ahead (good)
// Short hours:minutes for totals like break time (0:24, 1:05).
EX.hm = ms => { const m = Math.round(Math.max(0, ms || 0) / 60000); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
EX.bytes = n => {
  if (!(n > 0)) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const v = n / 1024 ** i;
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${u[i]}`;
};
EX.diff = ms => (ms == null ? '' : (ms <= 0 ? '−' : '+') + EX.fmt(Math.abs(ms)));
EX.diffCls = ms => (ms == null ? '' : ms <= 0 ? 'good' : 'bad');

EX.clock = t => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
EX.date = t => {
  const d = new Date(t), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
EX.ago = t => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
};
EX.duration = sec => {
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  return [d && `${d} day${d > 1 ? 's' : ''}`, h && `${h} hour${h > 1 ? 's' : ''}`, `${m} minute${m === 1 ? '' : 's'}`].filter(Boolean).join(', ');
};

// League day from the configured start
EX.leagueDay = start => {
  const m = /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2})/.exec(start || '');
  if (!m) return null;
  const t0 = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
  if (Date.now() < t0) return 0;
  return Math.floor((Date.now() - t0) / 86400000) + 1;
};

// Icons (stroke SVG, decorative)
const I = (vb, body, size = 16, extra = '') => `<svg width="${size}" height="${size}" viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;
EX.icon = {
  brand: () => `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M12 2l9 10-9 10-9-10z"/><path d="M12 7v10M8.5 12h7"/></svg>`,
  home: () => I('0 0 16 16', '<path d="M2.5 7.5L8 3l5.5 4.5V13h-11z"/><path d="M6.5 13V9.5h3V13"/>'),
  events: () => I('0 0 16 16', '<path d="M6 4h8M6 8h8M6 12h5"/><path d="M2.5 3.2l.8.8-.8.8-.8-.8zM2.5 7.2l.8.8-.8.8-.8-.8zM2.5 11.2l.8.8-.8.8-.8-.8z"/>'),
  settings: () => I('0 0 16 16', '<path d="M2 4h7M13 4h1M2 8h1M7 8h7M2 12h8M14 12h0"/><circle cx="11" cy="4" r="1.6"/><circle cx="5" cy="8" r="1.6"/><circle cx="12" cy="12" r="1.6"/>'),
  collapse: () => I('0 0 16 16', '<rect x="2" y="2.5" width="12" height="11" rx="1.5"/><path d="M6 2.5v11M10.5 6.5L9 8l1.5 1.5"/>'),
  expand: () => I('0 0 16 16', '<rect x="2" y="2.5" width="12" height="11" rx="1.5"/><path d="M6 2.5v11M9 6.5L10.5 8 9 9.5"/>'),
  chev: () => I('0 0 16 16', '<path d="M6 4l4 4-4 4"/>', 16, 'class="chev"'),
  ext: (s = 12) => I('0 0 16 16', '<path d="M9 3h4v4M13 3L7 9M11 10v3H3V5h3"/>', s, 'stroke-width="1.8"'),
  lock: (s = 13) => I('0 0 16 16', '<rect x="3.5" y="7" width="9" height="6.5" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/>', s),
  unlock: (s = 13) => I('0 0 16 16', '<rect x="3.5" y="7" width="9" height="6.5" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 4.9-.7"/>', s),
  folder: (s = 16) => I('0 0 16 16', '<path d="M1.5 4h4.5l1.5 1.5h7v7.5h-13z"/>', s),
  play: (s = 12) => `<svg width="${s}" height="${s}" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5l9 5.5-9 5.5z" fill="currentColor"/></svg>`,
  check: (s = 13) => I('0 0 16 16', '<path d="M3.5 8.5l3 3 6-7"/>', s, 'stroke-width="2"'),
  info: () => I('0 0 16 16', '<circle cx="8" cy="8" r="6.2"/><path d="M8 7.2v4M8 4.8v.2"/>', 14),
  warn: () => I('0 0 16 16', '<path d="M8 2l6.5 11.5h-13z"/><path d="M8 6.5v3.2M8 11.8v.2"/>', 14, 'stroke-width="1.6"'),
  refresh: (s = 13) => I('0 0 16 16', '<path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9"/><path d="M2.5 2.5v3h3"/>', s),
  grid: () => I('0 0 16 16', '<rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/>', 14),
  grip: () => `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="6" cy="4" r="1.2"/><circle cx="10" cy="4" r="1.2"/><circle cx="6" cy="8" r="1.2"/><circle cx="10" cy="8" r="1.2"/><circle cx="6" cy="12" r="1.2"/><circle cx="10" cy="12" r="1.2"/></svg>`,
  eye: () => I('0 0 16 16', '<path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>'),
  eyeOff: () => I('0 0 16 16', '<path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/><path d="M2.5 2.5l11 11"/>'),
  pause: () => `<svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="3" width="3" height="10" rx="1" fill="currentColor"/><rect x="9" y="3" width="3" height="10" rx="1" fill="currentColor"/></svg>`,
  min: () => I('0 0 16 16', '<path d="M2 8h12"/>', 10, 'stroke-width="1.4"'),
  max: () => I('0 0 16 16', '<rect x="2.5" y="2.5" width="11" height="11" rx="1"/>', 10, 'stroke-width="1.4"'),
  restore: () => I('0 0 16 16', '<path d="M5 2.5h8.5V11"/><rect x="2.5" y="5" width="8.5" height="8.5" rx="1"/>', 10, 'stroke-width="1.4"'),
  close: () => I('0 0 16 16', '<path d="M3 3l10 10M13 3L3 13"/>', 10, 'stroke-width="1.4"'),
  // event types
  e_level: () => I('0 0 16 16', '<path d="M4 8.5l4-4 4 4M4 12.5l4-4 4 4"/>', 16, 'stroke-width="1.6"'),
  e_death: () => I('0 0 16 16', '<path d="M3.5 14V7a4.5 4.5 0 0 1 9 0v7z"/><path d="M8 6v4.5M6.2 7.8h3.6"/>'),
  e_act: () => I('0 0 16 16', '<path d="M4 14V2"/><path d="M4 2.5h8l-2 3 2 3H4"/>'),
  e_campaign: () => I('0 0 16 16', '<path d="M2 12.5h12M2.5 12.5L2 5l3.2 2.8L8 3l2.8 4.8L14 5l-.5 7.5"/>'),
  e_firstMap: () => I('0 0 16 16', '<path d="M1.5 4l4-1.5 5 1.5 4-1.5v9.5l-4 1.5-5-1.5-4 1.5z"/><path d="M5.5 2.5v9.5M10.5 4v9.5"/>'),
  e_tier: () => I('0 0 16 16', '<path d="M3 2.5h10M8 14V6M4.5 9.5L8 6l3.5 3.5"/>'),
  e_sessStart: () => `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.5l7 4.5-7 4.5z" fill="currentColor"/></svg>`,
  e_sessEnd: () => `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="4" width="8" height="8" rx="1" fill="currentColor"/></svg>`,
};

EX.kbd = acc => (acc ? `<span class="row" style="gap:3px">${acc.split('+').map(k => `<span class="kbd">${EX.esc(k)}</span>`).join('')}<span class="vh">Hotkey ${EX.esc(acc)}</span></span>` : '<span class="sub">no hotkey</span>');

EX.note = text => `<div class="note">${EX.icon.info()}<span>${text}</span></div>`;

// Path status label
EX.pathSt = ok => (ok ? `<span class="st ok">${EX.icon.check()} Found</span>` : `<span class="st no">${EX.icon.warn()} Not found</span>`);

// Switch control with a fixed accessible name
EX.sw = (on, name, act) => `<button class="sw" role="switch" aria-checked="${on ? 'true' : 'false'}" aria-label="${EX.esc(name)}" data-act="${act}"><span></span></button>`;

// Tier from area level (68 = T1 … 83 = T16). 3.30 reworks the atlas: re-check once real logs exist.
EX.tierOf = lvl => (lvl >= 68 ? lvl - 67 : null);

// Minimal DOM morph: keeps unchanged nodes in place (hover, focus, transitions survive the 1s refresh).
EX.morph = function (el, html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  sync(el, tpl.content);
  function sync(a, b) {
    const an = [...a.childNodes], bn = [...b.childNodes];
    for (let i = 0; i < bn.length; i++) {
      const x = an[i], y = bn[i];
      if (!x) { a.appendChild(y); continue; }
      if (x.nodeType !== y.nodeType || x.nodeName !== y.nodeName) { a.replaceChild(y, x); continue; }
      if (x.nodeType === 3 || x.nodeType === 8) { if (x.nodeValue !== y.nodeValue) x.nodeValue = y.nodeValue; continue; }
      if (x.hasAttribute && x.hasAttribute('data-keep')) continue;
      for (const { name } of [...x.attributes]) if (!y.hasAttribute(name)) x.removeAttribute(name);
      for (const { name, value } of [...y.attributes]) if (x.getAttribute(name) !== value) x.setAttribute(name, value);
      if (x.nodeName === 'INPUT' && x.type !== 'checkbox' && x.type !== 'radio' && document.activeElement !== x && x.value !== (y.getAttribute('value') ?? '')) x.value = y.getAttribute('value') ?? '';
      if (x.nodeName === 'INPUT' && (x.type === 'checkbox' || x.type === 'radio')) x.checked = y.hasAttribute('checked');
      sync(x, y);
    }
    for (let i = an.length - 1; i >= bn.length; i--) a.removeChild(an[i]);
  }
};

// Modal confirm in the app's style
EX.confirm = ({ title, body, ok = 'Continue', danger = false, cancel = 'Cancel' }) => new Promise(resolve => {
  const wrap = document.createElement('div');
  wrap.className = 'scrim';
  wrap.innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-t">
    <h2 id="dlg-t">${title}</h2><p>${body}</p>
    <div class="row" style="justify-content:flex-end;gap:8px;margin-top:6px">
      <button class="btn q" data-r="0">${cancel}</button><button class="btn ${danger ? 'danger' : 'p'}" data-r="1">${ok}</button>
    </div></div>`;
  document.querySelector('.app').appendChild(wrap);
  const done = v => { wrap.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
  const onKey = e => { if (e.key === 'Escape') done(false); };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (b) done(b.dataset.r === '1'); else if (e.target === wrap) done(false); });
  wrap.querySelector('[data-r="1"]').focus();
});

EX.toast = msg => EX.confirm({ title: 'Heads up', body: msg, ok: 'OK', cancel: 'Close' });

// Main sends a full snapshot only when data changed; in between, a tick with just the running timers.
EX.applyTick = (snap, tk) => {
  if (!snap || !tk) return snap;
  snap.now = tk.now;
  const st = snap.stats, L = tk.live;
  if (!st || !L) return snap;
  st.area = L.area; st.session = L.session; st.currentMap = L.currentMap;
  if (L.runId != null) {
    if (st.campaign && st.campaign.id === L.runId) st.campaign.activeMs = L.runActiveMs;
    for (const r of st.runs || []) if (r.id === L.runId) r.activeMs = L.runActiveMs;
  }
  return snap;
};
