// The private "app://" address for our own pages.
//
//   app://local/<file>        the app's pages (src/renderer/)
//   app://drive/START-HERE.html and app://drive/LICENSES/<file>
//                             the customer guide and licence texts on the drive
//
// Files are read straight from disk; nothing else on the PC can be reached,
// and "../" tricks are refused.
'use strict';
const fs = require('fs');
const path = require('path');

const APP_PARTITIONS = ['ui', 'content'];

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.woff2': 'font/woff2',
};

// Our pages may talk only to themselves and to Kiwix/the AI on this computer.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: http://127.0.0.1:*",
  "connect-src 'self' http://127.0.0.1:*",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
].join('; ');

// Resolve `rel` inside `baseDir`, or null if it would escape it.
function safeJoin(baseDir, rel) {
  const full = path.resolve(baseDir, '.' + path.sep + rel);
  const base = path.resolve(baseDir) + path.sep;
  return full.startsWith(base) ? full : null;
}

function resolveAppUrl(url, { rendererDir, paths }) {
  const u = new URL(url);
  const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
  if (u.host === 'local') return safeJoin(rendererDir, rel || 'home.html');
  if (u.host === 'drive' && paths) {
    if (rel === 'START-HERE.html') return paths.startHere;
    if (rel.startsWith('LICENSES/')) return safeJoin(paths.licenses, rel.slice('LICENSES/'.length));
  }
  return null;
}

function registerAppProtocol(ses, opts) {
  if (ses.protocol.isProtocolHandled('app')) return;
  ses.protocol.handle('app', async request => {
    const file = resolveAppUrl(request.url, opts);
    if (!file) return new Response('Not found', { status: 404 });
    try {
      const body = await fs.promises.readFile(file);
      const headers = { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' };
      if (new URL(request.url).host === 'local') headers['content-security-policy'] = CSP;
      return new Response(body, { headers });
    } catch {
      if (opts.log) opts.log.warn('app page not found:', request.url);
      return new Response('Not found', { status: 404 });
    }
  });
}

module.exports = { registerAppProtocol, resolveAppUrl, safeJoin, APP_PARTITIONS };
