'use strict';
(async function () {
  const E = EX, ic = EX.icon;
  const el = document.getElementById('ov');
  const brk = document.getElementById('brk');
  const BRK_W = 210; // popup width + gap: what the window grows by while the popup shows
  let brkSide = null; // 'right' or 'left' while the popup shows (left when there's no room on the right)
  let cfg = await ej.getConfig();
  let snap = await ej.snapshot();
  let unlocked = false;
  let lastH = 0, lastX = -1, lastHtml = null, lastCls = null;
  EX.state = { cfg };

  function render() {
    const o = cfg.overlay;
    const paused = !snap.gameRunning;
    const font = o.font === 'app' ? cfg.ui.font : o.font;
    const cls = `app ov ovt-${cfg.ui.darkPalette} sz-${o.size} f-${font}${paused ? ' paused' : ''}${unlocked ? ' unl' : ''}`;
    const rows = E.overlayRows(cfg, snap.stats, paused, { divRate: snap.divRate });
    const bp = !unlocked && !paused && snap.breakPrompt;
    const brkHtml = bp ? E.breakPrompt(cfg, bp) : '';
    const extra = unlocked
      ? `<div class="bar"><span>Drag to move · corners resize</span><button data-lock>${ic.lock()} Lock</button></div>
         <span class="hdl hl ht" data-h="l" aria-hidden="true"></span><span class="hdl hr2 ht" data-h="r" aria-hidden="true"></span>
         <span class="hdl hl hb" data-h="l" aria-hidden="true"></span><span class="hdl hr2 hb" data-h="r" aria-hidden="true"></span>`
      : '';
    const html = rows + extra;
    if (html + brkHtml === lastHtml && cls + cfg.ui.motion === lastCls) return; // nothing visible changed: no DOM work, no layout read
    lastHtml = html + brkHtml; lastCls = cls + cfg.ui.motion;
    if (bp && !brkSide) {
      const right = window.screenX + window.outerWidth + BRK_W <= screen.availLeft + screen.availWidth;
      brkSide = right ? 'right' : 'left';
    } else if (!bp) brkSide = null;
    document.body.classList.toggle('brk-left', brkSide === 'left');
    brk.hidden = !bp;
    brk.className = `app ov ovbrk ovt-${cfg.ui.darkPalette} sz-${o.size} f-${font}`;
    if (bp) E.morph(brk, brkHtml);
    el.className = cls;
    el.style.setProperty('--ovf', 'var(--ui)');
    document.documentElement.classList.toggle('no-motion', !cfg.ui.motion);
    E.morph(el, html);
    requestAnimationFrame(() => {
      const h = Math.ceil(document.body.scrollHeight);
      const x = bp ? BRK_W : 0;
      if (h !== lastH || x !== lastX) { lastH = h; lastX = x; ej.fitOverlay(h, x, brkSide); } // only when the size changed
    });
  }

  // Lock button
  el.addEventListener('click', e => { if (e.target.closest('[data-lock]')) ej.lockOverlay(true); });

  // Custom resize handles: a transparent window can't be resized natively on Windows.
  el.addEventListener('pointerdown', async e => {
    const h = e.target.closest('[data-h]'); if (!h) return;
    e.preventDefault();
    h.setPointerCapture(e.pointerId);
    const start = await ej.overlayBounds();
    const x0 = e.screenX, side = h.dataset.h;
    const move = ev => {
      const dx = ev.screenX - x0;
      if (side === 'r') ej.setOverlayBounds({ width: start.width + dx });
      else ej.setOverlayBounds({ x: start.x + Math.min(dx, start.width - 180), width: start.width - dx });
    };
    const up = () => { h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); ej.overlayBoundsDone(); };
    h.addEventListener('pointermove', move);
    h.addEventListener('pointerup', up);
  });

  ej.onSnapshot(s => { snap = s; render(); });
  ej.onTick(t => { E.applyTick(snap, t); render(); });
  ej.onConfig(c => { cfg = c; EX.state.cfg = c; render(); });
  ej.onOverlayUnlocked(u => { unlocked = u; render(); });
  render();
})();
