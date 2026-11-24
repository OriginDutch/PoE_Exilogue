'use strict';
// Reads the game's own settings file (Documents\My Games\Path of Exile\production_Config.ini) to find which screen
// the game runs on: its [DISPLAY] section names the resolution and, after the graphics card, the monitor.

// → { width, height, fullscreen, borderless, monitor } (fields missing when the file doesn't have them)
function parseDisplay(text) {
  const out = {};
  let inDisplay = false;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('[')) { inDisplay = /^\[DISPLAY\]$/i.test(line); continue; }
    if (!inDisplay) continue;
    const m = /^([^=]+)=(.*)$/.exec(line);
    if (!m) continue;
    const k = m[1].trim(), v = m[2].trim();
    if (k === 'resolution_width' && /^\d+$/.test(v)) out.width = Number(v);
    else if (k === 'resolution_height' && /^\d+$/.test(v)) out.height = Number(v);
    else if (k === 'borderless_windowed_fullscreen') out.borderless = v === 'true';
    else if (k === 'fullscreen') out.fullscreen = v === 'true';
    else if (k === 'adapter_name') { const i = v.lastIndexOf(' - '); if (i > 0) out.monitor = v.slice(i + 3).trim(); }
  }
  return out;
}

// displays: [{ id, label, width, height }] (width/height in real pixels). → { id, how: 'monitor' | 'resolution' } or null.
// The monitor name wins; otherwise the only screen with the game's resolution.
function matchDisplay(displays, info) {
  if (!info) return null;
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (info.monitor) {
    const m = norm(info.monitor);
    const hit = m && displays.filter(d => norm(d.label) && (norm(d.label).includes(m) || m.includes(norm(d.label))));
    if (hit && hit.length === 1) return { id: hit[0].id, how: 'monitor' };
  }
  if (info.width && info.height) {
    const hit = displays.filter(d => d.width === info.width && d.height === info.height);
    if (hit.length === 1) return { id: hit[0].id, how: 'resolution' };
  }
  return null;
}

// Exclusive fullscreen: nothing (the overlay included) can be drawn over the game. Only true when the file says so.
const exclusiveFullscreen = info => !!(info && info.fullscreen === true && info.borderless !== true);

module.exports = { parseDisplay, matchDisplay, exclusiveFullscreen };
