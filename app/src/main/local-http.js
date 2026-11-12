// A small fetch() replacement for talking to Kiwix on 127.0.0.1.
//
// Why: Node's built-in fetch ("undici") crashed the whole app on Windows when
// Kiwix closed a connection while several large articles were being read at once
// (error "assert(!this.paused)"; seen with full Wikipedia, docs/progress.md).
// Node's older http module does not have this problem, and a failed request here
// is an ordinary error that the caller already handles.
//
// It supports only what our code uses: GET, an AbortSignal, following redirects,
// and a response with ok, status, url, headers.get(), text(), json() and body.cancel().
'use strict';
const http = require('http');

const MAX_REDIRECTS = 5;

function localFetch(url, { signal } = {}, redirectsLeft = MAX_REDIRECTS) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    // Belt and braces: this helper must never reach anything but this computer.
    if (u.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(u.hostname)) {
      return reject(new Error('localFetch only talks to 127.0.0.1'));
    }
    if (signal && signal.aborted) return reject(abortError(signal));

    const req = http.get(u, { signal }, res => {
      const status = res.statusCode || 0;
      const location = res.headers.location;
      if (status >= 300 && status < 400 && location) {
        res.resume(); // throw the redirect body away so the connection closes cleanly
        if (redirectsLeft <= 0) return reject(new Error('too many redirects'));
        return resolve(localFetch(new URL(location, u).toString(), { signal }, redirectsLeft - 1));
      }
      let bodyPromise = null;
      const readBody = () => bodyPromise || (bodyPromise = new Promise((ok, fail) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => ok(Buffer.concat(chunks).toString('utf8')));
        res.on('error', fail);
        res.on('aborted', () => fail(new Error('connection closed early')));
      }));
      resolve({
        ok: status >= 200 && status < 300,
        status,
        url: u.toString(),
        headers: { get: name => { const v = res.headers[String(name).toLowerCase()]; return v == null ? null : String(v); } },
        text: () => readBody(),
        json: () => readBody().then(t => JSON.parse(t)),
        body: { cancel: () => { res.destroy(); return Promise.resolve(); } },
      });
    });
    req.on('error', err => reject(signal && signal.aborted ? abortError(signal) : err));
  });
}

function abortError(signal) {
  const r = signal.reason;
  return r instanceof Error ? r : Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
}

module.exports = { localFetch };
