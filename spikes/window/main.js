// Phase 0 spike: throwaway Electron window. NOT production code.
// Checks: own window, localhost-only network, data dirs on the drive,
// read-only fallback, single instance, hidden child processes, cleanup,
// WebGL/worker support, start time and memory.
'use strict';
const { app, BrowserWindow, session, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const T0 = Date.now();
const AUTOTEST = process.env.SPIKE_AUTOTEST === '1';

// --- 1. Find the drive root: walk up from the app until a folder has "library/".
// (Never hard-code a drive letter.) The spike lets a test override it.
function findDriveRoot() {
  if (process.env.SPIKE_DRIVE) return process.env.SPIKE_DRIVE;
  let dir = path.dirname(process.execPath);
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, 'library'))) return dir;
    dir = path.dirname(dir);
  }
  return null;
}
const ROOT = findDriveRoot();

// --- 2. Keep every Electron data folder on the drive; if the drive is
// read-only, fall back to %TEMP%. Must happen before app "ready".
function pickDataDir() {
  const onDrive = path.join(ROOT, '_system', 'data');
  try {
    fs.mkdirSync(onDrive, { recursive: true });
    const probe = path.join(onDrive, '.write-test');
    fs.writeFileSync(probe, 'x'); fs.unlinkSync(probe);
    return { dir: onDrive, readOnly: false };
  } catch {
    return { dir: path.join(os.tmpdir(), 'offline-library'), readOnly: true };
  }
}
const DATA = pickDataDir();
for (const name of ['userData', 'sessionData', 'crashDumps', 'logs']) {
  app.setPath(name, path.join(DATA.dir, name === 'userData' ? '' : name));
}
const LOG = [];
function log(...a) { const l = `[${Date.now() - T0}ms] ${a.join(' ')}`; LOG.push(l); console.log(l); }
log('drive root:', ROOT, '| data dir:', DATA.dir, '| read-only drive:', DATA.readOnly);

// --- 3. Single instance: a second launch focuses the first window.
if (!app.requestSingleInstanceLock()) { log('second instance -> exiting'); app.exit(0); }
let win = null;
app.on('second-instance', () => { log('second launch detected -> focusing'); if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

// --- 4. Network rule: only 127.0.0.1 (and local schemes) may load.
const BLOCKED = [];
function isAllowed(url) {
  try {
    const u = new URL(url);
    if (['file:', 'data:', 'blob:', 'devtools:'].includes(u.protocol)) return true;
    return (u.protocol === 'http:' || u.protocol === 'ws:') && u.hostname === '127.0.0.1';
  } catch { return false; }
}
function lockDownSession(ses) {
  ses.webRequest.onBeforeRequest((details, cb) => {
    const ok = isAllowed(details.url);
    if (!ok) BLOCKED.push(details.url);
    cb({ cancel: !ok });
  });
  ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(false)); // no camera, location, etc.
  ses.setSpellCheckerEnabled(false); // avoids dictionary downloads
}

// --- 5. Start the engines hidden, tied to this app.
const children = [];
function startChild(label, exe, args) {
  const p = spawn(exe, args, { windowsHide: true, stdio: 'ignore' });
  p.on('exit', (code, sig) => log(`${label} exited code=${code} signal=${sig}`));
  children.push({ label, p });
  log(`${label} started pid=${p.pid}`);
  return p;
}
function stopChildren() { for (const c of children) if (c.p.exitCode === null) c.p.kill(); }

async function waitFor(url, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { const r = await fetch(url); if (r.ok) return true; } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  return false;
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);           // no menu bar
  lockDownSession(session.defaultSession);
  const libSession = session.fromPartition('library'); // in-memory: no cache writes to flash
  lockDownSession(libSession);

  win = new BrowserWindow({
    width: 1100, height: 750, show: false, backgroundColor: '#e8ece9',
    autoHideMenuBar: true,
    webPreferences: { partition: 'library', contextIsolation: true, sandbox: true,
                      devTools: !app.isPackaged, spellcheck: false },
  });
  win.webContents.setWindowOpenHandler(({ url }) => { log('blocked popup', url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!isAllowed(url)) { e.preventDefault(); log('blocked navigation', url); } });
  win.once('ready-to-show', () => { win.show(); log('WINDOW SHOWN'); });
  win.on('closed', () => { log('window closed'); stopChildren(); });

  const kiwixExe = process.env.SPIKE_KIWIX;
  const zims = fs.readdirSync(path.join(ROOT, 'library')).filter(f => f.endsWith('.zim')).map(f => path.join(ROOT, 'library', f));
  const kport = 18090;
  startChild('kiwix', kiwixExe, ['-i', '127.0.0.1', '-p', String(kport), '-b', '-k', '-a', String(process.pid), ...zims]);
  if (process.env.SPIKE_LLAMA) {
    startChild('llama', process.env.SPIKE_LLAMA, ['-m', path.join(ROOT, 'models', 'small.gguf'),
      '--host', '127.0.0.1', '--port', '18091', '-c', '2048', '--no-webui', '--offline']);
  }
  // pids file (for stale-process cleanup after a crash) — only if drive is writable
  if (!DATA.readOnly) fs.writeFileSync(path.join(DATA.dir, 'pids.json'),
    JSON.stringify(children.map(c => ({ label: c.label, pid: c.p.pid }))));

  await win.loadFile(path.join(__dirname, 'probe.html'));
  log('home page loaded');
  const kOk = await waitFor(`http://127.0.0.1:${kport}/catalog/v2/entries`, 10000);
  log('kiwix ready:', kOk);

  if (AUTOTEST) {
    const r = await win.webContents.executeJavaScript(`runProbes(${kport})`);
    log('PROBES', JSON.stringify(r));
    const m = app.getAppMetrics().reduce((s, x) => s + x.memory.workingSetSize, 0);
    log(`electron memory (all processes) ~${Math.round(m / 1024)} MB`);
    log('blocked requests:', BLOCKED.length, BLOCKED.slice(0, 5).join(' '));
    try { fs.writeFileSync(path.join(DATA.readOnly ? os.tmpdir() : DATA.dir, 'spike-result.log'), LOG.join('\n')); } catch {}
    if (process.env.SPIKE_STAY !== '1') win.close();
  }
});
app.on('window-all-closed', () => { stopChildren(); app.quit(); });
app.on('before-quit', stopChildren);
