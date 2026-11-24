'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { detectPaths, steamLibraries, parseRegValue, uniqueDirs, logNextTo } = require('../src/main/detect');

const fakeIo = ({ files = [], reads = {}, dirs = {}, reg = {}, env = {} }) => ({
  exists: p => files.includes(p),
  read: p => reads[p] ?? null,
  list: d => dirs[d] || [],
  reg: async (k, v) => reg[k + '|' + v] ?? null,
  env: { 'ProgramFiles(x86)': 'C:\\Program Files (x86)', ProgramFiles: 'C:\\Program Files', ProgramData: 'C:\\ProgramData', APPDATA: 'C:\\Users\\you\\AppData\\Roaming', LOCALAPPDATA: 'C:\\Users\\you\\AppData\\Local', ...env },
});

test('detect: Steam in a second library, with its log, in the vdf spelling', async () => {
  const vdf = '"libraryfolders"\n{\n "0" { "path" "C:\\\\Program Files (x86)\\\\Steam" }\n "1" { "path" "D:\\\\SteamLibrary" }\n}';
  const io = fakeIo({
    reg: { 'HKCU\\Software\\Valve\\Steam|SteamPath': 'c:/program files (x86)/steam' },
    reads: { 'c:\\program files (x86)\\steam\\steamapps\\libraryfolders.vdf': vdf },
    files: ['D:\\SteamLibrary\\steamapps\\common\\Path of Exile\\PathOfExile_x64Steam.exe', 'D:\\SteamLibrary\\steamapps\\common\\Path of Exile\\logs\\Client.txt'],
  });
  const f = await detectPaths(io);
  assert.equal(f.poeExe, 'D:\\SteamLibrary\\steamapps\\common\\Path of Exile\\PathOfExile_x64Steam.exe');
  assert.equal(f.clientTxt, 'D:\\SteamLibrary\\steamapps\\common\\Path of Exile\\logs\\Client.txt');
  assert.equal(f.logMissing, undefined);
  assert.equal(f.source.poe, 'Steam');
  // the main library comes back in the vdf's spelling, not the lowercase registry one
  const g = await detectPaths(fakeIo({ ...{ reg: io.reg ? { 'HKCU\\Software\\Valve\\Steam|SteamPath': 'c:/program files (x86)/steam' } : {} }, reads: { 'c:\\program files (x86)\\steam\\steamapps\\libraryfolders.vdf': vdf }, files: ['C:\\Program Files (x86)\\Steam\\steamapps\\common\\Path of Exile\\PathOfExile_x64Steam.exe'] }));
  assert.equal(g.poeExe, 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Path of Exile\\PathOfExile_x64Steam.exe');
});

test('detect: game found but never started (no log yet), standalone, Epic, tools', async () => {
  const sa = 'C:\\Program Files (x86)\\Grinding Gear Games\\Path of Exile';
  let f = await detectPaths(fakeIo({ files: [sa + '\\PathOfExile_x64.exe'] }));
  assert.equal(f.poeExe, sa + '\\PathOfExile_x64.exe'); assert.equal(f.source.poe, 'standalone');
  assert.equal(f.clientTxt, sa + '\\logs\\Client.txt'); assert.equal(f.logMissing, true);
  const man = 'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests';
  f = await detectPaths(fakeIo({ dirs: { [man]: ['abc.item', 'x.txt'] }, reads: { [man + '\\abc.item']: JSON.stringify({ DisplayName: 'Path of Exile', InstallLocation: 'E:\\Epic\\PathOfExile' }) },
    files: ['E:\\Epic\\PathOfExile\\PathOfExile_x64EGS.exe', 'C:\\Users\\you\\AppData\\Roaming\\Path of Building Community\\Path of Building.exe', 'C:\\Users\\you\\AppData\\Local\\Programs\\Awakened PoE Trade\\Awakened PoE Trade.exe'] }));
  assert.equal(f.poeExe, 'E:\\Epic\\PathOfExile\\PathOfExile_x64EGS.exe'); assert.equal(f.source.poe, 'Epic');
  assert.match(f.pobExe, /Path of Building\.exe$/); assert.match(f.aptExe, /Awakened PoE Trade\.exe$/);
  assert.deepEqual(await detectPaths(fakeIo({})), { source: {} }); // nothing found: nothing claimed
});

test('detect: vdf formats, reg output, case-insensitive dedupe, log next to an exe', () => {
  assert.deepEqual(steamLibraries('"path"\t\t"E:\\\\Games\\\\Steam"'), ['E:\\Games\\Steam']);
  const oldVdf = '"LibraryFolders"\n{\n\t"TimeNextStatsReport"\t\t"1634000000"\n\t"ContentStatsID"\t\t"-123"\n\t"1"\t\t"D:\\\\SteamLibrary"\n}';
  assert.deepEqual(steamLibraries(oldVdf), ['D:\\SteamLibrary']);
  const out = '\r\nHKEY_CURRENT_USER\\Software\\Valve\\Steam\r\n    SteamPath    REG_SZ    c:/program files (x86)/steam\r\n\r\n';
  assert.equal(parseRegValue(out, 'SteamPath'), 'c:/program files (x86)/steam');
  assert.equal(parseRegValue('    InstallLocation    REG_SZ    D:\\Games\\Path of Exile\\\r\n', 'InstallLocation'), 'D:\\Games\\Path of Exile\\');
  assert.equal(parseRegValue('', 'SteamPath'), null);
  assert.deepEqual(uniqueDirs(['C:\\Steam', 'c:/steam/', 'D:\\Lib']), ['C:\\Steam', 'D:\\Lib']);
  assert.equal(logNextTo('X:\\PoE\\PathOfExile.exe'), 'X:\\PoE\\logs\\Client.txt');
  assert.equal(logNextTo(''), null);
});
