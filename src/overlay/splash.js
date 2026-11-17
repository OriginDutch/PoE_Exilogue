'use strict';
// "Time for a break?" in big letters for 1.5 s, then it slides to where the popup appears next to the overlay
// (tx, ty: that spot, in this window's pixels; pal: the dark palette). Without motion it just shows and disappears.
// Main closes this window after BREAK_SPLASH_MS; the overlay shows the regular popup from then on.
(function () {
  const q = new URLSearchParams(location.search);
  const num = (k, d) => { const v = Number(q.get(k)); return Number.isFinite(v) ? v : d; };
  const motion = q.get('motion') === '1';
  document.getElementById('root').className = `ovt-${(q.get('pal') || 'night').replace(/[^a-z0-9-]/gi, '')}`; // palette colours only
  if (!motion) document.documentElement.classList.add('no-motion');
  const b = document.getElementById('b');

  if (q.get('snd') === '1') {
    const file = q.get('sound') === 'shrine' ? 'shrine.wav' : 'break-chime.wav';
    try { const a = new Audio('../renderer/sounds/' + file); a.volume = Math.max(0, Math.min(1, num('vol', 50) / 100)); a.play().catch(() => {}); } catch { /* no audio device */ }
  }

  requestAnimationFrame(() => requestAnimationFrame(() => b.classList.add('in')));
  setTimeout(() => {
    if (!motion) { b.classList.add('out'); return; }
    b.classList.add('go');
    b.style.left = num('tx', innerWidth - 120) + 'px';
    b.style.top = num('ty', 120) + 'px';
    b.style.transform = 'translate(-50%, -50%) scale(.3)';
  }, 1500);
})();
