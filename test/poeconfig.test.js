'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseDisplay, matchDisplay, exclusiveFullscreen } = require('../src/core/poeconfig');

const INI = '[ACTION_KEYS]\r\nresolution_width=1\r\n[DISPLAY]\r\nadapter_name=AMD Radeon RX 9070 XT - Q27G2WG4\r\nresolution_width=2560\r\nfullscreen=false\r\nborderless_windowed_fullscreen=true\r\nresolution_height=1440\r\n[GENERAL]\r\nresolution_height=5\r\n';

test('poeconfig: reads resolution, fullscreen, borderless and monitor from [DISPLAY] only', () => {
  assert.deepEqual(parseDisplay(INI), { monitor: 'Q27G2WG4', width: 2560, fullscreen: false, borderless: true, height: 1440 });
  assert.deepEqual(parseDisplay(''), {});
});

test('poeconfig: monitor name first, then a unique resolution', () => {
  const d = [{ id: 1, label: 'DELL U2415', width: 1920, height: 1200 }, { id: 2, label: 'Q27G2WG4', width: 2560, height: 1440 }];
  assert.deepEqual(matchDisplay(d, parseDisplay(INI)), { id: 2, how: 'monitor' });
  const noLabel = d.map(x => ({ ...x, label: '' }));
  assert.deepEqual(matchDisplay(noLabel, parseDisplay(INI)), { id: 2, how: 'resolution' });
  const twins = [{ id: 1, label: '', width: 2560, height: 1440 }, { id: 2, label: '', width: 2560, height: 1440 }];
  assert.equal(matchDisplay(twins, parseDisplay(INI)), null);
  assert.equal(matchDisplay(d, null), null);
});

test('exclusive fullscreen: only when the file says fullscreen and not borderless', () => {
  assert.equal(exclusiveFullscreen(parseDisplay(INI)), false);
  assert.equal(exclusiveFullscreen(parseDisplay(INI.replace('fullscreen=false', 'fullscreen=true').replace('borderless_windowed_fullscreen=true', 'borderless_windowed_fullscreen=false'))), true);
  assert.equal(exclusiveFullscreen(parseDisplay(INI.replace('fullscreen=false', 'fullscreen=true'))), false);
  assert.equal(exclusiveFullscreen(parseDisplay('[DISPLAY]\nresolution_width=1920\n')), false);
  assert.equal(exclusiveFullscreen(null), false);
});
