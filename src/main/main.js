'use strict';
const { app, BrowserWindow, nativeImage, ipcMain, globalShortcut, shell, dialog, screen, nativeTheme, powerMonitor } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile, spawn } = require('child_process');

const { JsonStore, deepMerge } = require('./store');
const { LeagueDb, checkFile } = require('./db');
const { IconStore } = require('./icons');
const { Wealth } = require('./wealth');
const { NinjaPrice } = require('./ninja');
const { shouldSync, WeSyncServer } = require('./wesync');
const { lastBuild } = require('./pob');
const { LogWatcher } = require('./logwatcher');
const { parseLine } = require('../core/parser');
const { Tracker, freshState } = require('../core/tracker');

const APP_NAME = 'Exilogue';
app.setName(APP_NAME);

const CARD_IDS = ['poe', 'maps', 'campaign', 'wealthy', 'overlay', 'filter', 'pob', 'apt', 'ninja', 'trade', 'goal', 'today', 'fate', 'threads'];
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
  breaks: { enabled: true, campaign: true, everyMin: 60 },
  // Home goal: an item to save for. Price from poe.ninja; `divines` is the fixed fallback when it isn't found.
  goal: { name: 'Mageblood', divines: null },
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
  c.goal.name = String(c.goal.name || '').slice(0, 80);
  c.weSync.everyMin = Math.min(180, Math.max(15, Math.round(Number(c.weSync.everyMin) || 30)));
  c.launch.custom = (Array.isArray(c.launch.custom) ? c.launch.custom : []).filter(x => x && typeof x.target === 'string' && x.target.trim()).slice(0, 20)
    .map((x, i) => ({ id: String(x.id || 'c' + Date.now().toString(36) + i).slice(0, 40), name: String(x.name || '').slice(0, 60) || path.basename(x.target.trim()).replace(/\.exe$/i, ''), target: x.target.trim().slice(0, 500), on: x.on !== false }));
  { const d = parseFloat(String(c.goal.divines ?? '').replace(',', '.')); c.goal.divines = Number.isFinite(d) && d > 0 ? d : null; }
  if (!['s', 'm', 'l'].includes(c.overlay.size)) c.overlay.size = 'm';
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
    wealth: wealth ? { ...wealth.summary(leagueStartMs()), syncAt: wealthSyncAt, syncEvery: WEALTH_SYNC_MS, scriptSeenAt: weScriptSeenAt, bgSyncAt: weBgSyncAt, serverError: weServer && weServer.error } : null,
    divRate: sessionDivRate(),
    breakPrompt,
    goal: goalInfo(),
    pobBuild,
    today: todayStats(),
  };
}

// Every second: a full snapshot only to windows that haven't seen the current data yet,
// otherwise just the running timers. Hidden or minimized windows get nothing (they catch up when shown).
const sentKey = new Map(); // webContents id -> data key last sent
const hiddenWc = new Set(); // windows whose page reports it can't be seen (covered by the game, etc.)
let lastIdleTick = 0;
function statusKey() {
  return JSON.stringify([gen, breakPrompt && breakPrompt.shownAt, ninja.cache && ninja.cache.at, config.data.goal, pobBuild && pobBuild.file + pobBuild.mtime, icons ? icons.rev : 0, wealth ? [wealth.rev, wealth.lastError, wealthSyncAt, weBgSyncAt, Math.floor(weScriptSeenAt / 300000)] : 0, tracker ? tracker.rev : -1, gameRunning, caughtUp, catchup, logMissing, hotkeyStatus, overlayUnlocked,
    profileStatus, neversinkLatest, config.data.neversink, pathsCache, leagueDb && leagueDb.corruptFile]);
}
function broadcast() {
  const wins = [dashWin, overlayWin].filter(w => w && !w.isDestroyed() && w.isVisible() && !w.isMinimized() && !hiddenWc.has(w.webContents.id));
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
  for (const w of [dashWin, overlayWin]) if (w && !w.isDestroyed()) w.webContents.send('config', c);
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
const BREAK_PROMPT_MS = 15 * 1000;
const BREAK_AFTER_ZONE_MS = 10 * 1000;
let idleSince = null;      // start of the current idle stretch (only once it is long enough to matter)
let breakPrompt = null;    // { shownAt, sinceMs } while "Take a break?" is on screen
let breakSnoozeUntil = 0;

function takeBreak() {
  breakPrompt = null;
  if (tracker && tracker.s.session && !tracker.s.session.ended) { const now = Date.now(); tracker.addBreak(now, now, 'manual'); }
}

function breakTick() {
  if (!tracker || !caughtUp || !gameRunning) { idleSince = null; breakPrompt = null; return; }
  const se = tracker.s.session;
  if (!se || se.ended) return;
  const now = Date.now();
  const idleMs = powerMonitor.getSystemIdleTime() * 1000;
  if (idleMs >= BREAK_IDLE_MS) {
    if (idleSince == null) idleSince = now - idleMs;
    breakPrompt = null;
    return;
  }
  if (idleSince != null) { // back from being away
    const end = now - idleMs;
    if (end - idleSince >= BREAK_IDLE_MS) tracker.addBreak(idleSince, end, 'idle');
    idleSince = null;
  }
  if (breakPrompt) {
    const a = tracker.s.area;
    const left = !a || (a.kind !== 'hideout' && a.kind !== 'town'); // into a map: gone at once, never asked in a map
    if (left || now - breakPrompt.shownAt > BREAK_PROMPT_MS) { breakPrompt = null; breakSnoozeUntil = now + BREAK_SNOOZE_MS; }
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
  breakPrompt = { shownAt: now, sinceMs: since };
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
let weServer = null, weScriptSeenAt = 0, weBgSyncAt = 0, weBgPrev = 0; // weBgPrev: put back when the script reports it couldn't sync
function weDecide() {
  const b = config.data.weSync;
  const go = !!wealth && caughtUp && shouldSync({
    enabled: b.background, everyMin: b.everyMin, gameRunning, now: Date.now(),
    idleMs: powerMonitor.getSystemIdleTime() * 1000,
    area: tracker && tracker.s.area,
    lastSyncAt: Math.max(wealthSyncAt, weBgSyncAt), lastExportAt: wealth.latestAt(),
  });
  if (go) { weBgPrev = weBgSyncAt; weBgSyncAt = Date.now(); }
  return go;
}
function startWeSync() {
  weServer = new WeSyncServer({ decide: weDecide, onAsk: () => { weScriptSeenAt = Date.now(); }, onFailed: () => { weBgSyncAt = weBgPrev; } });
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
    results.push({ target: t, ...(await launchExe(t)) });
  }
  return results;
}

// ---------- goal & today ----------
const ninja = new NinjaPrice({ fetch, userAgent: `Exilogue/${app.getVersion()} (personal companion app)` });
function goalInfo() {
  const g = config.data.goal;
  if (!g.name) return null;
  const live = ninja.get(config.data.league.name, g.name);
  const price = live && live.divines ? live.divines : g.divines;
  return { name: g.name, price: price || null, source: live && live.divines ? 'ninja' : g.divines ? 'fixed' : null, at: live ? live.at : null };
}

// "Today" starts at 05:00, so a night session past midnight still counts as the same day.
const DAY_START_HOUR = 5;
function todayStart(now = Date.now()) {
  const d = new Date(now); d.setHours(DAY_START_HOUR, 0, 0, 0);
  if (d.getTime() > now) d.setDate(d.getDate() - 1);
  return d.getTime();
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
  const best = maps.reduce((b, m) => (!b || m.activeMs < b.activeMs ? m : b), null);
  const first = evs[0] || (se && !se.ended ? { t: se.start } : null);
  return {
    from, firstAt: first ? Math.max(first.t, from) : null, sessions,
    levelFrom: levels.length ? levels[0].level - 1 : null, levelTo: levels.length ? levels[levels.length - 1].level : null,
    breakMs: breaks.reduce((n, e) => n + (e.ms || 0), 0),
    newTiers: evs.filter(e => e.type === 'tier').length,
    maps: maps.length, deaths: evs.filter(e => e.type === 'death').length,
    best: best && { zone: best.zone, areaId: best.areaId, tier: best.tier, activeMs: best.activeMs },
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
    if (which === 'apt') return launchExe(P.aptExe);
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
    if (left > 0) { shell.openExternal(WEALTH_URL); return { ok: false, left }; }
    wealthSyncAt = Date.now();
    shell.openExternal(WEALTH_URL + '#exilogue-sync');
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
  ipcMain.on('win:min', () => dashWin && dashWin.minimize());
  ipcMain.on('win:max', () => dashWin && (dashWin.isMaximized() ? dashWin.unmaximize() : dashWin.maximize()));
  ipcMain.on('win:close', () => dashWin && dashWin.close());
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
  config = new JsonStore(path.join(dir, 'config.json'), DEFAULT_CONFIG);
  sanitizeConfig();
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
  setInterval(goalInfo, 5 * 60 * 1000); // keeps the poe.ninja price fresh (it refreshes at most hourly)
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
  const refreshIcons = () => icons.refresh({ poeExe: config.data.paths.poeExe, pobExe: config.data.paths.pobExe, aptExe: config.data.paths.aptExe, mapName: bestMapName() }).catch(() => {});
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
