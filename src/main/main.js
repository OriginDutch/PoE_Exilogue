'use strict';
const { app, BrowserWindow, nativeImage, ipcMain, globalShortcut, shell, dialog, screen, nativeTheme, powerMonitor } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile, spawn } = require('child_process');

const { JsonStore, deepMerge } = require('./store');
const { LeagueDb, checkFile } = require('./db');
const { IconStore } = require('./icons');
const { Wealth } = require('./wealth');
const { NinjaPrice, ITEM_TYPES: NINJA_TYPES, SHEET_TYPES } = require('./ninja');
const { shouldSync, WeSyncServer } = require('./wesync');
const { lastBuild } = require('./pob');
const { LogWatcher } = require('./logwatcher');
const { parseLine } = require('../core/parser');
const { Tracker, freshState } = require('../core/tracker');

const APP_NAME = 'Exilogue';
app.setName(APP_NAME);

const CARD_IDS = ['poe', 'maps', 'campaign', 'wealthy', 'overlay', 'filter', 'pob', 'apt', 'ninja', 'trade', 'goal', 'today', 'fate', 'threads', 'days', 'fun'];
const SIZES = ['xs', 's', 'm', 'l', 'xl'];

const DEFAULT_CONFIG = {
  paths: {
    clientTxt: 'C:\\Program Files (x86)\\Grinding Gear Games\\Path of Exile\\logs\\Client.txt',
    poeExe: 'C:\\Program Files (x86)\\Grinding Gear Games\\Path of Exile\\PathOfExile.exe',
    pobExe: '',
    aptExe: path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Awakened PoE Trade', 'Awakened PoE Trade.exe'),
  },
  // Started along with the game, only by Exilogue's Play button. They keep running after the game closes.
  // custom: [{ id, name, target (program .exe or https link), on }]
  launch: { pob: true, apt: true, we: true, custom: [] },
  // Background Wealthy Exile sync (needs the userscript and an open WE tab in Firefox).
  weSync: { background: true, everyMin: 30 },
  account: '',
  league: { name: 'Covens of Umbra', start: '2026/11/13 20:00:00' },
  overlay: {
    enabled: true,
    bounds: null,
    size: 'm',          // s | m | l
    font: 'app',        // app | source | bahnschrift | inter | segoe
    show: { zone: true, map: true, campaign: false, splits: false, session: true },
  },
  hotkeys: { toggleOverlay: 'Ctrl+Alt+T', unlockOverlay: 'Ctrl+Alt+L', focusDashboard: 'Ctrl+Alt+J', breakTaken: '' },
  // "Take a break?": asked after `everyMin` of play, ~10 s after leaving a map (or entering a town in the campaign).
  // sound: a short chime when "Take a break?" shows. Off for new installs; existing installs get it on once (see startup).
  breaks: { enabled: true, campaign: true, everyMin: 60, sound: { on: false, volume: 50, file: 'chime' } },
  // Home goal: an item to save for. Price from poe.ninja; `divines` is the fixed fallback when it isn't found.
  goal: { name: 'Mageblood', id: null, type: null, label: '', divines: null },
  // Cheat sheets: your own lists of items with poe.ninja prices (or your own). seeded: the first example sheet was made once.
  sheets: { list: [], active: null, seeded: false, win: { x: null, y: null, w: 440, h: 600, pin: false } },
  ui: {
    theme: 'system',      // system | dark | light
    darkPalette: 'night', // night | spectral | silver
    lightPalette: 'paper',
    font: 'source',       // source | bahnschrift | inter | segoe
    motion: true,
    sidebarCollapsed: false,
    welcomeDone: false,
  },
  layout: {
    order: CARD_IDS.slice(),
    sizes: { poe: 'xl' },
    hidden: {},
  },
  window: { bounds: null, maximized: false },
  neversink: { lastSyncedTag: null, syncedAt: null },
  // Lifetime disk counters (bytes), kept here so a rebuild, restore or new league doesn't reset them.
  io: { since: null, dbWritten: 0, backupWritten: 0, configWritten: 0, iconWritten: 0, wealthWritten: 0, logRead: 0, otherRead: 0 },
};

let config, leagueDb, tracker, watcher;
// Client.txt position that matches the tracker state in memory, and which log/start it belongs to.
let offsetNow = 0, fileNow = null, minStampNow = null, headNow = null;
let gen = 0;
let icons = null;
let wealth = null;
let wealthSyncAt = 0;
const WEALTH_URL = 'https://wealthyexile.com/'; // a direct /stash link lands on the home page anyway; the script navigates
const WEALTH_SYNC_MS = 5 * 60 * 1000;                  // bumps on every (re)start of tracking, so windows always get the new data
let pathsCache = null;
let gamePid = null, lastTasklist = 0;
const FLUSH_MS = 30 * 1000;   // league data is saved at most this often (plus on quit, backup and catch-up end)
const GAME_POLL_MS = 2000;    // while the game runs: is its process still there (no new process started)
const GAME_SEARCH_MS = 60 * 1000; // while it doesn't: look for it this often (the log's game-start line also triggers a look)
const KEEP_BACKUPS = 10;
let dashWin = null, overlayWin = null, overlayUnlocked = false;
let gameRunning = false, caughtUp = false, catchup = null, logMissing = false;
let neversinkLatest = null;
let hotkeyStatus = {};
let profileStatus = { state: 'none' }; // none | ok | private | notfound | error | offline

// ---------- config hygiene (also migrates v0.1 configs) ----------
function sanitizeConfig() {
  const c = config.data;
  if (!['source', 'bahnschrift', 'inter', 'segoe'].includes(c.ui.font)) c.ui.font = c.ui.font === 'bahn-all' || c.ui.font === 'bahn-body' ? 'bahnschrift' : 'source';
  if (c.ui.overlayFont) { c.overlay.font = c.ui.overlayFont === 'bahnschrift' ? 'bahnschrift' : 'app'; delete c.ui.overlayFont; }
  if (!['system', 'dark', 'light'].includes(c.ui.theme)) c.ui.theme = 'system';
  if (!['night', 'spectral', 'silver'].includes(c.ui.darkPalette)) c.ui.darkPalette = 'night';
  c.ui.lightPalette = 'paper';
  c.breaks.everyMin = Math.min(240, Math.max(15, Math.round(Number(c.breaks.everyMin) || 60)));
  if (!c.breaks.sound || typeof c.breaks.sound !== 'object' || Array.isArray(c.breaks.sound)) c.breaks.sound = { on: false, volume: 50, file: 'chime' };
  c.breaks.sound.on = !!c.breaks.sound.on;
  { const v = c.breaks.sound.volume; const n = v === null || v === '' ? NaN : Number(v); c.breaks.sound.volume = Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 50; }
  if (!['chime', 'shrine'].includes(c.breaks.sound.file)) c.breaks.sound.file = 'chime';
  c.goal.name = String(c.goal.name || '').slice(0, 80);
  // Picked in the goal search: poe.ninja's id of that exact line (variant, links, relic), its category and a short label.
  c.goal.id = c.goal.name && typeof c.goal.id === 'string' && /^[a-z0-9-]{1,120}$/.test(c.goal.id) ? c.goal.id : null;
  c.goal.type = c.goal.id && NINJA_TYPES.includes(c.goal.type) ? c.goal.type : null;
  c.goal.label = c.goal.id ? String(c.goal.label || '').slice(0, 80) : '';
  sanitizeSheets(c);
  c.weSync.everyMin = Math.min(180, Math.max(15, Math.round(Number(c.weSync.everyMin) || 30)));
  c.launch.custom = (Array.isArray(c.launch.custom) ? c.launch.custom : []).filter(x => x && typeof x.target === 'string' && x.target.trim()).slice(0, 20)
    .map((x, i) => ({ id: String(x.id || 'c' + Date.now().toString(36) + i).slice(0, 40), name: String(x.name || '').slice(0, 60) || path.basename(x.target.trim()).replace(/\.exe$/i, ''), target: x.target.trim().slice(0, 500), on: x.on !== false }));
  { const d = parseFloat(String(c.goal.divines ?? '').replace(',', '.')); c.goal.divines = Number.isFinite(d) && d > 0 ? d : null; }
  if (!['s', 'm', 'l'].includes(c.overlay.size)) c.overlay.size = 'm';
  // v0.6 Home is a new layout: an order from the old tile grid is replaced once by the new default.
  if (c.layout.v !== 6) { c.layout.order = ['poe', 'wealthy', 'ninja', 'maps', 'pob', 'campaign', 'filter', 'overlay', 'apt', 'today']; c.layout.v = 6; }
  const order = (c.layout.order || []).filter(id => CARD_IDS.includes(id));
  for (const id of CARD_IDS) if (!order.includes(id)) order.push(id);
  c.layout.order = order;
  for (const [id, sz] of Object.entries(c.layout.sizes || {})) if (!SIZES.includes(sz)) delete c.layout.sizes[id];
  delete c.links; delete c.background;
}

// ---------- windows ----------
function createDashboard() {
  const wb = config.data.window;
  dashWin = new BrowserWindow({
    width: wb.bounds?.width || 1360, height: wb.bounds?.height || 880,
    x: wb.bounds?.x, y: wb.bounds?.y,
    minWidth: 720, minHeight: 520,
    frame: false, backgroundColor: '#0a0f18', title: APP_NAME, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: false },
  });
  dashWin.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  dashWin.once('ready-to-show', () => { if (wb.maximized) dashWin.maximize(); dashWin.show(); });
  const sendState = () => dashWin && dashWin.webContents.send('win:state', { maximized: dashWin.isMaximized() });
  dashWin.on('maximize', sendState);
  dashWin.on('unmaximize', sendState);
  const saveBounds = () => {
    if (!dashWin || dashWin.isMinimized()) return;
    config.data.window.maximized = dashWin.isMaximized();
    if (!dashWin.isMaximized()) config.data.window.bounds = dashWin.getBounds();
    config.saveSoon();
  };
  dashWin.on('resized', saveBounds);
  dashWin.on('moved', saveBounds);
  dashWin.on('maximize', saveBounds);
  dashWin.on('unmaximize', saveBounds);
  dashWin.on('focus', () => { refreshPaths(); if (wealth) wealth.scan(); refreshPobBuild(); }); // a path may have been fixed; an export may have been missed
  dashWin.on('session-end', finalSave); // Windows shutdown or logoff: will-quit doesn't come
  dashWin.on('closed', () => { dashWin = null; app.quit(); });
}

function createOverlay() {
  const b = config.data.overlay.bounds;
  const wa = screen.getPrimaryDisplay().workArea;
  overlayWin = new BrowserWindow({
    width: b?.width || 280, height: b?.height || 200,
    x: b?.x ?? wa.x + wa.width - 320, y: b?.y ?? wa.y + 120,
    frame: false, transparent: true, resizable: false, skipTaskbar: true, focusable: false,
    alwaysOnTop: true, hasShadow: false, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: false },
  });
  overlayWin.setAlwaysOnTop(true, 'screen-saver');
  overlayWin.setVisibleOnAllWorkspaces(true);
  overlayWin.loadFile(path.join(__dirname, '..', 'overlay', 'overlay.html'));
  overlayWin.webContents.once('did-finish-load', () => setOverlayLocked(true));
  overlayWin.on('moved', saveOverlayBounds);
  overlayWin.once('ready-to-show', updateOverlayVisibility);
}

let overlayWide = null; // the user's own { x, width } while the break popup widens the window
function saveOverlayBounds() {
  if (!overlayWin || overlayWide) return;
  config.data.overlay.bounds = overlayWin.getBounds();
  config.saveSoon();
}

function setOverlayLocked(locked) {
  overlayUnlocked = !locked;
  if (!overlayWin) return;
  overlayWin.setIgnoreMouseEvents(locked, { forward: true });
  overlayWin.setFocusable(!locked);
  updateOverlayVisibility();
  overlayWin.webContents.send('overlay:unlocked', !locked);
  broadcastConfig();
}

function setOverlayEnabled(on) {
  config.data.overlay.enabled = on;
  config.saveSoon();
  if (!overlayWin) return;
  if (!on && overlayUnlocked) setOverlayLocked(true);
  updateOverlayVisibility();
  broadcastConfig();
}

// The overlay only sits over the game while the game runs (or while unlocked, to place it).
function updateOverlayVisibility() {
  if (!overlayWin || overlayWin.isDestroyed()) return;
  const show = overlayUnlocked || (config.data.overlay.enabled && gameRunning);
  if (show && !overlayWin.isVisible()) overlayWin.showInactive();
  else if (!show && overlayWin.isVisible()) overlayWin.hide();
}

// ---------- tracking ----------
// Saves the tracker state, the new events/maps and the Client.txt offset together, in one transaction.
// Only what changed is written; nothing at all when nothing happened.
// The 30 s timer skips saves where only the read position moved (chat, AFK lines): those lines changed nothing,
// so reading them again after a crash is harmless. Quit, backups and catch-up always save (force).
let flushedRev = -1, flushedTracker = null;
function flushLeague({ force = true } = {}) {
  if (!leagueDb || !tracker) return;
  annotateSessions(); // before the "nothing changed" check: the 30-minute wealth recheck may change something
  if (!force && flushedTracker === tracker && flushedRev === tracker.rev) return;
  const pending = tracker.takePending();
  try {
    leagueDb.commit({ tracker: tracker.s, meta: { offset: offsetNow, file: fileNow, minStamp: minStampNow, head: headNow }, pending });
    flushedTracker = tracker; flushedRev = tracker.rev;
  } catch (e) {
    // Keep them for the next try.
    tracker.pending.events.unshift(...pending.events);
    tracker.pending.maps.unshift(...pending.maps);
    console.error('Saving league data failed:', e.message);
  }
}

// Old state.json format (v0.3 and earlier): { tracker, offset, file }. Null when unreadable.
function readLegacyJson(file) {
  try {
    const text = fs.readFileSync(file, 'utf8');
    config.data.io.otherRead += Buffer.byteLength(text);
    const data = JSON.parse(text);
    return data && data.tracker && typeof data.tracker === 'object' ? data : null;
  } catch { return null; }
}
function importLegacy(data) {
  const t = new Tracker(data.tracker); // inline events/maps become pending
  leagueDb.commit({ tracker: t.s, meta: { offset: data.offset || 0, file: data.file || null, minStamp: null, head: null }, pending: t.takePending() });
}

function startTracking() {
  if (watcher) { watcher.stop(); collectIo(); }
  gen++;
  wealthRecheck.length = 0; // events of the old tracker never go into the new one
  const saved = leagueDb.load();
  if (saved.tracker && saved.file &&
      (saved.file !== config.data.paths.clientTxt || (saved.minStamp && saved.minStamp !== config.data.league.start))) {
    // Config and saved stats disagree (config.json lost or reset, or a backup made for another log or start was restored).
    // The stats win: reading a different log on top of them would count everything twice.
    config.data.paths.clientTxt = saved.file;
    if (saved.minStamp) config.data.league.start = saved.minStamp;
    config.save();
    refreshPaths();
    broadcastConfig();
  }
  const file = config.data.paths.clientTxt;
  tracker = new Tracker(saved.tracker || freshState(), { maps: saved.maps, tail: saved.tail });
  // A save without a file (old v0.3 data) belongs to the configured log.
  const same = !!saved.tracker && (saved.file === file || saved.file == null);
  offsetNow = same ? saved.offset : 0;
  headNow = same ? saved.head : null;
  fileNow = file;
  minStampNow = config.data.league.start;
  caughtUp = false; catchup = null;
  ioSeen.log = 0;
  watcher = new LogWatcher({ file, offset: offsetNow, minStamp: minStampNow, head: headNow });
  watcher.on('head', h => { headNow = h; });
  watcher.on('replaced', () => console.log('Client.txt was replaced; reading the new file from the league start.'));
  watcher.on('lines', lines => {
    logMissing = false;
    for (const l of lines) {
      let ev = null;
      try { ev = parseLine(l); tracker.apply(ev); } catch (e) { console.error('Skipped a log line:', e.message); }
      // The game just started (maybe a quick restart): look up its process now.
      if (ev && ev.type === 'logOpen' && caughtUp) setImmediate(checkGameProcess);
    }
    if (tracker.s.unknownName) { tracker.s.unknownName = null; refreshProfileSoon(); }
    // A zone change hides "Take a break?" (and its splash) at once instead of at the next 2 s tick.
    if (breakPrompt && tracker.s.area && tracker.s.area.enteredAt !== breakPrompt.areaAt) breakTick();
  });
  watcher.on('error', e => console.error('Client.txt read error, retrying:', e.message));
  const markCaughtUp = () => {
    if (caughtUp) return;
    caughtUp = true; catchup = null;
    if (gameRunning) {
      // Game is running right now: time since the last log line was played time.
      tracker.s.paused = false;
      tracker.setPaused(false, Date.now());
    } else {
      // Not running: if the saved state still had the game open (app closed or crashed before noticing),
      // the session ended at the last log line.
      tracker.setPaused(true, tracker.s.paused ? null : tracker.s.lastT);
    }
    flushLeague(); // a long catch-up is worth keeping right away
  };
  // Offset of the last complete line; saved together with the tracker state on the next flush.
  watcher.on('offset', off => { offsetNow = off; });
  watcher.on('done', markCaughtUp);
  watcher.on('idle', () => { logMissing = false; markCaughtUp(); });
  watcher.on('catchup', c => { catchup = { ...c, at: c.from }; });
  watcher.on('progress', p => { if (catchup) catchup.at = p.at; });
  watcher.on('missing', () => { logMissing = true; });
  watcher.start();
  setTimeout(checkProfile, 500); // a fresh tracker needs the character list again
}

function setGameRunning(running) {
  if (running === gameRunning) return;
  gameRunning = running;
  // A downloaded update installs when Exilogue closes, but never while the game runs.
  if (autoUpdater) autoUpdater.autoInstallOnAppQuit = !running;
  if (caughtUp && tracker) tracker.setPaused(!running, Date.now());
  updateOverlayVisibility();
}

// Full process list (starts tasklist.exe): only while the game isn't known to run.
function checkGameProcess() {
  return new Promise(resolve => {
    if (process.platform !== 'win32') return resolve();
    lastTasklist = Date.now();
    execFile('tasklist', ['/NH', '/FO', 'CSV'], { windowsHide: true }, (err, out) => {
      if (!err) {
        const m = /"PathOfExile(?:_x64)?(?:Steam|EGS)?\.exe","(\d+)"/i.exec(out);
        gamePid = m ? Number(m[1]) : null;
        setGameRunning(!!gamePid);
      }
      resolve();
    });
  });
}

// Every 2 s: with a known game process, just ask Windows whether that process still exists (no new process).
function gameTick() {
  if (process.platform !== 'win32') return;
  if (gamePid) {
    try { process.kill(gamePid, 0); } catch (e) {
      if (e.code === 'EPERM') return; // exists, just not ours
      // That process is gone. Confirm with a full list: after a quick restart a new game process may already run.
      gamePid = null;
      checkGameProcess();
    }
    return;
  }
  if (Date.now() - lastTasklist >= GAME_SEARCH_MS) checkGameProcess();
}

function pathStatus() {
  const p = config.data.paths;
  const ok = f => !!f && fs.existsSync(f);
  return { clientTxt: ok(p.clientTxt), poeExe: ok(p.poeExe), pobExe: ok(p.pobExe), aptExe: ok(p.aptExe) };
}
// Checked on start, on config changes and when the dashboard gets focus; not every second.
function refreshPaths() { pathsCache = pathStatus(); }

function snapshot() {
  const ws = wealth ? wealth.summary(leagueStartMs()) : null;
  return {
    now: Date.now(),
    gameRunning, caughtUp, catchup, logMissing,
    paths: pathsCache || (pathsCache = pathStatus()),
    neversink: { latest: neversinkLatest, ...config.data.neversink },
    hotkeys: hotkeyStatus,
    overlayUnlocked,
    profileStatus,
    stateCorrupt: leagueDb && leagueDb.corruptFile ? path.basename(leagueDb.corruptFile) : null,
    stats: tracker ? tracker.snapshot(Date.now()) : null,
    iconsRev: icons ? icons.rev : 0,
    wealth: wealth ? { ...ws, history: wealthHistory(), syncAt: wealthSyncAt, syncEvery: WEALTH_SYNC_MS, manualExpiredAt: weManualExpiredAt, failAt: weFailAt, scriptSeenAt: weScriptSeenAt, bgSyncAt: weBgSyncAt, serverError: weServer && weServer.error } : null,
    divRate: sessionDivRate(),
    breakPrompt,
    goal: goalInfo(),
    prices: pricesInfo(ws),
    sheets: sheetsInfo(),
    apt: aptInfo(),
    pobBuild,
    today: todayStats(),
    mostRun: mostRunLeague(),
    league: leagueStats(),
    update: updateState,
  };
}

// Every second: a full snapshot only to windows that haven't seen the current data yet,
// otherwise just the running timers. Hidden or minimized windows get nothing (they catch up when shown).
const sentKey = new Map(); // webContents id -> data key last sent
const hiddenWc = new Set(); // windows whose page reports it can't be seen (covered by the game, etc.)
let lastIdleTick = 0;
function statusKey() {
  return JSON.stringify([gen, updateState, breakPrompt && [breakPrompt.shownAt, breakPrompt.revealed], ninja.rev, sheetCache.rev, config.data.goal, aptRunning, aptLaunchedAt, pobBuild && pobBuild.file + pobBuild.mtime, icons ? icons.rev : 0, wealth ? [(weManualTick(), wealth.rev), wealth.lastError, wealthSyncAt, weBgSyncAt, weManualExpiredAt, weFailAt, Math.floor(weScriptSeenAt / 300000)] : 0, tracker ? tracker.rev : -1, gameRunning, caughtUp, catchup, logMissing, hotkeyStatus, overlayUnlocked,
    profileStatus, neversinkLatest, config.data.neversink, pathsCache, leagueDb && leagueDb.corruptFile]);
}
function broadcast() {
  const wins = [dashWin, overlayWin, sheetWin].filter(w => w && !w.isDestroyed() && w.isVisible() && !w.isMinimized() && !hiddenWc.has(w.webContents.id));
  if (!wins.length) return;
  const key = statusKey();
  const now = Date.now();
  // Paused: the timers stand still, so a tick only every 30 s (for "x minutes ago" texts).
  const idle = !tracker || tracker.s.paused;
  const tickNow = !idle || now - lastIdleTick >= 30000;
  if (idle && tickNow) lastIdleTick = now;
  let snap = null, tick = null;
  for (const w of wins) {
    const id = w.webContents.id;
    if (sentKey.get(id) !== key) {
      w.webContents.send('snapshot', snap || (snap = snapshot()));
      sentKey.set(id, key);
    } else if (tracker && tickNow) {
      w.webContents.send('tick', tick || (tick = { now, live: tracker.liveSnapshot(now) }));
    }
  }
}

function effectiveConfig() {
  return { ...config.data, systemDark: nativeTheme.shouldUseDarkColors, overlayUnlocked, platform: process.platform };
}

function broadcastConfig() {
  const c = effectiveConfig();
  for (const w of [dashWin, overlayWin, sheetWin]) if (w && !w.isDestroyed()) w.webContents.send('config', c);
}

// ---------- NeverSink release check (GitHub, public) ----------
// The bullet points of a GitHub release text, as plain lines (no markdown), at most 40.
function releaseNotes(body) {
  if (typeof body !== 'string') return [];
  return body.split(/\r?\n/).map(l => l.trim()).filter(l => /^([-*•]|\d+\.)\s+/.test(l))
    .map(l => l.replace(/^([-*•]|\d+\.)\s+/, '').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`]+/g, '').replace(/<[^>]+>/g, '').trim())
    .filter(Boolean).slice(0, 40).map(l => l.slice(0, 300));
}

// ---------- Path of Building: last edited build ----------
let pobBuild = null, pobCheckedAt = 0;
function refreshPobBuild(force) {
  if (!force && Date.now() - pobCheckedAt < 30 * 1000) return;
  pobCheckedAt = Date.now();
  try { pobBuild = lastBuild(path.join(app.getPath('documents'), 'Path of Building', 'Builds'), pobBuild); } catch { pobBuild = null; }
}

async function checkNeverSink() {
  try {
    const r = await fetch('https://api.github.com/repos/NeverSinkDev/NeverSink-Filter/releases/latest',
      { headers: { 'User-Agent': 'exilogue' } });
    if (!r.ok) return;
    const j = await r.json();
    neversinkLatest = { tag: j.tag_name, name: j.name, publishedAt: j.published_at, url: j.html_url, notes: releaseNotes(j.body) };
  } catch { /* offline: ignore */ }
}

// ---------- public profile (GGG character list; works without login when the profile is public) ----------
async function checkProfile() {
  const acc = (config.data.account || '').trim();
  if (!acc) { profileStatus = { state: 'none' }; return; }
  try {
    const url = `https://www.pathofexile.com/character-window/get-characters?accountName=${encodeURIComponent(acc)}&realm=pc`;
    const r = await fetch(url, { headers: { 'User-Agent': `Exilogue/${app.getVersion()} (personal companion app)` } });
    if (r.status === 403) { profileStatus = { state: 'private', at: Date.now() }; return; }
    if (r.status === 404) { profileStatus = { state: 'notfound', at: Date.now() }; return; }
    if (r.status === 429) { profileStatus = { ...profileStatus, state: 'error', error: 'Rate limited, retrying later', at: Date.now() }; return; }
    if (!r.ok) { profileStatus = { state: 'error', error: 'HTTP ' + r.status, at: Date.now() }; return; }
    const list = await r.json();
    if (!Array.isArray(list)) { profileStatus = { state: 'private', at: Date.now() }; return; }
    const chars = list.map(c => ({ name: c.name, class: c.class, level: c.level, league: c.league, lastLoginTime: c.lastLoginTime || 0 }));
    profileStatus = { state: 'ok', count: chars.length, at: Date.now() };
    if (tracker) tracker.setProfile(chars, Date.now());
  } catch {
    profileStatus = { ...profileStatus, state: profileStatus.state === 'ok' ? 'ok' : 'offline', at: Date.now() };
  }
}

let profileSoon = null, profileLast = 0;
function refreshProfileSoon() {
  if (profileSoon) return;
  const wait = Math.max(0, 30000 - (Date.now() - profileLast));
  profileSoon = setTimeout(() => { profileSoon = null; profileLast = Date.now(); checkProfile(); }, wait);
}

// ---------- hotkeys ----------
const HOTKEY_ACTIONS = {
  toggleOverlay: () => setOverlayEnabled(!config.data.overlay.enabled),
  unlockOverlay: () => setOverlayLocked(overlayUnlocked),
  focusDashboard: () => { if (dashWin) { if (dashWin.isMinimized()) dashWin.restore(); dashWin.show(); dashWin.focus(); } },
  breakTaken: () => takeBreak(),
};

function registerHotkeys() {
  globalShortcut.unregisterAll();
  const hk = config.data.hotkeys;
  hotkeyStatus = {};
  const seen = {};
  for (const [key, fn] of Object.entries(HOTKEY_ACTIONS)) {
    const acc = hk[key];
    if (!acc) { hotkeyStatus[key] = 'none'; continue; }
    if (seen[acc]) { hotkeyStatus[key] = 'duplicate'; hotkeyStatus[seen[acc]] = 'duplicate'; continue; }
    seen[acc] = key;
    try {
      hotkeyStatus[key] = globalShortcut.register(acc, fn) ? 'ok' : 'taken';
    } catch {
      hotkeyStatus[key] = 'invalid';
    }
  }
}

// ---------- breaks ----------
// Idle = no mouse/keyboard input anywhere in Windows (powerMonitor; no hooks, no keylogging).
// A minute of idle counts as a break, from the moment the input stopped.
const BREAK_IDLE_MS = 60 * 1000;
const BREAK_SNOOZE_MS = 30 * 60 * 1000;
// Shows ~3 s after you arrive in a hideout or town and stays until you enter the next zone (or go away from the PC).
const BREAK_AFTER_ZONE_MS = 3 * 1000;
let idleSince = null;      // start of the current idle stretch (only once it is long enough to matter)
let breakPrompt = null;    // { shownAt, sinceMs, areaAt, revealed, splash } while "Take a break?" is on screen
// First "Time for a break?" big in the middle of the screen for 1.5 s, sliding to the overlay in 0.5 s (splash window);
// the overlay shows the regular popup once `revealed`.
const BREAK_SPLASH_MS = 2000;
let splashWin = null, splashTimer = null;
function closeSplash() {
  clearTimeout(splashTimer); splashTimer = null;
  if (splashWin && !splashWin.isDestroyed()) splashWin.destroy();
  splashWin = null;
}
function revealBreak(shownAt) {
  closeSplash();
  const bp = breakPrompt;
  if (!bp || bp.shownAt !== shownAt || bp.revealed) return;
  // Still in the hideout/town it was meant for? A zone change during the splash means: never show it.
  const a = tracker && tracker.s.area;
  if (!a || a.enteredAt !== bp.areaAt) { breakPrompt = null; breakSnoozeUntil = Date.now() + BREAK_SNOOZE_MS; broadcast(); return; }
  bp.revealed = true;
  broadcast();
}
function startBreakSplash() {
  const bp = breakPrompt;
  const ovShown = overlayWin && !overlayWin.isDestroyed() && overlayWin.isVisible() && !overlayUnlocked;
  // No overlay on screen (off, or unlocked to move it): nowhere to slide to, no popup to see, and no sound.
  if (!ovShown) { bp.revealed = true; bp.silent = true; return; }
  try {
    const ov = overlayWin.getBounds();
    const disp = screen.getDisplayMatching(ov), d = disp.bounds, wa = disp.workArea;
    // Same side rule as the overlay (its screen.availLeft/availWidth = this display's work area). The popup is 200 px
    // wide inside 14 px window padding and centred on the overlay's height.
    const right = ov.x + ov.width + 210 <= wa.x + wa.width;
    const tx = Math.round((right ? ov.x + ov.width + 96 : ov.x - 96) - d.x);
    const ty = Math.round(ov.y + ov.height / 2 - d.y);
    const s = config.data.breaks.sound, ui = config.data.ui;
    splashWin = new BrowserWindow({
      x: d.x, y: d.y, width: d.width, height: d.height,
      frame: false, transparent: true, resizable: false, movable: false, skipTaskbar: true, focusable: false,
      alwaysOnTop: true, hasShadow: false, show: false,
      webPreferences: { contextIsolation: true, sandbox: true },
    });
    splashWin.setIgnoreMouseEvents(true);
    splashWin.setAlwaysOnTop(true, 'screen-saver');
    splashWin.loadFile(path.join(__dirname, '..', 'overlay', 'splash.html'), { query: {
      tx: String(tx), ty: String(ty), motion: ui.motion ? '1' : '0', pal: ui.darkPalette,
      snd: s.on && s.volume > 0 ? '1' : '0', vol: String(s.volume), sound: s.file || 'chime',
    } });
    bp.splash = true;
    const at = bp.shownAt;
    const win = splashWin;
    // The splash's own 1.5 s + 0.5 s start when its page has loaded; so does this clock (else a slow load eats the slide).
    win.once('ready-to-show', () => {
      if (win.isDestroyed() || splashWin !== win) return;
      win.showInactive();
      clearTimeout(splashTimer); splashTimer = setTimeout(() => revealBreak(at), BREAK_SPLASH_MS);
    });
    // Never loads (or crashes): no splash after all; the overlay shows the popup and plays the sound itself.
    const fail = () => {
      if (splashWin !== win) return;
      closeSplash();
      if (breakPrompt && breakPrompt.shownAt === at) { breakPrompt.splash = false; revealBreak(at); }
    };
    win.webContents.once('did-fail-load', fail);
    win.webContents.once('render-process-gone', fail);
    splashTimer = setTimeout(fail, 4000);
  } catch { closeSplash(); bp.revealed = true; bp.splash = false; }
}
let breakSnoozeUntil = 0;

function takeBreak() {
  breakPrompt = null; closeSplash();
  if (tracker && tracker.s.session && !tracker.s.session.ended) { const now = Date.now(); tracker.addBreak(now, now, 'manual'); }
}

function breakTick() {
  if (!tracker || !caughtUp || !gameRunning) { idleSince = null; breakPrompt = null; closeSplash(); return; }
  const se = tracker.s.session;
  if (!se || se.ended) { if (breakPrompt) { breakPrompt = null; closeSplash(); } return; } // session over: nothing to ask
  const now = Date.now();
  const idleMs = powerMonitor.getSystemIdleTime() * 1000;
  if (idleMs >= BREAK_IDLE_MS) {
    if (idleSince == null) idleSince = now - idleMs;
    breakPrompt = null; closeSplash();
    return;
  }
  if (idleSince != null) { // back from being away
    const end = now - idleMs;
    if (end - idleSince >= BREAK_IDLE_MS) tracker.addBreak(idleSince, end, 'idle');
    idleSince = null;
  }
  if (breakPrompt) {
    const a = tracker.s.area;
    const moved = !a || a.enteredAt !== breakPrompt.areaAt; // the next zone (a map, another town): gone at once
    if (moved) { breakPrompt = null; closeSplash(); breakSnoozeUntil = now + BREAK_SNOOZE_MS; }
    return;
  }
  const b = config.data.breaks;
  if (!b.enabled || now < breakSnoozeUntil) return;
  const since = now - (se.lastBreakEnd || se.start);
  if (since < b.everyMin * 60e3) return;
  // Never in a map or in the middle of a campaign zone: only shortly after arriving in a hideout or town.
  const area = tracker.s.area;
  if (!area || (area.kind !== 'hideout' && area.kind !== 'town')) return;
  const inCampaign = tracker.liveSnapshot(now).runId != null; // an unfinished campaign run is going
  if (area.kind === 'town' && inCampaign && !b.campaign) return;
  if (area.enteredAt == null || now - area.enteredAt < BREAK_AFTER_ZONE_MS) return;
  breakPrompt = { shownAt: now, sinceMs: since, areaAt: area.enteredAt, revealed: false, splash: false };
  startBreakSplash();
}

// div per hour this session, from the Wealthy Exile exports around it (null until there are two).
function sessionDivRate() {
  const se = tracker && tracker.s.session;
  if (!wealth || !se) return null;
  try { return wealth.sessionChange(se.start, se.ended || Date.now(), sessionBreaks(se.start, se.ended || Date.now())); } catch { return null; }
}
const sessionBreaks = (from, to) => tracker.tail.filter(e => e.type === 'break' && e.t >= from && e.t <= to).map(e => ({ t: e.t, ms: e.ms || 0 }));

// Session summaries get the wealth change of that session before they are saved, and once more
// 30 minutes after the session (an export made after closing the game then still counts; the event row is replaced).
const wealthRecheck = []; // sessEnd events still waiting for their final wealth figure
function annotateOne(ev) {
  let ch = null;
  try { ch = wealth.sessionChange(ev.summary.start, ev.summary.end, sessionBreaks(ev.summary.start, ev.summary.end)); } catch { /* none */ }
  const changed = ev.summary.wealthDiv !== (ch ? ch.divines : null) || ev.summary.divPerHour !== (ch ? ch.perHour : null);
  ev.summary.wealthDiv = ch ? ch.divines : null;
  ev.summary.divPerHour = ch ? ch.perHour : null;
  const ls = tracker.s.lastSession;
  if (changed && ls && ls.start === ev.summary.start) { ls.wealthDiv = ev.summary.wealthDiv; ls.divPerHour = ev.summary.divPerHour; tracker.rev++; }
  return changed;
}
function annotateSessions() {
  if (!tracker || !wealth) return;
  for (const ev of tracker.pending.events) {
    if (ev.type !== 'sessEnd' || !ev.summary || 'wealthDiv' in ev.summary) continue;
    annotateOne(ev);
    if (Date.now() - ev.summary.end < 30 * 60e3) wealthRecheck.push(ev);
  }
  for (let i = wealthRecheck.length - 1; i >= 0; i--) {
    const ev = wealthRecheck[i];
    if (Date.now() - ev.summary.end < 31 * 60e3) continue;
    wealthRecheck.splice(i, 1);
    if (annotateOne(ev) && !tracker.pending.events.includes(ev)) tracker.pending.events.push(ev); // saved again (same seq: replaces the row)
  }
}

// ---------- background Wealthy Exile sync ----------
let weServer = null, weScriptSeenAt = 0, weBgSyncAt = 0;
// Tile button: the request waits here until the userscript asks (WE redirects / to /stash and drops the #marker,
// so the URL can't carry it). Handed out once. Valid 45 s when an open tab should pick it up, 2 min for a new tab.
let weManualAt = 0, weManualTtl = 0, weManualExpiredAt = 0, weForceTab = false, weFailAt = 0;
// Every "go" gets an id; /we-sync/failed?id=… undoes exactly that one (several WE tabs can be open).
const weGos = new Map(); let weGoSeq = 0;
// Background syncs that fail back off: 5, 10, 20, 40 min … up to the normal interval. Reset once an export arrives.
let weBgFails = 0, weBgFailAt = 0;
function weManualTick(now = Date.now()) {
  if (weManualAt && now - weManualAt > weManualTtl) {
    weManualAt = 0; wealthSyncAt = 0; // nobody picked it up: unlock the button, next press opens a new tab
    weManualExpiredAt = now; weForceTab = true;
  }
}
function weGo(kind, extra) {
  const id = ++weGoSeq;
  weGos.set(id, { kind, at: Date.now(), ...extra });
  for (const [k, g] of weGos) if (Date.now() - g.at > 10 * 60e3) weGos.delete(k);
  return { go: true, id };
}
function weDecide({ busy } = {}) {
  const now = Date.now();
  weManualTick(now);
  // A tab that is already syncing does what the button asked for: count the request as picked up.
  if (busy) { if (weManualAt) weManualAt = 0; return { go: false }; }
  if (weManualAt) { weManualAt = 0; return weGo('manual'); }
  if (!wealth) return { go: false };
  const lastExport = wealth.latestAt() || 0;
  if (weBgFails && lastExport > weBgFailAt) weBgFails = 0;
  const b = config.data.weSync;
  const go = caughtUp && shouldSync({
    enabled: b.background, everyMin: b.everyMin, gameRunning, now,
    idleMs: powerMonitor.getSystemIdleTime() * 1000,
    lastSyncAt: Math.max(wealthSyncAt, weBgSyncAt), lastExportAt: lastExport,
  });
  if (!go) return { go: false };
  weBgSyncAt = now;
  return weGo('bg');
}
function weFailed(id) {
  let g = id ? weGos.get(id) : null;
  if (!id) { const last = [...weGos.keys()].pop(); g = last ? weGos.get(last) : null; id = last; } // scripts before v1.8 send no id
  if (!g) return;
  weGos.delete(id);
  const now = Date.now();
  if (g.kind === 'manual') { wealthSyncAt = 0; weFailAt = now; return; }
  weBgFails++; weBgFailAt = now;
  const every = config.data.weSync.everyMin * 60e3;
  const wait = Math.min(5 * 60e3 * 2 ** (weBgFails - 1), every);
  weBgSyncAt = now - every + wait; // next background try in `wait`
}
function startWeSync() {
  weServer = new WeSyncServer({ decide: weDecide, onAsk: () => { weScriptSeenAt = Date.now(); }, onFailed: weFailed });
  weServer.start();
}

// ---------- launching tools along with the game ----------
// Image names of running programs (one tasklist call), to skip tools that are already open.
function runningImages() {
  return new Promise(resolve => {
    if (process.platform !== 'win32') return resolve(new Set());
    execFile('tasklist', ['/FO', 'CSV', '/NH'], { windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, out) => {
      if (err) return resolve(new Set());
      resolve(new Set(String(out).split(/\r?\n/).map(l => (l.match(/^"([^"]+)"/) || [])[1]).filter(Boolean).map(n => n.toLowerCase())));
    });
  });
}
async function launchCompanions() {
  const L = config.data.launch, P = config.data.paths;
  const list = [];
  if (L.pob && P.pobExe) list.push(P.pobExe);
  if (L.apt && P.aptExe) list.push(P.aptExe);
  // Wealthy Exile: not when a WE tab is already open (its userscript asked us something in the last 3 minutes).
  if (L.we && !(weScriptSeenAt && Date.now() - weScriptSeenAt < 3 * 60e3)) list.push(WEALTH_URL);
  for (const c of L.custom) if (c.on) list.push(c.target);
  const running = await runningImages();
  const results = [];
  for (const t of list) {
    if (/^https:\/\//i.test(t)) { shell.openExternal(t); results.push({ target: t, ok: true }); continue; }
    if (running.has(path.basename(t).toLowerCase())) { results.push({ target: t, ok: true, skipped: 'running' }); continue; }
    const r = await launchExe(t);
    if (r.ok && t === P.aptExe) { aptLaunchedAt = Date.now(); aptRunning = true; }
    results.push({ target: t, ...r });
  }
  return results;
}

// ---------- goal, prices & today ----------
const ninja = new NinjaPrice({ fetch, userAgent: `Exilogue/${app.getVersion()} (personal companion app)` });
function goalInfo() {
  const g = config.data.goal;
  if (!g.name) return null;
  const live = ninja.get(config.data.league.name, g);
  const price = live && live.divines ? live.divines : g.divines;
  return { name: g.name, label: g.label || '', art: goalArtId(g), price: price || null, source: live && live.divines ? 'ninja' : g.divines ? 'fixed' : null, approx: !!(live && live.divines && live.approx), at: live ? live.at : null, change: live ? live.change : null };
}
// Divine price and 24 h changes for the items in your latest export (only what poe.ninja data already loaded knows).
function pricesInfo(w) {
  const c = ninja.currency;
  const changes = {};
  for (const t of (w && w.top) || []) { const ch = ninja.change(t.name); if (ch != null) changes[t.name] = ch; }
  return { divineChaos: c ? c.divineChaos : null, at: c ? c.at : null, changes };
}
// Net worth over the league for the Home chart: at most 40 points (one per export, thinned evenly).
function wealthHistory() {
  try { return wealth.history(leagueStartMs(), 40); } catch { return []; }
}

// The map (and tier) you ran most this league: a neutral fact, counted over all maps.
function mostRunLeague() {
  if (!tracker || !tracker.maps.length) return null;
  const by = new Map();
  for (const m of tracker.maps) { const k = `${m.zone || m.areaId}|${m.tier || 0}`; by.set(k, (by.get(k) || 0) + 1); }
  let best = null;
  for (const [k, n] of by) if (!best || n > best.runs) { const [zone, t] = k.split('|'); best = { zone, tier: Number(t) || null, runs: n }; }
  return best;
}

// ---------- auto-update (installed version only) ----------
// GitHub Releases of the repo; downloads in the background, installs when Exilogue closes,
// or right away from the "Restart" button — which is never offered while the game runs.
let updateState = { state: 'off', version: app.getVersion() }; // off | checking | none | downloading | ready | error
let autoUpdater = null;
function startUpdater() {
  // A zip copy (no app-update.yml) can't update itself: only the installed app checks.
  if (!app.isPackaged || !fs.existsSync(path.join(process.resourcesPath, 'app-update.yml'))) return;
  try { ({ autoUpdater } = require('electron-updater')); } catch { return; }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = !gameRunning;
  autoUpdater.logger = null;
  const set = s => { updateState = { ...updateState, ...s, at: Date.now() }; };
  autoUpdater.on('checking-for-update', () => set({ state: 'checking' }));
  autoUpdater.on('update-not-available', () => set({ state: 'none' }));
  autoUpdater.on('update-available', i => set({ state: 'downloading', next: i && i.version, pct: 0 }));
  autoUpdater.on('download-progress', p => { const pct = Math.round(p.percent || 0); if (pct - (updateState.pct || 0) >= 10) set({ pct }); });
  autoUpdater.on('update-downloaded', i => set({ state: 'ready', next: i && i.version }));
  autoUpdater.on('error', e => set({ state: 'error', error: String((e && e.message) || e).split('\n')[0].slice(0, 160) }));
  const check = () => { if (updateState.state !== 'ready' && updateState.state !== 'downloading') autoUpdater.checkForUpdates().catch(() => {}); };
  setTimeout(check, 15 * 1000);
  setInterval(check, 4 * 60 * 60 * 1000);
  updateCheckNow = check;
}
let updateCheckNow = null;
// Closing Exilogue with an update ready: look for the game once more first (the regular check can be a minute old).
let quitChecked = false;
app.on('before-quit', e => {
  if (quitChecked || !autoUpdater || updateState.state !== 'ready' || process.platform !== 'win32') return;
  e.preventDefault();
  quitChecked = true;
  checkGameProcess().catch(() => {}).finally(() => { autoUpdater.autoInstallOnAppQuit = !gameRunning; app.quit(); });
});

// ---------- Awakened PoE Trade: running?, started by us when, its price-check key ----------
let aptRunning = false, aptLaunchedAt = 0, aptKey = null, aptKeyReadAt = 0;
async function checkApt() {
  const exe = config.data.paths.aptExe;
  if (!exe) { aptRunning = false; return; }
  const running = (await runningImages()).has(path.basename(exe).toLowerCase());
  if (running !== aptRunning) { aptRunning = running; if (!running) aptLaunchedAt = 0; }
}
// APT keeps its settings in %APPDATA%\awakened-poe-trade\apt-data\config.json; only the price-check key is read.
function readAptKey() {
  if (Date.now() - aptKeyReadAt < 10 * 60 * 1000) return aptKey;
  aptKeyReadAt = Date.now();
  try {
    const f = path.join(app.getPath('appData'), 'awakened-poe-trade', 'apt-data', 'config.json');
    const st = fs.statSync(f);
    if (st.size > 2 * 1024 * 1024) return aptKey;
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    // APT keeps the modifier apart: priceCheckKeyHold ("Ctrl") + priceCheckKey ("D").
    const k = j && j.priceCheckKey, hold = j && j.priceCheckKeyHold;
    aptKey = typeof k === 'string' && k && k.length < 40 ? (typeof hold === 'string' && hold && hold.length < 20 ? `${hold} + ${k}` : k) : null;
  } catch { aptKey = null; }
  return aptKey;
}
function aptInfo() {
  if (!config.data.paths.aptExe) return null;
  return { running: aptRunning, launchedAt: aptLaunchedAt || null, key: readAptKey() };
}

// Map glyph file names: "Jungle Valley Map" → "JungleValley".
const glyphName = zone => String(zone || '').replace(/ Map$/, '').replace(/[^A-Za-z]/g, '');
// Icon ids are lowercase letters, digits and hyphens (they are also the file names in the icon cache).
// Per goal (name, or name + a short hash of the exact variant), so a new goal never shows the previous goal's picture.
const goalArtId = g => {
  const slug = 'goal-' + String(g.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  if (!g.id) return slug;
  let h = 5381; for (const ch of g.id) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
  return slug.slice(0, 50) + '-' + h.toString(36).slice(0, 7);
};
const GLYPH = n => `https://web.poecdn.com/image/Art/2DItems/Maps/Atlas2Maps/New/${n}.png`;
// ---------- cheat sheets ----------
const SHEET_VIEWS = ['ratio', 'each', 'stack'];
const sheetId = () => Math.random().toString(36).slice(2, 10);
const num = (v, lo, hi, d) => { const n = v === null || v === '' ? NaN : Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
function sanitizeSheets(c) {
  const sh = c.sheets && typeof c.sheets === 'object' && !Array.isArray(c.sheets) ? c.sheets : {};
  const list = Array.isArray(sh.list) ? sh.list : [];
  const seen = new Set();
  const out = [];
  for (const raw of list.slice(0, 60)) {
    if (!raw || typeof raw !== 'object') continue;
    let id = typeof raw.id === 'string' && /^[a-z0-9]{1,24}$/.test(raw.id) ? raw.id : sheetId();
    if (seen.has(id)) id = sheetId();
    seen.add(id);
    const items = [];
    const keys = new Set();
    for (const it of Array.isArray(raw.items) ? raw.items.slice(0, 80) : []) {
      if (!it || !SHEET_TYPES.includes(it.type) || typeof it.id !== 'string' || !/^[a-z0-9-]{1,120}$/.test(it.id)) continue;
      const k = it.type + ':' + it.id;
      if (keys.has(k)) continue;
      keys.add(k);
      items.push({
        type: it.type, id: it.id, name: String(it.name || it.id).slice(0, 100), label: String(it.label || '').slice(0, 80),
        override: it.override == null || it.override === '' ? null : num(it.override, 0.0001, 1e7, null),
        view: SHEET_VIEWS.includes(it.view) ? it.view : null,
      });
    }
    out.push({
      id, name: String(raw.name || 'Sheet').trim().slice(0, 40) || 'Sheet',
      unit: raw.unit === 'divine' ? 'divine' : 'chaos',
      view: SHEET_VIEWS.includes(raw.view) ? raw.view : 'ratio',
      stack: Math.round(num(raw.stack, 1, 1000, 10)),
      sort: raw.sort === 'value' ? 'value' : 'manual',
      items,
    });
  }
  const w = sh.win && typeof sh.win === 'object' ? sh.win : {};
  c.sheets = {
    list: out,
    active: out.some(x => x.id === sh.active) ? sh.active : (out[0] ? out[0].id : null),
    seeded: !!sh.seeded,
    win: { x: Number.isFinite(w.x) ? Math.round(w.x) : null, y: Number.isFinite(w.y) ? Math.round(w.y) : null,
      w: Math.round(num(w.w, 280, 3000, 440)), h: Math.round(num(w.h, 200, 3000, 600)), pin: !!w.pin },
  };
}
// The first time: one example sheet with the threads, an ordinary sheet you can change or delete (never comes back).
function seedSheets() {
  if (config.data.sheets.seeded) return;
  const T = ['abyss', 'legion', 'blight', 'bestiary', 'ultimatum', 'breach', 'betrayal', 'incursion', 'expedition', 'ritual'];
  const cap = x => x[0].toUpperCase() + x.slice(1);
  config.data.sheets.list.push({ id: sheetId(), name: 'Blight-strat', unit: 'chaos', view: 'ratio', stack: 10, sort: 'manual',
    items: T.map(t => ({ type: 'Thread', id: t + '-thread', name: cap(t) + ' Thread', label: '', override: null, view: null })) });
  config.data.sheets.seeded = true;
  sanitizeConfig();
  config.save();
}
const sheetIconId = (type, id) => {
  let h = 5381; for (const ch of type + ':' + id) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
  return 'cs-' + h.toString(36);
};
let sheetWin = null;
let sheetCache = { prices: {}, at: 0, partial: false, complete: false, rev: 0, busy: false, again: false, lastTry: 0, sig: '' };
const sheetRefs = () => {
  const m = new Map();
  for (const sh of config.data.sheets.list) for (const it of sh.items) m.set(it.type + ':' + it.id, { type: it.type, id: it.id });
  return [...m.values()];
};
// Prices for every item in your sheets; due every 15 min while the sheet window or the dashboard is open, after 2 min
// when some categories failed, and right away when the items or the league changed (sig).
async function sheetTick(force) {
  if (sheetCache.busy) { sheetCache.again = true; return; } // run once more as soon as this round is done
  const refs = sheetRefs();
  const sig = config.data.league.name + '#' + refs.map(r => r.type + ':' + r.id).sort().join('|');
  const open = (sheetWin && !sheetWin.isDestroyed() && sheetWin.isVisible()) || (dashWin && !dashWin.isDestroyed() && dashWin.isVisible() && !dashWin.isMinimized());
  if (!refs.length || (!open && !force)) return;
  const wait = sheetCache.partial ? 2 * 60e3 : 15 * 60e3;
  const leagueChanged = !sheetCache.sig.startsWith(config.data.league.name + '#');
  if (!(force || sig !== sheetCache.sig || Date.now() - sheetCache.lastTry > wait)) return;
  sheetCache.busy = true; sheetCache.lastTry = Date.now();
  try {
    const r = await ninja.sheetPrices(config.data.league.name, refs);
    // Keep the older prices of categories that failed this time (unless the league changed: those are another league's).
    const prices = {};
    const failed = new Set(r.failed);
    if (!leagueChanged) for (const [k, v] of Object.entries(sheetCache.prices)) if (failed.has(k.split(':')[0])) prices[k] = v;
    Object.assign(prices, r.prices);
    const ok = r.at > 0;
    sheetCache = { ...sheetCache, prices, sig, partial: r.partial, at: ok ? r.at : (leagueChanged ? 0 : sheetCache.at),
      complete: ok && !r.partial, rev: sheetCache.rev + 1 };
    broadcast();
    if (typeof iconRefresh === 'function') iconRefresh(); // pictures of newly added items right away, not within the minute
  } catch { sheetCache.partial = true; sheetCache.complete = false; } finally {
    sheetCache.busy = false;
    if (sheetCache.again) { sheetCache.again = false; setImmediate(() => sheetTick()); }
  }
}
function sheetsInfo() {
  const icon = it => (sheetCache.prices[it.type + ':' + it.id] || {}).icon;
  return { prices: sheetCache.prices, at: sheetCache.at, partial: sheetCache.partial, divineChaos: (ninja.currency && ninja.currency.divineChaos) || null,
    iconIds: Object.fromEntries(sheetRefs().filter(icon).map(r => [r.type + ':' + r.id, sheetIconId(r.type, r.id)])) };
}
function openSheetWindow() {
  if (sheetWin && !sheetWin.isDestroyed()) { if (sheetWin.isMinimized()) sheetWin.restore(); sheetWin.show(); sheetWin.focus(); return; }
  const w = config.data.sheets.win;
  // Only reuse the saved spot if it is still on a screen (a monitor may be gone).
  let pos = {};
  if (w.x != null && w.y != null) {
    const r = { x: w.x, y: w.y, width: w.w, height: w.h };
    const d = screen.getDisplayMatching(r).workArea;
    if (r.x < d.x + d.width - 60 && r.x + r.width > d.x + 60 && r.y >= d.y - 10 && r.y < d.y + d.height - 60) pos = { x: w.x, y: w.y };
  }
  sheetWin = new BrowserWindow({
    width: w.w, height: w.h, ...pos, minWidth: 280, minHeight: 200,
    frame: false, backgroundColor: '#0a0f18', title: APP_NAME + ' · Cheat sheets', show: false, alwaysOnTop: w.pin,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: false },
  });
  sheetWin.loadFile(path.join(__dirname, '..', 'sheet', 'sheet.html'));
  sheetWin.once('ready-to-show', () => sheetWin && sheetWin.show());
  let t = null;
  const save = () => {
    clearTimeout(t);
    t = setTimeout(() => {
      if (!sheetWin || sheetWin.isDestroyed() || sheetWin.isMinimized() || sheetWin.isMaximized()) return;
      const b = sheetWin.getBounds();
      Object.assign(config.data.sheets.win, { x: b.x, y: b.y, w: b.width, h: b.height });
      config.saveSoon();
    }, 400);
  };
  sheetWin.on('move', save);
  sheetWin.on('resize', save);
  sheetWin.on('closed', () => { sheetWin = null; });
  sheetTick(true);
}
function setSheetPin(on) {
  config.data.sheets.win.pin = !!on;
  config.saveSoon();
  if (sheetWin && !sheetWin.isDestroyed()) sheetWin.setAlwaysOnTop(!!on);
  broadcastConfig();
}

function iconExtras() {
  const out = [];
  const c = ninja.currency;
  if (c && c.icons.divine) out.push({ id: 'cur-divine', url: c.icons.divine });
  if (c && c.icons.chaos) out.push({ id: 'cur-chaos', url: c.icons.chaos });
  const g = config.data.goal;
  // Only the art of the goal you have now (never the previous goal's picture next to a new name).
  const gc = g.name && ninja.get(config.data.league.name, g);
  if (gc && gc.icon) out.push({ id: goalArtId(g), url: gc.icon });
  const names = new Set();
  if (tracker) {
    const cur = tracker.s.currentMap;
    if (cur && cur.zone) names.add(glyphName(cur.zone));
    for (let i = tracker.maps.length - 1; i >= 0 && names.size < 12; i--) names.add(glyphName(tracker.maps[i].zone || tracker.maps[i].areaId));
  }
  for (const n of names) if (n) out.push({ id: 'map-' + n.toLowerCase(), url: GLYPH(n) });
  // Cheat-sheet item pictures (downloaded for at most 300 items; see sheetKeep for which ones the cache keeps).
  let n = 0;
  for (const r of sheetRefs()) {
    const p = sheetCache.prices[r.type + ':' + r.id];
    if (p && p.icon && n++ < 300) out.push({ id: sheetIconId(r.type, r.id), url: p.icon });
  }
  return out;
}

// "Today" starts at 05:00, so a night session past midnight still counts as the same day.
const DAY_START_HOUR = 5;
function todayStart(now = Date.now()) {
  const d = new Date(now); d.setHours(DAY_START_HOUR, 0, 0, 0);
  if (d.getTime() > now) d.setDate(d.getDate() - 1);
  return d.getTime();
}
// ---------- league stats for the "Maps per day" and fun-stat tiles ----------
// Recomputed only when a map was added (cached on the number of maps and the league start).
let leagueStatsCache = { key: '', v: null };
function leagueStats() {
  if (!tracker) return null;
  const key = tracker.maps.length + '|' + config.data.league.start + '|' + todayStart(); // a new day shows up at 05:00, map or not
  if (leagueStatsCache.key === key) return leagueStatsCache.v;
  const maps = tracker.maps.filter(m => m && m.end && m.start);
  const ls = leagueStartMs();
  const day0 = todayStart(ls || (maps[0] && maps[0].start) || Date.now());
  // Days run from 05:00 to 05:00, like "Today"; day 1 is the league's first day.
  // Rounded: around a clock change a day is 23 or 25 hours long.
  const dayOf = t => Math.round((todayStart(t) - day0) / 86400e3) + 1;
  const days = new Map();
  for (const m of maps) {
    const d = dayOf(m.end);
    if (d < 1) continue;
    const g = days.get(d) || { day: d, maps: 0, ms: 0, deaths: 0 };
    g.maps++; g.ms += m.activeMs || 0; g.deaths += m.deaths || 0;
    days.set(d, g);
  }
  const lastDay = Math.max(dayOf(Date.now()), ...days.keys(), 1);
  const perDay = [];
  for (let d = 1; d <= lastDay; d++) {
    const g = days.get(d) || { day: d, maps: 0, ms: 0, deaths: 0 };
    perDay.push({ day: d, date: day0 + (d - 1) * 86400e3 + 12 * 3600e3, maps: g.maps, avgMs: g.maps ? Math.round(g.ms / g.maps) : null, deaths: g.deaths });
  }
  // Fun facts: neutral, from your maps only. Each { text, sub } (text may hold a zone name: the renderer escapes it).
  const fun = [];
  if (maps.length) {
    const total = maps.reduce((a, m) => a + (m.activeMs || 0), 0);
    const zone = m => m.zone || m.areaId || 'a map';
    const longest = maps.reduce((a, m) => ((m.activeMs || 0) > (a.activeMs || 0) ? m : a));
    const timed = maps.filter(m => (m.activeMs || 0) >= 30e3);
    const quickest = timed.length ? timed.reduce((a, m) => (m.activeMs < a.activeMs ? m : a)) : null;
    const zones = new Set(maps.map(zone));
    const deaths = maps.reduce((a, m) => a + (m.deaths || 0), 0);
    let streak = 0, best = 0;
    for (const m of maps) { if (m.deaths) streak = 0; else best = Math.max(best, ++streak); }
    // The real time of each death in a map (from the event log), per hour of the day.
    let byHour = null;
    try { byHour = leagueDb ? leagueDb.deathHours(ls || 0, tracker.pending ? tracker.pending.events || [] : []) : null; } catch { byHour = null; }
    const h = byHour ? byHour.indexOf(Math.max(...byHour)) : -1;
    const busiest = perDay.reduce((a, d) => (d.maps > a.maps ? d : a), perDay[0]);
    const by = new Map();
    for (const m of maps) { const k = zone(m); by.set(k, (by.get(k) || 0) + (m.deaths || 0)); }
    const deadliest = [...by].sort((a, b) => b[1] - a[1])[0];
    const hm = ms => { const mins = Math.round(ms / 60000); return mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`; };
    const ms = v => { const sec = Math.round(v / 1000); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };
    fun.push({ text: `${hm(total)} inside maps`, sub: `over ${maps.length} maps this league` });
    fun.push({ text: `${zones.size} different maps`, sub: 'run at least once this league' });
    fun.push({ text: `Longest map: ${zone(longest)}`, sub: `${ms(longest.activeMs || 0)}${longest.tier ? ' · T' + longest.tier : ''}` });
    if (quickest) fun.push({ text: `Quickest map: ${zone(quickest)}`, sub: `${ms(quickest.activeMs)}${quickest.tier ? ' · T' + quickest.tier : ''}` });
    if (busiest && busiest.maps) fun.push({ text: `Day ${busiest.day} was your busiest`, sub: `${busiest.maps} maps that day` });
    fun.push({ text: `${best} maps in a row without dying`, sub: 'your longest streak this league' });
    if (deaths) {
      const rate = maps.length / deaths;
      fun.push({ text: `${deaths} deaths in maps`, sub: rate >= 1.5 ? `about one every ${Math.round(rate)} maps` : `about ${(deaths / maps.length).toFixed(1)} per map` });
      if (byHour && byHour[h] > 0) fun.push({ text: `Most deaths between ${String(h).padStart(2, '0')}:00 and ${String((h + 1) % 24).padStart(2, '0')}:00`, sub: `${byHour[h]} death${byHour[h] === 1 ? '' : 's'} in maps in that hour of the day` });
      if (deadliest && deadliest[1]) fun.push({ text: `${deadliest[0]} took ${deadliest[1]} of your lives`, sub: 'the map you died in most' });
    } else fun.push({ text: 'Not a single death in a map yet', sub: `${maps.length} maps clean` });
  }
  leagueStatsCache = { key, v: { perDay, fun } };
  return leagueStatsCache.v;
}

function todayStats() {
  if (!tracker) return null;
  const from = todayStart();
  const evs = tracker.tail.filter(e => e.t >= from);
  const se = tracker.s.session;
  const sessions = evs.filter(e => e.type === 'sessStart').length + (se && !se.ended && se.start < from ? 1 : 0);
  const me = tracker.s.character && tracker.s.character.name;
  const levels = evs.filter(e => e.type === 'level' && e.level != null && e.char === me);
  const breaks = evs.filter(e => e.type === 'break');
  const maps = tracker.maps.filter(m => m.end >= from);
  // Neutral facts only: which map you ran most, and which one killed you most (no "best": map speed is mostly luck).
  const by = new Map();
  for (const m of maps) {
    const k = `${m.zone || m.areaId}|${m.tier || 0}`;
    const g = by.get(k) || { zone: m.zone || m.areaId, tier: m.tier || null, runs: 0, deaths: 0 };
    g.runs++; g.deaths += m.deaths || 0; by.set(k, g);
  }
  const groups = [...by.values()];
  const mostRun = groups.reduce((b, g) => (!b || g.runs > b.runs ? g : b), null);
  const deadliest = groups.filter(g => g.deaths).reduce((b, g) => (!b || g.deaths > b.deaths ? g : b), null);
  const first = evs[0] || (se && !se.ended ? { t: se.start } : null);
  return {
    from, firstAt: first ? Math.max(first.t, from) : null, sessions,
    levelFrom: levels.length ? levels[0].level - 1 : null, levelTo: levels.length ? levels[levels.length - 1].level : null,
    breakMs: breaks.reduce((n, e) => n + (e.ms || 0), 0),
    newTiers: evs.filter(e => e.type === 'tier').length,
    maps: maps.length, deaths: evs.filter(e => e.type === 'death').length,
    mostRun, deadliest,
  };
}

// League start from the config ("YYYY/MM/DD HH:MM:SS", local time) in ms.
function leagueStartMs() {
  const m = /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(config.data.league.start || '');
  return m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() : 0;
}

// Map of the highest tier reached (for the Session & Maps icon): "MapWorldsStrand" -> "Strand".
let iconRefresh = null;
function bestMapName() {
  if (!tracker) return null;
  let best = null;
  for (const m of tracker.maps) if (m.tier != null && (!best || m.tier > best.tier)) best = m; // first map at that tier: stays fixed
  const id = best && best.areaId;
  return id && /^MapWorlds[A-Za-z]+$/.test(id) ? id.slice(9) : null;
}

// ---------- disk usage (Settings › Storage) ----------
// Lifetime byte counters live in config.data.io. The objects below count since they were created; ioSeen remembers
// how much of that is already in the totals.
const ioSeen = { db: 0, backup: 0, read: 0, config: 0, log: 0, icon: 0, iconRead: 0, wealth: 0, wealthRead: 0 };
function collectIo() {
  const io = config.data.io;
  let changed = false;
  const take = (field, now, k) => {
    const d = now - ioSeen[k];
    if (d > 0) { io[field] += d; if (k !== 'config') changed = true; } // config's own writes alone never trigger a save
    ioSeen[k] = now;
  };
  if (leagueDb) { take('dbWritten', leagueDb.io.db, 'db'); take('backupWritten', leagueDb.io.backup, 'backup'); take('otherRead', leagueDb.io.read, 'read'); }
  if (watcher) take('logRead', watcher.bytesRead, 'log');
  if (icons) { take('iconWritten', icons.written, 'icon'); take('otherRead', icons.read, 'iconRead'); }
  if (wealth) { take('wealthWritten', wealth.written, 'wealth'); take('otherRead', wealth.read, 'wealthRead'); }
  take('configWritten', config.bytesWritten || 0, 'config');
  return changed;
}

function fileSize(f) { try { return fs.statSync(f).size; } catch { return 0; } }
function dirSize(d) {
  let n = 0, entries;
  try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return 0; }
  for (const e of entries) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) n += dirSize(p); else if (e.isFile()) n += fileSize(p);
  }
  return n;
}

// Only computed when the Storage tab is opened.
function storageInfo() {
  try { leagueDb.checkpoint(); } catch { /* counts stay a few minutes behind */ }
  if (collectIo()) config.save();
  const dir = app.getPath('userData');
  const names = fs.readdirSync(dir);
  const pick = re => names.filter(f => re.test(f));
  const sum = list => list.reduce((a, f) => a + fileSize(path.join(dir, f)), 0);
  const database = sum(pick(/^league\.db(-wal|-shm)?$/));
  const backupFiles = pick(BACKUP_RE);
  const backups = sum(backupFiles);
  const cfg = sum(pick(/^config\.json$/));
  const iconBytes = dirSize(path.join(dir, 'icons'));
  const wealthBytes = dirSize(path.join(dir, 'wealth')) + sum(pick(/^wealth\.db(-wal|-shm)?$/));
  const other = sum(pick(/^(state\.json|state\.migrated\.json|.+\.corrupt-.+)$/));
  const all = dirSize(dir);
  return {
    io: { ...config.data.io },
    files: { database, backups, backupCount: backupFiles.length, keepBackups: KEEP_BACKUPS, config: cfg, other, icons: iconBytes, wealth: wealthBytes,
             engine: Math.max(0, all - database - backups - cfg - other - iconBytes - wealthBytes), total: all },
    clientTxt: fileSize(config.data.paths.clientTxt),
    dir,
  };
}

// ---------- backups ----------
// league.backup-*.db (current) and state.backup-*.json (made by v0.3 and earlier; still restorable).
const BACKUP_RE = /^(league\.backup-[\w.-]+\.db|state\.backup-[\w.-]+\.json)$/;
function backupDir() { return path.dirname(leagueDb.file); }

function listBackups() {
  try {
    return fs.readdirSync(backupDir())
      .filter(f => BACKUP_RE.test(f))
      .map(f => { const st = fs.statSync(path.join(backupDir(), f)); return { file: f, at: st.mtimeMs, size: st.size }; })
      .sort((a, b) => b.at - a.at);
  } catch { return []; }
}

function backupState({ prune = true } = {}) {
  try {
    flushLeague();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    leagueDb.backupTo(path.join(backupDir(), `league.backup-${stamp}.db`));
    if (prune) pruneBackups();
  } catch (e) { console.error('Backup failed:', e.message); } // best effort
}

// Keep the newest KEEP_BACKUPS database backups. Old state.backup-*.json files (v0.3) are left alone.
function pruneBackups() {
  const old = fs.readdirSync(backupDir()).filter(f => /^league\.backup-[\w.-]+\.db$/.test(f)).sort().reverse().slice(KEEP_BACKUPS);
  for (const f of old) { try { fs.unlinkSync(path.join(backupDir(), f)); } catch { /* in use: next time */ } }
}

// Rebuild from the log, but keep a backup first: if Client.txt was cleared mid-league the old stats are irreplaceable.
function resetState() {
  backupState();
  if (watcher) watcher.stop();
  tracker = null;
  leagueDb.clear();
  startTracking();
}

// Restores league stats from a backup. The backup is checked before anything changes. If it was made for another
// Client.txt or league start, those settings come back with it (startTracking), so the log is never counted twice.
function restoreBackup(file) {
  if (!BACKUP_RE.test(file)) return { ok: false, error: 'Invalid backup name.' };
  const src = path.join(backupDir(), file);
  if (!fs.existsSync(src)) return { ok: false, error: 'Backup not found.' };
  let legacy = null;
  if (file.endsWith('.json')) {
    legacy = readLegacyJson(src);
    if (!legacy) return { ok: false, error: 'This backup could not be read. Nothing was changed.' };
  } else {
    try { checkFile(src); } catch { return { ok: false, error: 'This backup is damaged or not an Exilogue backup. Nothing was changed.' }; }
  }
  // The current state becomes a backup too, so a restore can be undone. Pruning waits until after the restore:
  // the backup being restored may be the oldest one.
  backupState({ prune: false });
  if (watcher) watcher.stop();
  tracker = null;
  let error = null;
  try {
    if (legacy) { leagueDb.clear(); importLegacy(legacy); } else leagueDb.restoreFrom(src);
  } catch (e) {
    error = 'Restore failed: ' + e.message + ' Your previous stats are in the newest backup.';
  }
  startTracking();
  try { pruneBackups(); } catch { /* next time */ }
  return error ? { ok: false, error } : { ok: true };
}

// "2026-11-13 20:00" / "2026/11/13 20:00:00" -> "2026/11/13 20:00:00" (the format Client.txt uses), else null
function normalizeStamp(v) {
  const m = /^\s*(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*$/.exec(String(v));
  if (!m) return null;
  const p = n => String(n).padStart(2, '0');
  const [y, mo, d, h, mi, se = '00'] = m.slice(1);
  if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31 || +h > 23 || +mi > 59 || +se > 59) return null;
  return `${y}/${p(mo)}/${p(d)} ${p(h)}:${mi}:${p(se)}`;
}

// ---------- IPC ----------
function launchExe(exe) {
  let isFile = false;
  try { isFile = !!exe && fs.statSync(exe).isFile(); } catch { /* missing */ }
  if (!isFile || !/\.exe$/i.test(exe)) return Promise.resolve({ ok: false, error: 'That path is not a program (.exe). Check Settings › Paths.' });
  return new Promise(resolve => {
    let child;
    try { child = spawn(exe, [], { cwd: path.dirname(exe), detached: true, stdio: 'ignore' }); }
    catch (e) { resolve({ ok: false, error: 'Could not start it: ' + e.message }); return; }
    child.once('error', e => resolve({ ok: false, error: 'Could not start it: ' + e.message }));
    child.once('spawn', () => { child.unref(); resolve({ ok: true }); });
  });
}

function setupIpc() {
  ipcMain.handle('config:get', () => effectiveConfig());
  // Goal search (all unique categories from poe.ninja; the first search loads them, ~7 requests, then cached an hour).
  ipcMain.handle('goal:search', async (_e, q) => {
    try { const r = await ninja.search(config.data.league.name, String(q || '').slice(0, 80)); return { ok: true, items: r.items || [], partial: !!r.partial }; }
    catch (e) { return { ok: false, error: 'Could not load the item list from poe.ninja. Try again in a minute.' }; }
  });
  ipcMain.handle('config:set', (_e, patch) => {
    const before = JSON.stringify([config.data.paths.clientTxt, config.data.league.start]);
    if (patch.league && patch.league.start != null) {
      const norm = normalizeStamp(patch.league.start);
      if (!norm) return { ...effectiveConfig(), _error: 'Invalid start date. Use YYYY/MM/DD HH:MM.' };
      patch.league.start = norm;
    }
    if (patch._replaceLayout) { config.data.layout = { order: [], sizes: {}, hidden: {} }; delete patch._replaceLayout; }
    deepMerge(config.data, patch);
    sanitizeConfig();
    if (patch.sheets) { setImmediate(() => sheetTick()); if (sheetWin && !sheetWin.isDestroyed()) sheetWin.setAlwaysOnTop(!!config.data.sheets.win.pin); }
    if (patch.hotkeys) registerHotkeys();
    if (patch.paths) { refreshPaths(); if (iconRefresh) iconRefresh(); }
    if (patch.overlay && 'enabled' in patch.overlay) setOverlayEnabled(config.data.overlay.enabled);
    // Stats are wiped before the new path/start is saved: a crash in between leaves old stats with the old config.
    if (JSON.stringify([config.data.paths.clientTxt, config.data.league.start]) !== before) resetState();
    config.save();
    if (patch.account !== undefined) checkProfile();
    broadcastConfig();
    return effectiveConfig();
  });
  ipcMain.handle('snapshot', e => { sentKey.set(e.sender.id, statusKey()); return snapshot(); });
  ipcMain.on('win:visible', (e, visible) => { if (visible) hiddenWc.delete(e.sender.id); else hiddenWc.add(e.sender.id); });
  ipcMain.handle('storage:get', () => storageInfo());
  ipcMain.handle('break:taken', () => { takeBreak(); return true; });
  ipcMain.handle('update:install', async () => {
    if (!autoUpdater || updateState.state !== 'ready') return { ok: false, error: 'No update ready' };
    await checkGameProcess(); // the regular check can be a minute old
    if (gameRunning) return { ok: false, error: 'Close the game first; it installs by itself when Exilogue closes.' };
    flushLeague({ force: true });
    quitChecked = true; // just checked: the before-quit check must not hold this quit up
    setImmediate(() => autoUpdater.quitAndInstall(true, true)); // silent install, then start Exilogue again
    return { ok: true };
  });
  ipcMain.handle('update:check', () => { if (updateCheckNow) updateCheckNow(); return updateState; });
  ipcMain.handle('icons:get', () => (icons ? icons.all() : {}));
  ipcMain.handle('events:get', (_e, q) => {
    if (!tracker || !leagueDb) return { rows: [], total: 0, any: 0 };
    const f = q || {};
    const types = Array.isArray(f.types) ? f.types.filter(t => typeof t === 'string').slice(0, 20) : null;
    const limit = Math.min(1000, Math.max(1, Number(f.limit) || 200));
    const seq = v => (Number.isInteger(v) ? v : null);
    return leagueDb.events({ char: typeof f.char === 'string' ? f.char : 'all', types, limit, before: seq(f.before), after: seq(f.after) }, tracker.pending.events);
  });
  ipcMain.handle('maps:all', () => (tracker ? tracker.maps.slice().reverse() : []));
  ipcMain.handle('launch', async (_e, which) => {
    const P = config.data.paths;
    if (which === 'poe') {
      const r = await launchExe(P.poeExe);
      if (r.ok) launchCompanions().catch(() => {}); // the game first; tools follow without holding it up
      return r;
    }
    if (which === 'apt') { const r = await launchExe(P.aptExe); if (r.ok) { aptLaunchedAt = Date.now(); aptRunning = true; } return r; }
    if (which === 'pob') return launchExe(P.pobExe);
    const c = config.data.launch.custom.find(x => x.id === which);
    if (c) { if (/^https:\/\//i.test(c.target)) { shell.openExternal(c.target); return { ok: true }; } return launchExe(c.target); }
    return { ok: false, error: 'Unknown program' };
  });
  ipcMain.handle('open:url', (_e, url) => { if (/^https:\/\//.test(url)) shell.openExternal(url); });
  // Wealthy Exile tile: open the stash page with a marker the userscript reacts to (sync, then export).
  // At most once per WEALTH_SYNC_MS; within that, the plain page opens.
  ipcMain.handle('wealth:sync', () => {
    const left = wealthSyncAt + WEALTH_SYNC_MS - Date.now();
    // A WE tab is open when the userscript asked recently (v1.8 asks every 10 s; Firefox may slow a background tab down).
    const tabOpen = !weForceTab && weScriptSeenAt && Date.now() - weScriptSeenAt < 60e3;
    if (left > 0) { if (!tabOpen) shell.openExternal(WEALTH_URL); return { ok: false, left, inTab: !!tabOpen }; }
    wealthSyncAt = Date.now();
    weManualAt = wealthSyncAt; // picked up by the userscript via /we-sync (any open WE tab, or the one opened here)
    weForceTab = false;
    if (tabOpen) { weManualTtl = 45e3; return { ok: true, inTab: true }; }
    weManualTtl = 2 * 60e3;
    shell.openExternal(WEALTH_URL + '#exilogue-sync'); // marker kept as a fallback if the server isn't reachable
    return { ok: true };
  });
  ipcMain.handle('pick:file', async (_e, opts) => {
    const r = await dialog.showOpenDialog(dashWin, { properties: ['openFile'], filters: opts?.filters });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('neversink:synced', () => {
    if (neversinkLatest) { config.data.neversink = { lastSyncedTag: neversinkLatest.tag, syncedAt: Date.now() }; config.save(); }
    return true;
  });
  ipcMain.handle('league:reset', () => {
    try { resetState(); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle('profile:check', async () => { await checkProfile(); return profileStatus; });
  ipcMain.handle('backups:list', () => listBackups());
  ipcMain.handle('backups:restore', (_e, file) => {
    try { return restoreBackup(String(file)); } catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle('overlay:lock', (_e, locked) => setOverlayLocked(locked));
  ipcMain.handle('hotkeys:pause', (_e, paused) => { if (paused) globalShortcut.unregisterAll(); else registerHotkeys(); return true; });
  ipcMain.handle('overlay:reset', () => {
    overlayWide = null; config.data.overlay.bounds = null; config.save();
    if (overlayWin) {
      const wa = screen.getPrimaryDisplay().workArea;
      overlayWin.setBounds({ x: wa.x + wa.width - 320, y: wa.y + 120, width: 280, height: overlayWin.getBounds().height });
    }
    return true;
  });
  // Overlay: auto-height from its content, custom handles set x/width.
  // extra: px the take-a-break popup adds (0 when it's gone); side 'left' grows the window to the left.
  // The user's own position and width are remembered and put back exactly; they are never saved widened.
  ipcMain.on('overlay:fit', (_e, h, extra, side) => {
    if (!overlayWin || !h) return;
    const b = overlayWin.getBounds();
    const height = Math.min(700, Math.max(40, Math.round(h)));
    const add = Number.isFinite(extra) ? Math.min(400, Math.max(0, Math.round(extra))) : 0;
    let { x, width } = b;
    if (add && !overlayWide) { overlayWide = { x: b.x, width: b.width }; width = b.width + add; if (side === 'left') x = b.x - add; }
    else if (!add && overlayWide) { ({ x, width } = overlayWide); overlayWide = null; }
    if (Math.abs(b.height - height) > 2 || x !== b.x || width !== b.width) overlayWin.setBounds({ x, y: b.y, width, height });
  });
  ipcMain.on('overlay:setBounds', (_e, nb) => {
    if (!overlayWin || !overlayUnlocked) return;
    const b = overlayWin.getBounds();
    const width = Math.min(800, Math.max(180, Math.round(nb.width ?? b.width)));
    overlayWin.setBounds({ x: Math.round(nb.x ?? b.x), y: Math.round(nb.y ?? b.y), width, height: b.height });
  });
  ipcMain.on('overlay:boundsDone', saveOverlayBounds);
  ipcMain.handle('overlay:bounds', () => (overlayWin ? overlayWin.getBounds() : null));
  // Window chrome
  // Title-bar buttons act on the window they are in (dashboard or cheat-sheet window).
  const ownWin = e => BrowserWindow.fromWebContents(e.sender);
  ipcMain.on('win:min', e => { const w = ownWin(e); if (w) w.minimize(); });
  ipcMain.on('win:max', e => { const w = ownWin(e); if (w && w === dashWin) w.isMaximized() ? w.unmaximize() : w.maximize(); });
  ipcMain.on('win:close', e => { const w = ownWin(e); if (w) w.close(); });
  ipcMain.handle('sheet:open', () => { openSheetWindow(); return true; });
  ipcMain.handle('sheet:pin', (_e, on) => { setSheetPin(on); return true; });
  ipcMain.handle('sheet:search', async (_e, q) => {
    try { const r = await ninja.sheetSearch(config.data.league.name, String(q || '').slice(0, 80)); return { ok: true, items: r.items, partial: r.partial }; }
    catch { return { ok: false, error: 'Could not load the item lists from poe.ninja. Try again in a minute.' }; }
  });
  ipcMain.handle('sheet:refresh', () => sheetTick(true));
  ipcMain.handle('win:state', () => ({ maximized: !!(dashWin && dashWin.isMaximized()) }));
}

// ---------- boot ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => HOTKEY_ACTIONS.focusDashboard());
}

app.on('web-contents-created', (_e, wc) => {
  wc.on('will-navigate', e => e.preventDefault());
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
});

app.whenReady().then(() => {
  if (!app.hasSingleInstanceLock()) return;
  const dir = app.getPath('userData');
  // Break sound: on for an install that already had a config before the option existed, off for a new install.
  const cfgFile = path.join(dir, 'config.json');
  let soundMigrate = false;
  try { const raw = JSON.parse(fs.readFileSync(cfgFile, 'utf8')); soundMigrate = !(raw && raw.breaks && raw.breaks.sound); } catch { /* new install */ }
  config = new JsonStore(cfgFile, DEFAULT_CONFIG);
  if (soundMigrate) { config.data.breaks.sound = { on: true, volume: 50, file: 'shrine' }; } // Marcel's pick for his own install
  sanitizeConfig();
  if (soundMigrate) config.save();
  seedSheets();
  leagueDb = new LeagueDb(path.join(dir, 'league.db'));
  if (!config.data.io.since) { config.data.io.since = Date.now(); config.save(); }
  const legacy = path.join(dir, 'state.json');
  if (fs.existsSync(legacy) && !leagueDb.hasData()) {
    const data = readLegacyJson(legacy);
    if (data) {
      importLegacy(data);
      try { fs.renameSync(legacy, path.join(dir, 'state.migrated.json')); } catch { /* keep it */ }
    } else console.error('state.json could not be read; it is left in place.');
  }
  refreshPaths();
  setupIpc();
  createDashboard();
  createOverlay();
  registerHotkeys();
  nativeTheme.on('updated', broadcastConfig);
  // Know whether the game runs *before* the log catch-up decides the pause state.
  checkGameProcess().then(() => {
    startTracking(); // also checks the profile once
    setInterval(gameTick, GAME_POLL_MS);
  });
  setInterval(broadcast, 1000);
  setInterval(breakTick, 2000);
  startUpdater();
  // Is Awakened PoE Trade running? Once a minute, only while the dashboard can be seen (one tasklist call).
  setInterval(() => { if (dashWin && dashWin.isVisible() && !dashWin.isMinimized()) checkApt().catch(() => {}); }, 60 * 1000);
  setTimeout(() => checkApt().catch(() => {}), 4000);
  // poe.ninja: divine price and icons for everyone, goal price when a goal is set (each refreshes at most hourly).
  const ninjaTick = () => ninja.refresh(config.data.league.name, config.data.goal).catch(() => {});
  setInterval(() => sheetTick(), 60e3); // checks every minute; fetches only when due (15 min) or items changed
  setTimeout(ninjaTick, 3000);
  setInterval(ninjaTick, 5 * 60 * 1000);
  setInterval(() => flushLeague({ force: false }), FLUSH_MS);
  icons = new IconStore({
    dir: path.join(dir, 'icons'),
    fetch: (...a) => fetch(...a),
    getFileIcon: async p => (await app.getFileIcon(p, { size: 'large' })).toPNG(),
    // Scale big PNG/JPEG icons down (keeps files and the data sent to the page small).
    resize: (buf, px) => {
      const img = nativeImage.createFromBuffer(buf);
      if (img.isEmpty()) return null;
      const { width, height } = img.getSize();
      return Math.max(width, height) <= px ? null : img.resize(width >= height ? { width: px, quality: 'best' } : { height: px, quality: 'best' }).toPNG();
    },
    userAgent: `Exilogue/${app.getVersion()} (personal companion app)`,
    onChange: () => {},
  });
  // Cheap when nothing is due (no network, no writes); fetches only what is missing or older than 30 days.
  const refreshIcons = () => icons.refresh({ poeExe: config.data.paths.poeExe, pobExe: config.data.paths.pobExe, aptExe: config.data.paths.aptExe, mapName: bestMapName(), extra: iconExtras(), sheetsKnown: sheetCache.complete, sheetKeep: sheetRefs().map(r => sheetIconId(r.type, r.id)) }).catch(() => {});
  // New art to fetch (a new map in the recent list, poe.ninja icons that just arrived): checked every minute, fetched once.
  let extrasSeen = '';
  setInterval(() => { const sig = JSON.stringify(iconExtras()); if (sig !== extrasSeen) { extrasSeen = sig; refreshIcons(); } }, 60 * 1000);
  setTimeout(refreshIcons, 5000);
  setInterval(refreshIcons, 10 * 60 * 1000);
  iconRefresh = refreshIcons;
  // Wealthy Exile exports: watched in Downloads (event-driven, no polling).
  try {
    wealth = new Wealth({ dir, downloads: app.getPath('downloads'), onChange: () => {} });
    wealth.start();
    startWeSync();
  } catch (e) { console.error('Wealth import unavailable:', e.message); }
  // Disk counters are saved on quit, on Windows shutdown and when the Storage tab is opened (not on a timer).
  checkNeverSink();
  refreshPobBuild(true);
  setInterval(() => refreshPobBuild(true), 10 * 60 * 1000);
  setInterval(checkNeverSink, 30 * 60 * 1000);
  // Characters only change while playing; a closed game needs no profile checks.
  setInterval(() => { if (gameRunning) checkProfile(); }, 3 * 60 * 1000);
});

// Everything worth keeping, on quit and on Windows shutdown/logoff (which skips will-quit).
let finalSaved = false;
function finalSave() {
  if (finalSaved) return;
  finalSaved = true;
  flushLeague();
  if (leagueDb) leagueDb.close();
  if (wealth) wealth.close();
  if (config) {
    collectIo();
    // This last write counts too (next run starts counting from zero).
    config.data.io.configWritten += Buffer.byteLength(JSON.stringify(config.data, null, 2));
    config.save();
  }
}

app.on('will-quit', () => {
  if (weServer) weServer.stop();
  globalShortcut.unregisterAll();
  finalSave();
});
