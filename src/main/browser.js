'use strict';
// Which browser Windows opens links in (for the "Connect Wealthy Exile" steps): read from the https link association.
const { execFile } = require('child_process');

const KEY = 'HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice';

// Tampermonkey in each browser's own add-on store.
const TAMPERMONKEY = {
  firefox: 'https://addons.mozilla.org/firefox/addon/tampermonkey/',
  chrome: 'https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo',
  edge: 'https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd',
  // Tampermonkey's own listing on Opera add-ons (the slug says beta; it is the one tampermonkey.net links for Opera).
  opera: 'https://addons.opera.com/extensions/details/tampermonkey-beta/',
};
const NAMES = { firefox: 'Firefox', chrome: 'Chrome', edge: 'Edge', opera: 'Opera', other: 'your browser' };

// ProgId from `reg query` output → firefox | chrome | edge | opera | other (Opera GX's ProgId has a space: "Opera GXStable")
function browserFromRegOutput(out) {
  const m = /ProgId\s+REG_SZ\s+(.+?)\s*$/im.exec(String(out || ''));
  const id = m ? m[1] : '';
  if (/^FirefoxURL/i.test(id)) return 'firefox';
  if (/^ChromeHTML$/i.test(id)) return 'chrome';
  if (/^MSEdgeHTM$/i.test(id)) return 'edge';
  if (/^Opera/i.test(id)) return 'opera';
  return 'other';
}

function defaultBrowser() {
  if (process.platform !== 'win32') return Promise.resolve('other');
  return new Promise(resolve => {
    execFile('reg', ['query', KEY, '/v', 'ProgId'], { windowsHide: true, timeout: 4000 }, (err, stdout) => resolve(err ? 'other' : browserFromRegOutput(stdout)));
  });
}

module.exports = { defaultBrowser, browserFromRegOutput, TAMPERMONKEY, NAMES };
