'use strict';
// The small fetch replacement used for Kiwix (app/src/main/local-http.js).
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { localFetch } = require('../../app/src/main/local-http');

function withServer(handler, fn) {
  return async () => {
    const server = http.createServer(handler);
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${server.address().port}`;
    try { await fn(base); } finally { server.closeAllConnections(); await new Promise(r => server.close(r)); }
  };
}

const handler = (req, res) => {
  if (req.url === '/old') { res.writeHead(302, { Location: '/content/new%20page' }); return res.end('moved'); }
  if (req.url === '/content/new%20page') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<p>hello</p>'); }
  if (req.url === '/json') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('[1,2]'); }
  if (req.url === '/big') { res.writeHead(200, { 'Content-Type': 'application/pdf', Connection: 'close' }); return res.end(Buffer.alloc(2e6)); }
  if (req.url === '/slow') return setTimeout(() => res.end('late'), 2000);
  res.writeHead(404); res.end('nope');
};

test('local fetch: reads text and json, reports status and type', withServer(handler, async base => {
  const r = await localFetch(base + '/json');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.headers.get('Content-Type'), 'application/json');
  assert.deepStrictEqual(await r.json(), [1, 2]);
  const nf = await localFetch(base + '/missing');
  assert.strictEqual(nf.ok, false);
  assert.strictEqual(nf.status, 404);
  await nf.body.cancel();
}));

test('local fetch: follows redirects and gives the final address', withServer(handler, async base => {
  const r = await localFetch(base + '/old');
  assert.strictEqual(r.url, base + '/content/new%20page');
  assert.strictEqual(await r.text(), '<p>hello</p>');
}));

test('local fetch: an unread big download can be cancelled without a crash', withServer(handler, async base => {
  const all = await Promise.all(Array.from({ length: 10 }, () => localFetch(base + '/big')));
  for (const r of all) await r.body.cancel();
}));

test('local fetch: Stop (abort) and time limits end the request with an error', withServer(handler, async base => {
  await assert.rejects(localFetch(base + '/slow', { signal: AbortSignal.timeout(100) }));
}));

test('local fetch: refuses anything that is not this computer', async () => {
  await assert.rejects(localFetch('http://example.com/'), /only talks to 127\.0\.0\.1/);
  await assert.rejects(localFetch('https://127.0.0.1/'), /only talks to 127\.0\.0\.1/);
});
