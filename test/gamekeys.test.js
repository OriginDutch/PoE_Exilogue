'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseActionKeys, accelToKey, gameUse } = require('../src/core/gamekeys');

const INI = '[ACTION_KEYS]\r\nuse_flask_in_slot1=49\r\nuse_bound_skill1=1\r\nuse_bound_skill9=81 2\r\nopen_inventory_panel=73\r\nskip_encounter_delay=0\r\ntake_screenshot=119\r\nmirage_open_portal=118\r\nopen_atlas_passives_screen=71 2\r\n[DISPLAY]\r\nfoo=65 2\r\n';

test('gamekeys: reads keyboard binds from [ACTION_KEYS] only, skips mouse buttons and unbound', () => {
  const b = parseActionKeys(INI);
  assert.deepEqual(b.map(x => x.action), ['use_flask_in_slot1', 'use_bound_skill9', 'open_inventory_panel', 'take_screenshot', 'mirage_open_portal', 'open_atlas_passives_screen']);
  assert.deepEqual(b[1], { action: 'use_bound_skill9', vk: 81, mods: 2 });
  assert.deepEqual(parseActionKeys(''), []);
  assert.deepEqual(parseActionKeys(null), []);
});

test('gamekeys: accelerators to virtual keys', () => {
  assert.deepEqual(accelToKey('Ctrl+Q'), { vk: 81, mods: 2 });
  assert.deepEqual(accelToKey('Ctrl+Alt+T'), { vk: 84, mods: 3 });
  assert.deepEqual(accelToKey('Shift+F8'), { vk: 119, mods: 4 });
  assert.deepEqual(accelToKey('num5'), { vk: 101, mods: 0 });
  assert.deepEqual(accelToKey('F13'), { vk: 124, mods: 0 });
  assert.deepEqual(accelToKey('Ctrl+1'), { vk: 49, mods: 2 });
  assert.equal(accelToKey('Ctrl+Nope'), null);
  assert.equal(accelToKey(''), null);
});

test('gamekeys: finds the game action a combination belongs to', () => {
  const b = parseActionKeys(INI);
  assert.equal(gameUse('Ctrl+Q', b), 'Use bound skill 9');
  assert.equal(gameUse('Ctrl+G', b), 'Open atlas passives screen');
  assert.equal(gameUse('Ctrl+Alt+Q', b), null); // other modifiers: free
  assert.equal(gameUse('Ctrl+Alt+T', b), null);
  assert.equal(gameUse('Ctrl+C', b), 'Copy item text'); // always used, even without binds
  assert.equal(gameUse('Ctrl+Alt+C', []), 'Copy item text (advanced)');
  assert.equal(gameUse('Ctrl+F', []), 'Search');
  assert.equal(gameUse('num5', b), null);
});

test('gamekeys: the default Exilogue hotkeys are free with the default game binds', () => {
  const b = parseActionKeys(INI);
  for (const acc of ['Ctrl+Alt+T', 'Ctrl+Alt+L', 'Ctrl+Alt+J']) assert.equal(gameUse(acc, b), null);
});

test('gamekeys: the game writes one modifier as 1 = Shift, 2 = Ctrl, 3 = Alt', () => {
  const b = parseActionKeys('[ACTION_KEYS]\nfoo=88 1\nbar=84 3\nbaz=75 9\n');
  assert.equal(gameUse('Shift+X', b), 'Foo');
  assert.equal(gameUse('Alt+X', b), null);
  assert.equal(gameUse('Alt+T', b), 'Bar');
  assert.equal(gameUse('Ctrl+Alt+T', b), null);
  assert.equal(b.length, 2); // unknown modifier skipped
  assert.equal(gameUse('CommandOrControl+C', []), 'Copy item text');
});
