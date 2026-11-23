'use strict';
// Draws the essence plan from the main process: boxes around the cells to click, the profit per row in an empty cell,
// and the total next to the Upgrade button. Positions arrive in game pixels; CSS pixels = game pixels / devicePixelRatio.
(function () {
  const chaosSvg = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="#d9b45a" stroke-width="1.8"/><path d="M8 3.5a4.5 4.5 0 1 0 4.2 2.9" fill="none" stroke="#d9b45a" stroke-width="1.8" stroke-linecap="round"/></svg>';
  const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = v => (Math.round(v * 10) / 10).toString();

  ej.onEssences(d => {
    const k = 1 / (window.devicePixelRatio || 1), px = v => (v * k).toFixed(1) + 'px';
    const icon = sz => `<span class="ch" style="width:${px(sz)};height:${px(sz)}">${d.chaosIcon && /^https:\/\/web\.poecdn\.com\//.test(d.chaosIcon) ? `<img src="${esc(d.chaosIcon)}" alt="">` : chaosSvg}</span>`;
    let html = '';
    if (d.state === 'ok') {
      const s = d.scale || 1; // the stash's own scale: 1 at 1440p, 0.75 at 1080p
      const bw = Math.max(2, Math.round(4 * s));
      for (const b of d.boxes) html += `<div class="bx ${b.color}" style="left:${px(b.x - bw / 2)};top:${px(b.y - bw / 2)};width:${px(b.size + bw)};height:${px(b.size + bw)};border-width:${px(bw)}"></div>`;
      for (const l of d.labels) {
        const h = l.size * 0.45, txt = (l.profit > 0 ? '+' : '') + num(l.profit);
        const fs = (txt.length <= 4 ? 13 : txt.length === 5 ? 11.5 : 10) * s; // "+123.4" still fits the cell
        html += `<div class="pill${l.profit < 0 ? ' neg' : ''}" style="left:${px(l.x + 2 * s)};top:${px(l.y + (l.size - h) / 2)};width:${px(l.size - 4 * s)};height:${px(h)};border-radius:${px(h / 2)};font-size:${px(fs)}">${txt} ${icon(fs)}</div>`;
      }
      const t = d.total;
      html += `<div class="tot" style="left:${px(t.x)};top:${px(t.y)};height:${px(t.h)};border-radius:${px(t.h / 2)};font-size:${px(20 * s)}"><span class="k">Total</span>${t.value > 0 ? '+' : ''}${num(t.value)} ${icon(18 * s)}</div>`;
    } else if (d.state === 'error' && d.at) {
      const t = d.at;
      html = `<div class="tot err" style="left:${px(t.x)};top:${px(t.y)};height:${px(t.h)};border-radius:${px(t.h / 2)};font-size:${px(t.h * 0.36)}">${esc(d.message)}</div>`;
    }
    document.body.innerHTML = html;
  });
})();
