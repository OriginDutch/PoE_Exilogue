'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { NinjaPrice } = require('../src/main/ninja');

const resp = obj => ({ ok: true, status: 200, text: async () => JSON.stringify(obj) });
const wait = () => new Promise(r => setTimeout(r, 10));

test('ninja: finds the item across categories, prefers the plain version, remembers the category', async () => {
  const urls = [];
  const fetch = async url => {
    urls.push(url);
    if (url.includes('UniqueAccessory')) return resp({ lines: [{ name: 'Mageblood', chaosValue: 30000, divineValue: 150, detailsId: 'mageblood-heavy-belt' }, { name: 'Mageblood', chaosValue: 40000, divineValue: 200, detailsId: 'mageblood-heavy-belt-relic' }] });
    return resp({ lines: [] });
  };
  const n = new NinjaPrice({ fetch, userAgent: 't' });
  assert.equal(n.get('Covens of Umbra', 'Mageblood'), null);
  await wait();
  const c = n.get('Covens of Umbra', 'mageblood');
  assert.equal(c.divines, 150);
  assert.ok(urls[0].includes('league=Covens%20of%20Umbra'));
});

test('ninja: an unknown item fails quietly and waits before retrying', async () => {
  let calls = 0;
  const n = new NinjaPrice({ fetch: async () => { calls++; return resp({ lines: [] }); }, userAgent: 't' });
  n.get('L', 'Nope'); await wait();
  const before = calls;
  n.get('L', 'Nope'); await wait();
  assert.equal(calls, before);
  assert.ok(n.failed && n.failed.wait >= 3600e3);
  n.get('L', 'Other'); await wait();
  assert.ok(calls > before); // another name is looked up right away
});
