// The "offline and private" rule: nothing may load from outside this computer.
//
// Two layers (see docs/decisions.md, D6):
//  1. isAllowedUrl() checks every request a page makes.
//  2. HOST_RESOLVER_RULES makes every internet name fail to resolve, which also
//     catches Chromium's own background requests that pages never see.
'use strict';

const LOCAL_SCHEMES = new Set(['app:', 'data:', 'blob:', 'devtools:', 'chrome-error:']);

// "MAP * ~NOTFOUND" = every host name is "not found"; EXCLUDE keeps 127.0.0.1 working.
const HOST_RESOLVER_RULES = 'MAP * ~NOTFOUND, EXCLUDE 127.0.0.1';

function isAllowedUrl(url) {
  let u;
  try { u = new URL(url); } catch { return false; }
  if (LOCAL_SCHEMES.has(u.protocol)) return true;
  if (u.protocol === 'http:' || u.protocol === 'ws:') return u.hostname === '127.0.0.1';
  return false; // https:, file:, ftp:, anything else
}

// Is this one of the Kiwix pages (book or map) we serve ourselves?
function isKiwixUrl(url, kiwixPort) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' && u.hostname === '127.0.0.1' && Number(u.port) === kiwixPort;
  } catch { return false; }
}

module.exports = { isAllowedUrl, isKiwixUrl, HOST_RESOLVER_RULES };
