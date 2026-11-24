'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { browserFromRegOutput } = require('../src/main/browser');

test('browser: default browser from the https link association', () => {
  const out = id => `\r\nHKEY_CURRENT_USER\\Software\\...\\UserChoice\r\n    ProgId    REG_SZ    ${id}\r\n`;
  assert.equal(browserFromRegOutput(out('FirefoxURL-308046B0AF4A39CB')), 'firefox');
  assert.equal(browserFromRegOutput(out('ChromeHTML')), 'chrome');
  assert.equal(browserFromRegOutput(out('MSEdgeHTM')), 'edge');
  assert.equal(browserFromRegOutput(out('OperaStable')), 'opera');
  assert.equal(browserFromRegOutput(out('Opera GXStable')), 'opera');
  assert.equal(browserFromRegOutput(out('BraveHTML')), 'other');
  assert.equal(browserFromRegOutput(''), 'other');
});
