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

test('ninja: goal search lists every variant separately; a picked variant keeps its own price', async () => {
  const fetch = async url => {
    if (url.endsWith('/data/index-state')) return resp(INDEX);
    if (url.includes('exchange/current/overview')) return resp(CUR);
    if (url.includes('type=UniqueAccessory')) return resp({ lines: [
      { name: 'Mageblood', variant: '4 Flasks', baseType: 'Heavy Belt', chaosValue: 13501, divineValue: 132.1, icon: PLAIN, detailsId: 'mageblood-4-flasks-heavy-belt' },
      { name: 'Mageblood', variant: '2 Flasks', baseType: 'Heavy Belt', chaosValue: 9913, divineValue: 97, icon: PLAIN, detailsId: 'mageblood-2-flasks-heavy-belt' },
      { name: 'Foulborn Soul Tether', variant: 'Instant Leech', baseType: 'Cloth Belt', chaosValue: 715, divineValue: 7, icon: PLAIN, detailsId: 'foulborn-soul-tether-instant-leech-cloth-belt' },
    ] });
    if (url.includes('type=UniqueArmour')) return resp({ lines: [
      { name: 'The Iron Fortress', baseType: 'Crusader Plate', links: 6, chaosValue: 1100, divineValue: 11.1, icon: PLAIN, detailsId: 'the-iron-fortress-crusader-plate-6l' },
      { name: 'The Iron Fortress', baseType: 'Crusader Plate', chaosValue: 50, divineValue: 0.5, icon: PLAIN, detailsId: 'the-iron-fortress-crusader-plate' },
    ] });
    return resp({ lines: [] });
  };
  const n = new NinjaPrice({ fetch, userAgent: 't' });
  const mb = (await n.search('Covens of Umbra', 'mage')).items;
  assert.deepEqual(mb.map(x => x.label), ['4 Flasks', '2 Flasks']);
  assert.equal(mb[0].type, 'UniqueAccessory');
  const iron = (await n.search('Covens of Umbra', 'iron fortress 6l')).items;
  assert.equal(iron.length, 1);
  assert.equal(iron[0].label, '6L');
  assert.equal((await n.search('Covens of Umbra', 'leech')).items.length, 1); // variant text is searchable
  assert.deepEqual(await n.search('Covens of Umbra', ' '), []);
  assert.equal((await n.search('Covens of Umbra', 'mage')).partial, false);

  // Picked variant: its own price, not the cheapest plain one.
  const pick = { name: 'Mageblood', id: 'mageblood-4-flasks-heavy-belt', type: 'UniqueAccessory' };
  await n.refresh('Covens of Umbra', pick);
  assert.equal(n.get('Covens of Umbra', pick).divines, 132.1);
  assert.equal(n.get('Covens of Umbra', pick).label, '4 Flasks');
  await wait(); // get() starts a background refresh; let it finish
  assert.equal(n.get('Covens of Umbra', 'Mageblood'), null); // a name-only goal is a different goal
  await wait();
  assert.equal(n.get('Covens of Umbra', 'Mageblood').divines, 97);
});

test('ninja: a picked variant that poe.ninja dropped falls back to the name (approximate)', async () => {
  const fetch = async url => {
    if (url.endsWith('/data/index-state')) return resp(INDEX);
    if (url.includes('exchange/current/overview')) return resp(CUR);
    if (url.includes('type=UniqueAccessory')) return resp({ lines: [
      { name: 'Mageblood', variant: '2 Flasks', chaosValue: 9913, divineValue: 97, icon: PLAIN, detailsId: 'mageblood-2-flasks-heavy-belt' },
    ] });
    return resp({ lines: [] });
  };
  const n = new NinjaPrice({ fetch, userAgent: 't' });
  const gone = { name: 'Mageblood', id: 'mageblood-5-flasks-heavy-belt', type: 'UniqueAccessory' };
  await n.refresh('Covens of Umbra', gone);
  const g = n.get('Covens of Umbra', gone);
  assert.equal(g.divines, 97);
  assert.equal(g.approx, true);
});

test('ninja: the goal search shares downloads and backs off after a failure', async () => {
  let calls = 0, down = true;
  const fetch = async url => {
    if (url.endsWith('/data/index-state')) return resp(INDEX);
    if (url.includes('item/overview')) { calls++; await wait(); if (down) return { ok: false, status: 503, text: async () => '' }; return resp({ lines: [] }); }
    return resp({ lines: [] });
  };
  const n = new NinjaPrice({ fetch, userAgent: 't' });
  const [a, b] = await Promise.allSettled([n.search('Covens of Umbra', 'mage'), n.search('Covens of Umbra', 'mage')]);
  assert.equal(a.status, 'rejected'); assert.equal(b.status, 'rejected');
  assert.equal(calls, 7); // two searches, one download per category
  down = false;
  await assert.rejects(n.search('Covens of Umbra', 'mage')); // still waiting out the failure
  assert.equal(calls, 7);
});
