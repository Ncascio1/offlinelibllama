'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { isAllowedUrl, isKiwixUrl } = require('../../app/src/main/network-rules');
const { findFreePort, findFreePorts } = require('../../app/src/main/ports');

test('allowed: our own pages and this computer only', () => {
  for (const u of ['app://local/home.html', 'http://127.0.0.1:5000/content/x/A', 'ws://127.0.0.1:1/', 'data:text/plain,hi', 'blob:app://local/123'])
    assert.ok(isAllowedUrl(u), u);
});

test('blocked: the internet and everything else', () => {
  for (const u of ['https://en.wikipedia.org/wiki/Bowline', 'http://example.com', 'http://localhost:5000/', 'http://127.0.0.2/',
                   'http://0.0.0.0:80/', 'http://[::1]:80/', 'file:///C:/Windows/win.ini', 'ftp://x', 'not a url', '',
                   'http://127.0.0.1.evil.com/', 'http://evil.com/?127.0.0.1'])
    assert.ok(!isAllowedUrl(u), u);
});

test('only the built-in PDF viewer may use an extension address', () => {
  assert.ok(isAllowedUrl('chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/index.html'));
  assert.ok(!isAllowedUrl('chrome-extension://abcdefghijklmnopabcdefghijklmnop/evil.html'));
  assert.ok(isAllowedUrl('chrome://resources/js/load_time_data.js'));
  assert.ok(!isAllowedUrl('chrome://settings/'));
});

test('kiwix page check matches the Kiwix port only', () => {
  assert.ok(isKiwixUrl('http://127.0.0.1:4000/content/a/b', 4000));
  assert.ok(!isKiwixUrl('http://127.0.0.1:4001/content/a/b', 4000));
});

test('free ports are real, distinct and usable', async () => {
  const p = await findFreePort();
  assert.ok(p > 0 && p < 65536);
  const ps = await findFreePorts(3);
  assert.strictEqual(new Set(ps).size, 3);
});
