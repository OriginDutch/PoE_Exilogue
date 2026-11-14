'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { NinjaPrice, shortLeague } = require('../src/main/ninja');

const resp = obj => ({ ok: true, status: 200, text: async () => JSON.stringify(obj) });
const wait = () => new Promise(r => setTimeout(r, 20));
const INDEX = { economyLeagues: [{ name: 'Covens' }, { name: 'Hardcore Covens' }, { name: 'Standard' }, { name: 'Hardcore' }] };
const CUR = {
  core: { items: [{ id: 'chaos', name: 'Chaos Orb', image: '/gen/image/x/1/CurrencyRerollRare.png' }, { id: 'divine', name: 'Divine Orb', image: '/gen/image/y/2/CurrencyModValues.png' }], rates: { divine: 0.01045 } },
  lines: [{ id: 'divine', sparkline: { totalChange: 3.5 } }],
};
const RELIC = 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQmVsdHMvSW5qZWN0b3JCZWx0IiwidyI6MiwiaCI6MSwic2NhbGUiOjEsInJlbGljIjoxMX1d/922ddbaf97/InjectorBelt.png';
const PLAIN = 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQmVsdHMvSW5qZWN0b3JCZWx0IiwidyI6MiwiaCI6MSwic2NhbGUiOjF9XQ/21ec0269de/InjectorBelt.png';

test('ninja: short league names', () => {
  assert.equal(shortLeague('Covens of Umbra', INDEX.economyLeagues), 'Covens');
  assert.equal(shortLeague('Hardcore Covens of Umbra', INDEX.economyLeagues), 'Hardcore Covens');
  assert.equal(shortLeague('Standard', INDEX.economyLeagues), 'Standard');
});

test('ninja: divine price, icons, goal (cheapest plain, never relic), changes', async () => {
  const urls = [];
  const fetch = async url => {
    urls.push(url);
    if (url.endsWith('/data/index-state')) return resp(INDEX);
    if (url.includes('exchange/current/overview')) return resp(CUR);
    if (url.includes('type=UniqueAccessory')) return resp({ lines: [
      { name: 'Mageblood', chaosValue: 13394, divineValue: 141.6, icon: PLAIN, detailsId: 'mageblood-3-flasks-heavy-belt' },
      { name: 'Mageblood', chaosValue: 10121, divineValue: 107, icon: PLAIN, detailsId: 'mageblood-4-flasks-heavy-belt', sparkLine: { totalChange: -2 } },
      { name: 'Mageblood', chaosValue: 9000, divineValue: 95, icon: RELIC, detailsId: 'mageblood-2-flasks-heavy-belt' },
    ] });
    return resp({ lines: [] });
  };
  const n = new NinjaPrice({ fetch, userAgent: 't' });
  assert.equal(n.get('Covens of Umbra', 'Mageblood'), null);
  await wait();
  const g = n.get('Covens of Umbra', 'mageblood');
  assert.equal(g.divines, 107);
  assert.ok(g.icon.startsWith('https://web.poecdn.com/'));
  assert.ok(Math.abs(n.currency.divineChaos - 95.69) < 0.01);
  assert.equal(n.currency.icons.divine, 'https://web.poecdn.com/gen/image/y/2/CurrencyModValues.png');
  assert.equal(n.change('Divine Orb'), 3.5);
  assert.equal(n.change('Mageblood'), -2);
  assert.ok(urls.some(u => u.includes('league=Covens&type=UniqueAccessory')));
  assert.ok(urls.every(u => u.startsWith('https://poe.ninja/poe1/api/')));
});

test('ninja: an unknown goal waits long before retrying, another name is looked up right away', async () => {
  let calls = 0;
  const fetch = async url => { calls++; if (url.endsWith('/data/index-state')) return resp(INDEX); if (url.includes('exchange')) return resp(CUR); return resp({ lines: [] }); };
  const n = new NinjaPrice({ fetch, userAgent: 't' });
  n.get('Covens of Umbra', 'Nope'); await wait();
  const before = calls;
  n.get('Covens of Umbra', 'Nope'); await wait();
  assert.equal(calls, before);
  n.get('Covens of Umbra', 'Other'); await wait();
  assert.equal(n.failed.goal.key, 'Covens|other'); // looked up at once (from the categories already loaded)
});
