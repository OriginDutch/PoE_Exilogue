'use strict';
// Which key combinations Path of Exile itself uses, so a hotkey in Exilogue never takes one from the game.
// Source: the [ACTION_KEYS] section of the game's own settings file (production_Config.ini), which holds your
// own binds as "action=<Windows virtual-key code>[ <modifier bits>]", plus a few keys the game always uses that
// aren't in that list (copying and pasting item text, stash search).

// Internal modifier bits. The game writes ONE modifier as a plain number: 1 = Shift, 2 = Ctrl, 3 = Alt (the second
// skill bar, Ctrl+Q/W/E/R/T, is "81 2" … "84 2"; Awakened PoE Trade reads the file the same way).
const MOD_ALT = 1, MOD_CTRL = 2, MOD_SHIFT = 4;
const GAME_MOD = { 0: 0, 1: MOD_SHIFT, 2: MOD_CTRL, 3: MOD_ALT };

// Always used by the game, whatever your binds: item text copy (Ctrl+C, Ctrl+Alt+C), paste, select all, stash search,
// and Ctrl+Enter in chat.
const FIXED = [
  ['copy item text', 67, MOD_CTRL], ['copy item text (advanced)', 67, MOD_CTRL | MOD_ALT], ['paste', 86, MOD_CTRL],
  ['select all', 65, MOD_CTRL], ['search', 70, MOD_CTRL], ['chat', 13, MOD_CTRL],
];

// → [{ action, vk, mods }]: keyboard binds only (mouse buttons and unbound actions left out).
function parseActionKeys(text) {
  const out = [];
  let inKeys = false;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('[')) { inKeys = /^\[\s*ACTION_KEYS\s*\]$/i.test(line); continue; }
    if (!inKeys) continue;
    const m = /^([A-Za-z0-9_]+)=(\d+)(?:\s+(\d+))?$/.exec(line);
    if (!m) continue;
    const vk = Number(m[2]), mods = GAME_MOD[Number(m[3] || 0)];
    if (vk <= 6 || mods == null) continue; // 0 = unbound, 1/2/4/5/6 = mouse buttons; unknown modifier: skip
    out.push({ action: m[1], vk, mods });
  }
  return out;
}

const NAMED = {
  Space: 32, Enter: 13, Tab: 9, Backspace: 8, Delete: 46, Insert: 45, Home: 36, End: 35, PageUp: 33, PageDown: 34,
  Up: 38, Down: 40, Left: 37, Right: 39, numadd: 107, numsub: 109, nummult: 106, numdiv: 111, numdec: 110,
  ';': 186, '=': 187, Plus: 187, ',': 188, '-': 189, '.': 190, '/': 191, '`': 192, '[': 219, '\\': 220, ']': 221, "'": 222,
};

// Electron accelerator as Exilogue records it ("Ctrl+Alt+T", "num5", "F13") → { vk, mods } or null.
function accelToKey(acc) {
  const parts = String(acc || '').split('+');
  const key = parts.pop();
  let mods = 0;
  for (const p of parts) {
    if (['Ctrl', 'Control', 'CommandOrControl', 'CmdOrCtrl'].includes(p)) mods |= MOD_CTRL; else if (p === 'Alt') mods |= MOD_ALT; else if (p === 'Shift') mods |= MOD_SHIFT; else return null;
  }
  let vk = null;
  if (/^[A-Z]$/.test(key)) vk = key.charCodeAt(0);
  else if (/^\d$/.test(key)) vk = 48 + Number(key);
  else if (/^num\d$/.test(key)) vk = 96 + Number(key.slice(3));
  else if (/^F([1-9]|1\d|2[0-4])$/.test(key)) vk = 111 + Number(key.slice(1));
  else if (key in NAMED) vk = NAMED[key];
  return vk == null ? null : { vk, mods };
}

// "use_bound_skill9" → "Use bound skill 9"
const actionName = a => {
  const s = a.replace(/_/g, ' ').replace(/([a-z])(\d)/g, '$1 $2').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

// → the game action that uses this combination (readable), or null. binds: from parseActionKeys (may be empty).
function gameUse(acc, binds) {
  const k = accelToKey(acc);
  if (!k) return null;
  for (const b of binds || []) if (b.vk === k.vk && b.mods === k.mods) return actionName(b.action);
  for (const [name, vk, mods] of FIXED) if (vk === k.vk && mods === k.mods) return name.charAt(0).toUpperCase() + name.slice(1);
  return null;
}

module.exports = { parseActionKeys, accelToKey, gameUse, actionName };
