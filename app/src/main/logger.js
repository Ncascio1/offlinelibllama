// A small log file for the owner's support work: _system/logs/app.log
//
// Kept small on purpose (flash drives wear out with constant writing):
// when app.log passes MAX_BYTES it is renamed to app.1.log (replacing the old
// one), so at most about 2 x MAX_BYTES is ever used.
// No personal data is logged: no questions typed by the customer, no page text.
'use strict';
const fs = require('fs');
const path = require('path');

const MAX_BYTES = 256 * 1024;
const RECENT_LIMIT = 200; // recent lines kept in memory for "Save support info"

let logFile = null;
const recent = [];
const errors = [];

function init(logDir) {
  try {
    fs.mkdirSync(logDir, { recursive: true });
    logFile = path.join(logDir, 'app.log');
  } catch {
    logFile = null; // can't write logs: keep them in memory only
  }
}

function rotateIfNeeded() {
  try {
    if (fs.statSync(logFile).size > MAX_BYTES) fs.renameSync(logFile, logFile.replace(/\.log$/, '.1.log'));
  } catch { /* file doesn't exist yet: nothing to rotate */ }
}

function write(level, parts) {
  const line = `${new Date().toISOString()} ${level.padEnd(5)} ${parts.map(p => (p instanceof Error ? p.stack || p.message : typeof p === 'string' ? p : JSON.stringify(p))).join(' ')}`;
  recent.push(line); if (recent.length > RECENT_LIMIT) recent.shift();
  if (level === 'ERROR') { errors.push(line); if (errors.length > 20) errors.shift(); }
  if (process.env.OL_LOG_TO_CONSOLE === '1') console.log(line);
  if (!logFile) return;
  try { rotateIfNeeded(); fs.appendFileSync(logFile, line + '\n'); } catch { logFile = null; }
}

module.exports = {
  init,
  info: (...p) => write('INFO', p),
  warn: (...p) => write('WARN', p),
  error: (...p) => write('ERROR', p),
  recentLines: () => recent.slice(),
  recentErrors: () => errors.slice(),
  MAX_BYTES,
};
