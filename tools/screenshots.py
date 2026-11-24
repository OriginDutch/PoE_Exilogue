import json, subprocess, sys, pathlib
from playwright.sync_api import sync_playwright
root = pathlib.Path(__file__).resolve().parent.parent
out = root / 'mockups'; out.mkdir(exist_ok=True)
base_cfg = {
  "paths": {"clientTxt": "C:\\Program Files (x86)\\Grinding Gear Games\\Path of Exile\\logs\\Client.txt",
            "poeExe": "C:\\Program Files (x86)\\Grinding Gear Games\\Path of Exile\\PathOfExile_x64.exe",
            "pobExe": "C:\\Users\\you\\AppData\\Roaming\\Path of Building Community\\Path of Building.exe", "aptExe": "C:\\Users\\you\\AppData\\Local\\Programs\\Awakened PoE Trade\\Awakened PoE Trade.exe"},
  "account": "DemoExile#1234", "league": {"name": "Covens of Umbra", "start": "2026/11/13 20:00:00"},
  "overlay": {"enabled": True, "bounds": None, "size": "m", "font": "app", "show": {"zone": True, "map": True, "campaign": True, "splits": True, "session": True}},
  "hotkeys": {"toggleOverlay": "Ctrl+Alt+T", "unlockOverlay": "Ctrl+Alt+L", "focusDashboard": "Ctrl+Alt+J"},
  "ui": {"theme": "system", "darkPalette": "night", "lightPalette": "paper", "font": "source", "motion": True, "sidebarCollapsed": False, "welcomeDone": True},
  "layout": {"order": ["poe","maps","campaign","wealthy","overlay","filter","pob","apt","ninja","trade","goal","today","fate","threads"], "sizes": {}, "hidden": {}},
  "breaks": {"enabled": True, "campaign": True, "everyMin": 60, "sound": {"on": True, "volume": 50}},  "sheets": {"list": [{"id": "a1", "name": "Blight-strat", "unit": "chaos", "view": "ratio", "stack": 10, "sort": "manual", "items": [{"type": "Thread", "id": "abyss-thread", "name": "Abyss Thread", "label": "", "override": None, "view": None},{"type": "Thread", "id": "legion-thread", "name": "Legion Thread", "label": "", "override": None, "view": None},{"type": "Thread", "id": "blight-thread", "name": "Blight Thread", "label": "", "override": 2.7, "view": None},{"type": "Thread", "id": "bestiary-thread", "name": "Bestiary Thread", "label": "", "override": None, "view": None},{"type": "Thread", "id": "ultimatum-thread", "name": "Ultimatum Thread", "label": "", "override": None, "view": None},{"type": "Thread", "id": "breach-thread", "name": "Breach Thread", "label": "", "override": None, "view": None},{"type": "Thread", "id": "betrayal-thread", "name": "Betrayal Thread", "label": "", "override": None, "view": None},{"type": "Thread", "id": "incursion-thread", "name": "Incursion Thread", "label": "", "override": None, "view": None},{"type": "Thread", "id": "expedition-thread", "name": "Expedition Thread", "label": "", "override": None, "view": None},{"type": "Thread", "id": "ritual-thread", "name": "Ritual Thread", "label": "", "override": None, "view": None}]}, {"id": "b2", "name": "Oils", "unit": "chaos", "view": "each", "stack": 10, "sort": "value", "items": []}], "active": "a1", "seeded": True, "win": {"x": None, "y": None, "w": 440, "h": 600, "pin": False}}, "goal": {"name": "Mageblood", "id": "mageblood-4-flasks-heavy-belt", "type": "UniqueAccessory", "label": "4 Flasks", "divines": None},
  "launch": {"pob": True, "apt": True, "we": True, "custom": [{"id": "c1", "name": "Sidekick", "target": "C:\\Tools\\Sidekick.exe", "on": False}]}, "weSync": {"background": True, "everyMin": 30, "setup": "done"}, "essences": {"enabled": True, "display": None},
  "window": {}, "neversink": {}, "systemDark": True, "overlayUnlocked": False, "platform": "win32"}
cache = {}
def snap(s):
    if s not in cache:
        cache[s] = subprocess.check_output(['node','-e',f"process.stdout.write(JSON.stringify(require('./tools/demo-data').snapshot('{s}')))"], cwd=root).decode()
    return cache[s]
stub = """
window.__SNAP = %s; window.__CFG = %s;
if (window.__ICONS) window.__SNAP.icons = window.__ICONS;
if (window.__WEALTH) window.__SNAP.wealth = window.__WEALTH;
if (window.__SNAP.stats) { const n = window.__SNAP.now;
  window.__SNAP.wealth = window.__SNAP.wealth || {history:[[41,70],[43,69],[42,68.5],[47,50],[49,49],[48,48.5],[53,30],[55,29],[54,28],[58,6],[61,4],[60,2],[64.2,0]].map(([d,h])=>({t:n-h*3600e3, divines:d})), count:3, at: n-12*60e3, chaos:58350, divPrice:909, divines:64.2, delta:2900, prevAt: n-3*3600e3, top:[{name:'Divine Orb',qty:42,total:38157},{name:'Headhunter',qty:1,total:12000},{name:'Orb of Chance',qty:3048,total:4755}], error:null, syncAt: n-20*60e3, syncEvery: 300000};
  window.__SNAP.pobBuild = {name:'ED Trickster 3.30', file:'C:\\Users\\you\\Documents\\Path of Building\\Builds\\ED Trickster 3.30.xml', mtime:n-14*3600e3, level:92, cls:'Shadow', asc:'Trickster', skill:'Essence Drain', stats:{CombinedDPS:2412000, Life:4850, EnergyShield:2100, Evasion:6800, EffectiveSpellSuppressionChance:100, FireResist:76, ColdResist:76, LightningResist:75, ChaosResist:-12}};
  window.__SNAP.apt = {running:true, launchedAt:n-593*60e3, key:'Ctrl + D'};
  window.__SNAP.prices = {divineChaos:95.7, at:n, changes:{'Headhunter':8.2, 'Orb of Chance':-3.1}};
  window.__SNAP.paths.aptExe = true;
  if (window.__SNAP.neversink && window.__SNAP.neversink.latest) window.__SNAP.neversink.latest.notes = ['Currency tiers rebalanced for 3.30','Added styles for the new Coven items','Omens moved to their own tier list','Fixed Divination Card colours','Strictness levels retuned'];
  window.__SNAP.divRate = window.__SNAP.divRate || {divines: 1.3, perHour: 0.41};
  window.__SNAP.league = window.__SNAP.league || {perDay:[{day:1,maps:3,avgMs:262000,deaths:1},{day:2,maps:18,avgMs:241000,deaths:6},{day:3,maps:0,avgMs:null,deaths:0},{day:4,maps:39,avgMs:211000,deaths:13},{day:5,maps:44,avgMs:205000,deaths:5},{day:6,maps:22,avgMs:198000,deaths:2}].map(d=>({...d,date:n})),
    fun:[{text:'18 h 40 min inside maps',sub:'over 126 maps this league'},{text:'Graveyard took 7 of your lives',sub:'the map you died in most'}]};
  window.__SNAP.sheets = window.__SNAP.sheets || {prices:{'Thread:abyss-thread':{chaos:3.5},'Thread:legion-thread':{chaos:3.12},'Thread:blight-thread':{chaos:1.42},'Thread:bestiary-thread':{chaos:1.57},'Thread:ultimatum-thread':{chaos:2.14},'Thread:breach-thread':{chaos:0.3555},'Thread:betrayal-thread':{chaos:0.282},'Thread:incursion-thread':{chaos:0.2183},'Thread:expedition-thread':{chaos:0.2198},'Thread:ritual-thread':{chaos:0.6211}}, at:n-300000, partial:false, divineChaos:151, iconIds:{}};
  window.__SNAP.goal = window.__SNAP.goal || {name:'Mageblood', label:'4 Flasks', art:'goal-mageblood', price:107, source:'ninja', at:n, change:-2};
  window.__SNAP.mostRun = {zone:'Strand Map', tier:14, runs:11};
  window.__SNAP.today = window.__SNAP.today || {from:n-8*3600e3, firstAt:n-4*3600e3, sessions:2, levelFrom:83, levelTo:86, breakMs:24*60e3, newTiers:2, maps:23, deaths:3, mostRun:{zone:'Strand Map', tier:14, runs:5}, deadliest:{zone:'Tower Map', tier:13, deaths:2}};
  if (window.__SNAP.stats.session) Object.assign(window.__SNAP.stats.session, {breaks:2, breakMs:24*60e3, lastBreakEnd:n-41*60e3});
  window.__SNAP.stats.lastSession = window.__SNAP.stats.lastSession || {start:n-30*3600e3, end:n-25*3600e3, playedMs:5*3600e3, maps:31, deaths:4, levelFrom:80, levelTo:83, breaks:3, breakMs:30*60e3, wealthDiv:1.4, divPerHour:0.29};
}
const nowFix = window.__SNAP.now; Date.now = () => nowFix;
const deep = (a,b)=>{for(const k in b){if(b[k]&&typeof b[k]==='object'&&!Array.isArray(b[k])&&a[k]&&typeof a[k]==='object')deep(a[k],b[k]);else a[k]=b[k];}return a;};
window.ej = { getConfig: async () => window.__CFG, setConfig: async p => deep(window.__CFG, p), snapshot: async () => window.__SNAP,
  events: async q => { const all = (window.__SNAP.events || []).slice().reverse().filter(e => (!q || q.char === 'all' || e.char === q.char) && (!q || !q.types || q.types.includes(e.type))); return { rows: all.slice(0, (q && q.limit) || 200), total: all.length, any: (window.__SNAP.events || []).length }; }, allMaps: async () => (window.__SNAP.stats ? (window.__SNAP.stats.recentMaps || []) : []), launch: async () => ({ok:true}), openUrl: async()=>{}, pickFile: async()=>null,
  neversinkSynced: async()=>{}, resetLeague: async()=>{}, listBackups: async()=>[{file:'state.backup-1.json',at:nowFix-86400e3,size:48000}],
  restoreBackup: async()=>({ok:true}), lockOverlay: async()=>{}, resetOverlay: async()=>{}, overlayBounds: async()=>({x:0,y:0,width:280,height:200}),
  fitOverlay: ()=>{}, setOverlayBounds: ()=>{}, overlayBoundsDone: ()=>{}, setVisible: ()=>{},
  icons: async () => (window.__ICONS || {}), weSetupInfo: async () => ({browser:'chrome'}), weSetupOpen: async () => true, weSetupCopy: async () => true, weSetupSkip: async () => true,
  storage: async () => ({ io: { since: nowFix - 9*86400e3, dbWritten: 31.4*1048576, backupWritten: 6.2*1048576, configWritten: 412*1024, logRead: 186*1048576, otherRead: 2.3*1048576 },
    files: { database: 7.8*1048576, backups: 15.1*1048576, backupCount: 3, keepBackups: 10, config: 3200, other: 2331, engine: 38.5*1048576, total: 61.4*1048576 }, clientTxt: 612*1048576, dir: 'C:/Users/you/AppData/Roaming/Exilogue' }),
  win: { min(){}, max(){}, close(){}, state: async()=>({maximized:false}), onState(){} },
  onSnapshot: fn => {}, onTick: fn => {}, onConfig: fn => {}, onOverlayUnlocked: fn => { if (window.__UNLOCK) setTimeout(()=>fn(true), 10); } };
window.ej = new Proxy(window.ej, { get: (t, k) => (k in t ? t[k] : () => Promise.resolve(null)) }); // newer IPC not stubbed yet
"""
def cfg(**kw):
    c = json.loads(json.dumps(base_cfg))
    for k, v in kw.items():
        cur = c
        parts = k.split('__')
        for p in parts[:-1]: cur = cur[p]
        cur[parts[-1]] = v
    return c
shots = [
  ('01-home', 'mapping', 'home', {}, (1440, 1000), None),
  ('01b-home-tall', 'mapping', 'home', {}, (1440, 1420), None),
  ('01b-home-wide', 'mapping', 'home', {}, (2400, 1300), None),
  ('02-home-leveling', 'leveling', 'home', {}, (1440, 1240), None),
  ('03-home-light-compact', 'mapping', 'home', {'ui__theme':'light','ui__sidebarCollapsed':True,'ui__font':'bahnschrift'}, (900, 760), None),
  ('04-home-off', 'off', 'home', {}, (1440, 1000), None),
  ('05-home-first', 'first', 'home', {'ui__welcomeDone': False}, (1440, 1000), None),
  ('06-home-nolog', 'nolog', 'home', {}, (1440, 1000), None),
  ('07-home-reading', 'reading', 'home', {}, (1440, 900), None),
  ('08-edit-layout', 'mapping', 'home', {'layout__sizes': {'poe':'xl','ninja':'xs','trade':'l'}}, (1440, 1300), 'edit'),
  ('09-page-poe', 'mapping', 'page:poe', {}, (1440, 1000), None),
  ('10-page-maps', 'mapping', 'page:maps', {}, (1440, 1400), None),
  ('11-page-campaign-run', 'leveling', 'page:campaign', {}, (1440, 1200), None),
  ('12-page-campaign-done', 'mapping', 'page:campaign', {}, (1440, 1200), None),
  ('13-page-overlay', 'mapping', 'page:overlay', {}, (1440, 1000), None),
  ('13b-page-sheets', 'mapping', 'page:sheets', {}, (1440, 1000), None),
  ('14-page-filter', 'mapping', 'page:filter', {}, (1440, 820), None),
  ('15-events', 'mapping', 'events', {}, (1440, 1300), None),
  ('16-settings-appearance', 'mapping', 'settings', {}, (1440, 1200), None),
  ('17-settings-paths', 'mapping', 'settings:paths', {}, (1440, 800), None),
  ('18-settings-league', 'mapping', 'settings:league', {}, (1440, 1000), None),
  ('19-settings-hotkeys', 'mapping', 'settings:hotkeys', {}, (1440, 900), None),
  ('20-home-empty', 'empty', 'home', {}, (1440, 1000), None),
  ('26-icon-filter', 'mapping', 'home', {'layout__order': ['filter','poe','maps','campaign','overlay','pob','wealthy','ninja','trade','fate','threads'], 'layout__sizes': {'poe':'xl','filter':'xl','pob':'l','maps':'m'}}, (1440, 1100), None),
  ('27-wealthy', 'mapping', 'home', {'layout__order': ['wealthy','filter','poe','maps','campaign','overlay','pob','ninja','trade','fate','threads'], 'layout__sizes': {'poe':'xl','wealthy':'l','maps':'m'}}, (1440, 1000), None),
  ('28-settings-launch', 'mapping', 'settings:launch', {}, (1440, 1100), None),
  ('25-settings-storage', 'mapping', 'settings:storage', {}, (1440, 1100), None),
]
only = sys.argv[1:]
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    for name, scen, view, kw, (w, h), action in shots:
        if only and name not in only: continue
        pg = b.new_page(viewport={'width': w, 'height': h})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pre = 'window.__ICONS = ' + open(root/'tools/demo-icons.json').read() + ';\n'
        if name.startswith('27-'):
            pre = "window.__WEALTH = {count:3, at: Date.now()-12*60e3, chaos:196944, divPrice:909, divines:196944/909, delta:12400, prevAt: Date.now()-3*3600e3, top:[{name:'Mageblood',qty:1,total:135285},{name:'Divine Orb',qty:42,total:38157},{name:'Orb of Chance',qty:3048,total:4755}], error:null};\n"
        if name.startswith('26-'):
            ph = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><defs><pattern id='h' width='6' height='6' patternUnits='userSpaceOnUse' patternTransform='rotate(45)'><rect width='3' height='6' fill='%23889'/></pattern></defs><rect x='4' y='4' width='56' height='56' rx='12' fill='url(%23h)' stroke='%23aab' stroke-width='2'/><text x='32' y='37' font-size='11' text-anchor='middle' fill='%23fff' font-family='sans-serif'>ICON</text></svg>"
            pre += "window.__ICONS.filter = \"data:image/svg+xml;utf8," + ph + "\";\n"
        pg.add_init_script(pre + (stub % (snap(scen), json.dumps(cfg(**kw)))))
        pg.goto((root/'src/renderer/index.html').as_uri() + '#' + view)
        pg.wait_for_timeout(500)
        if action == 'edit':
            pg.click('[data-act="edit"]'); pg.wait_for_timeout(300)
        pg.screenshot(path=str(out/f'{name}.png'))
        if errs: print(name, 'ERR', errs)
        pg.close()
    for name, scen, kw, unlock in [('21-overlay-mapping','mapping',{},False),('22-overlay-leveling','leveling',{},False),('23-overlay-paused','off',{'overlay__show':{'zone':True,'map':True,'campaign':False,'splits':False,'session':True}},False),('24-overlay-unlocked','mapping',{'overlay__show':{'zone':False,'map':True,'campaign':False,'splits':False,'session':True}},True)]:
        if only and name not in only: continue
        pg = b.new_page(viewport={'width': 320, 'height': 420}, device_scale_factor=2)
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.add_init_script(stub % (snap(scen), json.dumps(cfg(**kw))) + ('window.__UNLOCK=true;' if unlock else ''))
        pg.goto((root/'src/overlay/overlay.html').as_uri())
        pg.wait_for_timeout(500)
        pg.evaluate("document.body.style.background='linear-gradient(160deg,#2a2f22,#151a17 40%,#2b2018 70%,#101418)'")
        pg.screenshot(path=str(out/f'{name}.png'))
        if errs: print(name, 'ERR', errs)
        pg.close()
    b.close()
print('ok')
