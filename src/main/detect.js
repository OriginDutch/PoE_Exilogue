'use strict';
// Finds Path of Exile, its log and the tools on this PC: Steam (all libraries), the standalone client, Epic,
// and the usual install folders of Path of Building and Awakened PoE Trade. Everything is passed in, so it can be tested.
const path = require('path');

const POE_EXES = ['PathOfExile_x64.exe', 'PathOfExile.exe', 'PathOfExile_x64Steam.exe', 'PathOfExileSteam.exe', 'PathOfExile_x64EGS.exe', 'PathOfExileEGS.exe'];

// Steam's libraryfolders.vdf. Current format: "path" "D:\\SteamLibrary" per library.
// Before 2021: "1" "D:\\SteamLibrary" directly under "LibraryFolders".
function steamLibraries(vdf) {
  const txt = String(vdf || ''), out = [];
  let m;
  const re = /"path"\s+"([^"]+)"/gi;
  while ((m = re.exec(txt))) out.push(m[1]);
  if (!out.length) { const old = /^[ \t]*"\d+"[ \t]+"([^"]+)"/gm; while ((m = old.exec(txt))) out.push(m[1]); }
  return out.map(p => p.replace(/\\\\/g, '\\'));
}

// Epic manifests (*.item, JSON): the one for Path of Exile.
function epicInstall(manifests) {
  for (const txt of manifests) {
    try {
      const j = JSON.parse(txt);
      if (/^path of exile$/i.test(String(j.DisplayName || '').trim()) && j.InstallLocation) return j.InstallLocation;
    } catch { /* not a manifest */ }
  }
  return null;
}

// `reg query <key> /v <value>` output → the value, or null.
function parseRegValue(out, value) {
  const line = String(out || '').split(/\r?\n/).find(l => l.trim().toLowerCase().startsWith(String(value).toLowerCase() + ' '));
  const m = line && /^\s*\S+\s+REG_\w+\s+(.*\S)\s*$/.exec(line);
  return m ? m[1] : null;
}

// Same folder, different case or slashes (Windows paths aren't case-sensitive): keep the first spelling.
function uniqueDirs(list) {
  const seen = new Set();
  return list.filter(p => { const k = p.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}

// io: { exists(p), read(p) -> string|null, list(dir) -> names[], reg(key, value) -> Promise<string|null>, env }
// Result: { poeExe, clientTxt, logMissing, pobExe, aptExe, source: { poe } } for whatever was found.
// clientTxt is the log next to the found game; logMissing when the game was never started there yet.
async function detectPaths(io) {
  const env = io.env || {};
  const pf86 = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', pf = env.ProgramFiles || 'C:\\Program Files';
  const found = { source: {} };

  const dirs = [];
  const steam = await io.reg('HKCU\\Software\\Valve\\Steam', 'SteamPath');
  if (steam) {
    const root = steam.replace(/\//g, '\\');
    // The vdf spells paths the way Steam shows them; the registry value is lowercase. Prefer the vdf spelling.
    const libs = uniqueDirs([...steamLibraries(io.read(path.win32.join(root, 'steamapps', 'libraryfolders.vdf'))), root]);
    for (const lib of libs) dirs.push([path.win32.join(lib, 'steamapps', 'common', 'Path of Exile'), 'Steam']);
  }
  const ggg = await io.reg('HKCU\\Software\\GrindingGearGames\\Path of Exile', 'InstallLocation');
  if (ggg) dirs.push([ggg, 'standalone']);
  dirs.push([path.win32.join(pf86, 'Grinding Gear Games', 'Path of Exile'), 'standalone']);
  const epicDir = path.win32.join(env.ProgramData || 'C:\\ProgramData', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests');
  const epic = epicInstall((io.list(epicDir) || []).filter(n => /\.item$/i.test(n)).map(n => io.read(path.win32.join(epicDir, n)) || ''));
  if (epic) dirs.push([epic, 'Epic']);
  dirs.push([path.win32.join(pf86, 'Steam', 'steamapps', 'common', 'Path of Exile'), 'Steam']);

  for (const [dir, src] of uniqueDirs(dirs.map(d => d[0])).map(d => dirs.find(x => x[0] === d))) {
    const exe = POE_EXES.map(e => path.win32.join(dir, e)).find(p => io.exists(p));
    if (!exe) continue;
    found.poeExe = exe; found.source.poe = src;
    found.clientTxt = path.win32.join(dir, 'logs', 'Client.txt');
    if (!io.exists(found.clientTxt)) found.logMissing = true;
    break;
  }

  const first = list => list.find(p => p && io.exists(p)) || null;
  const appData = env.APPDATA, local = env.LOCALAPPDATA;
  const pob = first([
    appData && path.win32.join(appData, 'Path of Building Community', 'Path of Building.exe'),
    local && path.win32.join(local, 'Programs', 'Path of Building Community', 'Path of Building.exe'),
    path.win32.join(pf, 'Path of Building Community', 'Path of Building.exe'),
    path.win32.join(pf86, 'Path of Building Community', 'Path of Building.exe'),
    env.ProgramData && path.win32.join(env.ProgramData, 'Path of Building Community', 'Path of Building.exe'),
  ]);
  if (pob) found.pobExe = pob;
  const apt = first([
    local && path.win32.join(local, 'Programs', 'Awakened PoE Trade', 'Awakened PoE Trade.exe'),
    path.win32.join(pf, 'Awakened PoE Trade', 'Awakened PoE Trade.exe'),
  ]);
  if (apt) found.aptExe = apt;
  return found;
}

// The log next to a chosen game exe (the logs folder of that install), whether it exists yet or not.
function logNextTo(exe) {
  return exe ? path.win32.join(path.win32.dirname(exe), 'logs', 'Client.txt') : null;
}

module.exports = { detectPaths, steamLibraries, epicInstall, parseRegValue, uniqueDirs, logNextTo, POE_EXES };
