'use strict';
// Background warm-up of the books' search indexes (KiwixService.warmUp).
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { KiwixService } = require('../../app/src/main/kiwix-service');

test('warm-up: one search per book, biggest first, maps skipped, errors ignored', async () => {
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push(req.url);
    if (req.url.includes('small')) { res.writeHead(500); return res.end('broken'); } // a failing book must not stop the rest
    res.end('ok');
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try {
    const k = new KiwixService({ exe: 'x', port: server.address().port, zims: [], log: { info() {} } });
    k.engine = { running: true };
    k.books = [
      { id: 'id-small', slug: 'small', articleCount: 10, hasFullTextIndex: true },
      { id: 'id-map', slug: 'map', articleCount: 9e9, isMap: true, hasFullTextIndex: true },
      { id: 'id-wiki', slug: 'wiki', articleCount: 7e6, hasFullTextIndex: true },
      { id: 'id-noindex', slug: 'noindex', articleCount: 50, hasFullTextIndex: false },
    ];
    await k.warmUp();
    assert.ok(!seen.some(u => u.includes('map')), 'maps are not warmed up');
    assert.ok(seen[0].startsWith('/search') && seen[0].includes('id-wiki'), 'biggest book first: ' + seen[0]);
    assert.ok(seen.some(u => u.startsWith('/suggest') && u.includes('content=small')), 'continues after a failing book');
    assert.ok(!seen.some(u => u.startsWith('/search') && u.includes('id-noindex')), 'no full-text search for a book without an index');
    assert.ok(seen.some(u => u.startsWith('/suggest') && u.includes('content=noindex')), 'title lookup still warmed up');
  } finally { server.closeAllConnections(); await new Promise(r => server.close(r)); }
});

test('warm-up: stops quietly if the library engine has stopped', async () => {
  const k = new KiwixService({ exe: 'x', port: 1, zims: [], log: { info() {} } });
  k.engine = { running: false };
  k.books = [{ id: 'a', slug: 'a', articleCount: 1, hasFullTextIndex: true }];
  await k.warmUp(); // must not throw or try to connect
});
