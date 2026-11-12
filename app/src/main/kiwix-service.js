// The Library engine: start kiwix-serve with every book in library/, wait until
// it answers, then read its catalog to learn each book's ID, address and title.
'use strict';
const fs = require('fs');
const path = require('path');
const { EngineProcess } = require('./processes');
const { parseCatalog } = require('./kiwix-catalog');
const { localFetch } = require('./local-http'); // not Node's fetch: see local-http.js

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Every .zim file directly inside library/ (sorted for a stable order).
function findZimFiles(libraryDir) {
  try {
    return fs.readdirSync(libraryDir)
      .filter(name => name.toLowerCase().endsWith('.zim'))
      .map(name => path.join(libraryDir, name))
      // statSync follows links, so a linked book counts too; folders named *.zim don't.
      .filter(file => { try { return fs.statSync(file).isFile(); } catch { return false; } })
      .sort();
  } catch { return []; }
}

async function fetchText(url, timeoutMs = 5000) {
  const res = await localFetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) { res.body.cancel(); throw new Error(`HTTP ${res.status}`); }
  return res.text();
}

class KiwixService {
  constructor({ exe, port, zims, log, startSeconds = 90 }) {
    this.exe = exe; this.port = port; this.zims = zims; this.log = log; this.startSeconds = startSeconds;
    this.engine = null; this.books = [];
  }

  get baseUrl() { return `http://127.0.0.1:${this.port}`; }

  // Resolves with the list of books, or throws an Error whose .code says what went wrong:
  // 'engine-missing' | 'engine-failed' | 'timeout' | 'no-readable-books'
  async start() {
    if (!fs.existsSync(this.exe)) throw Object.assign(new Error('kiwix-serve not found at ' + this.exe), { code: 'engine-missing' });
    const args = [
      '--address', '127.0.0.1',           // this computer only
      '--port', String(this.port),
      '--blockexternal',                  // Kiwix also refuses outside links
      '--skipInvalid',                    // one damaged book must not stop the others
      '--nolibrarybutton',                // our own top bar has the Library button
      '--attachToProcess', String(process.pid), // quit if the app disappears
      ...this.zims,
    ];
    this.engine = new EngineProcess('kiwix', this.exe, args, this.log);
    this.engine.start();

    const deadline = Date.now() + this.startSeconds * 1000;
    while (Date.now() < deadline) {
      if (!this.engine.running) {
        throw Object.assign(new Error('kiwix-serve stopped during start: ' + this.engine.tail.slice(-3).join(' | ')), { code: 'engine-failed' });
      }
      try {
        const xml = await fetchText(`${this.baseUrl}/catalog/v2/entries?count=-1`);
        this.books = parseCatalog(xml);
        this.log.info(`library ready: ${this.books.length} book(s):`, this.books.map(b => `${b.slug}${b.isMap ? ' [map]' : ''}`).join(', '));
        if (this.books.length === 0) throw Object.assign(new Error('Kiwix could not read any book'), { code: 'no-readable-books' });
        return this.books;
      } catch (e) {
        if (e.code === 'no-readable-books') throw e;
        await sleep(200); // not answering yet
      }
    }
    throw Object.assign(new Error(`kiwix-serve did not answer within ${this.startSeconds} s`), { code: 'timeout' });
  }

  stop() { return this.engine ? this.engine.stop() : Promise.resolve(); }
}

module.exports = { KiwixService, findZimFiles };
