'use strict';
// Builds realistic demo snapshots by feeding a synthetic Client.txt through the real tracker.
const { parseLine } = require('../src/core/parser');
const { Tracker } = require('../src/core/tracker');

const pad = n => String(n).padStart(2, '0');
function stamp(t) { const d = new Date(t); return `${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; }

function build(scenario) {
  let clock = new Date(2026, 10, 13, 20, 5, 0).getTime();
  const tr = new Tracker();
  const feed = l => tr.apply(parseLine(l));
  const gen = (lvl, id) => feed(`${stamp(clock)} 1 a [DEBUG Client 1] Generating level ${lvl} area "${id}" with seed ${Math.floor(Math.random()*1e9)}`);
  const enter = z => feed(`${stamp(clock)} 1 a [INFO Client 1] : You have entered ${z}.`);
  const lvl = (n, c, l) => feed(`${stamp(clock)} 1 a [INFO Client 1] : ${n} (${c}) is now level ${l}`);
  const slain = n => feed(`${stamp(clock)} 1 a [INFO Client 1] : ${n} has been slain.`);
  const wait = s => { clock += s * 1000; };
  feed(`${stamp(clock)} ***** LOG FILE OPENING *****`);

  const acts = [
    [1, 'The Coast', 'The Ledge', 'The Submerged Passage'], [2, 'The Southern Forest', 'The Riverways', 'The Wetlands'],
    [3, 'The City of Sarn', 'The Crematorium', 'The Ebony Barracks'], [4, 'The Aqueduct', 'The Mines Level 1', 'The Crystal Veins'],
    [5, 'The Slave Pens', 'The Control Blocks', 'The Cathedral Rooftop'], [6, "The Twilight Strand", 'The Mud Flats', 'The Karui Fortress'],
    [7, 'The Broken Bridge', 'The Fellshrine Ruins', 'The Crypt'], [8, 'The Sarn Ramparts', 'The Toxic Conduits', 'The Grand Promenade'],
    [9, 'The Blood Aqueduct', 'The Vastiri Desert', 'The Quarry'], [10, 'The Cathedral Rooftop', 'The Ravaged Square', 'The Feeding Trough'],
  ];
  function campaign(name, cls, pace, deathsIn, uptoAct) {
    gen(1, '1_1_1'); enter('The Twilight Strand'); wait(40); lvl(name, cls, 2);
    let level = 2;
    for (const [act, ...zones] of acts) {
      if (act > uptoAct) break;
      zones.forEach((z, i) => {
        const al = Math.min(67, act * 6 + i); gen(al, `${act <= 5 ? 1 : 2}_${act}_${i + 2}`); enter(z);
        wait(pace * (300 + i * 90)); level = Math.max(level + 1, al - 1); lvl(name, cls, Math.min(level, 68));
        if (deathsIn.includes(z)) { slain(name); }
        if (i === 1) { gen(act * 6, `${act <= 5 ? 1 : 2}_${act}_town`); enter('Town'); wait(70); }
      });
    }
  }
  campaign('TerribleLizard', 'Witch', 1.0, ['The Ebony Barracks', 'The Cathedral Rooftop', 'The Feeding Trough'], 10);
  gen(67, '3_10_town'); enter('Karui Shores'); wait(300);

  const mapPool = [['MapWorldsStrand', 'Strand Map'], ['MapWorldsBeach', 'Beach Map'], ['MapWorldsDunes', 'Dunes Map'],
    ['MapWorldsCrimsonTemple', 'Crimson Temple Map'], ['MapWorldsCemetery', 'Cemetery Map'], ['MapWorldsTowerB', 'Tower Map'],
    ['MapWorldsCity', 'City Square Map'], ['MapWorldsJungleValley', 'Jungle Valley Map'], ['MapWorldsCanyon', 'Canyon Map']];
  let lv = 68, mapsDone = 0;
  const deathMaps = ['Crimson Temple Map', 'Tower Map'];
  for (let i = 0; i < 46; i++) {
    const [id, z] = mapPool[i % mapPool.length];
    const tierLevel = Math.min(68 + Math.floor(i / 3), 81);
    gen(tierLevel, id); enter(z); wait(200 + (i * 37) % 160);
    if (deathMaps.includes(z) && i % 2) slain('TerribleLizard');
    gen(1, 'HideoutLuxurious'); enter('Luxurious Hideout'); wait(60); enter(z); wait(70);
    if (i % 4 === 0) lvl('TerribleLizard', 'Witch', Math.min(70 + Math.floor(i / 3), 86));
    gen(1, 'HideoutLuxurious'); enter('Luxurious Hideout'); wait(90);
    mapsDone++;
  }
  if (scenario === 'leveling') {
    campaign('LizardTwo', 'Ranger', 0.85, ['The Crematorium'], 7);
    return { tr, now: clock + 135000 };
  }
  lvl('TerribleLizard', 'Witch', 86);
  tr.setProfile([{ name: 'TerribleLizard', class: 'Occultist', level: 86, league: 'Covens of Umbra', lastLoginTime: 0 },
    { name: 'Blitz_Krieg_Bob', class: 'Warden', level: 89, league: 'Standard', lastLoginTime: 1764192627 }], clock);
  gen(80, 'MapWorldsCrimsonTemple'); enter('Crimson Temple Map'); wait(140);
  return { tr, now: clock };
}

function snapshot(scenario) {
  if (scenario === 'empty' || scenario === 'first' || scenario === 'nolog') {
    const tr = new Tracker(); const now = Date.now();
    return { now, gameRunning: false, caughtUp: true, catchup: null, logMissing: scenario === 'nolog',
      paths: { clientTxt: scenario === 'empty', poeExe: scenario !== 'first', pobExe: false },
      neversink: { latest: { tag: '8.21.0', publishedAt: new Date(now - 5 * 3600e3).toISOString(), url: 'https://github.com' }, lastSyncedTag: null, syncedAt: null },
      hotkeys: { toggleOverlay: 'ok', unlockOverlay: 'ok', focusDashboard: 'ok' }, overlayUnlocked: false,
      stats: scenario === 'empty' ? tr.snapshot(now) : null, events: [] };
  }
  const { tr, now } = build(scenario);
  return {
    now, gameRunning: scenario !== 'off', caughtUp: true,
    catchup: scenario === 'reading' ? { from: 0, at: 412e6, to: 1.31e9 } : null, logMissing: false,
    paths: { clientTxt: true, poeExe: true, pobExe: true },
    neversink: { latest: { tag: '8.21.0', name: '8.21.0', publishedAt: new Date(now - 5 * 3600e3).toISOString(), url: 'https://github.com' }, lastSyncedTag: '8.20.4', syncedAt: now - 3 * 86400e3 },
    hotkeys: { toggleOverlay: 'ok', unlockOverlay: 'taken', focusDashboard: 'ok' }, overlayUnlocked: false,
    profileStatus: { state: 'ok', count: 2, at: now },
    stats: tr.snapshot(now), events: tr.events(),
  };
}
module.exports = { snapshot };
if (require.main === module) console.log(JSON.stringify(snapshot(process.argv[2] || 'mapping').stats.totals));
