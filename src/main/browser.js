'use strict';
// Which browser Windows opens links in (for the "Connect Wealthy Exile" steps): read from the https link association.
const { execFile } = require('child_process');

const KEY = 'HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice';

// Tampermonkey in each browser's own add-on store.
const TAMPERMONKEY = {
  firefox: 'https://addons.mozilla.org/firefox/addon/tampermonkey/',
  chrome: 'https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo',
  edge: 'https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd',
};
const NAMES = { firefox: 'Firefox', chrome: 'Chrome', edge: 'Edge', other: 'your browser' };

// ProgId from `reg query` output → firefox | chrome | edge | other
function browserFromRegOutput(out) {
  const m = /ProgId\s+REG_SZ\s+(\S+)/i.exec(String(out || ''));
  const id = m ? m[1] : '';
  if (/^FirefoxURL/i.test(id)) return 'firefox';
  if (/^ChromeHTML$/i.test(id)) return 'chrome';
  if (/^MSEdgeHTM$/i.test(id)) return 'edge';
  return 'other';
}

function defaultBrowser() {
  if (process.platform !== 'win32') return Promise.resolve('other');
  return new Promise(resolve => {
    execFile('reg', ['query', KEY, '/v', 'ProgId'], { windowsHide: true, timeout: 4000 }, (err, stdout) => resolve(err ? 'other' : browserFromRegOutput(stdout)));
  });
}

module.exports = { defaultBrowser, browserFromRegOutput, TAMPERMONKEY, NAMES };
