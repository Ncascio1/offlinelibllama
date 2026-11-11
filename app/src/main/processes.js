// Starting, tracking and stopping the engines (Kiwix and the AI).
//
// Three safety nets so nothing is left running on the customer's PC
// (docs/decisions.md, D5):
//  1. Windows "job": programs started this way are killed by Windows when the
//     app ends, even if it is force-closed (built into Electron/Node on Windows).
//  2. Kiwix is told to watch our process ID and quit if we disappear.
//  3. A pids.json file lists what we started. At the next start, anything still
//     running from that list is stopped, but ONLY if its program file is our
//     engine on this drive (a recycled process ID is never touched).
'use strict';
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const TAIL_LINES = 40; // keep the engine's last output lines for error reports

class EngineProcess {
  constructor(label, exe, args, log) {
    this.label = label; this.exe = exe; this.args = args; this.log = log;
    this.child = null; this.tail = []; this.stopping = false; this.exitInfo = null;
    this.exitListeners = [];
  }

  start() {
    this.child = spawn(this.exe, this.args, {
      windowsHide: true,                 // no console window
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: path.dirname(this.exe),       // so Windows finds the engine's DLLs beside it
    });
    // Engines print a lot; read it (or they would block) but keep only the tail.
    const keep = buf => {
      for (const line of buf.toString('utf8').split(/\r?\n/)) {
        if (!line.trim()) continue;
        this.tail.push(line.slice(0, 300));
        if (this.tail.length > TAIL_LINES) this.tail.shift();
      }
    };
    this.child.stdout.on('data', keep);
    this.child.stderr.on('data', keep);
    this.child.on('error', err => { this.log.error(`${this.label} could not start:`, err.message); this.onExit(null, null, err); });
    this.child.on('exit', (code, signal) => this.onExit(code, signal, null));
    this.log.info(`${this.label} started, pid ${this.child.pid}`);
    return this.child.pid;
  }

  onExit(code, signal, err) {
    if (this.exitInfo) return; // already handled (error + exit can both fire)
    this.exitInfo = { code, signal, error: err ? err.message : null, expected: this.stopping };
    const how = this.stopping ? 'stopped' : 'ended unexpectedly';
    (this.stopping ? this.log.info : this.log.error)(`${this.label} ${how} (code ${code}, signal ${signal})`);
    if (!this.stopping && this.tail.length) this.log.error(`${this.label} last output:\n  ` + this.tail.slice(-10).join('\n  '));
    for (const fn of this.exitListeners) fn(this.exitInfo);
  }

  onceExit(fn) { if (this.exitInfo) fn(this.exitInfo); else this.exitListeners.push(fn); }
  get pid() { return this.child ? this.child.pid : null; }
  get running() { return !!this.child && !this.exitInfo; }

  // Ask the engine to stop; force it after `graceMs`.
  stop(graceMs = 3000) {
    return new Promise(resolve => {
      if (!this.running) return resolve();
      this.stopping = true;
      const timer = setTimeout(() => { try { this.child.kill('SIGKILL'); } catch {} }, graceMs);
      this.onceExit(() => { clearTimeout(timer); resolve(); });
      try { this.child.kill(); } catch { clearTimeout(timer); resolve(); }
    });
  }
}

// ---- pids.json (safety net 3) ----

function writePidsFile(file, engines) {
  try {
    const list = engines.filter(e => e.running).map(e => ({ label: e.label, pid: e.pid, exe: e.exe }));
    fs.writeFileSync(file, JSON.stringify(list));
  } catch { /* read-only drive and temp both failed: safety nets 1 and 2 still apply */ }
}

function removePidsFile(file) { try { fs.unlinkSync(file); } catch {} }

// Which program file does a running process ID belong to? null = not running.
function exePathOf(pid) {
  if (process.platform === 'linux') {
    try { return Promise.resolve(fs.realpathSync(`/proc/${pid}/exe`)); } catch { return Promise.resolve(null); }
  }
  if (process.platform === 'win32') {
    // PowerShell ships with Windows 10 and 11. Started hidden, read-only query.
    return new Promise(resolve => {
      execFile('powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', `(Get-Process -Id ${Number(pid)} -ErrorAction SilentlyContinue).Path`],
        { windowsHide: true, timeout: 8000 },
        (err, stdout) => resolve(err ? null : (stdout.trim() || null)));
    });
  }
  return Promise.resolve(null);
}

function samePath(a, b) {
  const norm = p => { try { p = fs.realpathSync(p); } catch {} p = path.resolve(p); return process.platform === 'win32' ? p.toLowerCase() : p; };
  return norm(a) === norm(b);
}

// Stop engines left over from a crashed earlier run. Returns a list of what was done.
async function cleanStaleEngines(file, ourExes, log, lookup = exePathOf) {
  let list;
  try { list = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return []; }
  const report = [];
  for (const { label, pid } of Array.isArray(list) ? list : []) {
    if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) continue;
    const exe = await lookup(pid);
    if (!exe) { report.push(`${label} ${pid}: not running`); continue; }
    if (!ourExes.some(our => samePath(exe, our))) { report.push(`${label} ${pid}: another program, left alone`); continue; }
    try { process.kill(pid); report.push(`${label} ${pid}: left over from last time, stopped`); }
    catch (e) { report.push(`${label} ${pid}: could not stop (${e.code})`); }
  }
  removePidsFile(file);
  if (report.length && log) log.info('stale engine check:', report.join('; '));
  return report;
}

module.exports = { EngineProcess, writePidsFile, removePidsFile, cleanStaleEngines, exePathOf };
